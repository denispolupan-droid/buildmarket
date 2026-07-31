/**
 * Зрізання службових полів складу перед віддачею об'єкта в клієнтський компонент.
 *
 * Сторінка товару тягне product_stock(*) — і правильно: серверу потрібні
 * price_unit, щоб порахувати оптову ціну, і price_cost для нічого іншого не
 * використовується, але приїжджає разом з рештою. Далі об'єкт цілком їде
 * пропсом у ProductGallery і RelatedCarousel, тобто серіалізується у вихідний
 * код сторінки. Через це закупівельна ціна лежала у відкритому вигляді
 * в кожній картці товару.
 *
 * Список полів БІЛИЙ, а не чорний: якщо завтра в product_stock з'явиться нова
 * службова колонка, вона не поїде назовні автоматично.
 */

const PUBLIC_STOCK_KEYS = [
  'price_retail',
  'price_retail_old',
  'price_promo',
  'price_old',
  'stock_status',
  'stock_qty',
] as const;

type AnyStock = Record<string, unknown> | null | undefined;

/**
 * @param keepUnitPrice — лишити price_unit (оптову ціну). Потрібно тільки коли
 * сторінку дивиться оптовий клієнт: для гостя оптова ціна теж зайва.
 */
export function publicStock(stock: AnyStock, keepUnitPrice = false): Record<string, unknown> | null {
  if (!stock) return null;
  const out: Record<string, unknown> = {};
  for (const k of PUBLIC_STOCK_KEYS) {
    if (k in stock) out[k] = stock[k];
  }
  if (keepUnitPrice && 'price_unit' in stock) out.price_unit = stock.price_unit;
  return out;
}

/** Копія товару з обрізаним складом. Решта полів не чіпається. */
export function publicProduct<T extends { stock?: AnyStock }>(product: T, keepUnitPrice = false): T {
  return { ...product, stock: publicStock(product.stock, keepUnitPrice) } as T;
}
