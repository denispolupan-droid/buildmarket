// PostgREST caps a single response at 1000 rows by default, silently truncating
// larger result sets. fetchAllRows pages through with .range() so full-table
// reads (pricing sync, feeds) stay correct as the catalog grows past 1000.
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
