import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServer } from '../../../../../lib/supabase-server';
import { createServiceClient } from '../../../../../lib/supabase';
import { recordDropshipSale } from '../../../../../lib/accounting/dropship';
import { releaseReservation } from '../../../../../lib/accounting/reservations';
import { notifyAdminStatusChange, notifyCustomerStatus } from '../../../../../lib/telegram';
import { recordCustomerPayment } from '../../../../../lib/accounting/money';

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();

  const role = user?.user_metadata?.role ?? '';
  if (!user || !['admin', 'manager'].includes(role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { id } = await params;
  const body = await req.json();
  const { status, tracking_number, tracking_ref, payment_confirmed, callback_done, supplier_confirmed, items: bodyItems, total_price: bodyTotalPrice } = body;

  const db = createServiceClient();
  const update: Record<string, unknown> = {};

  if (status !== undefined) {
    const VALID = ['new', 'confirmed', 'awaiting_stock', 'picking', 'shipped', 'delivered', 'cancelled'];
    if (!VALID.includes(status)) {
      return NextResponse.json({ error: 'Invalid status' }, { status: 400 });
    }

    // Always fetch current order for history tracking + manager backward check
    const { data: current } = await db
      .from('orders')
      .select('status, status_history')
      .eq('id', id)
      .single();

    // Managers cannot move status backward or cancel non-new orders
    if (role !== 'admin') {
      const STATUS_RANK: Record<string, number> = {
        new: 0, confirmed: 1, awaiting_stock: 2, picking: 3, shipped: 4, delivered: 5,
      };
      const currentStatus = current?.status ?? 'new';
      const isBackward = (STATUS_RANK[status] ?? -1) < (STATUS_RANK[currentStatus] ?? 0);
      const isCancelNonNew = status === 'cancelled' && currentStatus !== 'new';
      if (isBackward || isCancelNonNew) {
        return NextResponse.json({ error: 'Недостатньо прав для зміни статусу в зворотньому порядку' }, { status: 403 });
      }
    }

    update.status = status;
    const now = new Date().toISOString();
    if (status === 'shipped')   update.shipped_at   = now;
    if (status === 'delivered') update.delivered_at = now;
    if (status === 'cancelled') update.cancelled_at = now;

    // Append to status_history
    const history = Array.isArray(current?.status_history) ? current.status_history : [];
    update.status_history = [
      ...history,
      { status, at: now, by: user.email ?? 'admin' },
    ];
  }

  if (tracking_number !== undefined) update.tracking_number = tracking_number;
  if (tracking_ref    !== undefined) update.tracking_ref    = tracking_ref;
  if (payment_confirmed  !== undefined) update.payment_confirmed  = payment_confirmed;
  if (callback_done      !== undefined) update.callback_done      = callback_done;
  if (supplier_confirmed !== undefined) update.supplier_confirmed = supplier_confirmed;
  if (bodyItems !== undefined) update.items = bodyItems;
  if (bodyTotalPrice !== undefined) update.total_price = bodyTotalPrice;

  const { error } = await db.from('orders').update(update).eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // ── Оплата підтверджена → записуємо в леджер ─────────────────────────────
  if (payment_confirmed === true) {
    try {
      const { data: ord } = await db
        .from('orders')
        .select('payment_type, total_price, customer_id, order_number')
        .eq('id', id)
        .single();

      // Всі типи оплати що закривають дебіторку
      const PAYMENT_METHOD_MAP: Record<string, 'cash' | 'bank' | 'acquiring'> = {
        cash:     'cash',
        invoice:  'bank',
        bank:     'bank',
        card:     'acquiring',
        online:   'acquiring',
        liqpay:   'acquiring',
        mono:     'acquiring',
      };

      const payMethod = PAYMENT_METHOD_MAP[ord?.payment_type ?? ''] ?? 'bank';

      if (ord && ord.customer_id) {
        // Шукаємо активний договір клієнта (якщо є)
        let payContractId: string | undefined;
        const { data: ctr } = await db
          .from('customer_contracts')
          .select('id')
          .eq('customer_id', ord.customer_id)
          .eq('status', 'active')
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        payContractId = ctr?.id ?? undefined;

        const methodLabel = payMethod === 'cash' ? 'Готівка' : payMethod === 'acquiring' ? 'Еквайринг' : 'Безготівковий';
        await recordCustomerPayment({
          customerId:     ord.customer_id,
          contractId:     payContractId,
          amount:         Number(ord.total_price),
          paymentMethod:  payMethod,
          businessDate:   new Date().toISOString().slice(0, 10),
          description:    `${methodLabel} — замовлення #${ord.order_number}`,
          idempotencyKey: `payment:confirmed:${id}`,
          createdBy:      user.email,
        });
      }
    } catch (err: unknown) {
      // Ігноруємо duplicate idempotency key (вже записано раніше)
      const msg = String(err instanceof Error ? err.message : err);
      if (!msg.includes('unique') && !msg.includes('duplicate') && !msg.includes('23505')) {
        console.error('[payment] recordCustomerPayment failed:', err);
      }
    }
  }

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

  // shipped → знімаємо резерв спочатку, потім фіксуємо продаж в обліку
  // Порядок важливий: якщо спочатку списати FIFO а потім не зняти резерв —
  // qty_available стане штучно заниженим (qty_total↓, qty_reserved залишається).
  if (status === 'shipped') {
    try {
      await releaseReservation(id, 'shipped');
    } catch (err) {
      console.error('[reservation] release on ship failed:', err);
    }

    try {
      const { data: order } = await db
        .from('orders')
        .select('id, order_number, items, channel_code, partner_code, customer_id, payment_type, created_at')
        .eq('id', id)
        .single();

      if (order?.items?.length && order.channel_code !== 'dropship') {
        const bizDate = order.created_at
          ? new Date(order.created_at).toISOString().slice(0, 10)
          : new Date().toISOString().slice(0, 10);

        let saleContractId: string | undefined;
        if (order.customer_id) {
          const { data: ctr } = await db
            .from('customer_contracts')
            .select('id')
            .eq('customer_id', order.customer_id)
            .eq('status', 'active')
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();
          saleContractId = ctr?.id ?? undefined;
        }

        await recordDropshipSale({
          order_id:      order.id,
          order_number:  order.order_number,
          order_items:   order.items,
          channel_code:  order.channel_code ?? 'website',
          confirmed_by:  user.email ?? 'admin',
          customer_id:   order.customer_id ?? undefined,
          contract_id:   saleContractId,
          business_date: bizDate,
        });
      }
    } catch (err) {
      console.error('[accounting] recordDropshipSale failed:', err);
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
