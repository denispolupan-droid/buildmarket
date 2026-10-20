/**
 * Статуси замовлення — єдине джерело правди.
 *
 * До 12.10.2026 список статусів, їхній порядок і правила переходів жили в
 * дев'яти місцях: PATCH картки (VALID + STATUS_RANK), AdminOrders.tsx (свій
 * STATUS_RANK), /confirm, /ship, прийом закупівлі, вебхук Monobank, синк
 * доставки, синк Prom і сторож скасувань маркетплейсів. Кожне писало status
 * по-своєму: хтось ставив delivered_at, хтось дописував status_history, хтось ні.
 * Звідси інцидент #26091195 (03.10.2026): статус «Відправлено» селектом минув
 * відгрузку, і жоден запобіжник цього не побачив.
 *
 * Тут — назви, порядок, дозволені переходи за роллю і ОДИН спосіб записати
 * зміну статусу (buildStatusPatch / transitionOrder), який завжди ставить
 * потрібну часову мітку й дописує status_history з позначкою, звідки прийшла
 * зміна. Правила переходів — з реальної історії order_status_history за
 * липень–жовтень 2026, а не з уяви: усе, що бізнес робив свідомо, дозволено;
 * рідкісні зворотні ходи адміна лишаються, але позначаються як незвичні.
 */

import type { SupabaseClient } from '@supabase/supabase-js';

export const ORDER_STATUSES = [
  'new', 'pending_payment', 'confirmed', 'awaiting_stock', 'picking', 'shipped', 'delivered', 'cancelled',
] as const;
export type OrderStatus = typeof ORDER_STATUSES[number];

export function isOrderStatus(v: unknown): v is OrderStatus {
  return typeof v === 'string' && (ORDER_STATUSES as readonly string[]).includes(v);
}

/**
 * Порядок і підписи вкладок журналу (app/admin/page.tsx) — разом із
 * псевдостатусом `ready_to_ship`: це зріз «підтверджено + зібрано», а не
 * окремий статус, тож у ORDER_STATUSES його немає й бути не повинно.
 */
export const ORDER_TAB_ORDER = [
  '', 'new', 'confirmed', 'pending_payment', 'awaiting_stock', 'ready_to_ship', 'shipped', 'delivered', 'cancelled',
] as const;
export const ORDER_TAB_LABELS: Record<string, string> = {
  '': 'Всі',
  new: 'Нові',
  confirmed: 'Підтверджено',
  pending_payment: 'Очікує оплати',
  awaiting_stock: 'Очікуємо товар',
  ready_to_ship: 'До відправки',
  shipped: 'Відправлено',
  delivered: 'Доставлено',
  cancelled: 'Скасовано',
};

/**
 * Лінійний ранг для «вперед/назад». cancelled поза шкалою: скасувати можна
 * з будь-якого стану, і це не «рух назад».
 */
export const STATUS_RANK: Record<Exclude<OrderStatus, 'cancelled'>, number> = {
  new: 0, pending_payment: 0, confirmed: 1, awaiting_stock: 2, picking: 3, shipped: 4, delivered: 5,
};

/** Кінцеві статуси: далі замовлення живе лише документами (повернення, сторно). */
export const TERMINAL_STATUSES: readonly OrderStatus[] = ['delivered', 'cancelled'];

/**
 * Штатні переходи — те, що робить система сама або менеджер у звичайній роботі.
 * Усе інше для адміна дозволене, але «незвичне» (див. transitionVerdict).
 */
const NORMAL_NEXT: Record<OrderStatus, readonly OrderStatus[]> = {
  new:             ['confirmed', 'pending_payment', 'awaiting_stock', 'cancelled'],
  pending_payment: ['confirmed', 'cancelled'],
  confirmed:       ['picking', 'awaiting_stock', 'shipped', 'delivered', 'cancelled'],   // delivered — самовивіз через /ship
  awaiting_stock:  ['picking', 'confirmed', 'shipped', 'cancelled'],
  picking:         ['shipped', 'delivered', 'cancelled'],
  shipped:         ['delivered', 'cancelled'],
  delivered:       ['cancelled'],   // скасування після вручення = повернення; сторно робить документ
  cancelled:       [],
};

export type ActorRole = 'admin' | 'manager' | 'system';

export type TransitionVerdict =
  | { allowed: true; unusual: string | null }
  | { allowed: false; reason: string };

/**
 * Чи можна перевести замовлення зі статусу from у to цією роллю.
 *
 * Ролеві правила — рівно ті, що були в PATCH картки до 12.10.2026:
 * менеджер не рухає назад і скасовує лише «нове»; адмін і система — будь-куди.
 * «Незвичне» — перехід поза штатною мапою (назад, або з cancelled): для адміна
 * це дозволено, але варто показати, бо саме так народжуються розбіжності обліку.
 */
export function transitionVerdict(from: OrderStatus, to: OrderStatus, role: ActorRole): TransitionVerdict {
  if (from === to) return { allowed: true, unusual: null };

  if (role === 'manager') {
    const backward = to !== 'cancelled'
      && (STATUS_RANK[to as Exclude<OrderStatus, 'cancelled'>] ?? -1)
         < (from === 'cancelled' ? 0 : STATUS_RANK[from as Exclude<OrderStatus, 'cancelled'>] ?? 0);
    const cancelNonNew = to === 'cancelled' && from !== 'new';
    if (backward || cancelNonNew) {
      return { allowed: false, reason: 'Недостатньо прав для зміни статусу в зворотньому порядку' };
    }
  }

  if (NORMAL_NEXT[from].includes(to)) return { allowed: true, unusual: null };

  const unusual = from === 'cancelled'
    ? `Повернення скасованого замовлення у «${to}»: облік по ньому міг бути сторнований — перевірте РН і проводки`
    : from === 'delivered'
      ? `Зміна статусу доставленого замовлення на «${to}»: продаж уже проведено, відкат — лише документом повернення`
      : `Рух назад «${from}» → «${to}»: резерви й чернетки РН не перераховуються автоматично`;
  return { allowed: true, unusual };
}

export type StatusHistoryEntry = { status: OrderStatus; at: string; by: string; via?: string };

export type OrderStatusState = {
  status: OrderStatus | string | null;
  status_history?: unknown;
  confirmed_at?: string | null;
};

/**
 * Патч для orders при зміні статусу: сам статус, часова мітка стану і запис у
 * status_history. Чиста функція — її легко перевірити й однаково використати
 * і там, де статус пишуть разом з іншими полями (PATCH, /ship, /confirm), і в
 * transitionOrder.
 *
 * Мітки: shipped_at/delivered_at/cancelled_at — як було в PATCH; confirmed_at —
 * лише якщо ще порожня (/confirm ставить її сам, ручний PATCH раніше не ставив
 * узагалі, і в журналі такі замовлення не мали часу підтвердження).
 */
export function buildStatusPatch(
  current: OrderStatusState,
  to: OrderStatus,
  actor: string,
  via: string,
  now = new Date().toISOString(),
): Record<string, unknown> {
  if (current.status === to) return {};
  const history = Array.isArray(current.status_history) ? (current.status_history as StatusHistoryEntry[]) : [];
  const patch: Record<string, unknown> = {
    status: to,
    status_history: [...history, { status: to, at: now, by: actor, via }],
  };
  if (to === 'shipped')   patch.shipped_at   = now;
  if (to === 'delivered') patch.delivered_at = now;
  if (to === 'cancelled') patch.cancelled_at = now;
  if (to === 'confirmed' && !current.confirmed_at) patch.confirmed_at = now;
  return patch;
}

export type TransitionResult = { from: OrderStatus | string | null; to: OrderStatus; changed: boolean };

/**
 * Перевести замовлення в статус to одним UPDATE: статус + мітка + історія
 * (+ extra — інші колонки, які це місце міняє тим самим записом, наприклад
 * fulfillment_mode у /confirm або contract_id у /ship). Якщо статус уже такий —
 * пишуться лише extra. Ролеві правила тут НЕ перевіряються: це справа роуту
 * (transitionVerdict); крони й вебхуки — «система», їм дозволено все штатне.
 */
export async function transitionOrder(
  db: SupabaseClient,
  orderId: string,
  to: OrderStatus,
  actor: string,
  via: string,
  extra: Record<string, unknown> = {},
): Promise<TransitionResult> {
  const { data: current, error } = await db
    .from('orders')
    .select('status, status_history, confirmed_at')
    .eq('id', orderId)
    .single();
  if (error || !current) throw new Error(`transitionOrder: замовлення ${orderId} не знайдено${error ? ` (${error.message})` : ''}`);

  const patch = { ...buildStatusPatch(current as OrderStatusState, to, actor, via), ...extra };
  if (Object.keys(patch).length === 0) return { from: current.status, to, changed: false };

  const { error: upErr } = await db.from('orders').update(patch).eq('id', orderId);
  if (upErr) throw new Error(`transitionOrder: ${orderId} → ${to}: ${upErr.message}`);
  return { from: current.status, to, changed: current.status !== to };
}
