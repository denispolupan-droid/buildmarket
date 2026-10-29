/**
 * Повтор запиту до API Нової Пошти при «To many requests».
 *
 * НП обмежує кількість запитів на ключ за секунду. Модалка ТТН при відкритті
 * шле одразу кілька довідникових запитів (місто, список відділень, пошук за
 * номером) паралельно з даними відправника — і частина з них повертається з
 * `success: false, errors: ["To many requests"]`. Раніше така відповідь мовчки
 * ставала порожнім списком: поштомат «не знаходився», у полі лишався лише
 * номер, і накладну було не створити (29.10.2026, Prom, Київ, поштомат №57517).
 *
 * Тут — одне місце, яке розпізнає цю помилку і повторює запит з паузою.
 * Функції чисті (без fetch), щоб покрити тестом; затримку можна підмінити.
 */

export type NpLikeResponse = { success?: boolean; errors?: unknown[] | null } | null | undefined;

const RATE_LIMIT_RE = /to+\s*many\s*requests|too many requests|rate limit/i;

/** НП відмовила через ліміт запитів (а не через дані). */
export function isNpRateLimited(res: NpLikeResponse): boolean {
  if (!res || res.success) return false;
  return (res.errors ?? []).some(e => RATE_LIMIT_RE.test(String(e)));
}

export type NpRetryOptions = {
  /** Скільки разів усього пробувати (перша спроба включно). */
  attempts?: number;
  /** Пауза перед другою спробою, мс; далі подвоюється. */
  baseDelayMs?: number;
  /** Для тестів: власна пауза замість setTimeout. */
  sleep?: (ms: number) => Promise<void>;
};

const defaultSleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms));

/**
 * Виконує `call`, поки відповідь — ліміт запитів, але не більше `attempts` разів.
 * Будь-яку іншу відповідь (успіх чи змістовну помилку) віддає одразу.
 */
export async function withNpRetry<T extends NpLikeResponse>(
  call: () => Promise<T>,
  { attempts = 4, baseDelayMs = 350, sleep = defaultSleep }: NpRetryOptions = {},
): Promise<T> {
  let res = await call();
  for (let i = 1; i < attempts && isNpRateLimited(res); i++) {
    await sleep(baseDelayMs * 2 ** (i - 1));
    res = await call();
  }
  return res;
}
