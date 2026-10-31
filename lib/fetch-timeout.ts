/**
 * fetch із таймаутом для зовнішніх API (НП, Prom, Rozetka, Епіцентр, Zoho,
 * RozetkaPay, RZ-доставка, Telegram, GSC, Google Ads, прайси постачальників).
 *
 * Аудит 31.10.2026: жоден із цих клієнтів не мав таймауту. Завислий НП чи Prom
 * тримав функцію до maxDuration, а наступний тік крона (кожні 5 хв) стартував
 * поверх ще живого — синки накладались. Тепер зависання стає звичайною
 * помилкою мережі, яку вже вміють ретраїти promFetch / fetchWithRetry / npCall.
 */

export const DEFAULT_FETCH_TIMEOUT_MS = 20_000;

export class FetchTimeoutError extends Error {
  constructor(url: string, ms: number) {
    let host = url;
    try { host = new URL(url).host; } catch { /* лишаємо як є */ }
    super(`${host}: timeout after ${ms} ms`);
    this.name = 'FetchTimeoutError';
  }
}

export async function fetchWithTimeout(
  input: string | URL,
  init?: RequestInit,
  ms: number = DEFAULT_FETCH_TIMEOUT_MS,
): Promise<Response> {
  const timeout = AbortSignal.timeout(ms);
  const signal = init?.signal ? AbortSignal.any([init.signal, timeout]) : timeout;
  try {
    return await fetch(input, { ...init, signal });
  } catch (err) {
    // Таймаут — окремий тип помилки з хостом у тексті, щоб алерт був зрозумілий;
    // скасування самим викликачем (його signal) прокидаємо як є.
    if (timeout.aborted && !init?.signal?.aborted) throw new FetchTimeoutError(String(input), ms);
    throw err;
  }
}
