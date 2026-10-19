import { describe, it, expect } from 'vitest';
import { parseVolume, shippingWeightKg, DEFAULT_KG } from '../lib/shipping-weight';

describe('parseVolume', () => {
  it('розбирає кому, крапку й одиниці', () => {
    expect(parseVolume('0,75 л')).toEqual({ value: 0.75, unit: 'л' });
    expect(parseVolume('2.2 кг')).toEqual({ value: 2.2, unit: 'кг' });
    expect(parseVolume('400 г')).toEqual({ value: 400, unit: 'г' });
    expect(parseVolume('850 мл')).toEqual({ value: 850, unit: 'мл' });
  });
  it('метри, міліметри й порожнє — не маса', () => {
    expect(parseVolume('33 м')).toBeNull();
    expect(parseVolume('50 мм')).toBeNull();
    expect(parseVolume(null)).toBeNull();
  });
});

describe('shippingWeightKg', () => {
  it('кг — вміст плюс тара', () => {
    expect(shippingWeightKg('5 кг', 'klei-dlya-plytky', 'klei')).toBe(5.4);
  });
  it('малі фасовки отримують мінімум тари', () => {
    expect(shippingWeightKg('310 г', 'bitumni-germetyky', 'germetyky')).toBe(0.36);
  });
  it('літри фарби — через щільність родини', () => {
    expect(shippingWeightKg('9 л', 'vodoemiulsiyni-interierni', 'farby')).toBe(12.64);
  });
  it('розчинник легший за воду', () => {
    expect(shippingWeightKg('1 л', 'rozchynnyky', 'farby')).toBe(0.92);
  });
  it('балон піни 750 мл — у першій ступені до 2 кг', () => {
    expect(shippingWeightKg('750 мл', 'pistoletna-pina', 'montazhna-pina')).toBeLessThan(2);
  });
  it('без фасовки — дефолт', () => {
    expect(shippingWeightKg(null, 'vidrizni-dysky', 'instrumenty')).toBe(DEFAULT_KG);
    expect(shippingWeightKg('33 м', 'malyarna-strichka', 'strichky')).toBe(DEFAULT_KG);
  });
});
