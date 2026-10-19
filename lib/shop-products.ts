/**
 * Товари в листингу магазину — лише гілка відкритої категорії.
 *
 * Навіщо. Сторінка категорії везла весь каталог (773 товари), бо перемикання
 * категорій у сайдбарі — клієнтське, без навігації (memory project_shop_category_ux).
 * На телефоні браузер ~2 с розбирав і гідрував чужі товари, перш ніж показати
 * першу картинку (LCP 4,4–4,7 с при картинці за 0,3 с). Тепер сервер віддає
 * лише гілку від кореня відкритої категорії, решту клієнт довантажує при
 * перемиканні (lib/use-shop-products, /api/shop-products/<slug>).
 *
 * Порядок. Каталог відсортовано на сервері (sort_order, відсутні — в кінець),
 * і довантажені товари не можна просто дописати в хвіст — «Всі категорії»
 * показали б інший порядок, ніж /shop. Тому сторінка везе ще й список артикулів
 * усього каталогу в серверному порядку (~10 КБ), і список збирається за ним.
 *
 * Чисті функції винесено окремо, щоб покрити тестом без React.
 */

type CatTree = { slug: string; parent_slug: string | null }[];

/** Корінь гілки, до якої належить категорія (сама категорія, якщо вона коренева чи невідома). */
export function branchRoot(categories: CatTree, slug: string): string {
  const bySlug = new Map(categories.map(c => [c.slug, c]));
  const seen = new Set<string>();
  let cur = slug;
  while (!seen.has(cur)) {
    seen.add(cur);
    const parent = bySlug.get(cur)?.parent_slug;
    if (!parent || !bySlug.has(parent)) break;
    cur = parent;
  }
  return cur;
}

/**
 * Список у серверному порядку `order` зі стартових і довантажених товарів.
 * Товар, якого немає в `order` (з'явився після збірки сторінки), іде в кінець;
 * артикул з `order`, якого немає ніде, пропускається.
 */
export function assembleCatalog<T extends { sku: string }>(order: string[], initial: T[], extra: Map<string, T>): T[] {
  if (extra.size === 0) return initial;
  const bySku = new Map<string, T>(extra);
  for (const p of initial) bySku.set(p.sku, p); // стартові — з тієї ж сторінки, що й HTML
  const out: T[] = [];
  for (const sku of order) {
    const p = bySku.get(sku);
    if (p) { out.push(p); bySku.delete(sku); }
  }
  for (const p of bySku.values()) out.push(p);
  return out;
}
