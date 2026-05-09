import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServer } from '../../../../../lib/supabase-server';
import { createServiceClient } from '../../../../../lib/supabase';
import { recordDropshipSale } from '../../../../../lib/accounting/dropship';

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user || user.user_metadata?.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { id } = await params;
  const body = await req.json();
  const { status, tracking_number, payment_confirmed, callback_done } = body;

  const db = createServiceClient();
  const update: Record<string, unknown> = {};

  if (status !== undefined) {
    const VALID = ['new', 'confirmed', 'shipped', 'delivered', 'cancelled'];
    if (!VALID.includes(status)) {
      return NextResponse.json({ error: 'Invalid status' }, { status: 400 });
    }
    update.status = status;
  }

  if (tracking_number !== undefined) update.tracking_number = tracking_number;
  if (payment_confirmed !== undefined) update.payment_confirmed = payment_confirmed;
  if (callback_done !== undefined) update.callback_done = callback_done;
  if (body.items !== undefined) update.items = body.items;
  if (body.total_price !== undefined) update.total_price = body.total_price;

  const { error } = await db.from('orders').update(update).eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // При переходе в shipped — фиксируем продажу в учёте (дропшип)
  if (status === 'shipped') {
    try {
      const { data: order } = await db
        .from('orders')
        .select('id, order_number, items, channel_code')
        .eq('id', id)
        .single();

      if (order?.items?.length) {
        await recordDropshipSale({
          order_id:      order.id,
          order_number:  order.order_number,
          order_items:   order.items,
          channel_code:  order.channel_code ?? 'website',
          confirmed_by:  user.email ?? 'admin',
        });
      }
    } catch (err) {
      // Не прерываем смену статуса если учёт упал — логируем и продолжаем
      console.error('[accounting] recordDropshipSale failed:', err);
    }
  }

  return NextResponse.json({ ok: true });
}
