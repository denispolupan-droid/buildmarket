/**
 * Наявність товару для Епіцентру — ЄДИНЕ правило для фіда (<availability>) і
 * пушу через /v1/offers. Чиста функція без залежностей, щоб її бачили тести.
 */
export type EpicentrStockLike = { stock_qty: number | null; stock_status: string | null };

export function epicentrAvailabilityOf(enabled: boolean, stock: EpicentrStockLike | null | undefined): 'in_stock' | 'not_available' {
  if (!enabled || !stock) return 'not_available';
  const qty = Math.max(0, Math.floor(Number(stock.stock_qty) || 0));
  return stock.stock_status === 'in_stock' || qty >= 1 ? 'in_stock' : 'not_available';
}

/**
 * Артикул для Епіцентру: offer id / sku в API — «буквено-цифрове значення без
 * розділових знаків, до 64 символів» (вимоги до XML). Наші SKU виду 1603-014,
 * тож дефіс прибираємо; назад — вставляємо після 4 цифр (усі 773 SKU у форматі
 * ^\d{4}-\d{3}$, перевірено 11.09.2026). Інші рядки повертаються як є.
 */
export function toEpicentrId(sku: string): string {
  return sku.replace(/[^0-9A-Za-z]/g, '');
}

export function fromEpicentrId(id: string | null | undefined): string {
  const s = (id ?? '').trim();
  return /^\d{7}$/.test(s) ? `${s.slice(0, 4)}-${s.slice(4)}` : s;
}
