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

/**
 * Службові колонки самої таблиці products. Тут список ЧОРНИЙ, на відміну від
 * складу: у products близько сорока колонок, і майже всі потрібні вітрині —
 * білий список довелося б правити при кожному новому полі й ламати рендер,
 * якщо забути. Тому перелічені ті, що назовні не потрібні ніколи:
 * код постачальника, мінімальна ціна, коефіцієнти закупівлі та націнки МП.
 */
const INTERNAL_PRODUCT_KEYS = [
  'supplier_sku',
  'min_price',
  'purchase_ratio',
  'sale_ratio',
  'purchase_uom',
  'purchase_uom_factor',
  'prom_markup_pct',
  'rozetka_markup_pct',
] as const;

/** Копія товару з обрізаним складом і без службових колонок. */
export function publicProduct<T extends { stock?: AnyStock }>(product: T, keepUnitPrice = false): T {
  const out: Record<string, unknown> = { ...product, stock: publicStock(product.stock, keepUnitPrice) };
  for (const k of INTERNAL_PRODUCT_KEYS) delete out[k];
  return out as T;
}
