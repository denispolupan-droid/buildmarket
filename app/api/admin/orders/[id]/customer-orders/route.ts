import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServer } from '../../../../../../lib/supabase-server';
import { createServiceClient } from '../../../../../../lib/supabase';

// Скільки ще замовлень у цього клієнта (за customer_id, інакше за телефоном) + сумарно.
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

  const { data: order } = await db.from('orders')
    .select('customer_id, phone').eq('id', id).single();
  if (!order) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  let q = db.from('orders').select('total_price', { count: 'exact' }).neq('status', 'cancelled');
  q = order.customer_id ? q.eq('customer_id', order.customer_id) : q.eq('phone', order.phone);
  const { data: rows, count } = await q;

  const total = (rows ?? []).reduce((s, r) => s + Number(r.total_price ?? 0), 0);
  return NextResponse.json({ count: count ?? 0, total });
}
