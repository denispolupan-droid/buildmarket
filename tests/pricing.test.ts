import { describe, it, expect } from 'vitest';
import { repriceItems, applyPromoCode, applyOrderDiscount, type PriceRow, type PromoCodeRow } from '../lib/pricing';

function priceMap(rows: PriceRow[]): Map<string, PriceRow> {
  return new Map(rows.map(r => [r.sku, r]));
}

describe('repriceItems — server-side re-pricing', () => {
  it('роздрібна ціна: price_retail коли промо немає', () => {
    const map = priceMap([{ sku: 'A', price_promo: null, price_retail: 100, price_unit: 70 }]);
    const r = repriceItems([{ sku: 'A', qty: 2 }], map, false);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.serverTotal).toBe(200);
    expect(r.serverEligibleTotal).toBe(200);
    expect(r.serverItems[0]).toMatchObject({ price: 100, is_promo: false });
  });

  it('роздрібна: price_promo має пріоритет над price_retail і виключається з eligible', () => {
    const map = priceMap([{ sku: 'A', price_promo: 80, price_retail: 100, price_unit: 70 }]);
    const r = repriceItems([{ sku: 'A', qty: 1 }], map, false);
    if (!r.ok) throw new Error(r.error);
    expect(r.serverTotal).toBe(80);
    expect(r.serverEligibleTotal).toBe(0); // акційний рядок не входить у базу знижки
    expect(r.serverItems[0]).toMatchObject({ price: 80, is_promo: true });
  });

  it('оптовик без акції: бере price_unit', () => {
    const map = priceMap([{ sku: 'A', price_promo: null, price_retail: 100, price_unit: 70 }]);
    const r = repriceItems([{ sku: 'A', qty: 3 }], map, true);
    if (!r.ok) throw new Error(r.error);
    expect(r.serverTotal).toBe(210);
    expect(r.serverEligibleTotal).toBe(210);
    expect(r.serverItems[0]).toMatchObject({ price: 70, is_promo: false });
  });

  it('оптовик з акцією: той самий % знижки застосовується до оптової ціни', () => {
    // роздріб: 100 → 80 (−20%). опт 70 → 70×0.8 = 56.
    const map = priceMap([{ sku: 'A', price_promo: 80, price_retail: 100, price_unit: 70 }]);
    const r = repriceItems([{ sku: 'A', qty: 3 }], map, true);
    if (!r.ok) throw new Error(r.error);
    expect(r.serverItems[0]).toMatchObject({ price: 56, is_promo: true });
    expect(r.serverTotal).toBe(168);            // 56 × 3
    expect(r.serverEligibleTotal).toBe(0);      // акційний рядок не входить у базу промокоду
  });

  it('оптовик: без price_retail акція не застосовується (нема від чого рахувати %)', () => {
    const map = priceMap([{ sku: 'A', price_promo: 80, price_retail: 0, price_unit: 70 }]);
    const r = repriceItems([{ sku: 'A', qty: 1 }], map, true);
    if (!r.ok) throw new Error(r.error);
    expect(r.serverItems[0]).toMatchObject({ price: 70, is_promo: false });
  });

  it('НЕ довіряє ціні клієнта — перезаписує price з product_stock', () => {
    const map = priceMap([{ sku: 'A', price_promo: null, price_retail: 100, price_unit: 70 }]);
    const r = repriceItems([{ sku: 'A', qty: 1, price: 1 } as never], map, false);
    if (!r.ok) throw new Error(r.error);
    expect(r.serverItems[0].price).toBe(100);
  });

  it('відсутній SKU → помилка', () => {
    const r = repriceItems([{ sku: 'X', qty: 1 }], priceMap([]), false);
    expect(r).toEqual({ ok: false, error: 'Товар X більше недоступний' });
  });

  it('ціна 0/відсутня → помилка', () => {
    const map = priceMap([{ sku: 'A', price_promo: null, price_retail: 0, price_unit: 0 }]);
    const r = repriceItems([{ sku: 'A', qty: 1 }], map, false);
    expect(r).toEqual({ ok: false, error: 'Для товару A не встановлено ціну' });
  });

  it('коректне округлення дробових сум', () => {
    const map = priceMap([{ sku: 'A', price_promo: null, price_retail: 10.1, price_unit: 5 }]);
    const r = repriceItems([{ sku: 'A', qty: 3 }], map, false);
    if (!r.ok) throw new Error(r.error);
    expect(r.serverTotal).toBe(30.3);
  });

  it('кілька рядків підсумовуються, eligible рахує лише не-акційні', () => {
    const map = priceMap([
      { sku: 'A', price_promo: null, price_retail: 100, price_unit: 70 },
      { sku: 'B', price_promo: 50, price_retail: 90, price_unit: 40 },
    ]);
    const r = repriceItems([{ sku: 'A', qty: 1 }, { sku: 'B', qty: 2 }], map, false);
    if (!r.ok) throw new Error(r.error);
    expect(r.serverTotal).toBe(200);       // 100 + 100
    expect(r.serverEligibleTotal).toBe(100); // лише A
  });
});

describe('applyPromoCode — валідація і знижка', () => {
  const now = new Date('2026-07-18T12:00:00Z');
  const base = (over: Partial<PromoCodeRow>): PromoCodeRow => ({
    code: 'SAVE', discount_type: 'percent', discount_value: 10,
    valid_from: null, valid_until: null, max_uses: null, uses_count: 0,
    min_order_amount: null, max_discount_amount: null, ...over,
  });

  it('відсоткова знижка від eligible-суми, не від загальної', () => {
    const r = applyPromoCode(base({ discount_type: 'percent', discount_value: 10 }), 1000, 800, now);
    if (!r.ok) throw new Error(r.error);
    expect(r.promoDiscount).toBe(80);   // 10% від 800
    expect(r.finalTotal).toBe(920);     // 1000 - 80
  });

  it('фіксована знижка обмежена базою eligible', () => {
    const r = applyPromoCode(base({ discount_type: 'fixed', discount_value: 500 }), 1000, 300, now);
    if (!r.ok) throw new Error(r.error);
    expect(r.promoDiscount).toBe(300);  // min(500, 300)
    expect(r.finalTotal).toBe(700);
  });

  it('max_discount_amount обмежує знижку', () => {
    const r = applyPromoCode(base({ discount_type: 'percent', discount_value: 50, max_discount_amount: 100 }), 1000, 1000, now);
    if (!r.ok) throw new Error(r.error);
    expect(r.promoDiscount).toBe(100);
    expect(r.finalTotal).toBe(900);
  });

  it('finalTotal не може бути від’ємним', () => {
    const r = applyPromoCode(base({ discount_type: 'fixed', discount_value: 5000 }), 100, 100, now);
    if (!r.ok) throw new Error(r.error);
    expect(r.finalTotal).toBe(0);
  });

  it('відхиляє прострочений промокод', () => {
    const r = applyPromoCode(base({ valid_until: '2026-07-01' }), 1000, 1000, now);
    expect(r).toEqual({ ok: false, error: 'Термін дії промокоду закінчився' });
  });

  it('відхиляє ще-не-активний промокод', () => {
    const r = applyPromoCode(base({ valid_from: '2026-08-01' }), 1000, 1000, now);
    expect(r).toEqual({ ok: false, error: 'Промокод ще не діє' });
  });

  it('відхиляє вичерпаний промокод', () => {
    const r = applyPromoCode(base({ max_uses: 5, uses_count: 5 }), 1000, 1000, now);
    expect(r).toEqual({ ok: false, error: 'Промокод вичерпано' });
  });

  it('перевіряє мінімальну суму замовлення', () => {
    const r = applyPromoCode(base({ min_order_amount: 2000 }), 1000, 1000, now);
    expect(r).toEqual({ ok: false, error: 'Мінімальна сума для цього промокоду — 2000 ₴' });
  });
});

describe('applyOrderDiscount — ручна знижка по замовленню', () => {
  it('відсоткова знижка знижує кожну ціну і перераховує суму', () => {
    const r = applyOrderDiscount([{ sku: 'A', qty: 2, price: 100 }, { sku: 'B', qty: 1, price: 50 }], { pct: 10 });
    if (!r.ok) throw new Error(r.error);
    expect(r.items[0]).toMatchObject({ price: 90, price_base: 100 });
    expect(r.items[1]).toMatchObject({ price: 45, price_base: 50 });
    expect(r.total).toBe(225);            // 90×2 + 45
    expect(r.discountPct).toBe(10);
    expect(r.discountAmount).toBe(25);    // 250 − 225
  });

  it('знижка сумою грн переводиться у % від бази', () => {
    // база 250, знижка 25 грн → 10%
    const r = applyOrderDiscount([{ sku: 'A', qty: 2, price: 100 }, { sku: 'B', qty: 1, price: 50 }], { amount: 25 });
    if (!r.ok) throw new Error(r.error);
    expect(r.discountPct).toBe(10);
    expect(r.total).toBe(225);
  });

  it('ідемпотентність: повторне застосування рахує від price_base, не компаундить', () => {
    const first = applyOrderDiscount([{ sku: 'A', qty: 1, price: 100 }], { pct: 10 });
    if (!first.ok) throw new Error(first.error);
    // застосовуємо 20% до вже здешевлених позицій — має бути 80, а не 72
    const second = applyOrderDiscount(first.items, { pct: 20 });
    if (!second.ok) throw new Error(second.error);
    expect(second.items[0]).toMatchObject({ price: 80, price_base: 100 });
    expect(second.total).toBe(80);
    expect(second.discountAmount).toBe(20);
  });

  it('pct=0 повертає повні ціни (знімає знижку)', () => {
    const discounted = applyOrderDiscount([{ sku: 'A', qty: 1, price: 100 }], { pct: 15 });
    if (!discounted.ok) throw new Error(discounted.error);
    const restored = applyOrderDiscount(discounted.items, { pct: 0 });
    if (!restored.ok) throw new Error(restored.error);
    expect(restored.items[0].price).toBe(100);
    expect(restored.total).toBe(100);
    expect(restored.discountAmount).toBe(0);
  });

  it('бонусні позиції не чіпаються', () => {
    const r = applyOrderDiscount([{ sku: 'A', qty: 1, price: 100 }, { sku: 'GIFT', qty: 1, price: 0, is_bonus: true }], { pct: 50 });
    if (!r.ok) throw new Error(r.error);
    expect(r.items[0].price).toBe(50);
    expect(r.items[1]).toMatchObject({ price: 0, is_bonus: true });
    expect(r.items[1].price_base).toBeUndefined();   // бонус не отримує price_base
    expect(r.total).toBe(50);
  });

  it('знижка обмежена 0..100%', () => {
    const over = applyOrderDiscount([{ sku: 'A', qty: 1, price: 100 }], { pct: 150 });
    if (!over.ok) throw new Error(over.error);
    expect(over.discountPct).toBe(100);
    expect(over.total).toBe(0);
  });

  it('без pct/amount — помилка', () => {
    const r = applyOrderDiscount([{ sku: 'A', qty: 1, price: 100 }], {});
    expect(r).toEqual({ ok: false, error: 'Вкажіть відсоток або суму знижки' });
  });

  it('сума грн при нульовому замовленні — помилка', () => {
    const r = applyOrderDiscount([], { amount: 50 });
    expect(r).toEqual({ ok: false, error: 'Нульова сума замовлення' });
  });
});
