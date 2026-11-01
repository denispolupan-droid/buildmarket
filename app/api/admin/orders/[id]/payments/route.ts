import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '../../../../../../lib/supabase-service';
import { applyOrderPayment } from '../../../../../../lib/accounting/order-payment';
import { requireStaff } from '../../../../../../lib/auth-guard';
import { parseBody, zMoney, zYmd, zYmdOpt, zText, z } from '../../../../../../lib/validate';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireStaff('admin', 'manager');
  if (!auth.ok) return auth.response;

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
  const auth = await requireStaff('admin', 'manager');
  if (!auth.ok) return auth.response;
  const { user } = auth;

  const { id } = await params;
  const body = await parseBody(req, z.object({
    amount:       zMoney,
    payment_mode: z.enum(['cash', 'transfer', 'bank', 'card', 'acquiring']),
    payment_date: zYmdOpt,
    note:         zText(500),
  }));
  if (!body.ok) return body.response;
  const { amount, payment_mode, payment_date, note } = body.data;

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
