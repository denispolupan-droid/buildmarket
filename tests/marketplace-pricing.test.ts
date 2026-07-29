import { describe, it, expect } from 'vitest';
import {
  resolveMarkup, rozetkaBasePrice, rozetkaSmartPrice, rozetkaPrice, rozetkaMargin,
  promPriceFromBase, promPrice, promMargin, promCommissionOf, siteMargin,
} from '../lib/marketplace-pricing';

// Референс — SKU 1901-017 (Пластифікатор Байріс 10 л) станом на 2026-07-28:
// cost 497.30, retail 547, націнка товару Rozetka 10 %, комісія 10.8 %, Smart;
// Prom: націнка товару 12 %, комісія 11.66 %. Фіди віддавали 640 і 631.
const RZ_1901 = {
  cost: 497.3, retail: 547,
  productMarkupPct: 10, categoryMarkupPct: 0, commissionPct: 10.8,
};

describe('rozetkaPrice — формула фіда', () => {
  it('база без Smart: 497.30 ×1.10 ÷0.892 → ceil5 = 615', () => {
    expect(rozetkaBasePrice(RZ_1901)).toBe(615);
  });

  it('зі Smart (дефолтний тариф): 615 + 18/0.892 → ceil5 = 640 (як у фіді)', () => {
    expect(rozetkaPrice({ ...RZ_1901, smart: true })).toBe(640);
  });

  it('товарна націнка перебиває категорійну', () => {
    expect(resolveMarkup(10, 25)).toBe(10);
    expect(resolveMarkup(null, 25)).toBe(25);
    expect(resolveMarkup(0, 25)).toBe(0); // явний нуль — теж override
  });

  it('без комісії і націнки → роздрібна ціна як є', () => {
    expect(rozetkaPrice({ cost: 100, retail: 149, productMarkupPct: null, categoryMarkupPct: null, commissionPct: 0 })).toBe(149);
  });

  it('без ціни входу база = роздріб', () => {
    expect(rozetkaBasePrice({ cost: null, retail: 500, productMarkupPct: 10, categoryMarkupPct: null, commissionPct: 0 }))
      .toBe(Math.ceil(550 / 5) * 5);
  });

  it('Smart без комісії — запобіжник 15 %', () => {
    // P=300: fee 12 → 300 + 12/0.85 = 314.1 → 315
    expect(rozetkaSmartPrice(300, 0)).toBe(315);
  });

  it('Smart: перескок порога 399→400 перераховується з більшим тарифом', () => {
    // P=395, c=10%: fee 12 → 408.3 (перескочили 400) → fee 18 → 395+20 = 415
    expect(rozetkaSmartPrice(395, 10)).toBe(415);
  });

  it('маржа рахується без Smart-надбавки', () => {
    const m = rozetkaMargin({ ...RZ_1901, smart: true });
    // net = 615 × 0.892 = 548.58; маржа = 51.28
    expect(m!.uah).toBeCloseTo(548.58 - 497.3, 1);
  });
});

describe('promPrice — формула фіда', () => {
  const PROM_1901 = { cost: 497.3, retail: 547, productMarkupPct: 12, categoryMarkupPct: null, commissionPct: 11.66 };

  it('від ціни входу: 497.30 ×1.12 ÷0.8834 → ceil = 631 (як у фіді)', () => {
    expect(promPrice(PROM_1901)).toBe(631);
  });

  it('ручний override (price_wholesale) б\'є формулу', () => {
    expect(promPrice({ ...PROM_1901, manualOverride: 599 })).toBe(599);
  });

  it('комісія ≥100 % → 0 (захист від ділення)', () => {
    expect(promPriceFromBase(100, 10, 100)).toBe(0);
  });

  it('маржа: ціна × (1−комісія) − собівартість', () => {
    const m = promMargin(PROM_1901);
    expect(m!.uah).toBeCloseTo(631 * (1 - 0.1166) - 497.3, 1);
  });

  it('promCommissionOf: план Економ бере econom-колонку, з fallback на єдину', () => {
    const cat = { prom_commission_pct: 15.29, prom_commission_pct_econom: 7.65 };
    expect(promCommissionOf(cat, 'single')).toBe(15.29);
    expect(promCommissionOf(cat, 'econom')).toBe(7.65);
    expect(promCommissionOf({ prom_commission_pct: 15.29, prom_commission_pct_econom: null }, 'econom')).toBe(15.29);
    expect(promCommissionOf(null, 'econom')).toBe(0);
  });
});

describe('siteMargin', () => {
  it('роздріб − собівартість', () => {
    expect(siteMargin(547, 497.3)!.uah).toBeCloseTo(49.7, 5);
    expect(siteMargin(547, null)).toBeNull();
  });
});
