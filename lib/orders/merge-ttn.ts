/**
 * Об'єднана накладна: кілька замовлень одного покупця їдуть однією посилкою.
 *
 * Ознака об'єднання в базі — спільний tracking_number, окремої сутності немає
 * (див. mergedByTtn в AdminOrders). Тут — лише рішення, ЯКИМ перевізником і
 * чи взагалі можна об'єднати вибрані замовлення. Чиста функція під тестами:
 * правила «одна точка видачі», «один покупець», «жодне ще без накладної»
 * перевіряються без браузера.
 *
 * Три потоки, три різні API:
 *  - nova            — Нова Пошта (CreateTTNModal), історично без обмежень;
 *  - rozetka_delivery — точка видачі Rozetka для маркетплейсних замовлень
 *                       (Seller API, «RMP-…»): накладна створюється з ОДНОГО
 *                       замовлення Rozetka, решта отримують той самий номер;
 *  - rz_delivery      — «ROZETKA Доставка» власного договору (замовлення сайту).
 */

export type MergeTtnOrder = {
  id: string;
  order_number: number;
  delivery_type: string | null;
  channel_code: string | null;
  rozetka_order_id: string | number | null;
  tracking_number: string | null;
  phone: string | null;
  delivery_address: string | null;
  delivery_warehouse_ref: string | null;
};

export type MergeTtnKind = 'nova' | 'rozetka_delivery' | 'rz_delivery';

export type MergeTtnPlan =
  | { ok: true; kind: MergeTtnKind; ids: string[] }
  | { ok: false; error: string };

const KIND_LABEL: Record<MergeTtnKind, string> = {
  nova:             'Нова Пошта',
  rozetka_delivery: 'точка видачі Rozetka',
  rz_delivery:      'ROZETKA Доставка',
};

export function mergeTtnKind(deliveryType: string | null | undefined): MergeTtnKind | null {
  if (deliveryType === 'rozetka_delivery') return 'rozetka_delivery';
  if (deliveryType === 'rz_delivery') return 'rz_delivery';
  if (deliveryType === 'pickup') return null;
  return 'nova';
}

const normPhone = (s: string | null) => (s ?? '').replace(/\D/g, '').replace(/^38/, '');
const normAddr  = (s: string | null) => (s ?? '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');

export function planMergeTtn(orders: MergeTtnOrder[]): MergeTtnPlan {
  if (orders.length < 2) return { ok: false, error: 'Виберіть щонайменше два замовлення' };

  const withTtn = orders.filter(o => o.tracking_number);
  if (withTtn.length) {
    return { ok: false, error: `Уже має накладну: ${withTtn.map(o => `№${o.order_number}`).join(', ')}` };
  }

  const kinds = new Set(orders.map(o => mergeTtnKind(o.delivery_type)));
  if (kinds.has(null)) return { ok: false, error: 'Самовивіз в одну посилку не об\'єднується' };
  if (kinds.size > 1) {
    const list = [...kinds].map(k => KIND_LABEL[k as MergeTtnKind]).join(' і ');
    return { ok: false, error: `Різні способи доставки (${list}) — одна накладна неможлива` };
  }
  const kind = [...kinds][0] as MergeTtnKind;
  const ids = orders.map(o => o.id);

  if (kind === 'nova') return { ok: true, kind, ids };

  // Обидва потоки Rozetka: посилка їде на КОНКРЕТНУ точку конкретному покупцю —
  // адресу бере з першого замовлення (Seller API — із замовлення Rozetka,
  // власний договір — із delivery_warehouse_ref). Різні точки чи різні телефони
  // означали б, що чиясь посилка поїде не туди.
  const phones = new Set(orders.map(o => normPhone(o.phone)));
  if (phones.size > 1) return { ok: false, error: 'Різні покупці (телефони) — одна посилка неможлива' };

  if (kind === 'rozetka_delivery') {
    const foreign = orders.filter(o => o.channel_code !== 'rozetka' || !o.rozetka_order_id);
    if (foreign.length) {
      return { ok: false, error: `Не замовлення Rozetka: ${foreign.map(o => `№${o.order_number}`).join(', ')}` };
    }
    const points = new Set(orders.map(o => normAddr(o.delivery_address)));
    if (points.size > 1) return { ok: false, error: 'Різні точки видачі Rozetka — одна посилка неможлива' };
  }

  if (kind === 'rz_delivery') {
    const points = new Set(orders.map(o => o.delivery_warehouse_ref ?? ''));
    if (points.size > 1 || points.has('')) {
      return { ok: false, error: 'Різні (або порожні) точки видачі ROZETKA — одна посилка неможлива' };
    }
  }

  return { ok: true, kind, ids };
}

/**
 * Кандидати на об'єднання: ще не відправлені замовлення одного покупця, які
 * могли б поїхати однією посилкою. Журнал підсвічує їх, щоб при обробці не
 * відправити двома ТТН те, що можна однією (02.11.2026: Котляров, #26111002 і
 * #26111003 — одна точка, дві окремі посилки).
 *
 * Покупець — за телефоном (як і в planMergeTtn); у групу потрапляють лише
 * замовлення одного способу доставки, без накладної і в статусі до відправки.
 * Повертає orderId → група (номери, id і порядковий індекс групи для кольору).
 */
export type SameBuyerOrder = MergeTtnOrder & { status: string };
export type SameBuyerGroup = { ids: string[]; numbers: number[]; index: number; sameAddress: boolean };

const BEFORE_SHIPPING = new Set(['new', 'pending_payment', 'confirmed', 'awaiting_stock', 'picking']);

export function sameBuyerGroups(orders: SameBuyerOrder[]): Map<string, SameBuyerGroup> {
  const byKey = new Map<string, SameBuyerOrder[]>();
  for (const o of orders) {
    if (o.tracking_number || !BEFORE_SHIPPING.has(o.status)) continue;
    const kind = mergeTtnKind(o.delivery_type);
    const phone = normPhone(o.phone);
    if (!kind || phone.length < 9) continue;
    const key = `${kind}:${phone}`;
    const arr = byKey.get(key) ?? [];
    arr.push(o);
    byKey.set(key, arr);
  }
  const out = new Map<string, SameBuyerGroup>();
  let index = 0;
  for (const group of byKey.values()) {
    if (group.length < 2) continue;
    const sorted = [...group].sort((a, b) => a.order_number - b.order_number);
    const addrs = new Set(sorted.map(o => o.delivery_warehouse_ref || normAddr(o.delivery_address)));
    const g: SameBuyerGroup = { ids: sorted.map(o => o.id), numbers: sorted.map(o => o.order_number), index: index++, sameAddress: addrs.size === 1 };
    for (const o of sorted) out.set(o.id, g);
  }
  return out;
}

/** Опис вантажу для об'єднаної посилки: номери замовлень + назви позицій, до ліміту API. */
export function mergedDescription(
  orders: { order_number: number; items?: { name?: string }[] | null }[],
  maxLen = 100,
): string {
  const numbers = orders.map(o => `№${o.order_number}`).join('+');
  const names = orders.flatMap(o => (o.items ?? []).map(i => i.name).filter(Boolean) as string[]);
  return `${numbers}: ${names.join(', ')}`.slice(0, maxLen);
}
