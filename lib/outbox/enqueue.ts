import { promAcceptsTtnFor } from '../prom-api';
import type { OutboxEventInput, PushTtnPayload } from './types';

/**
 * Події «ЕН на площадку» для відвантаження — чиста функція: з того, що знає
 * /ship, збирає по рядку на кожну площадку замовлення. dedupe_key включає ЕН і
 * статус, тож повторна відгрузка з тією ж накладною рядків не плодить, а нова
 * ЕН (перевідвантаження) — дає нову подію.
 */
export type ShipSnapshot = {
  order_number: number;
  prom_order_id: number | null;
  rozetka_order_id: number | null;
  epicentr_order_id: string | null;
  delivery_type: string | null;
  rozetka_cabinet_status: number | null;
};

export function ttnPushEvents(
  orderId: string,
  o: ShipSnapshot,
  ttn: string | null,
  status: 'shipped' | 'delivered',
  fullyShipped: boolean,
): OutboxEventInput[] {
  if (!ttn) return [];
  const base = { order_number: o.order_number, ttn, delivery_type: o.delivery_type, status, fully_shipped: fullyShipped, cabinet_status: null } as const;
  const out: OutboxEventInput[] = [];
  const push = (payload: PushTtnPayload) => out.push({
    event: 'order.shipped',
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
