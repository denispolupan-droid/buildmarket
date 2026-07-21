import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServer } from '../../../../../../lib/supabase-server';
import { createServiceClient } from '../../../../../../lib/supabase';
import { applyOrderPayment } from '../../../../../../lib/accounting/order-payment';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || !['admin', 'manager'].includes(user.app_metadata?.role ?? '')) {
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
  if (!user || !['admin', 'manager'].includes(user.app_metadata?.role ?? '')) {
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
  const res = await applyOrderPayment(db, {
    orderId:     id,
    amount,
    paymentMode: payment_mode,
    paymentDate: payment_date,
    note,
    createdBy:   user.email ?? 'admin',
  });
  if (!res.ok) {
    const status = res.error === 'Замовлення не знайдено' ? 404 : 400;
    return NextResponse.json({ error: res.error }, { status });
  }

  return NextResponse.json({
    ok:            true,
    payment:       res.payment,
    amount_paid:   res.amountPaid,
    is_fully_paid: res.isFullyPaid,
  });
}
