import { NextRequest, NextResponse } from 'next/server';
import { requireStaff } from '../../../../../lib/auth-guard';
import { createServiceClient } from '../../../../../lib/supabase';
import { recordTxn, recordSupplierPayment, type AccountType } from '../../../../../lib/accounting/money';
import { fetchAndIngestMonoStatement, postPendingAcquiringSettlements } from '../../../../../lib/mono-ingest';

// Виписка Mono: документи (списання і незіставлені надходження) і категоризація людиною.
// Списання = DR <витрата | novapay | cash | supplier | owner | taxes> / CR bank;
// ідемпотентно за id документа (mono-txn:{id}).

const EXPENSE_ACCOUNTS: AccountType[] = ['logistics', 'loading', 'customs', 'packaging', 'rent', 'salary', 'marketing', 'opex', 'taxes'];
const TRANSFER_TARGETS = { 'transfer:novapay': 'novapay', 'transfer:cash': 'cash' } as const;

export async function GET(req: NextRequest) {
  const auth = await requireStaff('admin');
  if (!auth.ok) return auth.response;
  const db = createServiceClient();
  const status = req.nextUrl.searchParams.get('status');
  let q = db.from('mono_bank_txns')
    .select('id, txn_time, amount, direction, comment, description, counter_name, status, category, note, posted_at, matched_order_id')
    .order('txn_time', { ascending: false }).limit(500);
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

  if (body.action === 'refresh') {
    try {
      const r = await fetchAndIngestMonoStatement(db, 7);
      const acq = await postPendingAcquiringSettlements(db, by);
      return NextResponse.json({ ok: true, ...r, acquiringPosted: acq });
    } catch (err) {
      return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
    }
  }

  if (!body.id) return NextResponse.json({ error: 'Немає id' }, { status: 400 });
  const { data: row } = await db.from('mono_bank_txns').select('*').eq('id', body.id).maybeSingle();
  if (!row) return NextResponse.json({ error: 'Документ не знайдено' }, { status: 404 });
  if (row.status === 'posted' || row.status === 'matched') return NextResponse.json({ error: 'Уже проведено' }, { status: 400 });

  const category = body.category ?? '';
  if (category === 'ignore') {
    await db.from('mono_bank_txns').update({ status: 'ignored', category: 'ignore', note: body.note ?? null, posted_at: new Date().toISOString(), posted_by: by }).eq('id', row.id);
    return NextResponse.json({ ok: true });
  }

  const amount = Number(row.amount);
  const date = String(row.txn_time).slice(0, 10);
  const descr = (body.description ?? '').trim() || `${row.comment ?? row.description ?? ''} — ${row.counter_name ?? ''}`.replace(/ — $/, '').trim();
  let txnId: string;
  try {
    if (row.direction === 'in') {
      // Надходження не за замовленням: переказ з NovaPay / внесення готівки / інше
      const src = category === 'transfer-in:novapay' ? 'novapay' : category === 'transfer-in:cash' ? 'cash' : category === 'transfer-in:owner' ? 'owner' : null;
      if (!src) return NextResponse.json({ error: 'Для надходження доступні лише переказ з NovaPay, внесення готівки або внесок власника' }, { status: 400 });
      txnId = await recordTxn({ debitAccount: 'bank', creditAccount: src, amount, businessDate: date, docType: src === 'owner' ? 'owner_contribution' : 'transfer', description: descr || (src === 'owner' ? 'Внесок власника' : descr),
        idempotencyKey: `mono-txn:${row.id}`, createdBy: by, meta: { mono_txn_id: row.id, manual: true, ...(src === 'owner' ? {} : { transfer: true }) } });
    } else if (category in TRANSFER_TARGETS) {
      txnId = await recordTxn({ debitAccount: TRANSFER_TARGETS[category as keyof typeof TRANSFER_TARGETS], creditAccount: 'bank', amount, businessDate: date, docType: 'transfer', description: descr,
        idempotencyKey: `mono-txn:${row.id}`, createdBy: by, meta: { mono_txn_id: row.id, manual: true, transfer: true } });
    } else if (category === 'owner') {
      txnId = await recordTxn({ debitAccount: 'owner', creditAccount: 'bank', amount, businessDate: date, docType: 'owner_draw', description: descr || 'Вилучення власника',
        idempotencyKey: `mono-txn:${row.id}`, createdBy: by, meta: { mono_txn_id: row.id, manual: true } });
    } else if (category === 'supplier') {
      const supplierId = String(body.supplierId ?? '');
      if (!supplierId) return NextResponse.json({ error: 'Вкажіть постачальника' }, { status: 400 });
      txnId = await recordSupplierPayment({ supplierId, amount, paymentMethod: 'bank', businessDate: date, createdBy: by, description: descr || 'Оплата постачальнику',
        idempotencyKey: `mono-txn:${row.id}` });
    } else if (EXPENSE_ACCOUNTS.includes(category as AccountType)) {
      txnId = await recordTxn({ debitAccount: category as AccountType, creditAccount: 'bank', amount, businessDate: date, docType: 'expense', description: descr,
        idempotencyKey: `mono-txn:${row.id}`, createdBy: by, meta: { mono_txn_id: row.id, manual: true, counterparty: row.counter_name } });
      await db.from('expenses').insert({ expense_type: category, description: descr, counterparty: row.counter_name ?? null, amount, payment_method: 'bank', source: 'mono', source_id: row.id, txn_id: txnId, business_date: date, created_by: by });
    } else {
      return NextResponse.json({ error: 'Невірна категорія' }, { status: 400 });
    }
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
  await db.from('mono_bank_txns').update({ status: 'posted', category: category === 'supplier' ? `supplier:${body.supplierId}` : category, txn_id: txnId, note: body.note ?? null, posted_at: new Date().toISOString(), posted_by: by }).eq('id', row.id);
  return NextResponse.json({ ok: true, txnId });
}
