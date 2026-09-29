/**
 * lib/prom-delivery-state.ts — рух посилки за даними Prom (чисто, під тести).
 *
 * Для доставок, які веде сам кабінет Prom («Магазини Rozetka» з номерами PRM-…,
 * Meest за договором Prom), наші крони номер не бачать: RZ-доставка не знає PRM,
 * Нова Пошта не знає Meest. Єдине джерело руху — `delivery_provider_data.unified_status`
 * у замовленні Prom: on_the_way → in_warehouse → delivered. До 29.09.2026 крон
 * читав звідти лише 'delivered', тож такі замовлення висіли «До відправки» на
 * «Огляді» до самого вручення (#26091224, #26091243, #26091258).
 */

export type PromDeliveryData = {
  unified_status?: string | null;
  declaration_number?: string | null;
} | null | undefined;

export type PromDeliveryOrder = {
  status: string;
  tracking_number: string | null;
  carrier_accepted_at: string | null;
  carrier_status_text: string | null;
};

/** Стани Prom, за яких перевізник уже фізично взяв посилку. */
const PROM_ACCEPTED = new Set(['on_the_way', 'in_warehouse', 'delivered']);

const PROM_STATUS_TEXT: Record<string, string> = {
  on_the_way:   'В дорозі',
  in_warehouse: 'У відділенні',
  delivered:    'Вручено',
};

export function promDeliveryStatusText(dpd: PromDeliveryData, ourTracking: string | null): string | null {
  const unified = dpd?.unified_status ?? null;
  if (!unified) return null;
  const base = PROM_STATUS_TEXT[unified] ?? unified;
  // Свого номера немає (декларацію виписав кабінет Prom) — показуємо їхній,
  // інакше менеджер не знає, що взагалі шукати в кабінеті перевізника.
  const decl = dpd?.declaration_number?.trim();
  const ref = !ourTracking && decl ? ` · ${decl}` : '';
  return `${base} (за даними Prom)${ref}`;
}

export type PromDeliveryPatch = {
  /** Що записати в orders (порожній об'єкт = нічого не змінилось). */
  patch: Record<string, unknown>;
  /** Уперше побачили, що перевізник узяв посилку. */
  accepted: boolean;
  /** Prom каже «вручено» — далі проводки й перехід у delivered (як і раніше). */
  delivered: boolean;
};

/**
 * Що змінити в нашому замовленні за станом декларації Prom. Лише для
 * «відвантажених»: до відгрузки посилки ще немає, після вручення — нема чого міняти.
 */
export function promDeliveryPatch(order: PromDeliveryOrder, dpd: PromDeliveryData, now: string): PromDeliveryPatch {
  const none: PromDeliveryPatch = { patch: {}, accepted: false, delivered: false };
  if (order.status !== 'shipped') return none;
  const unified = dpd?.unified_status ?? null;
  if (!unified) return none;

  const patch: Record<string, unknown> = {};
  const text = promDeliveryStatusText(dpd, order.tracking_number);
  if (text && text !== order.carrier_status_text) {
    patch.carrier_status_text = text;
    patch.carrier_status_synced_at = now;
  }
  const accepted = PROM_ACCEPTED.has(unified) && !order.carrier_accepted_at;
  if (accepted) patch.carrier_accepted_at = now;

  return { patch, accepted, delivered: unified === 'delivered' };
}

/**
 * Чи веде доставку цього замовлення сам Prom (наші крони посилку не бачать):
 * «Магазини Rozetka» або будь-який спосіб без нашого номера ЕН — декларацію
 * виписали в кабінеті Prom (Meest тощо).
 */
export function isPromLedDelivery(order: { delivery_type: string | null; tracking_number: string | null }): boolean {
  return order.delivery_type === 'rz_delivery' || !order.tracking_number;
}
