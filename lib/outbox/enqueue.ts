import { promAcceptsTtnFor } from '../prom-api';
import type { NotifyStatusPayload, OutboxEventInput, PushStatusPayload, PushTtnPayload } from './types';

/**
 * Збирачі подій outbox — чисті функції: з того, що знає роут, складають по рядку
 * на кожен побічний ефект. dedupe_key описує НАМІР (канал, замовлення, що саме
 * пушимо), тож повторний клік рядків не плодить, а новий намір (інша ЕН, інший
 * статус) — дає нову подію.
 */
export type ShipSnapshot = {
  order_number: number;
  prom_order_id: number | null;
  rozetka_order_id: number | null;
  epicentr_order_id: string | null;
  delivery_type: string | null;
  rozetka_cabinet_status: number | null;
};

/** Знімок замовлення для збирачів — з будь-якого рядка orders з потрібними колонками. */
export function orderSnapshot(order: Record<string, unknown>): ShipSnapshot {
  const cabinet = (order.rozetka_data as Record<string, unknown> | null) ?? {};
  return {
    order_number:     Number(order.order_number),
    prom_order_id:    (order.prom_order_id as number | null) ?? null,
    rozetka_order_id: (order.rozetka_order_id as number | null) ?? null,
    epicentr_order_id:(order.epicentr_order_id as string | null) ?? null,
    delivery_type:    (order.delivery_type as string | null) ?? null,
    rozetka_cabinet_status: typeof cabinet.status === 'number' ? cabinet.status : null,
  };
}

/** Хвилинна мітка: той самий статус, поставлений двічі за хвилину (подвійний клік), — одна подія; пізніше — нова. */
const minuteBucket = (at: Date = new Date()) => at.toISOString().slice(0, 16);

export function ttnPushEvents(
  orderId: string,
  o: ShipSnapshot,
  ttn: string | null,
  status: 'shipped' | 'delivered',
  fullyShipped: boolean,
  opts: { event?: 'order.shipped' | 'order.ttn_replaced'; forceTtn?: boolean } = {},
): OutboxEventInput[] {
  if (!ttn) return [];
  const base = {
    order_number: o.order_number, ttn, delivery_type: o.delivery_type, status, fully_shipped: fullyShipped,
    cabinet_status: null, ...(opts.forceTtn ? { force_ttn: true } : {}),
  } as const;
  const out: OutboxEventInput[] = [];
  const push = (payload: PushTtnPayload) => out.push({
    event: opts.event ?? 'order.shipped',
    handler: 'mp.push_ttn',
    payload,
    dedupe_key: `mp.push_ttn:${payload.channel}:${orderId}:${ttn}:${status}:${fullyShipped ? 'full' : 'part'}`,
  });
  // Prom приймає ЕН лише для НП/Укрпошти/Meest; «Магазини Rozetka» веде сам
  if (o.prom_order_id && promAcceptsTtnFor(o.delivery_type)) {
    push({ ...base, channel: 'prom', external_id: o.prom_order_id });
  }
  if (o.epicentr_order_id) {
    push({ ...base, channel: 'epicentr', external_id: o.epicentr_order_id });
  }
  // Rozetka: статус + ЕН лише при повній відгрузці (часткова статус не міняє)
  if (o.rozetka_order_id && fullyShipped) {
    push({ ...base, channel: 'rozetka', external_id: o.rozetka_order_id, cabinet_status: o.rozetka_cabinet_status });
  }
  return out;
}

/** Заміна ЕН у відвантаженому замовленні: ті самі канали, що й при відгрузці, Rozetka — з forceTtn. */
export function ttnReplacedEvents(orderId: string, o: ShipSnapshot, ttn: string): OutboxEventInput[] {
  return ttnPushEvents(orderId, o, ttn, 'shipped', true, { event: 'order.ttn_replaced', forceTtn: true });
}

/**
 * Статус замовлення → статус площадки: підтвердження, зміна статусу з картки,
 * скасування. Обробник сам підставить ЕН із замовлення, якщо її не передали.
 */
export function statusPushEvents(
  orderId: string,
  o: ShipSnapshot,
  status: string,
  opts: { ttn?: string | null; cancelReason?: number | null; at?: Date } = {},
): OutboxEventInput[] {
  const event = status === 'cancelled' ? 'order.cancelled' : status === 'confirmed' ? 'order.confirmed' : 'order.status_changed';
  const bucket = minuteBucket(opts.at);
  const base = { order_number: o.order_number, status, ttn: opts.ttn ?? null, cancel_reason: opts.cancelReason ?? null, cabinet_status: null } as const;
  const out: OutboxEventInput[] = [];
  const push = (payload: PushStatusPayload) => out.push({
    event, handler: 'mp.push_status', payload,
    dedupe_key: `mp.push_status:${payload.channel}:${orderId}:${status}:${bucket}`,
  });
  if (o.prom_order_id)     push({ ...base, channel: 'prom', external_id: o.prom_order_id });
  if (o.rozetka_order_id)  push({ ...base, channel: 'rozetka', external_id: o.rozetka_order_id, cabinet_status: o.rozetka_cabinet_status });
  if (o.epicentr_order_id) push({ ...base, channel: 'epicentr', external_id: o.epicentr_order_id });
  return out;
}

export type NotifyOrder = {
  order_number: number;
  tracking_number: string | null;
  delivery_type: string | null;
  telegram_chat_id: string | null;
  email: string | null;
  phone: string | null;
  contact: string | null;
  company: string | null;
  channel_code: string | null;
  total_price: number | null;
};

/**
 * Сповіщення покупцю про статус — окрема подія на кожен канал (Telegram, email,
 * SMS/Viber), щоб збій одного каналу при повторі не дублював інший. Канали
 * вибирає роут: /confirm історично слав лише Telegram, картка — усі три.
 */
export function customerNotifyEvents(
  orderId: string,
  o: NotifyOrder,
  status: string,
  via: Array<NotifyStatusPayload['via']>,
  at: Date = new Date(),
): OutboxEventInput[] {
  const event = status === 'cancelled' ? 'order.cancelled' : status === 'confirmed' ? 'order.confirmed' : status === 'shipped' ? 'order.shipped' : 'order.status_changed';
  const bucket = minuteBucket(at);
  const base = {
    order_number: o.order_number, status, ttn: o.tracking_number ?? null, delivery_type: o.delivery_type ?? null,
    telegram_chat_id: o.telegram_chat_id ?? null, email: o.email ?? null, phone: o.phone ?? null,
    contact: o.contact ?? null, company: o.company ?? null, channel_code: o.channel_code ?? null,
    total_price: Number(o.total_price ?? 0),
  };
  const out: OutboxEventInput[] = [];
  for (const v of via) {
    // Канал без адресата — події не буде (не skipped у таблиці, а просто нічого)
    if (v === 'telegram' && !o.telegram_chat_id) continue;
    if (v === 'email' && !o.email) continue;
    if (v === 'sms' && !o.phone) continue;
    out.push({
      event, handler: 'customer.notify_status', payload: { ...base, via: v },
      dedupe_key: `customer.notify_status:${v}:${orderId}:${status}:${bucket}`,
    });
  }
  return out;
}
