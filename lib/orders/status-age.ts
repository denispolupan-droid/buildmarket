// Скільки замовлення стоїть у поточному статусі.
//
// У картці була дата створення й історія подій, але не було головного, заради
// чого журнал узагалі відкривають: чи не застрягло. «Оформлено 17.08» нічого не
// каже про те, що замовлення третій день висить у «Підтверджено».

export type StatusAgeSource = {
  status: string;
  created_at: string;
  status_history?: { status: string; at: string }[] | null;
};

/** Статуси, у яких замовлення має рухатись. У кінцевих (доставлено, скасовано)
 *  вік не сигнал: там нічого не чекають. */
const ACTIVE_STATUSES = ['new', 'pending_payment', 'confirmed', 'awaiting_stock', 'picking', 'shipped'];

/** Скільки годин у статусі — вже привід глянути. «Відправлено» довше живе
 *  своїм життям (посилка їде), тому поріг більший. */
const STALE_HOURS: Record<string, number> = {
  new: 24,
  pending_payment: 48,
  confirmed: 48,
  awaiting_stock: 72,
  picking: 24,
  shipped: 120,
};

const HOUR = 3600_000;

/** Українська множина: 1 день, 2 дні, 5 днів. */
function plural(n: number, one: string, few: string, many: string): string {
  const mod10 = n % 10, mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
  return many;
}

/** «щойно» / «3 год» / «2 дні» — коротко, бо стоїть у рядку міток. */
export function humanAge(ms: number): string {
  if (ms < HOUR) return 'щойно';
  const hours = Math.floor(ms / HOUR);
  if (hours < 24) return `${hours} ${plural(hours, 'год', 'год', 'год')}`;
  const days = Math.floor(hours / 24);
  return `${days} ${plural(days, 'день', 'дні', 'днів')}`;
}

export type StatusAge = { label: string; ms: number; stale: boolean } | null;

/**
 * Вік поточного статусу. `null` — для кінцевих статусів і коли дати немає:
 * краще нічого, ніж «0 год» під доставленим замовленням.
 */
export function statusAge(order: StatusAgeSource, now: Date = new Date()): StatusAge {
  if (!ACTIVE_STATUSES.includes(order.status)) return null;

  // Остання подія з поточним статусом; для щойно оформленого — дата створення
  const history = Array.isArray(order.status_history) ? order.status_history : [];
  const entry = [...history].reverse().find(h => h.status === order.status);
  const raw = entry?.at ?? order.created_at;
  const since = new Date(raw).getTime();
  if (!Number.isFinite(since)) return null;

  const ms = now.getTime() - since;
  if (ms < 0) return null;

  const limit = (STALE_HOURS[order.status] ?? 48) * HOUR;
  return { label: humanAge(ms), ms, stale: ms >= limit };
}
