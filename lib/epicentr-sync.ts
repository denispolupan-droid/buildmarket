/**
 * Синк замовлень Епіцентру (дзеркало prom-sync / rozetka-sync).
 *
 *   1. Тягнемо замовлення, оновлені за останні 48 год (вікно перекриває дірки
 *      між запусками крона).
 *   2. Нові — імпортуємо в orders (customer за телефоном, знімок комісії в
 *      epicentr_data._commission).
 *   3. Існуючі — самолікування: допушуємо статус/ТТН, які не дійшли (пуш при
 *      підтвердженні/відвантаженні — fire-and-forget), фіксуємо пізню оплату,
 *      скасовуємо в себе те, що скасував покупець/площадка.
 */
import { createClient } from '@supabase/supabase-js';
import {
  getEpicentrOrders, epicentrOrderToOurFormat, ourStatusToEpicentrStatus, setEpicentrOrderStatus,
  setEpicentrTTN, hasEpicentrToken, EPICENTR_CANCELLED, EPICENTR_TERMINAL,
  type EpicentrOrder, type EpicentrOrderStatus,
} from './epicentr-api';
import { computeEpicentrCommission, getEpicentrFallbackPct } from './epicentr-commission';
import { handleMarketplaceCancelledOrder, type CancelWatchOrder } from './marketplace-cancel-watch';

const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

/** З яких живих статусів Епіцентру допушуємо наш цільовий статус. */
const REPUSH_FROM: Partial<Record<EpicentrOrderStatus, EpicentrOrderStatus[]>> = {
  confirmed_by_merchant: ['new'],
  sent:                  ['new', 'confirmed_by_merchant', 'confirmed'],
};

export type EpicentrSyncResult = {
  ok: boolean;
  error?: string;
  created: number;
  skipped: number;
  repushed: number;
  ttnRepushed: number;
  paidUpdated: number;
  cancelled: number;
  total: number;
};

export async function syncEpicentrOrders(): Promise<EpicentrSyncResult> {
  const empty: EpicentrSyncResult = { ok: true, created: 0, skipped: 0, repushed: 0, ttnRepushed: 0, paidUpdated: 0, cancelled: 0, total: 0 };
  if (!(await hasEpicentrToken())) return { ...empty, ok: false, error: 'Ключ API Епіцентру не налаштований' };

  const updatedFrom = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
  const orders = await getEpicentrOrders({ updatedFrom, limit: 50 });
  if (!orders.length) return empty;

  const fallbackPct = await getEpicentrFallbackPct(db);
  const result = { ...empty, total: orders.length };

  for (const epi of orders) {
    const { data: existing } = await db
      .from('orders')
      .select('id, order_number, status, payment_confirmed, total_price, comment, epicentr_data, tracking_number, status_history')
      .eq('epicentr_order_id', epi.id)
      .maybeSingle();

    if (existing) {
      await reconcileExisting(existing, epi, result);
      result.skipped++;
      continue;
    }

    // Скасоване до імпорту — не заводимо
    if (EPICENTR_CANCELLED.includes(epi.statusCode) || epi.statusCode === 'canceled_by_merchant') {
      result.skipped++;
      continue;
    }

    const mapped = epicentrOrderToOurFormat(epi);
    const commission = await computeEpicentrCommission(mapped.items, { fallbackPct });
    const enriched = { ...(mapped.epicentr_data as unknown as Record<string, unknown>), _commission: commission };

    let customerId: string | null = null;
    if (mapped.phone) {
      const { data: cust } = await db.from('customers').select('id').eq('phone', mapped.phone).maybeSingle();
      customerId = cust?.id ?? null;
    }
    if (!customerId) {
      const { data: newCust } = await db
        .from('customers')
        .insert({
          name: mapped.contact, phone: mapped.phone || null, email: mapped.email || null,
          type: 'retail', price_tier: 'retail', is_active: true,
          orders_count: 0, total_revenue: 0, balance: 0, balance_held: 0, meta: {},
        })
        .select('id')
        .single();
      customerId = newCust?.id ?? null;
    }

    const { error } = await db.from('orders').insert({
      customer_id:       customerId,
      contact:           mapped.contact,
      phone:             mapped.phone,
      email:             mapped.email,
      delivery_type:     mapped.delivery_type,
      delivery_subtype:  mapped.delivery_subtype,
      delivery_address:  mapped.delivery_address,
      delivery_city_ref:      mapped.delivery_city_ref,
      delivery_city_name:     mapped.delivery_city_name,
      delivery_warehouse_ref: mapped.delivery_warehouse_ref,
      payment_type:      mapped.payment_type,
      payment_confirmed: mapped.paid,
      amount_paid:       mapped.paid ? mapped.total_price : 0,
      price_type:        'retail',
      comment:           mapped.comment,
      items:             mapped.items,
      total_price:       mapped.total_price,
      status:            'new',
      channel_code:      'epicentr',
      epicentr_order_id: mapped.epicentr_order_id,
      epicentr_data:     enriched,
    });

    if (error) {
      console.error('[epicentr-sync] insert failed:', error.message, 'epicentr_id:', epi.id, 'number:', epi.number);
    } else {
      result.created++;
    }
  }

  return result;
}

type ExistingRow = {
  id: string; order_number: number; status: string; payment_confirmed: boolean | null; total_price: number;
  comment: string | null; epicentr_data: Record<string, unknown> | null; tracking_number: string | null;
  status_history: { status: string; at: string; by: string }[] | null;
};

async function reconcileExisting(existing: ExistingRow, epi: EpicentrOrder, result: EpicentrSyncResult) {
  // Освіжаємо знімок payload (статус, оплата, ТТН), зберігаючи наш _commission
  const snapshot = { ...(epi as unknown as Record<string, unknown>), _commission: existing.epicentr_data?._commission };
  const patch: Record<string, unknown> = { epicentr_data: snapshot };

  // Пізня оплата: онлайн-оплата проходить ПІСЛЯ створення замовлення
  const prevPayed = Boolean((existing.epicentr_data as { payed?: boolean } | null)?.payed);
  if (!existing.payment_confirmed && epi.payed && !prevPayed) {
    const pay = epi.address?.shipment?.paymentProvider;
    if (pay !== 'pay_on_delivery' && pay !== 'pay_on_pickup') {
      patch.payment_confirmed = true;
      patch.amount_paid       = existing.total_price;
      patch.payment_type      = 'prepaid';
      result.paidUpdated++;
      console.log(`[epicentr-sync] late payment confirmed for order ${epi.number}`);
    }
  }

  const { error: upErr } = await db.from('orders').update(patch).eq('id', existing.id);
  if (upErr) console.error('[epicentr-sync] snapshot update failed:', epi.id, upErr.message);

  // Скасування покупцем/площадкою → скасовуємо в себе (з урахуванням відвантаження)
  if (EPICENTR_CANCELLED.includes(epi.statusCode) && !['cancelled', 'delivered'].includes(existing.status)) {
    try {
      const ours: CancelWatchOrder = {
        id: existing.id, order_number: existing.order_number, status: existing.status,
        rozetka_order_id: null, prom_order_id: null, status_history: existing.status_history,
      };
      await handleMarketplaceCancelledOrder(db, ours, 'Епіцентр');
      result.cancelled++;
    } catch (err) {
      console.error('[epicentr-sync] cancel handling failed:', epi.id, err);
    }
    return;
  }
  if (EPICENTR_TERMINAL.includes(epi.statusCode)) return;

  // Допуш ТТН (потрібна ДО статусу sent)
  const ourTtn = existing.tracking_number;
  const epiTtn = epi.address?.shipment?.number ?? null;
  if (['shipped', 'delivered'].includes(existing.status) && ourTtn && ourTtn !== epiTtn) {
    try {
      await setEpicentrTTN(epi.id, ourTtn);
      result.ttnRepushed++;
      console.log(`[epicentr-sync] re-pushed TTN ${ourTtn} for order ${epi.number}`);
    } catch (err) {
      console.error('[epicentr-sync] TTN re-push failed:', epi.id, err);
    }
  }

  // Допуш статусу
  const desired = ourStatusToEpicentrStatus(existing.status);
  if (desired && desired !== 'canceled_by_merchant' && REPUSH_FROM[desired]?.includes(epi.statusCode)) {
    try {
      // Відправка без ТТН Епіцентр відхиляє — не пробуємо
      if (desired === 'sent' && !ourTtn && !epiTtn) return;
      await setEpicentrOrderStatus(epi.id, desired);
      result.repushed++;
      console.log(`[epicentr-sync] re-pushed status ${desired} for order ${epi.number} (was ${epi.statusCode})`);
    } catch (err) {
      console.error('[epicentr-sync] status re-push failed:', epi.id, err);
    }
  }
}
