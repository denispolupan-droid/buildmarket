import { describe, it, expect } from 'vitest';
import {
  roundRetail, roundHalf, priceFromMarkup, markupFromPrice, roundUpFor, enforcePriceLadder,
} from '../lib/price-formula';

describe('округлення', () => {
  it('роздріб — вниз до цілого', () => {
    expect(roundRetail(107.9)).toBe(107);
    expect(roundRetail(107)).toBe(107);
    expect(roundRetail(0.9)).toBe(0);
  });

  it('опт і дроп — до 0.5', () => {
    expect(roundHalf(97.3)).toBe(97.5);
    expect(roundHalf(97.1)).toBe(97);
    expect(roundHalf(97.75)).toBe(98);
  });
});

describe('priceFromMarkup', () => {
  it('рахує ціну від собівартості з наценкою', () => {
    expect(priceFromMarkup(100, 10, 'retail')).toBe(110);
    expect(priceFromMarkup(95.5, 12, 'retail')).toBe(106);   // 106.96 → вниз
    expect(priceFromMarkup(95.5, 2, 'wholesale')).toBe(97.5); // 97.41 → 97.5
  });

  it('нульова наценка — ціна дорівнює собівартості', () => {
    expect(priceFromMarkup(80, 0, 'retail')).toBe(80);
  });
});

describe('markupFromPrice', () => {
  it('повертає наценку у відсотках із двома знаками', () => {
    expect(markupFromPrice(100, 112)).toBe(12);
    expect(markupFromPrice(95.5, 107)).toBe(12.05); // вгору, щоб floor не з'їв гривню
  });

  it('без собівартості або ціни наценки немає', () => {
    expect(markupFromPrice(0, 100)).toBeNull();
    expect(markupFromPrice(null, 100)).toBeNull();
    expect(markupFromPrice(100, 0)).toBeNull();
    expect(markupFromPrice(100, null)).toBeNull();
  });

  it('кругообіг: ціна → наценка → ціна дає ту саму ціну', () => {
    for (const [cost, price] of [[100, 112], [95.5, 107], [426, 434], [77, 79]] as [number, number][]) {
      const m = markupFromPrice(cost, price)!;
      expect(priceFromMarkup(cost, m, 'retail')).toBe(price);
    }
  });

  it('переоцінка ×1.12 від собівартості = наценка 12 %', () => {
    const cost = 250;
    const target = Math.floor(cost * 1.12);
    expect(markupFromPrice(cost, target)).toBe(12);
  });
});

describe('roundUpFor', () => {
  it('роздріб — угору до цілого, опт і дроп — угору до 0.5', () => {
    expect(roundUpFor('retail', 1.2)).toBe(2);
    expect(roundUpFor('retail', 3)).toBe(3);
    expect(roundUpFor('wholesale', 1.2)).toBe(1.5);
    expect(roundUpFor('drop', 1.2)).toBe(1.5);
    expect(roundUpFor('drop', 1.5)).toBe(1.5);
  });
});

describe('enforcePriceLadder', () => {
  it('роздріб піднімається до опту, якщо опустився нижче', () => {
    expect(enforcePriceLadder(70, { retail: 90, wholesale: 97.5, drop: 85 }).retail).toBe(97.5);
    expect(enforcePriceLadder(70, { retail: 120, wholesale: 97.5, drop: 85 }).retail).toBe(120);
  });

  it('роздріб піднімається до дропу — випадок дюбеля 1701-010', () => {
    // вхід 1.20: floor(1.2 × 1.2) = 1 роздріб, round₀.₅(1.2 × 1.25) = 1.5 дроп
    expect(enforcePriceLadder(1.2, { retail: 1, wholesale: 1, drop: 1.5 }))
      .toEqual({ retail: 1.5, wholesale: 1.5, drop: 1.5 });
  });

  it('жодна ціна продажу не лишається нижче собівартості', () => {
    const l = enforcePriceLadder(1.2, { retail: 1, wholesale: 1, drop: 1 });
    expect(l.wholesale).toBe(1.5);
    expect(l.drop).toBe(1.5);
    expect(l.retail).toBe(1.5);
  });

  it('нормальний товар лишається недоторканим', () => {
    const p = { retail: 106, wholesale: 89, drop: 93.5 };
    expect(enforcePriceLadder(87.3, p)).toEqual(p);
  });

  it('без собівартості сходинка все одно тримає порядок цін', () => {
    expect(enforcePriceLadder(0, { retail: 100, wholesale: 105, drop: 102 }))
      .toEqual({ retail: 105, wholesale: 105, drop: 102 });
  });
});
