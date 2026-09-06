import { NextRequest, NextResponse } from 'next/server';
import { requireStaff } from '../../../../../lib/auth-guard';
import { createServiceClient } from '../../../../../lib/supabase';
import { recordTxn, type AccountType } from '../../../../../lib/accounting/money';
import { ingestNovapayStatement, postNpPayouts } from '../../../../../lib/novapay-ingest';

// Виписка NovaPay: список документів і категоризація списань людиною.
// Списання = DR <витрата | bank | cash> / CR novapay; ідемпотентно за id документа
// виписки (np-txn:{id}), тож повторне натискання нічого не дублює.

const EXPENSE_ACCOUNTS: AccountType[] = ['logistics', 'loading', 'customs', 'packaging', 'rent', 'salary', 'marketing', 'opex'];
const TRANSFER_TARGETS = { 'transfer:bank': 'bank', 'transfer:cash': 'cash' } as const;

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
  const body = await req.json().catch(() => ({})) as { action?: string; id?: string; category?: string; description?: string; note?: string };
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
    const src = category === 'transfer-in:bank' ? 'bank' : category === 'transfer-in:cash' ? 'cash' : null;
    if (!src) return NextResponse.json({ error: 'Для зарахування доступні лише переказ з Mono або внесення готівки' }, { status: 400 });
    try {
      const txnId = await recordTxn({
        debitAccount: 'novapay', creditAccount: src, amount: Number(row.amount), businessDate: String(row.txn_date),
        docType: 'transfer', description: (body.description ?? '').trim() || `Переказ ${src === 'bank' ? 'Mono' : 'каса'} → НоваПей`,
        idempotencyKey: `np-txn:${row.id}`, createdBy: by, meta: { novapay_doc_id: row.id, manual: true, transfer: true },
      });
      await db.from('novapay_txns').update({ status: 'posted', category, txn_id: txnId, note: body.note ?? null, posted_at: new Date().toISOString(), posted_by: by }).eq('id', row.id);
      return NextResponse.json({ ok: true, txnId });
    } catch (err) {
      return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
    }
  }
  const isTransfer = category in TRANSFER_TARGETS;
  const isExpense  = EXPENSE_ACCOUNTS.includes(category as AccountType);
  if (!isTransfer && !isExpense) return NextResponse.json({ error: 'Невірна категорія' }, { status: 400 });

  const amount = Number(row.amount);
  const description = (body.description ?? '').trim() || `${row.purpose ?? ''} — ${row.counterparty ?? ''}`.trim();
  const debitAccount = (isTransfer ? TRANSFER_TARGETS[category as keyof typeof TRANSFER_TARGETS] : category) as AccountType;

  let txnId: string;
  try {
    txnId = await recordTxn({
      debitAccount, creditAccount: 'novapay',
      amount, businessDate: String(row.txn_date),
      docType: isTransfer ? 'transfer' : 'expense',
      description,
      idempotencyKey: `np-txn:${row.id}`, createdBy: by,
      meta: { novapay_doc_id: row.id, counterparty: row.counterparty, manual: true, ...(isTransfer ? { transfer: true } : {}) },
    });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
  if (isExpense) {
    await db.from('expenses').insert({
      expense_type: category, description, counterparty: row.counterparty ?? null, amount,
      payment_method: 'novapay', source: 'novapay', source_id: row.id, txn_id: txnId,
      business_date: String(row.txn_date), created_by: by,
    });
  }
  await db.from('novapay_txns').update({ status: 'posted', category, txn_id: txnId, note: body.note ?? null, posted_at: new Date().toISOString(), posted_by: by }).eq('id', row.id);
  return NextResponse.json({ ok: true, txnId });
}
