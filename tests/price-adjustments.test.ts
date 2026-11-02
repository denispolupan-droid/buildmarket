import { describe, it, expect } from 'vitest';
import {
  adjState, buildFactorMap, factorOf, factorLabel, hasPromo, kyivToday, totalFactor,
  type AdjRow,
} from '../lib/price-adjustments';
import { rozetkaPrice, promPrice, rozetkaBasePrice } from '../lib/marketplace-pricing';

const row = (p: Partial<AdjRow>): AdjRow => ({
  channel: 'rozetka', sku: 'A', pct: 5, is_promo: false, starts_on: '2026-11-01', ends_on: null, cancelled_at: null, ...p,
});

describe('adjState — дати (ends_on виключно, за Києвом)', () => {
  it('запланована / діє / закінчилась / вимкнена', () => {
    expect(adjState(row({ starts_on: '2026-11-05' }), '2026-11-01')).toBe('scheduled');
    expect(adjState(row({ starts_on: '2026-11-01' }), '2026-11-01')).toBe('active');
    expect(adjState(row({ ends_on: '2026-11-03' }), '2026-11-02')).toBe('active');
    expect(adjState(row({ ends_on: '2026-11-03' }), '2026-11-03')).toBe('ended');
    expect(adjState(row({ cancelled_at: '2026-11-01T10:00:00Z' }), '2026-11-01')).toBe('cancelled');
  });

  it('kyivToday — UTC 22:30 у Києві вже наступна доба', () => {
    expect(kyivToday(new Date('2026-11-01T22:30:00Z'))).toBe('2026-11-02');
  });
});

describe('buildFactorMap — акції й тимчасові зміни перемножуються', () => {
  const today = '2026-11-01';

  it('+5 % і −2 % → ×1,029 у будь-якому порядку', () => {
    const a = buildFactorMap([row({ pct: 5 }), row({ pct: -2 })], today);
    const b = buildFactorMap([row({ pct: -2 }), row({ pct: 5 })], today);
    expect(totalFactor(factorOf(a, 'rozetka', 'A'))).toBeCloseTo(1.029, 12);
    expect(totalFactor(factorOf(b, 'rozetka', 'A'))).toBeCloseTo(1.029, 12);
  });

  it('вимкнення будь-якої прибирає рівно її внесок', () => {
    const m = buildFactorMap([row({ pct: 5, cancelled_at: 'x' }), row({ pct: -2 })], today);
    expect(totalFactor(factorOf(m, 'rozetka', 'A'))).toBeCloseTo(0.98, 12);
  });

  it('заплановані й закінчені не діють; канали й товари окремо', () => {
    const m = buildFactorMap([
      row({ pct: 10, starts_on: '2026-11-10' }),
      row({ pct: 10, ends_on: '2026-11-01' }),
      row({ pct: 3, channel: 'prom' }),
      row({ pct: 7, sku: 'B' }),
    ], today);
    expect(totalFactor(factorOf(m, 'rozetka', 'A'))).toBe(1);
    expect(totalFactor(factorOf(m, 'prom', 'A'))).toBeCloseTo(1.03, 12);
    expect(totalFactor(factorOf(m, 'rozetka', 'B'))).toBeCloseTo(1.07, 12);
  });

  it('акція — окремий множник promo, тимчасова зміна — regular', () => {
    const m = buildFactorMap([row({ pct: -10, is_promo: true }), row({ pct: 5 })], today);
    const f = factorOf(m, 'rozetka', 'A');
    expect(f.regular).toBeCloseTo(1.05, 12);
    expect(f.promo).toBeCloseTo(0.9, 12);
    expect(hasPromo(f)).toBe(true);
    expect(hasPromo(factorOf(m, 'prom', 'A'))).toBe(false);
  });
});

describe('формули МП з корекціями', () => {
  const RZ = { cost: 497.3, retail: 547, productMarkupPct: 10, categoryMarkupPct: 0, commissionPct: 10.8 };
  const PROM = { cost: 497.3, retail: 547, productMarkupPct: 12, categoryMarkupPct: null, commissionPct: 11.66 };

  it('без множника — рівно як раніше (615 / 640 зі Smart / Prom 631)', () => {
    expect(rozetkaBasePrice(RZ)).toBe(615);
    expect(rozetkaPrice({ ...RZ, smart: true })).toBe(640);
    expect(rozetkaPrice({ ...RZ, adjustFactor: 1 })).toBe(615);
    expect(promPrice(PROM)).toBe(631);
    expect(promPrice({ ...PROM, adjustFactor: 1 })).toBe(631);
  });

  it('множник до округлення: Rozetka 613.26 × 1.05 → 645, Prom ceil', () => {
    expect(rozetkaPrice({ ...RZ, adjustFactor: 1.05 })).toBe(645);
    expect(promPrice({ ...PROM, adjustFactor: 0.98 })).toBe(Math.ceil((497.3 * 1.12 / (1 - 0.1166)) * 0.98));
  });

  it('ручна ціна Prom теж зсувається', () => {
    const base = { cost: 1, retail: 1, productMarkupPct: 0, categoryMarkupPct: 0, commissionPct: 10 };
    expect(promPrice({ ...base, manualOverride: 599 })).toBe(599);
    expect(promPrice({ ...base, manualOverride: 600, adjustFactor: 0.95 })).toBe(570);
  });

  it('акція −10 % у фіді: нова ціна з усіма корекціями, стара — без акційних (зі Smart)', () => {
    const f = factorOf(buildFactorMap([row({ pct: -10, is_promo: true })], '2026-11-01'), 'rozetka', 'A');
    const price = rozetkaPrice({ ...RZ, smart: true, adjustFactor: totalFactor(f) });
    const old   = rozetkaPrice({ ...RZ, smart: true, adjustFactor: f.regular });
    expect(old).toBe(640);                    // рівно поточна ціна без акції
    expect(price).toBeLessThan(old);
    expect(price).toBe(rozetkaPrice({ ...RZ, smart: true, adjustFactor: 0.9 }));
  });

  it('акція поверх тимчасової зміни: стара ціна включає тимчасову зміну, але не акцію', () => {
    const f = factorOf(buildFactorMap([row({ channel: 'prom', pct: 5 }), row({ channel: 'prom', pct: -20, is_promo: true })], '2026-11-01'), 'prom', 'A');
    expect(promPrice({ ...PROM, adjustFactor: f.regular })).toBe(promPrice({ ...PROM, adjustFactor: 1.05 }));
    expect(promPrice({ ...PROM, adjustFactor: totalFactor(f) })).toBe(promPrice({ ...PROM, adjustFactor: 1.05 * 0.8 }));
  });
});

describe('factorLabel', () => {
  it('+2,9 % / -10 % / 0', () => {
    expect(factorLabel(1.029)).toBe('+2,9 %');
    expect(factorLabel(0.9)).toBe('-10 %');
    expect(factorLabel(1)).toBe('0 %');
  });
});
