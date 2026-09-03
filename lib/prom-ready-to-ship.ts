/**
 * Наявність товару для Prom.ua — єдине правило для YML-фіда і API-пушу.
 *
 * Prom має два незалежні прапорці:
 *  • available / presence — товар в наявності (можна купити);
 *  • in_stock — «Готово до відправки»: гарантована наявність (на своєму складі
 *    або складі постачальника), пріоритет у видачі Prom і Bigl.
 *
 * «Готово до відправки» вмикається одним перемикачем (app_settings
 * `prom_ready_to_ship`, on за замовчуванням). Prom окремо рахує відсоток
 * успішних замовлень таких товарів: нижче 90 % — статус забирають, тому
 * власник має змогу швидко вимкнути його з дашборда Prom.
 *
 * Формати:
 *  • YML-фід: <offer id="…" available="true" in_stock="true">
 *  • API products/edit: { presence: 'available', in_stock: true, quantity_in_stock: N }
 */

export const PROM_READY_TO_SHIP_KEY = 'prom_ready_to_ship';

/** Значення налаштування → чи ставити «Готово до відправки». Відсутнє = увімкнено. */
export function readyToShipEnabled(value: string | null | undefined): boolean {
  if (value == null || value === '') return true;
  return value !== 'off';
}

export type PromAvailability = {
  presence: 'available' | 'not_available';
  in_stock: boolean;
  quantity_in_stock: number;
};

export function promAvailability(input: {
  /** on_prom: товар увімкнений для Prom */
  enabled: boolean;
  /** product_stock.stock_status: in_stock | out_of_stock | on_order */
  stockStatus: string | null | undefined;
  /** product_stock.stock_qty (у постачальників з stock_always_available = 0 при наявності) */
  stockQty: number | null | undefined;
  /** глобальний перемикач «Готово до відправки» */
  readyToShip: boolean;
}): PromAvailability {
  const available = input.enabled && input.stockStatus === 'in_stock';
  if (!available) return { presence: 'not_available', in_stock: false, quantity_in_stock: 0 };
  return {
    presence: 'available',
    // Наявність визначає статус постачальника, а не число: у частини постачальників
    // залишок — умовний прапорець (stock_qty = 0 при фактичній наявності).
    in_stock: input.readyToShip,
    quantity_in_stock: Math.max(0, Math.floor(Number(input.stockQty ?? 0))),
  };
}
