// Запис того, що люди шукають у нас на сайті.
//
// Навіщо: Search Console показує лише запити, за якими сайт УЖЕ показувався в
// Google. Власний пошук показує інше — чого людині бракує саме в нашому
// асортименті, включно із запитами, на які ми віддали порожню видачу. Це і є
// найпряміший сигнал «що завозити».
//
// Пишемо не кожне натискання клавіші, а два осмислені моменти: підтверджений
// пошук (Enter / кнопка) і запит, що дав НУЛЬ результатів. Проміжні «кл», «кле»
// цінності не мають, зате засмічують вибірку.

const sent = new Set<string>();

export function logSearch(query: string, resultsCount: number): void {
  const q = query.trim().toLowerCase();
  if (q.length < 2) return;

  // Один і той самий запит у межах сторінки пишемо раз: інакше кожне
  // перемальовування списку давало б новий рядок.
  const key = `${q}:${resultsCount === 0 ? 'empty' : 'found'}`;
  if (sent.has(key)) return;
  sent.add(key);

  // Fire-and-forget: пошук не має чекати на журнал і не має від нього падати.
  // keepalive — щоб запис не загубився, коли одразу після Enter іде перехід.
  try {
    void fetch('/api/search-log', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: q, resultsCount }),
      keepalive: true,
    }).catch(() => {});
  } catch {
    /* журнал пошуку не вартий жодної помилки на очах у покупця */
  }
}
