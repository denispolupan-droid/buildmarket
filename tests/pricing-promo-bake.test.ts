import { describe, it, expect } from 'vitest';
import { applyPromoToItems } from '../lib/pricing';
import { linesTotal } from '../lib/orders/lines';

describe('applyPromoToItems — промокод у построчних цінах (етап C: сума = Σ рядків)', () => {
  const items = [
    { sku: 'A', qty: 2, price: 100, is_promo: false },
    { sku: 'B', qty: 1, price: 50, is_promo: true },     // акційний — під промокод не підпадає
    { sku: 'C', qty: 3, price: 10, is_promo: false },
  ];

  it('розкладає знижку пропорційно по рядках, що підпадають; сума замовлення = Σ рядків після знижки', () => {
    // eligible = 200 + 30 = 230; знижка 23 ₴ = 10 %
    const r = applyPromoToItems(items, 23);
    expect(r.items[0]).toMatchObject({ sku: 'A', price_base: 100, price: 90 });
    expect(r.items[1]).toEqual(items[1]);                  // акційний рядок не чіпаємо, price_base не з'являється
    expect(r.items[2]).toMatchObject({ sku: 'C', price_base: 10, price: 9 });
    expect(r.finalTotal).toBe(linesTotal(r.items as { qty: number; price: number }[]));
    expect(r.finalTotal).toBe(257);
    expect(r.promoDiscount).toBe(23);
  });

  it('округлення копійок: фактична знижка може відрізнятись від розрахованої, повертається фактична', () => {
    const r = applyPromoToItems([{ sku: 'A', qty: 3, price: 10, is_promo: false }], 1); // 3.333 % → 9.67 × 3 = 29.01
    expect(r.items[0]).toMatchObject({ price: 9.67, price_base: 10 });
    expect(r.finalTotal).toBe(29.01);
    expect(r.promoDiscount).toBe(0.99);
  });

  it('знижка не більша за суму рядків, що підпадають; нульова знижка нічого не міняє', () => {
    const r = applyPromoToItems(items, 10_000);
    expect(r.items[0]).toMatchObject({ price: 0 });
    expect(r.finalTotal).toBe(50);
    const z = applyPromoToItems(items, 0);
    expect(z.items).toBe(items);
    expect(z.promoDiscount).toBe(0);
    expect(z.finalTotal).toBe(280);
  });
});
