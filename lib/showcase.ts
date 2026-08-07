/**
 * lib/showcase.ts — вітрина головної сторінки: товари, які показуються першими.
 *
 * Чиста частина (без мережі) — щоб правила порядку й відсіву можна було покрити
 * тестами: саме вони вирішують, що побачить покупець.
 *
 * Серверне читання — getShowcaseCached нижче; воно тягне supabase, тож у
 * клієнтські компоненти імпортуй ТІЛЬКИ типи й чисті функції.
 */

export type ShowcaseSurface = 'shop' | 'catalog';

export const SHOWCASE_SURFACES: ShowcaseSurface[] = ['shop', 'catalog'];

/**
 * Стеля вітрини. Показуємо ВСЕ, що додали, — окремої межі показу немає: типовий
 * набір це «по одному товару з кожної категорії», а категорій із товаром у
 * наявності зараз 59, і ховати більшу частину за «запасом» було б безглуздо.
 *
 * Сама стеля потрібна лише як запобіжник: щоб випадковий імпорт не заллявся
 * тисячами рядків і не перетворив вітрину на другий каталог.
 */
export const SHOWCASE_MAX_ITEMS = 96;

export function isShowcaseSurface(v: unknown): v is ShowcaseSurface {
  return v === 'shop' || v === 'catalog';
}

/**
 * Товар придатний до показу: активний і є в наявності.
 *
 * Порожня вітрина краща за вітрину із заглушок — «немає в наявності» першим
 * екраном псує враження сильніше, ніж шість карток замість восьми. У адмінці
 * така позиція лишається видимою з поміткою, щоб було зрозуміло, чому її немає.
 */
export function isShowcaseVisible(p: {
  is_active?: boolean | null;
  stock?: { stock_status?: string | null; price_retail?: number | null } | null;
}): boolean {
  if (p.is_active === false) return false;
  // Наявність визначає stock_status — те саме поле, за яким фільтрує вітрина
  // магазину (lib/supabase: product_stock.stock_status = 'in_stock').
  if (p.stock?.stock_status !== 'in_stock') return false;
  return Number(p.stock?.price_retail ?? 0) > 0;
}

/**
 * Впорядкувати товари за списком SKU вітрини й відсіяти непридатні.
 * Порядок задає вітрина, а не порядок вибірки з бази.
 */
export function orderByShowcase<T extends { sku: string }>(
  skus: string[],
  products: T[],
  opts: { limit?: number; visible?: (p: T) => boolean } = {},
): T[] {
  const limit = opts.limit ?? SHOWCASE_MAX_ITEMS;
  const visible = opts.visible ?? (() => true);
  const bySku = new Map(products.map(p => [p.sku, p]));
  const out: T[] = [];
  for (const sku of skus) {
    const p = bySku.get(sku);
    if (!p || !visible(p)) continue;
    out.push(p);
    if (out.length >= limit) break;
  }
  return out;
}

/**
 * Нормалізувати список SKU перед збереженням: без порожніх, без дублів,
 * не довше стелі. Порядок = порядок у масиві.
 */
export function normalizeShowcaseSkus(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of input) {
    if (typeof raw !== 'string') continue;
    const sku = raw.trim();
    if (!sku || seen.has(sku)) continue;
    seen.add(sku);
    out.push(sku);
    if (out.length >= SHOWCASE_MAX_ITEMS) break;
  }
  return out;
}

/** Перемістити позицію на крок вгору/вниз. Повертає НОВИЙ масив. */
export function moveShowcaseItem(skus: string[], index: number, delta: -1 | 1): string[] {
  const to = index + delta;
  if (index < 0 || index >= skus.length || to < 0 || to >= skus.length) return skus;
  const next = [...skus];
  [next[index], next[to]] = [next[to], next[index]];
  return next;
}

