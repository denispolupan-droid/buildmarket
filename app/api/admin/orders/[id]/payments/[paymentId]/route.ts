import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServer } from '../../../../../../../lib/supabase-server';
import { createServiceClient } from '../../../../../../../lib/supabase';
import { recordTxn } from '../../../../../../../lib/accounting/money';
import { createPaymentVoucher } from '../../../../../../../lib/accounting/documents';

const PAYMENT_METHOD_MAP: Record<string, 'cash' | 'bank' | 'acquiring'> = {
  cash:      'cash',
  transfer:  'bank',
  card:      'acquiring',
  acquiring: 'acquiring',
};

// DELETE — сторнування окремого платежу (тільки admin)
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; paymentId: string }> },
) {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || user.user_metadata?.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { id: orderId, paymentId } = await params;
  const db = createServiceClient();

  // Знаходимо платіж
  const { data: payment, error: findErr } = await db
    .from('order_payments')
    .select('*')
    .eq('id', paymentId)
    .eq('order_id', orderId)
    .single();
  if (findErr || !payment) return NextResponse.json({ error: 'Платіж не знайдено' }, { status: 404 });
  if (payment.reversed)    return NextResponse.json({ error: 'Платіж вже скасовано' }, { status: 400 });

  // Позначаємо як скасований
  const { error: revErr } = await db
    .from('order_payments')
    .update({ reversed: true, reversed_at: new Date().toISOString(), reversed_by: user.email ?? 'admin' })
    .eq('id', paymentId);
  if (revErr) return NextResponse.json({ error: revErr.message }, { status: 500 });

  // Перераховуємо amount_paid з усіх активних платежів
  const { data: allPayments } = await db
    .from('order_payments')
    .select('amount')
    .eq('order_id', orderId)
    .eq('reversed', false);
  const newAmountPaid = (allPayments ?? []).reduce((s, p) => s + Number(p.amount), 0);

  const { data: order } = await db.from('orders').select('total_price, customer_id, order_number').eq('id', orderId).single();
  const totalPrice  = Number(order?.total_price ?? 0);
  const isFullyPaid = totalPrice > 0 && newAmountPaid >= totalPrice * 0.999;

  await db.from('orders').update({
    amount_paid:       newAmountPaid,
    payment_confirmed: isFullyPaid,
  }).eq('id', orderId);

  // Компенсуюча проводка в леджері (append-only: реверс original entry)
  if (order?.customer_id) {
    const ledgerMethod = PAYMENT_METHOD_MAP[payment.payment_mode] ?? 'bank';
    try {
      const voucher = await createPaymentVoucher({
        doc_type:    'customer_payment_reversal',
        customer_id: order.customer_id,
        order_id:    orderId,
        amount:      Number(payment.amount),
        created_by:  user.email ?? 'admin',
        meta:        { payment_mode: payment.payment_mode, reversed_payment_id: paymentId },
      });
      await recordTxn({
        debitAccount:   'customer',
        debitParty:     order.customer_id,
        creditAccount:  ledgerMethod,
        creditParty:    null,
        amount:         Number(payment.amount),
        businessDate:   new Date().toISOString().slice(0, 10),
        docId:          voucher.id,
        docType:        'customer_payment_reversal',
        orderId,
        description:    `Скасування оплати — замовлення #${order.order_number}`,
        idempotencyKey: `order_payment_reversal:${paymentId}`,
        createdBy:      user.email ?? 'admin',
        meta:           { payment_mode: payment.payment_mode, reversed_payment_id: paymentId },
      });
    } catch (err: unknown) {
      const msg = String(err instanceof Error ? err.message : err);
      if (!msg.includes('unique') && !msg.includes('duplicate') && !msg.includes('23505')) {
        console.error('[order payment reversal] ledger write failed:', err);
      }
    }
  }

  return NextResponse.json({ ok: true, amount_paid: newAmountPaid, is_fully_paid: isFullyPaid });
}
