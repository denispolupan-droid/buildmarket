import { describe, it, expect } from 'vitest';
import {
  applicableRules, resolveRule, computeMarketplacePrice,
  type PricingRule, type PriceTarget,
} from '../lib/pricing-rules';

const BANDS: PricingRule[] = [
  { marketplace: 'all', scope: 'cost_band', cost_from: 0,    cost_to: 50,   round_step: 5, exclude_single: true },
  { marketplace: 'all', scope: 'cost_band', cost_from: 50,   cost_to: 150,  markup_pct: 28, min_profit_uah: 45,  round_step: 5 },
  { marketplace: 'all', scope: 'cost_band', cost_from: 150,  cost_to: 400,  markup_pct: 22, min_profit_uah: 60,  round_step: 5 },
  { marketplace: 'all', scope: 'cost_band', cost_from: 400,  cost_to: 1000, markup_pct: 16, min_profit_uah: 90,  round_step: 5 },
  { marketplace: 'all', scope: 'cost_band', cost_from: 1000, cost_to: null, markup_pct: 13, min_profit_uah: 170, round_step: 5 },
  { marketplace: 'all', scope: 'global', markup_pct: 20, min_profit_uah: 45, round_step: 5 },
];

const target = (over: Partial<PriceTarget>): PriceTarget => ({
  sku: '1001-002', brand: 'Lacrysil', category_slug: 'akrylovi-germetyky',
  cost: 100, commissionPct: 16.2, ...over,
});

describe('вибір правила', () => {
  it('точніше правило б\'є загальніше', () => {
    const rules: PricingRule[] = [
      ...BANDS,
      { marketplace: 'all', scope: 'category', category_slug: 'akrylovi-germetyky', markup_pct: 40 },
      { marketplace: 'all', scope: 'product', sku: '1001-002', markup_pct: 55 },
    ];
    expect(resolveRule(rules, target({}), 'rozetka').markupPct).toBe(55);
  });

  it('правило конкретного МП б\'є спільне на тому ж рівні', () => {
    const rules: PricingRule[] = [
      { marketplace: 'all',     scope: 'category', category_slug: 'akrylovi-germetyky', markup_pct: 30 },
      { marketplace: 'rozetka', scope: 'category', category_slug: 'akrylovi-germetyky', markup_pct: 45 },
    ];
    expect(resolveRule(rules, target({}), 'rozetka').markupPct).toBe(45);
    expect(resolveRule(rules, target({}), 'prom').markupPct).toBe(30);
  });

  it('незадані поля успадковуються далі по ланцюжку', () => {
    const rules: PricingRule[] = [
      ...BANDS,
      // категорійне правило міняє ЛИШЕ відсоток
      { marketplace: 'all', scope: 'category', category_slug: 'akrylovi-germetyky', markup_pct: 35 },
    ];
    const r = resolveRule(rules, target({ cost: 100 }), 'rozetka');
    expect(r.markupPct).toBe(35);
    expect(r.minProfitUah).toBe(45);  // зі смуги 50–150
    expect(r.roundStep).toBe(5);
  });

  it('смуга обирається за собівартістю, межа cost_to не включна', () => {
    expect(resolveRule(BANDS, target({ cost: 149.99 }), 'rozetka').markupPct).toBe(28);
    expect(resolveRule(BANDS, target({ cost: 150 }), 'rozetka').markupPct).toBe(22);
  });

  it('неактивні правила ігноруються', () => {
    const rules: PricingRule[] = [
      ...BANDS,
      { marketplace: 'all', scope: 'product', sku: '1001-002', markup_pct: 99, is_active: false },
    ];
    expect(resolveRule(rules, target({}), 'rozetka').markupPct).toBe(28);
  });

  it('ланцюжок віддається від найточнішого до загального', () => {
    const rules: PricingRule[] = [
      ...BANDS,
      { marketplace: 'all', scope: 'category', category_slug: 'akrylovi-germetyky', markup_pct: 40 },
    ];
    expect(applicableRules(rules, target({}), 'rozetka').map(r => r.scope))
      .toEqual(['category', 'cost_band', 'global']);
  });
});

describe('розрахунок ціни', () => {
  it('комісія розкручується, а не додається — після її утримання лишається цільовий прибуток', () => {
    // cost 100, смуга 50–150: max(100×28% = 28, мінімум 45) = 45
    // (100 + 45) / (1 − 0.162) = 173.0 → округлення вгору до 5 = 175
    const r = computeMarketplacePrice(target({ cost: 100 }), BANDS, 'rozetka');
    expect(r.price).toBe(175);
    expect(r.profit).toBeGreaterThanOrEqual(45);
    expect(r.driver).toBe('min_profit');
  });

  it('на дорогому товарі працює відсоток, а не мінімум', () => {
    const r = computeMarketplacePrice(target({ cost: 2000, commissionPct: 12 }), BANDS, 'rozetka');
    expect(r.driver).toBe('markup');
    expect(r.profit).toBeGreaterThanOrEqual(2000 * 0.13);
  });

  it('дрібнота позначається як «не продавати поштучно»', () => {
    expect(computeMarketplacePrice(target({ cost: 9 }), BANDS, 'rozetka').excluded).toBe(true);
    expect(computeMarketplacePrice(target({ cost: 90 }), BANDS, 'rozetka').excluded).toBe(false);
  });

  it('РРЦ постачальника — жорстка нижня межа', () => {
    const r = computeMarketplacePrice(target({ cost: 100, minPrice: 300 }), BANDS, 'rozetka');
    expect(r.price).toBe(300);
    expect(r.driver).toBe('min_price');
  });

  it('нульова комісія не ламає розрахунок', () => {
    const r = computeMarketplacePrice(target({ cost: 100, commissionPct: 0 }), BANDS, 'rozetka');
    expect(r.price).toBe(145);
    expect(r.profit).toBe(45);
  });

  it('стара модель на тих самих даних давала помітно менше', () => {
    const cost = 100, comm = 0.162;
    const oldPrice = Math.ceil(cost * 1.10 / (1 - comm) / 5) * 5;
    const oldProfit = oldPrice * (1 - comm) - cost;
    const now = computeMarketplacePrice(target({ cost }), BANDS, 'rozetka');
    expect(oldProfit).toBeLessThan(20);
    expect(now.profit).toBeGreaterThan(oldProfit * 2);
  });

  it('прибуток рахується від ціни ПІСЛЯ комісії', () => {
    const r = computeMarketplacePrice(target({ cost: 500, commissionPct: 20 }), BANDS, 'rozetka');
    expect(r.profit).toBeCloseTo(r.price * 0.8 - 500, 2);
  });
});
