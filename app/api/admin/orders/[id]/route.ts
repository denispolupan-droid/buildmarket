import { NextRequest, NextResponse } from 'next/server';
import { Resend } from 'resend';
import { createSupabaseServer } from '../../../../../lib/supabase-server';
import { createServiceClient } from '../../../../../lib/supabase';
import { recordDropshipSale, reverseDropshipLedgerExtras } from '../../../../../lib/accounting/dropship';
import { cancelDocument } from '../../../../../lib/accounting/documents';
import { releaseReservation } from '../../../../../lib/accounting/reservations';
import { notifyAdminStatusChange, notifyCustomerStatus } from '../../../../../lib/telegram';
import { buildCustomerStatusEmail } from '../../../../../lib/invoice-email';
import { recordCustomerPayment, recordMarketplaceCommission, recordShipment } from '../../../../../lib/accounting/money';
import { ourStatusToPromStatus, setPromOrderStatus } from '../../../../../lib/prom-api';
import { computePromCommission } from '../../../../../lib/prom-commission';
import { computeRozetkaCommission } from '../../../../../lib/rozetka-commission';
import { ourStatusToRozetkaStatus, setRozetkaOrderStatus } from '../../../../../lib/rozetka-api';

const resend = new Resend(process.env.RESEND_API_KEY);

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();

  const role = user?.user_metadata?.role ?? '';
  if (!user || !['admin', 'manager'].includes(role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { id } = await params;
  const body = await req.json();
  const {
    status, tracking_number, tracking_ref,
    payment_confirmed, callback_done, supplier_confirmed,
    items: bodyItems, total_price: bodyTotalPrice,
    delivery_type, delivery_subtype, delivery_city_name, delivery_address,
    payment_type, payment_due_date,
  } = body;

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
  if (bodyItems !== undefined)          update.items              = bodyItems;
  if (bodyTotalPrice !== undefined)     update.total_price         = bodyTotalPrice;
  if (delivery_type !== undefined)      update.delivery_type       = delivery_type;
  if (delivery_subtype !== undefined)   update.delivery_subtype    = delivery_subtype;
  if (delivery_city_name !== undefined) update.delivery_city_name  = delivery_city_name;
  if (delivery_address !== undefined)   update.delivery_address    = delivery_address;
  if (payment_due_date !== undefined)    update.payment_due_date    = payment_due_date;
  if (payment_type !== undefined)       update.payment_type        = payment_type;

  const { error } = await db.from('orders').update(update).eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // ── Зміна payment_type → облікова фіксація ───────────────────────────────
  let computedDueDate: string | null = null;
  if (payment_type !== undefined && ['invoice', 'deferred'].includes(payment_type)) {
    try {
      const { data: ord } = await db
        .from('orders')
        .select('status, shipped_at, customer_id, total_price, order_number')
        .eq('id', id)
        .single();

      if (ord?.customer_id && ['shipped', 'delivered'].includes(ord.status ?? '')) {
        // Перевіряємо чи вже є запис дебіторки для цього замовлення
        const { data: existing } = await db
          .from('money_entries')
          .select('id')
          .eq('order_id', id)
          .eq('account_type', 'customer')
          .gt('amount', 0)
          .limit(1)
          .maybeSingle();

        if (!existing) {
          // Замовлення відвантажили анонімно, тепер прив'язано до клієнта → фіксуємо дебіторку
          await recordShipment({
            customerId:     ord.customer_id,
            orderId:        id,
            amount:         Number(ord.total_price),
            businessDate:   ord.shipped_at?.slice(0, 10) ?? new Date().toISOString().slice(0, 10),
            createdBy:      user.email ?? 'admin',
            idempotencyKey: `shipment:payment-type:${id}`,
          });
        }
      }

      // Для відстрочки: розраховуємо дату погашення з договору
      if (payment_type === 'deferred' && ord?.customer_id) {
        let creditDays = 7;
        const { data: contract } = await db
          .from('customer_contracts')
          .select('credit_days')
          .eq('customer_id', ord.customer_id)
          .eq('status', 'active')
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        if (contract?.credit_days) creditDays = contract.credit_days;

        const base = ord?.shipped_at ? new Date(ord.shipped_at) : new Date();
        const due  = new Date(base.getTime() + creditDays * 86_400_000);
        computedDueDate = due.toISOString().slice(0, 10);
        await db.from('orders').update({ payment_due_date: computedDueDate }).eq('id', id);
      }

      // Безготівковий — очищуємо дату погашення якщо раніше стояла відстрочка
      if (payment_type === 'invoice') {
        await db.from('orders').update({ payment_due_date: null }).eq('id', id);
      }
    } catch (err) {
      console.error('[payment_type change] accounting:', err);
    }
  }

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
        deferred: 'bank',
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

    // Якщо замовлення вже було відвантажено (є підтверджена РН) — сторнуємо
    // облік: виручку/склад через cancelDocument, а COGS і борг перед
    // постачальником (записані recordDropshipSale окремо від документа)
    // через reverseDropshipLedgerExtras. Без цього скасоване замовлення
    // лишало б висіти виручку в дебіторці і борг постачальнику в кредиторці.
    try {
      const { data: saleDoc } = await db
        .from('acc_documents')
        .select('id')
        .eq('order_id', id)
        .eq('doc_type', 'sale')
        .eq('status', 'confirmed')
        .maybeSingle();

      if (saleDoc) {
        await cancelDocument(saleDoc.id, user.email ?? 'admin', 'Замовлення скасовано');
        await reverseDropshipLedgerExtras({ orderId: id, docId: saleDoc.id, createdBy: user.email ?? 'admin' });
      }
    } catch (err) {
      console.error('[accounting] cancel reversal failed:', err);
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

      // Prom.ua commission — точний розрахунок по SKU при доставці
      if (order?.channel_code === 'prom') {
        try {
          const [{ data: planRow }, { data: fallbackRow }, { data: fullOrder }] = await Promise.all([
            db.from('app_settings').select('value').eq('key', 'prom_plan').maybeSingle(),
            db.from('app_settings').select('value').eq('key', 'prom_commission_pct').maybeSingle(),
            db.from('orders').select('items, total_price').eq('id', id).single(),
          ]);

          const plan        = (planRow?.value ?? 'single') as 'single' | 'econom';
          const fallbackPct = parseFloat(fallbackRow?.value ?? '3');
          const items       = (fullOrder?.items ?? []) as { sku: string; qty: number; price: number }[];

          if (items.length > 0) {
            const result = await computePromCommission(items, { plan, fallbackPct });
            if (result.total_commission > 0) {
              const avgPct = Number(fullOrder?.total_price) > 0
                ? Math.round(result.total_commission / Number(fullOrder?.total_price) * 10000) / 100
                : fallbackPct;
              await recordMarketplaceCommission({
                orderId:       id,
                amount:        result.total_commission,
                marketplace:   'prom',
                commissionPct: avgPct,
                businessDate:  new Date().toISOString().slice(0, 10),
                createdBy:     user.email ?? 'admin',
              });
            }
          }
        } catch (err) {
          console.error('[prom] commission record failed:', err);
        }
      }

      // Rozetka commission — той самий принцип: точний розрахунок по SKU/категорії при доставці
      if (order?.channel_code === 'rozetka') {
        try {
          const [{ data: fallbackRow }, { data: fullOrder }] = await Promise.all([
            db.from('app_settings').select('value').eq('key', 'rozetka_commission_pct').maybeSingle(),
            db.from('orders').select('items, total_price').eq('id', id).single(),
          ]);

          const fallbackPct = parseFloat(fallbackRow?.value ?? '15');
          const items        = (fullOrder?.items ?? []) as { sku: string; qty: number; price: number }[];

          if (items.length > 0) {
            const result = await computeRozetkaCommission(items, { fallbackPct });
            if (result.total_commission > 0) {
              const avgPct = Number(fullOrder?.total_price) > 0
                ? Math.round(result.total_commission / Number(fullOrder?.total_price) * 10000) / 100
                : fallbackPct;
              await recordMarketplaceCommission({
                orderId:       id,
                amount:        result.total_commission,
                marketplace:   'rozetka',
                commissionPct: avgPct,
                businessDate:  new Date().toISOString().slice(0, 10),
                createdBy:     user.email ?? 'admin',
              });
            }
          }
        } catch (err) {
          console.error('[rozetka] commission record failed:', err);
        }
      }

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
        .select('order_number, contact, company, phone, email, telegram_chat_id, tracking_number')
        .eq('id', id)
        .single();

      if (order) {
        notifyAdminStatusChange(
          { order_number: order.order_number, contact: order.contact, phone: order.phone },
          status,
        );
        // Both channels, same as on order creation — Telegram when linked, email always
        // (email is the one channel every customer has, so it never gets skipped here).
        if (order.telegram_chat_id && ['confirmed', 'shipped', 'delivered', 'cancelled'].includes(status)) {
          notifyCustomerStatus(order.telegram_chat_id, order.order_number, status, order.tracking_number);
        }
        const statusEmailHtml = order.email
          ? buildCustomerStatusEmail({
              orderNumber: order.order_number, contact: order.contact, company: order.company ?? '',
              status, trackingNumber: order.tracking_number,
              siteUrl: process.env.NEXT_PUBLIC_SITE_URL ?? 'https://fixline.com.ua',
            })
          : null;
        if (statusEmailHtml) {
          resend.emails.send({
            from: 'FIXLINE <noreply@fixline.com.ua>', to: order.email,
            subject: `Замовлення №${order.order_number} — оновлення статусу`,
            html: statusEmailHtml,
          }).catch(e => console.error('[status email]', e));
        }
      }
    } catch (err) {
      console.error('[telegram]', err);
    }
  }

  // Push status to Prom.ua (fire-and-forget) if this is a Prom order
  if (status) {
    try {
      const { data: promOrder } = await db
        .from('orders')
        .select('prom_order_id, channel_code')
        .eq('id', id)
        .maybeSingle();

      if (promOrder?.channel_code === 'prom' && promOrder.prom_order_id) {
        const promStatus = ourStatusToPromStatus(status);
        if (promStatus) {
          setPromOrderStatus(Number(promOrder.prom_order_id), promStatus).catch(err =>
            console.error('[prom] setPromOrderStatus failed:', err),
          );
        }
      }
    } catch (err) {
      console.error('[prom] status push lookup failed:', err);
    }
  }

  // Push status to Rozetka (fire-and-forget) if this is a Rozetka order
  if (status) {
    try {
      const { data: rozOrder } = await db
        .from('orders')
        .select('rozetka_order_id, channel_code, tracking_number')
        .eq('id', id)
        .maybeSingle();

      if (rozOrder?.channel_code === 'rozetka' && rozOrder.rozetka_order_id) {
        const rozStatus = ourStatusToRozetkaStatus(status);
        if (rozStatus) {
          // status 3 (shipped) requires ttn — include it when already known, either from this
          // same request or a previously saved tracking_number.
          const ttn = (update.tracking_number as string | undefined) ?? (rozOrder.tracking_number as string | null) ?? undefined;
          setRozetkaOrderStatus(Number(rozOrder.rozetka_order_id), rozStatus, ttn ? { ttn } : undefined).catch(err =>
            console.error('[rozetka] setRozetkaOrderStatus failed:', err),
          );
        }
      }
    } catch (err) {
      console.error('[rozetka] status push lookup failed:', err);
    }
  }

  return NextResponse.json({ ok: true, ...(computedDueDate ? { payment_due_date: computedDueDate } : {}) });
}
