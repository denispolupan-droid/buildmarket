import { describe, it, expect } from 'vitest';
import {
  roundRetail, roundHalf, priceFromMarkup, markupFromPrice, retailNotBelowWholesale,
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

describe('retailNotBelowWholesale', () => {
  it('роздріб піднімається до опту, якщо опустився нижче', () => {
    expect(retailNotBelowWholesale(90, 97.5)).toBe(97.5);
    expect(retailNotBelowWholesale(120, 97.5)).toBe(120);
  });
});
