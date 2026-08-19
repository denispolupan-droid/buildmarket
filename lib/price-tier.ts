// Ціна товару за тарифом клієнта — одне місце на всю адмінку.
// Раніше формула жила всередині NewOrderModal, і будь-хто, кому треба було
// підставити ціну (копія замовлення, імпорт з файлу), заводив другу копію —
// а це грошовий шлях, де розбіжність означає неправильну суму в замовленні.

export type ProductPrices = {
  price_retail?:    number | null;
  price_wholesale?: number | null;
  price_drop?:      number | null;
  price_cost?:      number | null;
  price_unit?:      number | null;
};

export const PRICE_TIER_OPTIONS = [
  { value: 'retail',    label: 'Роздріб' },
  { value: 'wholesale', label: 'Оптова'  },
  { value: 'drop',      label: 'Дроп'    },
  { value: 'cost',      label: 'Закуп'   },
];

export function priceForTier(p: ProductPrices, tier: string): number {
  const v = tier === 'retail'    ? (p.price_retail    ?? p.price_unit)
          : tier === 'wholesale' ? (p.price_wholesale ?? p.price_unit)
          : tier === 'drop'      ? (p.price_drop      ?? p.price_unit)
          : tier === 'cost'      ? p.price_cost
          : p.price_unit;
  return Number(v ?? 0);
}
