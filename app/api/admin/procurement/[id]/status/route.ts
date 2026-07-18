import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServer } from '../../../../../../lib/supabase-server';
import { createServiceClient } from '../../../../../../lib/supabase';
import { recordTxn } from '../../../../../../lib/accounting/money';
import { maybeAutoClose } from '../../../../../../lib/accounting/documents';

const db = createServiceClient();

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || user.app_metadata?.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { id } = await params;
  const body = await req.json() as {
    procurement_status?: string;
    supplier_invoice_number?: string;
    supplier_invoice_date?: string;
    supplier_invoice_amount?: number;
    expected_date?: string;
    payment_amount?: number;
    payment_date?: string;
    payment_defer_date?: string;
    payment_mode?: string;
    cancel_reason?: string;
  };

  const update: Record<string, unknown> = {};
  if (body.procurement_status)       update.procurement_status       = body.procurement_status;
  if (body.supplier_invoice_number)  update.supplier_invoice_number  = body.supplier_invoice_number;
  if (body.supplier_invoice_date)    update.supplier_invoice_date    = body.supplier_invoice_date;
  if (body.supplier_invoice_amount)  update.supplier_invoice_amount  = body.supplier_invoice_amount;
  if (body.expected_date)            update.expected_date            = body.expected_date;

  // Зберігаємо деталі оплати та скасування в meta
  const isPaymentOp = body.payment_defer_date || body.payment_mode || body.cancel_reason
    || body.procurement_status === 'paid' || body.procurement_status === 'invoiced';
  if (isPaymentOp) {
    const { data: current } = await db.from('acc_documents').select('meta, procurement_status').eq('id', id).single();
    const isNewPayment = body.procurement_status === 'paid' || body.procurement_status === 'invoiced';
    const { payment_reversed, ...existingMeta } = (current?.meta as Record<string, unknown>) ?? {};
    void payment_reversed; // знімаємо флаг скасування при новій оплаті
    update.meta = {
      ...existingMeta,
      ...(body.payment_defer_date ? { payment_defer_date: body.payment_defer_date } : {}),
      ...(body.payment_mode      ? { payment_mode:       body.payment_mode       } : {}),
      ...(body.cancel_reason     ? { cancel_reason:      body.cancel_reason      } : {}),
      // Зберігаємо статус доставки до оплати, щоб не ламати прогрес-бар
      ...(isNewPayment ? {
        pre_payment_status: current?.procurement_status ?? null,
        is_paid:            body.procurement_status === 'paid',
        payment_status:     body.procurement_status,
      } : {}),
    };
  }

  // Проведення: встановлюємо status = 'confirmed'
  if (body.procurement_status === 'ordered') {
    update.status       = 'confirmed';
    update.confirmed_at = new Date().toISOString();
    update.confirmed_by = user.email;
  }

  // Скасування: також встановлюємо status = 'cancelled' (не тільки procurement_status)
  if (body.procurement_status === 'cancelled') {
    update.status = 'cancelled';
  }

  const { data: po } = await db.from('acc_documents').select('supplier_id, doc_number, total_cost, supplier_contract_id').eq('id', id).single();

  // Record payment to supplier in money_entries
  if (body.procurement_status === 'paid' && body.payment_amount && po?.supplier_id) {
    const creditAccount = body.payment_mode === 'cash' ? 'cash' : 'bank';
    await recordTxn({
      debitAccount:  'supplier',
      debitParty:    String(po.supplier_id),
      creditAccount,
      creditParty:   null,
      amount:        body.payment_amount,
      businessDate:  body.payment_date ?? new Date().toISOString().slice(0, 10),
      docId:         id,
      docType:       'supplier_payment',
      contractId:    po.supplier_contract_id ?? undefined,
      description:   `Оплата постачальнику: ${po.doc_number}`,
      idempotencyKey: `supplier_payment:${id}:${body.payment_date ?? ''}:${Math.round((body.payment_amount ?? 0) * 100)}`,
      createdBy:     user.email,
      meta:          { payment_mode: body.payment_mode ?? 'transfer' },
    });
  }

  const { error } = await db.from('acc_documents').update(update).eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Legacy оплата через status route: якщо встановили paid/invoiced → перевірити автозакриття
  if (body.procurement_status === 'paid') await maybeAutoClose(id);

  return NextResponse.json({ ok: true });
}
