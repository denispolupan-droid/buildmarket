import { describe, it, expect } from 'vitest';
import { variantBaseName, volumeValue, findVariants } from '../lib/seo/meta';

// Стрічки CL 152 («…, 120 мм, 10 м» і «…, 120 мм, 50 м») не склеювались у
// варіанти: у переліку одиниць фасовки не було метрів, тож базова назва лишалась
// різною і на картці товару не з'являвся перемикач фасовок.
const TAPE_10 = { sku: '1100-001', name: 'Стрічка гідроізоляційна Ceresit CL 152, 120 мм, 10 м', brand: 'Ceresit', volume: '10 м' };
const TAPE_50 = { sku: '1100-002', name: 'Стрічка гідроізоляційна Ceresit CL 152, 120 мм, 50 м', brand: 'Ceresit', volume: '50 м' };

describe('variantBaseName', () => {
  it('відрізає метри в кінці назви', () => {
    expect(variantBaseName(TAPE_10.name)).toBe(variantBaseName(TAPE_50.name));
  });

  it('відрізає саме останню фасовку, а розмір у назві лишає', () => {
    expect(variantBaseName(TAPE_10.name)).toBe('стрічка гідроізоляційна ceresit cl 152, 120 мм');
  });

  it('старі одиниці працюють як раніше', () => {
    expect(variantBaseName('Грунтовка Ceresit CT 17, 10 л')).toBe('грунтовка ceresit ct 17');
    expect(variantBaseName('Клей Ceresit CM 11, 25 кг')).toBe('клей ceresit cm 11');
    expect(variantBaseName('Герметик, 280 мл')).toBe('герметик');
    expect(variantBaseName('Клей, 50 г')).toBe('клей');
  });
});

describe('volumeValue', () => {
  it('метри рахуються в міліметрах — 50 м більше за 10 м', () => {
    expect(volumeValue('10 м')).toBe(10_000);
    expect(volumeValue('50 м')).toBe(50_000);
    expect(volumeValue('120 мм')).toBe(120);
  });

  it('«мм» не читається як «м»: інакше 120 мм важило б 120 000', () => {
    expect(volumeValue('120 мм')).toBeLessThan(volumeValue('10 м'));
  });

  it('об\'єм і вага — як раніше', () => {
    expect(volumeValue('10 л')).toBe(10_000);
    expect(volumeValue('25 кг')).toBe(25_000);
    expect(volumeValue('280 мл')).toBe(280);
    expect(volumeValue('50 г')).toBe(50);
    expect(volumeValue(null)).toBe(0);
  });
});

describe('findVariants', () => {
  it('знаходить другу довжину стрічки', () => {
    expect(findVariants([TAPE_10, TAPE_50], TAPE_10).map(v => v.sku)).toEqual(['1100-002']);
  });

  it('сортує за зростанням фасовки', () => {
    const list = [TAPE_50, TAPE_10];
    expect(findVariants(list, { sku: 'x', name: TAPE_10.name, brand: 'Ceresit' }).map(v => v.volume))
      .toEqual(['10 м', '50 м']);
  });

  it('чужий бренд із такою ж назвою не підтягується', () => {
    const other = { ...TAPE_50, sku: 'z', brand: 'Sika' };
    expect(findVariants([other], TAPE_10)).toEqual([]);
  });
});
