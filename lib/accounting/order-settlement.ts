/**
 * «Виплачено» по замовленню: чи дійшли гроші за нього до наших рахунків.
 *
 * Джерело — леджер: рахунок customer по order_id. Продаж дебетує дебітора
 * (покупця, np:cod, mp:prom / mp:rozetka), гроші кредитують його: пряма оплата
 * (customer_payment), виплата наложки НоваПей по ЕН (np-payout) і її комісія
 * (np_fee — частина ціни, яку НП лишила собі), рознесена виплата RozetkaPay
 * (rzpay-alloc), ручні закриття за фактом від власника (correction).
 *
 * Кліринг mp:rozetkapay сюди НЕ входить: рознесення робить DR mp:rozetkapay /
 * CR mp:rozetka з тим самим order_id, і без виключення сума по замовленню
 * лишалась би +X (сама виплата з банку — без order_id).
 *
 *   received — дебітор закритий або в мінусі (аванс: RozetkaPay платить за
 *              передоплату до вручення; оплата рахунку до відвантаження)
 *   pending  — продаж проведено, гроші ще не прийшли (вручено, чекаємо виплату)
 *   none     — проводок по дебітору ще немає (не вручено; наложка ще не зібрана)
 */
export type SettlementEntry = { order_id: string | null; counterparty_id: string | null; amount: number; doc_type: string | null };
export type OrderSettlement = { state: 'received' | 'pending' | 'none'; sale: number; received: number; open: number };

export const RZPAY_CLEARING = 'mp:rozetkapay';

export function settlementFor(entries: SettlementEntry[]): OrderSettlement {
  let sale = 0, received = 0;
  for (const e of entries) {
    if (e.counterparty_id === RZPAY_CLEARING) continue;
    const v = Number(e.amount);
    if (v > 0) sale += v; else received += -v;
  }
  sale = Math.round(sale * 100) / 100;
  received = Math.round(received * 100) / 100;
  const open = Math.round((sale - received) * 100) / 100;
  if (received <= 0.005 && sale <= 0.005) return { state: 'none', sale, received, open: 0 };
  if (open > 0.01) return { state: 'pending', sale, received, open };
  return { state: 'received', sale, received, open: 0 };
}

/** Мапа order_id → стан за списком проводок (рахунок customer, будь-які замовлення). */
export function settlementMap(entries: SettlementEntry[]): Record<string, OrderSettlement> {
  const byOrder: Record<string, SettlementEntry[]> = {};
  for (const e of entries) {
    if (!e.order_id) continue;
    (byOrder[e.order_id] ??= []).push(e);
  }
  const out: Record<string, OrderSettlement> = {};
  for (const [id, list] of Object.entries(byOrder)) out[id] = settlementFor(list);
  return out;
}
