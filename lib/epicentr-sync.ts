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
import {
  getEpicentrOrders, getEpicentrOrder, epicentrOrderToOurFormat, ourStatusToEpicentrStatus, setEpicentrOrderStatus,
  setEpicentrTTN, hasEpicentrToken, epicentrOrderPaid, epicentrHoldLost, epicentrHasContacts,
  EPICENTR_CANCELLED, EPICENTR_TERMINAL,
  type EpicentrOrder, type EpicentrOrderStatus,
} from './epicentr-api';
import { findCustomerIdByPhone } from './customers';
import { alertAdmin } from './alert';
import { log } from './log';
import { getEpicentrFallbackPct } from './epicentr-commission';
import { importMarketplaceOrder } from './marketplace/import-order';
import { epicentrAdapter } from './marketplace/epicentr';
import { handleMarketplaceCancelledOrder, type CancelWatchOrder } from './marketplace-cancel-watch';
import { createServiceClient, type TableUpdate } from './supabase-service';

const db = createServiceClient();

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
  contactsFilled: number;
  cancelled: number;
  total: number;
};

export async function syncEpicentrOrders(): Promise<EpicentrSyncResult> {
  const empty: EpicentrSyncResult = { ok: true, created: 0, skipped: 0, repushed: 0, ttnRepushed: 0, paidUpdated: 0, contactsFilled: 0, cancelled: 0, total: 0 };
  if (!(await hasEpicentrToken())) return { ...empty, ok: false, error: 'Ключ API Епіцентру не налаштований' };

  const updatedFrom = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
  const orders = await getEpicentrOrders({ updatedFrom, limit: 50 });
  if (!orders.length) return empty;

  const adapter = epicentrAdapter({ fallbackPct: await getEpicentrFallbackPct(db) });
  const result = { ...empty, total: orders.length };

  for (const epi of orders) {
    const { data: existing } = await db
      .from('orders')
      .select('id, order_number, status, payment_confirmed, total_price, comment, epicentr_data, tracking_number, status_history, contact, phone, email, delivery_address, delivery_city_name, customer_id')
      .eq('epicentr_order_id', epi.id)
      .maybeSingle();

    if (existing) {
      await reconcileExisting(existing as unknown as Parameters<typeof reconcileExisting>[0], epi, result);
      result.skipped++;
      continue;
    }

    // Новий — спільний імпорт (скасовані до імпорту адаптер відсіває сам).
    // Місто й відділення людськими назвами є лише в картці /v6 — беремо її.
    const res = await importMarketplaceOrder(db, adapter, await withCard(epi));
    if (res.status === 'created') result.created++;
    else if (res.status === 'skipped' || res.status === 'exists') result.skipped++;
  }

  return result;
}

/** Список + картка /v6 (місто, відділення, контакти після підтвердження). Картка недоступна — лишаємо список. */
async function withCard(epi: EpicentrOrder): Promise<EpicentrOrder> {
  try {
    const card = await getEpicentrOrder(epi.id);
    return card ? { ...epi, ...card, items: card.items?.length ? card.items : epi.items } : epi;
  } catch (err) {
    log.warn('epicentr.card_failed', { id: epi.id, err: err instanceof Error ? err.message : String(err) });
    return epi;
  }
}

type ExistingRow = {
  id: string; order_number: number; status: string; payment_confirmed: boolean | null; total_price: number;
  comment: string | null; epicentr_data: Record<string, unknown> | null; tracking_number: string | null;
  status_history: { status: string; at: string; by: string }[] | null;
  contact: string | null; phone: string | null; email: string | null;
  delivery_address: string | null; delivery_city_name: string | null; customer_id: string | null;
};

const PLACEHOLDER_CONTACT = 'Клієнт Епіцентр';

/**
 * Контакти й адреса з картки в наше замовлення — лише в порожні поля (ручні
 * правки менеджера не перебиваємо). Клієнт: знайшовся за телефоном — переносимо
 * замовлення на нього; ні — дописуємо ім'я/телефон у клієнта-заглушку, створеного
 * при імпорті без контактів.
 */
async function fillBuyerAndAddress(existing: ExistingRow, epi: EpicentrOrder, patch: Record<string, unknown>, result: EpicentrSyncResult): Promise<string | null> {
  const m = epicentrOrderToOurFormat(epi);

  if (!existing.delivery_address && m.delivery_address) {
    patch.delivery_address = m.delivery_address;
    patch.delivery_subtype = m.delivery_subtype ?? null;
    if (!existing.delivery_city_name && m.delivery_city_name) patch.delivery_city_name = m.delivery_city_name;
  }

  if (existing.phone || !epicentrHasContacts(epi) || !m.phone) return null;
  patch.phone = m.phone;
  if (!existing.contact || existing.contact === PLACEHOLDER_CONTACT) patch.contact = m.contact;
  if (!existing.email && m.email) patch.email = m.email;
  result.contactsFilled++;

  const match = await findCustomerIdByPhone(db, m.phone);
  if (match && match !== existing.customer_id) {
    patch.customer_id = match;
    // Заглушку з імпорту прибираємо ПІСЛЯ перенесення замовлення (див. reconcileExisting)
    return existing.customer_id;
  } else if (existing.customer_id && !match) {
    const { error } = await db.from('customers')
      .update({ name: m.contact, phone: m.phone, email: m.email || null })
      .eq('id', existing.customer_id)
      .is('phone', null);
    if (error) log.warn('epicentr.customer_fill_failed', { customer: existing.customer_id, err: error.message });
  }
  log.info('epicentr.contacts_filled', { order: existing.order_number, epi: epi.number, matched: Boolean(match) });
  return null;
}

/** Видаляє клієнта-заглушку, якщо на ньому не лишилось замовлень (виклик — після перенесення). */
async function dropStubCustomer(stubId: string) {
  const { count, error: cntErr } = await db.from('orders').select('id', { count: 'exact', head: true }).eq('customer_id', stubId);
  if (cntErr || count) return;
  const { error } = await db.from('customers').delete().eq('id', stubId).is('phone', null).eq('name', PLACEHOLDER_CONTACT);
  if (error) log.warn('epicentr.stub_customer_delete_failed', { customer: stubId, err: error.message });
}

async function reconcileExisting(existing: ExistingRow, listEpi: EpicentrOrder, result: EpicentrSyncResult) {
  // Епіцентр віддає контакти покупця лише після підтвердження продавцем, а місто й
  // відділення — лише в картці /v6. Поки чогось бракує — читаємо картку.
  const live = !['cancelled', 'delivered'].includes(existing.status) && !EPICENTR_TERMINAL.includes(listEpi.statusCode);
  const needsCard = live && (!existing.phone || !existing.delivery_address);
  const epi = needsCard ? await withCard(listEpi) : listEpi;

  // Освіжаємо знімок payload (статус, оплата, ТТН), зберігаючи наш _commission і мітку оплати
  const prevData = existing.epicentr_data as { _commission?: unknown; _paySynced?: boolean } | null;
  const snapshot: Record<string, unknown> = {
    ...(epi as unknown as Record<string, unknown>),
    _commission: prevData?._commission,
    _paySynced:  prevData?._paySynced,
  };
  const patch: Record<string, unknown> = { epicentr_data: snapshot };

  const stubToDrop = needsCard ? await fillBuyerAndAddress(existing, epi, patch, result) : null;

  // Пізня оплата: онлайн-оплата (або холд на картці) з'являється ПІСЛЯ створення
  // замовлення. Ставимо один раз (_paySynced) — ручне зняття оплати не перебиваємо.
  if (!existing.payment_confirmed && !prevData?._paySynced && epicentrOrderPaid(epi)) {
    patch.payment_confirmed = true;
    patch.amount_paid       = existing.total_price;
    patch.payment_type      = 'prepaid';
    snapshot._paySynced     = true;
    result.paidUpdated++;
    log.info('epicentr.payment_confirmed', { order: existing.order_number, epi: epi.number, status: epi.address?.shipment?.paymentStatus, payed: epi.payed });
  }

  // Холд зняли, а ми вважаємо замовлення оплаченим — гроші покупця не заблоковані
  const prevHoldLost = epicentrHoldLost((existing.epicentr_data ?? {}) as unknown as EpicentrOrder);
  if (existing.payment_confirmed && live && epicentrHoldLost(epi) && !prevHoldLost) {
    alertAdmin(`Епіцентр: холд оплати знято — №${existing.order_number}`,
      `Замовлення Епіцентру ${epi.number}: статус оплати ${epi.address?.shipment?.paymentStatus}. Перевірте оплату перед відправкою.`);
  }

  const { error: upErr } = await db.from('orders').update(patch as TableUpdate<'orders'>).eq('id', existing.id);
  if (upErr) log.error('epicentr.snapshot_update_failed', { id: epi.id, err: upErr.message });
  else if (stubToDrop) await dropStubCustomer(stubToDrop);

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
