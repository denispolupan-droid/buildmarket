import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServer } from '../../../../../../lib/supabase-server';
import { createServiceClient } from '../../../../../../lib/supabase';
import { recordTxn } from '../../../../../../lib/accounting/money';

const db = createServiceClient();

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || user.user_metadata?.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

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
  };

  const update: Record<string, unknown> = {};
  if (body.procurement_status)       update.procurement_status       = body.procurement_status;
  if (body.supplier_invoice_number)  update.supplier_invoice_number  = body.supplier_invoice_number;
  if (body.supplier_invoice_date)    update.supplier_invoice_date    = body.supplier_invoice_date;
  if (body.supplier_invoice_amount)  update.supplier_invoice_amount  = body.supplier_invoice_amount;
  if (body.expected_date)            update.expected_date            = body.expected_date;

  // Зберігаємо деталі оплати в meta
  if (body.payment_defer_date || body.payment_mode) {
    const { data: current } = await db.from('acc_documents').select('meta').eq('id', id).single();
    const existingMeta = (current?.meta as Record<string, unknown>) ?? {};
    update.meta = {
      ...existingMeta,
      ...(body.payment_defer_date ? { payment_defer_date: body.payment_defer_date } : {}),
      ...(body.payment_mode      ? { payment_mode:       body.payment_mode       } : {}),
    };
  }

  const { data: po } = await db.from('acc_documents').select('supplier_id, doc_number, total_cost').eq('id', id).single();

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
      description:   `Оплата постачальнику: ${po.doc_number}`,
      idempotencyKey: `supplier_payment:${id}`,
      createdBy:     user.email,
    });
  }

  const { error } = await db.from('acc_documents').update(update).eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
