import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServer } from '../../../../../lib/supabase-server';
import { createServiceClient } from '../../../../../lib/supabase';
import { recordDropshipSale } from '../../../../../lib/accounting/dropship';
import { releaseReservation } from '../../../../../lib/accounting/reservations';
import { notifyAdminStatusChange, notifyCustomerStatus } from '../../../../../lib/telegram';

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user || user.user_metadata?.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { id } = await params;
  const body = await req.json();
  const { status, tracking_number, tracking_ref, payment_confirmed, callback_done, items: bodyItems, total_price: bodyTotalPrice } = body;

  const db = createServiceClient();
  const update: Record<string, unknown> = {};

  if (status !== undefined) {
    const VALID = ['new', 'confirmed', 'awaiting_stock', 'picking', 'shipped', 'delivered', 'cancelled'];
    if (!VALID.includes(status)) {
      return NextResponse.json({ error: 'Invalid status' }, { status: 400 });
    }
    update.status = status;
  }

  if (tracking_number !== undefined) update.tracking_number = tracking_number;
  if (tracking_ref    !== undefined) update.tracking_ref    = tracking_ref;
  if (payment_confirmed !== undefined) update.payment_confirmed = payment_confirmed;
  if (callback_done !== undefined) update.callback_done = callback_done;
  if (bodyItems !== undefined) update.items = bodyItems;
  if (bodyTotalPrice !== undefined) update.total_price = bodyTotalPrice;

  const { error } = await db.from('orders').update(update).eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Note: reservation on confirm is now handled by /confirm endpoint (fulfillment decision)

  // cancelled → знімаємо резерв + повертаємо баланс партнера
  if (status === 'cancelled') {
    try {
      await releaseReservation(id, 'cancelled');
    } catch (err) {
      console.error('[reservation] release on cancel failed:', err);
    }

    try {
      const { data: order } = await db
        .from('orders')
        .select('channel_code, partner_code, items, status')
        .eq('id', id)
        .single();

      if (order?.channel_code === 'dropship' && order.partner_code) {
        const orderItems = (order.items ?? []) as { qty: number; cost_price?: number; price?: number }[];
        const totalCost = orderItems.reduce((s, i) => s + (i.cost_price ?? 0) * i.qty, 0);
        if (totalCost > 0) {
          await db.rpc('refund_partner_balance', {
            p_customer_id: order.partner_code,
            p_amount:      totalCost,
            p_order_id:    id,
            p_description: 'Повернення: замовлення скасовано',
          });
        }
      }
    } catch (err) {
      console.error('[balance] refund on cancel failed:', err);
    }
  }

  // shipped → фіксуємо продаж в обліку + знімаємо резерв
  if (status === 'shipped') {
    try {
      const { data: order } = await db
        .from('orders')
        .select('id, order_number, items, channel_code, partner_code')
        .eq('id', id)
        .single();

      if (order?.items?.length && order.channel_code !== 'dropship') {
        await recordDropshipSale({
          order_id:     order.id,
          order_number: order.order_number,
          order_items:  order.items,
          channel_code: order.channel_code ?? 'website',
          confirmed_by: user.email ?? 'admin',
        });
      }
    } catch (err) {
      console.error('[accounting] recordDropshipSale failed:', err);
    }

    try {
      await releaseReservation(id, 'shipped');
    } catch (err) {
      console.error('[reservation] release on ship failed:', err);
    }
  }

  // delivered + дропшип партнер → нараховуємо COD на баланс
  if (status === 'delivered') {
    try {
      const { data: order } = await db
        .from('orders')
        .select('id, order_number, total_price, payment_type, channel_code, partner_code')
        .eq('id', id)
        .single();

      if (order?.channel_code === 'dropship' && order.partner_code && order.payment_type === 'cod') {
        const { data: customer } = await db
          .from('customers')
          .select('id')
          .eq('id', order.partner_code)
          .single();

        if (customer) {
          const { error: creditErr } = await db.rpc('credit_cod_to_partner', {
            p_customer_id: customer.id,
            p_cod_amount:  order.total_price,
            p_order_id:    order.id,
            p_np_fee_pct:  2,
          });
          if (creditErr) console.error('[balance] credit_cod_to_partner failed:', creditErr);
        }
      }
    } catch (err) {
      console.error('[balance] COD credit failed:', err);
    }
  }

  // Telegram notifications (fire-and-forget)
  if (status) {
    try {
      const { data: order } = await db
        .from('orders')
        .select('order_number, contact, phone, telegram_chat_id, tracking_number')
        .eq('id', id)
        .single();

      if (order) {
        notifyAdminStatusChange(
          { order_number: order.order_number, contact: order.contact, phone: order.phone },
          status,
        );
        if (order.telegram_chat_id && ['confirmed', 'shipped', 'delivered', 'cancelled'].includes(status)) {
          notifyCustomerStatus(order.telegram_chat_id, order.order_number, status, order.tracking_number);
        }
      }
    } catch (err) {
      console.error('[telegram]', err);
    }
  }

  return NextResponse.json({ ok: true });
}
