import { describe, it, expect } from 'vitest';
import { computeSmartFee, parseSmartTariff, DEFAULT_SMART_TARIFF } from '../lib/rozetka-smart-tariff';

describe('computeSmartFee — тариф Rozetka Smart за порогами суми замовлення', () => {
  it('дефолтний тариф: до 399 → 12, 400–699 → 18, від 700 → 30', () => {
    expect(computeSmartFee(50)).toBe(12);
    expect(computeSmartFee(399)).toBe(12);
    expect(computeSmartFee(399.99)).toBe(12);
    expect(computeSmartFee(400)).toBe(18);
    expect(computeSmartFee(680)).toBe(18);
    expect(computeSmartFee(699.99)).toBe(18);
    expect(computeSmartFee(700)).toBe(30);
    expect(computeSmartFee(10000)).toBe(30);
  });

  it('кастомний тариф застосовується', () => {
    const t = [{ upTo: 500, fee: 10 }, { upTo: null, fee: 25 }];
    expect(computeSmartFee(499, t)).toBe(10);
    expect(computeSmartFee(500, t)).toBe(25);
  });
});

describe('parseSmartTariff — розбір налаштування', () => {
  it('валідний JSON парситься', () => {
    const raw = JSON.stringify({ brackets: [{ upTo: 300, fee: 10 }, { upTo: null, fee: 20 }] });
    expect(parseSmartTariff(raw)).toEqual([{ upTo: 300, fee: 10 }, { upTo: null, fee: 20 }]);
  });

  it('порожнє / зіпсоване / без відкритого останнього кошика → дефолт', () => {
    expect(parseSmartTariff(null)).toEqual(DEFAULT_SMART_TARIFF);
    expect(parseSmartTariff('не json')).toEqual(DEFAULT_SMART_TARIFF);
    expect(parseSmartTariff('{}')).toEqual(DEFAULT_SMART_TARIFF);
    expect(parseSmartTariff(JSON.stringify({ brackets: [{ upTo: 400, fee: 12 }] }))).toEqual(DEFAULT_SMART_TARIFF);
    expect(parseSmartTariff(JSON.stringify({ brackets: [{ upTo: 400, fee: -5 }, { upTo: null, fee: 30 }] }))).toEqual(DEFAULT_SMART_TARIFF);
    expect(parseSmartTariff(JSON.stringify({ brackets: [{ upTo: 700, fee: 12 }, { upTo: 400, fee: 18 }, { upTo: null, fee: 30 }] }))).toEqual(DEFAULT_SMART_TARIFF);
  });
});
