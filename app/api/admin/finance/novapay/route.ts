import { NextRequest, NextResponse } from 'next/server';
import { requireStaff } from '../../../../../lib/auth-guard';
import { createServiceClient } from '../../../../../lib/supabase';
import { recordTxn, recordSupplierPayment, recordMarketplaceTopup, type AccountType } from '../../../../../lib/accounting/money';
import { ingestNovapayStatement, postNpPayouts } from '../../../../../lib/novapay-ingest';

// Виписка NovaPay: список документів і категоризація списань людиною.
// Списання = DR <витрата | bank | cash | supplier | owner | marketplace_balance> / CR novapay;
// ідемпотентно за id документа виписки (np-txn:{id}), тож повторне натискання нічого не дублює.

const EXPENSE_ACCOUNTS: AccountType[] = ['logistics', 'loading', 'customs', 'packaging', 'rent', 'salary', 'marketing', 'opex', 'taxes'];
const TRANSFER_TARGETS = { 'transfer:bank': 'bank', 'transfer:cash': 'cash' } as const;
const TOPUP_TARGETS = { 'topup:rozetka': 'rozetka', 'topup:prom': 'prom' } as const;

export async function GET(req: NextRequest) {
  const auth = await requireStaff('admin');
  if (!auth.ok) return auth.response;
  const db = createServiceClient();
  const status = req.nextUrl.searchParams.get('status');
  let q = db.from('novapay_txns')
    .select('id, txn_date, amount, direction, counterparty, purpose, register_no, kind, status, category, note, posted_at')
    .order('txn_date', { ascending: false }).order('id', { ascending: false }).limit(500);
  if (status) q = q.eq('status', status);
  const { data, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ rows: data ?? [] });
}

export async function POST(req: NextRequest) {
  const auth = await requireStaff('admin');
  if (!auth.ok) return auth.response;
  const db = createServiceClient();
  const body = await req.json().catch(() => ({})) as { action?: string; id?: string; category?: string; description?: string; note?: string; supplierId?: string };
  const by = auth.user.email ?? 'admin';

  // Ручне оновлення виписки (крон робить це раз на день)
  if (body.action === 'refresh') {
    try {
      const ingest = await ingestNovapayStatement(14);
      const payouts = await postNpPayouts(by);
      return NextResponse.json({ ok: true, ingest, payouts });
    } catch (err) {
      return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
    }
  }

  if (!body.id) return NextResponse.json({ error: 'Немає id' }, { status: 400 });
  const { data: row } = await db.from('novapay_txns').select('*').eq('id', body.id).maybeSingle();
  if (!row) return NextResponse.json({ error: 'Документ не знайдено' }, { status: 404 });
  if (row.status === 'posted') return NextResponse.json({ error: 'Уже проведено' }, { status: 400 });

  if (body.category === 'ignore') {
    await db.from('novapay_txns').update({ status: 'ignored', category: 'ignore', note: body.note ?? null, posted_at: new Date().toISOString(), posted_by: by }).eq('id', row.id);
    return NextResponse.json({ ok: true });
  }

  const category = body.category ?? '';

  // Зарахування не за реєстром (переказ з Mono / внесення готівки): DR novapay / CR bank|cash
  if (row.direction === 'in') {
    const src = category === 'transfer-in:bank' ? 'bank' : category === 'transfer-in:cash' ? 'cash' : category === 'transfer-in:owner' ? 'owner' : null;
    if (!src) return NextResponse.json({ error: 'Для зарахування доступні лише переказ з Mono, внесення готівки або внесок власника' }, { status: 400 });
    try {
      const txnId = await recordTxn({
        debitAccount: 'novapay', creditAccount: src, amount: Number(row.amount), businessDate: String(row.txn_date),
        docType: src === 'owner' ? 'owner_contribution' : 'transfer', description: (body.description ?? '').trim() || (src === 'owner' ? 'Внесок власника' : `Переказ ${src === 'bank' ? 'Mono' : 'каса'} → НоваПей`),
        idempotencyKey: `np-txn:${row.id}`, createdBy: by, meta: { novapay_doc_id: row.id, manual: true, ...(src === 'owner' ? {} : { transfer: true }) },
      });
      await db.from('novapay_txns').update({ status: 'posted', category, txn_id: txnId, note: body.note ?? null, posted_at: new Date().toISOString(), posted_by: by }).eq('id', row.id);
      return NextResponse.json({ ok: true, txnId });
    } catch (err) {
      return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
    }
  }
  const isTransfer = category in TRANSFER_TARGETS;
  const isTopup    = category in TOPUP_TARGETS;
  const isExpense  = EXPENSE_ACCOUNTS.includes(category as AccountType);
  if (!isTransfer && !isTopup && !isExpense && category !== 'owner' && category !== 'supplier') {
    return NextResponse.json({ error: 'Невірна категорія' }, { status: 400 });
  }

  const amount = Number(row.amount);
  const date = String(row.txn_date);
  const description = (body.description ?? '').trim() || `${row.purpose ?? ''} — ${row.counterparty ?? ''}`.trim();
  const key = `np-txn:${row.id}`;
  const baseMeta = { novapay_doc_id: row.id, counterparty: row.counterparty, manual: true };

  let txnId: string;
  try {
    if (category === 'supplier') {
      const supplierId = String(body.supplierId ?? '');
      if (!supplierId) return NextResponse.json({ error: 'Вкажіть постачальника' }, { status: 400 });
      txnId = await recordSupplierPayment({ supplierId, amount, paymentMethod: 'novapay', businessDate: date, createdBy: by,
        description: description || 'Оплата постачальнику', idempotencyKey: key });
    } else if (isTopup) {
      txnId = await recordMarketplaceTopup({ marketplace: TOPUP_TARGETS[category as keyof typeof TOPUP_TARGETS], amount, paymentMethod: 'novapay',
        businessDate: date, createdBy: by, idempotencyKey: key, description });
    } else if (category === 'owner') {
      txnId = await recordTxn({ debitAccount: 'owner', creditAccount: 'novapay', amount, businessDate: date, docType: 'owner_draw',
        description: description || 'Вилучення власника', idempotencyKey: key, createdBy: by, meta: baseMeta });
    } else {
      const debitAccount = (isTransfer ? TRANSFER_TARGETS[category as keyof typeof TRANSFER_TARGETS] : category) as AccountType;
      txnId = await recordTxn({
        debitAccount, creditAccount: 'novapay', amount, businessDate: date,
        docType: isTransfer ? 'transfer' : 'expense', description, idempotencyKey: key, createdBy: by,
        meta: { ...baseMeta, ...(isTransfer ? { transfer: true } : {}) },
      });
    }
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
  if (isExpense) {
    await db.from('expenses').insert({
      expense_type: category, description, counterparty: row.counterparty ?? null, amount,
      payment_method: 'novapay', source: 'novapay', source_id: row.id, txn_id: txnId,
      business_date: date, created_by: by,
    });
  }
  await db.from('novapay_txns').update({ status: 'posted', category: category === 'supplier' ? `supplier:${body.supplierId}` : category, txn_id: txnId, note: body.note ?? null, posted_at: new Date().toISOString(), posted_by: by }).eq('id', row.id);
  return NextResponse.json({ ok: true, txnId });
}
