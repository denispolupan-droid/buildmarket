import { describe, it, expect } from 'vitest';
import { applyPromoToItems } from '../lib/pricing';
import { linesTotal, type OrderLineInput } from '../lib/orders/lines';

/**
 * Імпорт з площадки (lib/marketplace/import-order): знижка площадки на все замовлення
 * (total площадки < Σ рядків) зашивається в построчні ціни тим самим правилом, що й
 * промокод, — щоб amount_paid дорівнював сумі замовлення й не було фантомного боргу.
 */
describe('знижка площадки при імпорті замовлення', () => {
  const lines = [
    { sku: 'A', name: 'a', brand: 'b', qty: 2, price: 300 },
    { sku: 'B', name: 'b', brand: 'b', qty: 1, price: 400 },
  ];
  it('total площадки 900 при Σ рядків 1000 → рядки пропорційно на 900, сума збігається з оплатою', () => {
    const diff = linesTotal(lines as OrderLineInput[]) - 900;
    const baked = applyPromoToItems(lines, diff);
    expect(baked.finalTotal).toBe(900);
    expect(linesTotal(baked.items as unknown as OrderLineInput[])).toBe(900);
    for (const l of baked.items) expect(Number(l.price_base)).toBeGreaterThan(Number(l.price));
  });
  it('total площадки більший за рядки (доставка в сумі) — рядки не чіпаємо', () => {
    const diff = linesTotal(lines as OrderLineInput[]) - 1070;
    expect(diff).toBeLessThan(0);
    const baked = applyPromoToItems(lines, Math.max(0, diff));
    expect(baked.promoDiscount).toBe(0);
    expect(baked.finalTotal).toBe(1000);
  });
});
