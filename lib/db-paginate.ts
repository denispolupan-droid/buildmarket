// PostgREST caps a single response at 1000 rows by default, silently truncating
// larger result sets. fetchAllRows pages through with .range() so full-table
// reads (pricing sync, feeds) stay correct as the catalog grows past 1000.
//
// ОБОВ'ЯЗКОВО: запит у `page` мусить мати `.order(<унікальна колонка>)` (зазвичай
// `.order('id')`) перед `.range()`. Без ORDER BY Postgres віддає сторінки в
// нестабільному порядку — рядки дублюються й губляться (30.08.2026 так зникли
// 101 товар; 29.09.2026 «Огляд» фінансів загубив 251 проводку і показав виручку
// 103 тис. замість 136 тис.).
export async function fetchAllRows<T = Record<string, unknown>>(
  page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>,
): Promise<T[]> {
  const SIZE = 1000;
  const out: T[] = [];
  for (let from = 0; ; from += SIZE) {
    const { data, error } = await page(from, from + SIZE - 1);
    if (error) throw error as Error;
    const rows = data ?? [];
    out.push(...rows);
    if (rows.length < SIZE) break;
  }
  return out;
}
