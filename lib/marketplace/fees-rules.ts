/**
 * Чисті допоміжні правила для зборів площадок (без БД — під тести).
 */

/**
 * Розбити позиції на пачки так, щоб у кожній було не більше maxSkus РІЗНИХ SKU:
 * оцінювачі комісій роблять `.in('sku', …)` по всіх SKU пачки, а довгий список
 * у URL PostgREST обривається. Порядок позицій зберігається (результати
 * зіставляються з входом за індексом).
 */
export function chunkByDistinctSku<T extends { sku: string }>(items: T[], maxSkus = 150): T[][] {
  const out: T[][] = [];
  let cur: T[] = [];
  let skus = new Set<string>();
  for (const it of items) {
    if (!skus.has(it.sku) && skus.size >= maxSkus) {
      out.push(cur);
      cur = [];
      skus = new Set();
    }
    cur.push(it);
    skus.add(it.sku);
  }
  if (cur.length) out.push(cur);
  return out;
}
