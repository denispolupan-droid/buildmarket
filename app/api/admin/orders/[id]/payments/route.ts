import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServer } from '../../../../../../lib/supabase-server';
import { createServiceClient } from '../../../../../../lib/supabase';
import { recordTxn } from '../../../../../../lib/accounting/money';

const PAYMENT_METHOD_MAP: Record<string, 'cash' | 'bank' | 'acquiring'> = {
  cash:       'cash',
  transfer:   'bank',
  card:       'acquiring',
  acquiring:  'acquiring',
};

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || !['admin', 'manager'].includes(user.user_metadata?.role ?? '')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { id } = await params;
  const db = createServiceClient();

  const { data, error } = await db
    .from('order_payments')
    .select('*')
    .eq('order_id', id)
    .order('created_at', { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || !['admin', 'manager'].includes(user.user_metadata?.role ?? '')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { id } = await params;
  const { amount, payment_mode, payment_date, note } = await req.json() as {
    amount:       number;
    payment_mode: string;
    payment_date: string;
    note?:        string;
  };

  if (!amount || amount <= 0)  return NextResponse.json({ error: 'Сума має бути більше 0' }, { status: 400 });
  if (!payment_mode)           return NextResponse.json({ error: 'Вкажіть спосіб оплати' }, { status: 400 });

  const db = createServiceClient();

  // Завантажуємо замовлення
  const { data: order, error: orderErr } = await db
    .from('orders')
    .select('order_number, total_price, amount_paid, customer_id, payment_type')
    .eq('id', id)
    .single();
  if (orderErr || !order) return NextResponse.json({ error: 'Замовлення не знайдено' }, { status: 404 });

  // Вставляємо запис оплати
  const { data: payment, error: insertErr } = await db
    .from('order_payments')
    .insert({
      order_id:     id,
      amount,
      payment_mode,
      payment_date: payment_date ?? new Date().toISOString().slice(0, 10),
      note:         note ?? null,
      created_by:   user.email ?? 'admin',
    })
    .select()
    .single();
  if (insertErr) return NextResponse.json({ error: insertErr.message }, { status: 500 });

  // Оновлюємо кеш amount_paid + payment_confirmed
  const newAmountPaid   = Number(order.amount_paid ?? 0) + amount;
  const totalPrice      = Number(order.total_price);
  const isFullyPaid     = totalPrice > 0 && newAmountPaid >= totalPrice * 0.999;

  await db.from('orders').update({
    amount_paid:       newAmountPaid,
    payment_confirmed: isFullyPaid,
  }).eq('id', id);

  // Записуємо в грошовий леджер (тільки якщо є customer_id)
  if (order.customer_id) {
    const ledgerMethod = PAYMENT_METHOD_MAP[payment_mode] ?? 'bank';
    const modeLabel: Record<string, string> = {
      cash: 'Готівка', transfer: 'Безготівковий', card: 'Карта', acquiring: 'Еквайринг',
    };

    // Знаходимо активний договір клієнта
    let contractId: string | undefined;
    const { data: ctr } = await db
      .from('customer_contracts')
      .select('id')
      .eq('customer_id', order.customer_id)
      .eq('status', 'active')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    contractId = ctr?.id ?? undefined;

    try {
      await recordTxn({
        debitAccount:   ledgerMethod,
        debitParty:     null,
        creditAccount:  'customer',
        creditParty:    order.customer_id,
        amount,
        businessDate:   payment_date ?? new Date().toISOString().slice(0, 10),
        docType:        'customer_payment',
        orderId:        id,
        contractId,
        description:    `${modeLabel[payment_mode] ?? payment_mode} — замовлення #${order.order_number}${note ? ': ' + note : ''}`,
        idempotencyKey: `order_payment:${payment.id}`,
        createdBy:      user.email ?? 'admin',
        meta:           { payment_mode, order_payment_id: payment.id },
      });
    } catch (err: unknown) {
      const msg = String(err instanceof Error ? err.message : err);
      // idempotency duplicate — ігноруємо
      if (!msg.includes('unique') && !msg.includes('duplicate') && !msg.includes('23505')) {
        console.error('[order payment] ledger write failed:', err);
      }
    }
  }

  return NextResponse.json({
    ok:            true,
    payment,
    amount_paid:   newAmountPaid,
    is_fully_paid: isFullyPaid,
  });
}
