import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServer } from '../../../../../../lib/supabase-server';
import { createServiceClient } from '../../../../../../lib/supabase';
import { recordTxn } from '../../../../../../lib/accounting/money';
import { procurementPaymentOr } from '../../../../../../lib/accounting/procurement-payments';

const db = createServiceClient();

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || user.app_metadata?.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { id } = await params;
  const { reason } = await req.json() as { reason?: string };

  const { data: doc } = await db
    .from('acc_documents')
    .select('meta, supplier_id, doc_number, procurement_status')
    .eq('id', id).single();

  if (!doc) return NextResponse.json({ error: 'Не знайдено' }, { status: 404 });

  const meta = (doc.meta as Record<string, unknown>) ?? {};
  if (!meta.is_paid && meta.payment_status !== 'invoiced') {
    return NextResponse.json({ error: 'Оплата не знайдена або вже скасована' }, { status: 400 });
  }

  // Знаходимо оригінальну суму оплати в леджері
  const { data: entries } = await db
    .from('money_entries')
    .select('amount, account_type, doc_type, txn_id')
    .or(procurementPaymentOr(id))
    .in('doc_type', ['supplier_payment'])
    .order('created_at', { ascending: true });

  const supplierEntry = (entries ?? []).find(
    e => e.account_type === 'supplier' && Number(e.amount) > 0
  );
  const cashOrBankEntry = (entries ?? []).find(
    e => (e.account_type === 'cash' || e.account_type === 'bank') && Number(e.amount) < 0
  );

  // Проводимо компенсуючу проводку (reverse)
  // Ключ ідемпотентності прив'язаний до txn_id оригінальної оплати:
  // повторний виклик при мережевій помилці не задвоїть проводку.
  if (supplierEntry && cashOrBankEntry && doc.supplier_id) {
    const paymentAccount = cashOrBankEntry.account_type as 'cash' | 'bank';
    await recordTxn({
      debitAccount:   paymentAccount,
      debitParty:     null,
      creditAccount:  'supplier',
      creditParty:    String(doc.supplier_id),
      amount:         Math.abs(Number(supplierEntry.amount)),
      businessDate:   new Date().toISOString().slice(0, 10),
      docId:          id,
      docType:        'supplier_payment_reversal',
      description:    `Скасування оплати: ${doc.doc_number}${reason ? ` (${reason})` : ''}`,
      idempotencyKey: `supplier_payment_reversal:${supplierEntry.txn_id ?? id}`,
      createdBy:      user.email,
    });
  }

  // Скидаємо поля оплати в meta, зберігаємо решту
  const { is_paid, payment_status, payment_mode, payment_defer_date, pre_payment_status, ...restMeta } = meta;
  void is_paid; void payment_status; void payment_mode; void payment_defer_date;

  // Відновлюємо procurement_status тільки якщо він був перезаписаний старим механізмом оплати
  // (new add-payment flow не змінює procurement_status — він залишається 'received'/'sent'/etc.)
  const docStatus = (doc as { procurement_status?: string }).procurement_status ?? '';
  const updateFields: Record<string, unknown> = { meta: { ...restMeta, payment_reversed: true } };
  if (docStatus === 'paid' || docStatus === 'invoiced') {
    updateFields.procurement_status = (pre_payment_status as string | undefined) ?? 'ordered';
  } else if (docStatus === 'closed') {
    // Якщо замовлення було автозакрите — повертаємо до 'received' (товар вже є)
    updateFields.procurement_status = 'received';
  }

  const { error } = await db
    .from('acc_documents')
    .update(updateFields)
    .eq('id', id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
