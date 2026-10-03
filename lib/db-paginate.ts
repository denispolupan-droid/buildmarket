// PostgREST caps a single response at 1000 rows by default, silently truncating
// larger result sets. fetchAllRows pages through with .range() so full-table
// reads (pricing sync, feeds) stay correct as the catalog grows past 1000.
//
// ОБОВ'ЯЗКОВО: запит у `page` мусить мати `.order(<унікальна колонка>)` (зазвичай
// `.order('id')`) перед `.range()`. Без ORDER BY Postgres віддає сторінки в
// нестабільному порядку — рядки дублюються й губляться (30.08.2026 так зникли
// 101 товар; 29.09.2026 «Огляд» фінансів загубив 251 проводку і показав виручку
// 103 тис. замість 136 тис.).
/**
 * Транзиентний таймаут Postgres (57014, «canceling statement due to statement
 * timeout»). Прод крутиться на найменшому compute, і коли одночасно
 * перебудовується пачка ISR-сторінок, важка вибірка каталогу не встигає в
 * statement_timeout — сторінки віддавали 500 пачками (02–03.10, 27 падінь на
 * /shop/*). Самі запити при цьому здорові: план 1–11 мс, кеш-хіт 100 % —
 * впирається не план, а момент.
 */
function isTransientTimeout(error: unknown): boolean {
  const e = error as { code?: unknown; message?: unknown } | null;
  if (!e) return false;
  if (e.code === '57014') return true;
  return typeof e.message === 'string' && e.message.includes('statement timeout');
}

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

export async function fetchAllRows<T = Record<string, unknown>>(
  page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>,
): Promise<T[]> {
  const SIZE = 1000;
  const RETRIES = 2;            // 3 спроби разом із першою
  const BACKOFF = [300, 900];   // мс; сумарно < 1,2 с — у бюджет рендера влазить
  const out: T[] = [];
  for (let from = 0; ; from += SIZE) {
    let data: T[] | null = null;
    // Повтор робимо тільки для сторінки, що впала, і тільки на таймауті:
    // читання ідемпотентне, а будь-яку іншу помилку (права, синтаксис) ховати
    // за ретраями не можна — вона не мине сама.
    for (let attempt = 0; ; attempt++) {
      const res = await page(from, from + SIZE - 1);
      if (!res.error) { data = res.data; break; }
      if (attempt >= RETRIES || !isTransientTimeout(res.error)) throw res.error as Error;
      await sleep(BACKOFF[attempt]);
    }
    const rows = data ?? [];
    out.push(...rows);
    if (rows.length < SIZE) break;
  }
  return out;
}
