/**
 * Характеристики товарів у листингу магазину — лише для відкритої гілки.
 *
 * Навіщо. Сторінка категорії везе весь каталог (перемикання категорій без
 * навігації — див. memory project_shop_category_ux), і характеристики всіх 773
 * товарів важили ~0,7 МБ із 1,5 МБ даних сторінки, хоча фасети потрібні лише
 * поточній категорії. Сервер лишає характеристики товарам відкритої родини,
 * решті кладе порожній масив; при клієнтському перемиканні їх довантажує
 * useCategoryChars з /api/category-chars/<slug>.
 *
 * Чисті функції винесено окремо, щоб покрити тестом без React.
 */

export type CharRow = { label: string; value: string };
type WithChars = { sku: string; category_slug: string | null; characteristics: CharRow[] };

/** Копія списку, де характеристики лишаються тільки товарам із `keepSlugs`. */
export function stripCharsOutside<T extends WithChars>(products: T[], keepSlugs: Set<string>): T[] {
  return products.map(p =>
    keepSlugs.has(p.category_slug ?? '') || p.characteristics.length === 0
      ? p
      : { ...p, characteristics: [] as CharRow[] },
  );
}

/** Накладає довантажені характеристики на список товарів (нові об'єкти лише там, де є що накласти). */
export function mergeChars<T extends WithChars>(products: T[], extra: Map<string, CharRow[]>): T[] {
  if (extra.size === 0) return products;
  return products.map(p => {
    const chars = extra.get(p.sku);
    return chars ? { ...p, characteristics: chars } : p;
  });
}
