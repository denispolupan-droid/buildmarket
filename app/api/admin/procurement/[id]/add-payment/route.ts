import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServer } from '../../../../../../lib/supabase-server';
import { createServiceClient } from '../../../../../../lib/supabase';
import { recordTxn } from '../../../../../../lib/accounting/money';
import { createPaymentVoucher, maybeAutoClose } from '../../../../../../lib/accounting/documents';

const db = createServiceClient();

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || user.user_metadata?.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { id } = await params;
  const { amount, payment_mode, payment_date, note } = await req.json() as {
    amount: number;
    payment_mode: 'transfer' | 'cash';
    payment_date: string;
    note?: string;
  };

  if (!amount || amount <= 0) return NextResponse.json({ error: 'Невірна сума' }, { status: 400 });

  const { data: doc } = await db
    .from('acc_documents')
    .select('supplier_id, doc_number, supplier_invoice_amount, total_cost, meta')
    .eq('id', id).single();

  if (!doc) return NextResponse.json({ error: 'Не знайдено' }, { status: 404 });

  const creditAccount = payment_mode === 'cash' ? 'cash' : 'bank';
  const bizDate = payment_date ?? new Date().toISOString().slice(0, 10);

  const voucher = await createPaymentVoucher({
    doc_type:      'supplier_payment',
    supplier_id:   Number(doc.supplier_id),
    amount,
    business_date: bizDate,
    created_by:    user.email ?? 'admin',
    meta:          { payment_mode, po_id: id },
  });

  await recordTxn({
    debitAccount:   'supplier',
    debitParty:     String(doc.supplier_id),
    creditAccount,
    creditParty:    null,
    amount,
    businessDate:   bizDate,
    docId:          voucher.id,
    docType:        'supplier_payment',
    description:    `${note ? note + ': ' : ''}Оплата постачальнику: ${doc.doc_number}`,
    idempotencyKey: `supplier_payment:${voucher.id}`,
    createdBy:      user.email,
    meta:           { payment_mode, po_id: id },
  });

  // Обчислюємо загальну суму оплат
  const { data: entries } = await db
    .from('money_entries')
    .select('amount')
    .eq('doc_id', id)
    .eq('doc_type', 'supplier_payment')
    .eq('account_type', 'supplier')
    .gt('amount', 0);

  const totalPaid = (entries ?? []).reduce((s, e) => s + Number(e.amount), 0);
  const invoiceAmt = Number(doc.supplier_invoice_amount ?? doc.total_cost ?? 0);
  const isFullyPaid = invoiceAmt > 0 && totalPaid >= invoiceAmt * 0.999; // 0.1% tolerance

  const { payment_reversed, ...cleanMeta } = (doc.meta as Record<string, unknown>) ?? {};
  void payment_reversed; // знімаємо флаг скасування — здійснюється нова оплата
  await db.from('acc_documents').update({
    meta: {
      ...cleanMeta,
      is_paid:        isFullyPaid || undefined,
      payment_status: isFullyPaid ? 'paid' : 'partial',
      payment_mode,
    },
  }).eq('id', id);

  if (isFullyPaid) await maybeAutoClose(id);

  return NextResponse.json({ ok: true, total_paid: totalPaid, is_fully_paid: isFullyPaid });
}
