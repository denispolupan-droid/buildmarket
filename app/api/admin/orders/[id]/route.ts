import { NextRequest, NextResponse } from 'next/server';
import { Resend } from 'resend';
import { createSupabaseServer } from '../../../../../lib/supabase-server';
import { createServiceClient } from '../../../../../lib/supabase';
import { reverseDropshipLedgerExtras, syncSaleDraftLines } from '../../../../../lib/accounting/dropship';
import { cancelDocument } from '../../../../../lib/accounting/documents';
import { releaseReservation } from '../../../../../lib/accounting/reservations';
import { notifyCustomerStatus } from '../../../../../lib/telegram';
import { buildCustomerStatusEmail } from '../../../../../lib/invoice-email';
import { recordCustomerPayment, recordShipment } from '../../../../../lib/accounting/money';
import { ourStatusToPromStatus, setPromOrderStatus } from '../../../../../lib/prom-api';
import { ourStatusToRozetkaStatus, setRozetkaOrderStatusChained } from '../../../../../lib/rozetka-api';
import { alertAdmin } from '../../../../../lib/alert';
import { completeOrderDelivery, syncDraftShipmentTracking } from '../../../../../lib/accounting/completion';
import { notifyCustomer } from '../../../../../lib/notify/send';
import { checkOrderCredit } from '../../../../../lib/accounting/credit-guard';

const resend = new Resend(process.env.RESEND_API_KEY);

// РН — кінцевий фінансовий документ виконаного замовлення. Ідемпотентно фіксує
// продаж (документ + виручка + COGS + борг постачальнику), якщо підтвердженої
// РН по замовленню ще немає. Викликається і на shipped, і на delivered.
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();

  const role = user?.app_metadata?.role ?? '';
  if (!user || !['admin', 'manager'].includes(role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { id } = await params;
  const body = await req.json();
  const {
    status, tracking_number, tracking_ref,
    payment_confirmed, callback_done, supplier_confirmed,
    invoice_as_company, invoice_options,
    items: bodyItems, total_price: bodyTotalPrice,
    delivery_type, delivery_subtype, delivery_city_name, delivery_address,
    payment_type, payment_due_date, shipping_supplier_id,
    internal_note, flags,
    // Причина скасування для Rozetka (id статусу групи 3) — обирає менеджер
    // при скасуванні rozetka-замовлення; без неї скасування в кабінет не пушиться
    rozetka_cancel_reason,
  } = body;

  const db = createServiceClient();
  const update: Record<string, unknown> = {};

  if (status !== undefined) {
    const VALID = ['new', 'pending_payment', 'confirmed', 'awaiting_stock', 'picking', 'shipped', 'delivered', 'cancelled'];
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
      // 'cancelled' isn't on the linear rank scale — exclude it here and let
      // isCancelNonNew decide, otherwise (rank -1 < any) blocks every cancel,
      // including cancelling a still-'new' order which managers are allowed to do.
      const isBackward = status !== 'cancelled'
        && (STATUS_RANK[status] ?? -1) < (STATUS_RANK[currentStatus] ?? 0);
      const isCancelNonNew = status === 'cancelled' && currentStatus !== 'new';
      if (isBackward || isCancelNonNew) {
        return NextResponse.json({ error: 'Недостатньо прав для зміни статусу в зворотньому порядку' }, { status: 403 });
      }
    }

    // Кредитний контроль: відгрузку в борг блокуємо ДО запису статусу
    if (status === 'shipped') {
      const credit = await checkOrderCredit(id);
      if (!credit.ok) {
        return NextResponse.json({ error: credit.reason }, { status: 409 });
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

  // Номер посилки правлять і руками (поле ТТН у картці), і при злитті замовлень
  // в одну накладну. Непроведені РН мусять їхати з тим самим номером — крон
  // доставки шукає їх саме за ним.
  if (tracking_number !== undefined) {
    update.tracking_number = tracking_number;
    await syncDraftShipmentTracking(id, (tracking_number as string) || null);
  }
  if (tracking_ref    !== undefined) update.tracking_ref    = tracking_ref;
  if (payment_confirmed  !== undefined) update.payment_confirmed  = payment_confirmed;
  if (callback_done      !== undefined) update.callback_done      = callback_done;
  if (internal_note      !== undefined) update.internal_note      = internal_note === '' ? null : internal_note;
  if (flags              !== undefined && Array.isArray(flags))
    update.flags = flags.filter((f: unknown): f is string => typeof f === 'string').slice(0, 20);
  if (invoice_as_company !== undefined) update.invoice_as_company = invoice_as_company;
  if (invoice_options    !== undefined) update.invoice_options    = invoice_options;
  if (supplier_confirmed !== undefined) update.supplier_confirmed = supplier_confirmed;
  if (bodyItems !== undefined)          update.items              = bodyItems;
  if (bodyTotalPrice !== undefined)     update.total_price         = bodyTotalPrice;
  if (delivery_type !== undefined)      update.delivery_type       = delivery_type;
  if (delivery_subtype !== undefined)   update.delivery_subtype    = delivery_subtype;
  if (delivery_city_name !== undefined) update.delivery_city_name  = delivery_city_name;
  if (delivery_address !== undefined)   update.delivery_address    = delivery_address;
  if (payment_due_date !== undefined)    update.payment_due_date    = payment_due_date;
  if (payment_type !== undefined)       update.payment_type        = payment_type;
  if (shipping_supplier_id !== undefined) {
    if (shipping_supplier_id !== null && !Number.isInteger(shipping_supplier_id)) {
      return NextResponse.json({ error: 'Invalid shipping_supplier_id' }, { status: 400 });
    }
    update.shipping_supplier_id = shipping_supplier_id;
  }

  const { error } = await db.from('orders').update(update).eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // ── Редагування позицій → синхронізуємо рядки РН-чернетки ────────────────
  // Комісія маркетплейсу/виручка/COGS рахуються при доставці по рядках РН, а не
  // по orders.items. Якщо к-сть/ціну змінили після відвантаження — приводимо
  // чернетку у відповідність, щоб при доставці все порахувалось правильно.
  // Єдина логіка для всіх каналів (Prom/Rozetka/сайт).
  if (Array.isArray(bodyItems)) {
    try {
      const lineItems = bodyItems
        .filter((i: { sku?: string }) => i?.sku)
        .map((i: { sku: string; qty: number; price: number }) => ({ sku: i.sku, qty: Number(i.qty), price: Number(i.price) }));
      const res = await syncSaleDraftLines(id, lineItems, user.email ?? 'admin');
      if (res.needsManual) {
        alertAdmin(
          `Правку позицій замовлення не проведено автоматично в обліку (order ${id}, причина: ${res.reason})`,
          res.reason === 'confirmed_sale_doc'
            ? 'РН вже проведена (доставлено) — перевірте виручку/комісію та за потреби оформіть коригування вручну.'
            : 'Кілька РН-чернеток по замовленню (мультипосилка) — оновіть потрібну РН вручну.',
        );
      }
    } catch (err) {
      alertAdmin(`Синхронізація рядків РН після правки позицій не пройшла (order ${id})`, err);
    }
  }

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
        const { data: ctr } = await db
          .from('customer_contracts')
          .select('id')
          .eq('customer_id', ord.customer_id)
          .eq('status', 'active')
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        const payContractId = ctr?.id ?? undefined;

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
      // Якщо сторно не пройшло — по скасованому замовленню залишиться висіти
      // виручка/борг постачальнику. Це треба лагодити руками, тому алертуємо.
      alertAdmin(`Сторно обліку при скасуванні замовлення не пройшло (order ${id})`, err);
    }
  }

  // shipped → косметичний статус (Варіант 3): проводок немає, резерв тримаємо до
  // доставки. РН-чернетки створює /ship; проводяться вони при доставці посилки.

  // delivered → проводимо всі РН-чернетки замовлення (виручка/COGS/склад + комісія
  // маркетплейсу по позиціях кожної РН); резерв знімається при проведенні. Ручний
  // перехід у delivered трактуємо як повну доставку.
  if (status === 'delivered') {
    await completeOrderDelivery(id, user.email ?? 'admin');
  }

  // «Підтверджено» — момент, коли ми беремо замовлення в роботу, і перше, що
  // покупець має від нас почути. Далі його чекають «відправлено, ТТН …» і
  // «прибуло у відділення» з крона доставки. Повтор виключено на рівні БД
  // (UNIQUE order_id+event), тож повторне натискання статусу нічого не надішле.
  if (status === 'confirmed') {
    const { data: o } = await db
      .from('orders').select('order_number, phone, total_price').eq('id', id).single();
    if (o) {
      notifyCustomer({
        orderId: id,
        phone:   o.phone as string,
        event:   'accepted',
        ctx:     { orderNumber: o.order_number as number, total: Number(o.total_price) },
      }).catch(err => console.error('[orders] notify accepted failed:', id, err));
    }
  }

  // Telegram notifications (fire-and-forget)
  if (status) {
    try {
      const { data: order } = await db
        .from('orders')
        .select('order_number, contact, company, phone, email, telegram_chat_id, tracking_number, delivery_type')
        .eq('id', id)
        .single();

      if (order) {
        // Both channels, same as on order creation — Telegram when linked, email always
        // (email is the one channel every customer has, so it never gets skipped here).
        if (order.telegram_chat_id && ['confirmed', 'shipped', 'delivered', 'cancelled'].includes(status)) {
          notifyCustomerStatus(order.telegram_chat_id, order.order_number, status, order.tracking_number, order.delivery_type);
        }
        const statusEmailHtml = order.email
          ? buildCustomerStatusEmail({
              orderNumber: order.order_number, contact: order.contact, company: order.company ?? '',
              status, trackingNumber: order.tracking_number, deliveryType: order.delivery_type,
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
        // Скасування: статус 13 продавцю недоступний, тому мапа дає null —
        // пушимо конкретну причину, обрану менеджером (rozetka_cancel_reason)
        const rozStatus = status === 'cancelled'
          ? (typeof rozetka_cancel_reason === 'number' ? rozetka_cancel_reason : null)
          : ourStatusToRozetkaStatus(status);
        if (rozStatus) {
          // status 3 (shipped) requires ttn — include it when already known, either from this
          // same request or a previously saved tracking_number.
          const ttn = (update.tracking_number as string | undefined) ?? (rozOrder.tracking_number as string | null) ?? undefined;
          setRozetkaOrderStatusChained(Number(rozOrder.rozetka_order_id), rozStatus, ttn ? { ttn } : undefined).catch(err =>
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
