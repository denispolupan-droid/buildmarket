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

  it('штуки й рулони — теж фасовка', () => {
    expect(variantBaseName('Дюбель Wkret-met 6х40, 100 шт')).toBe('дюбель wkret-met 6х40');
    expect(variantBaseName('Дюбель Wkret-met 6х40, 200 шт')).toBe('дюбель wkret-met 6х40');
    expect(variantBaseName('Сітка Masternet 1х50, 2 рулони')).toBe('сітка masternet 1х50');
    expect(variantBaseName('Сітка Masternet 1х50, 5 рулонів')).toBe('сітка masternet 1х50');
  });

  // Стрічки підписані парою розмірів, і різнитись може будь-який бік:
  // у Dichtungsband однакова довжина (30 м) і різна ширина, у Fugendeckstreifen
  // навпаки. Поки відрізалась лише довжина, перша сімʼя не бачила сама себе.
  it('пара «ширина х довжина» відрізається цілком', () => {
    const knauf = [
      'Стрічка звукоізоляційна Knauf Dichtungsband, 30 мм х 30 м',
      'Стрічка звукоізоляційна Knauf Dichtungsband, 95 мм х 30 м',
    ].map(variantBaseName);
    expect(knauf[0]).toBe('стрічка звукоізоляційна knauf dichtungsband');
    expect(knauf[0]).toBe(knauf[1]);
  });

  it('пара без пробілів і коми теж ловиться', () => {
    expect(variantBaseName('Стрічка малярна HARDEX №572 25мм х 33м')).toBe('стрічка малярна hardex №572');
  });

  it('розміри бура парою не вважаються — там немає «мм х … м»', () => {
    expect(variantBaseName('Бур Werk Sds-plus 6х100х160 мм')).toBe('бур werk sds-plus 6х100х');
    expect(variantBaseName('Бур Werk Sds-plus 8х100х160 мм')).toBe('бур werk sds-plus 8х100х');
    // різні діаметри не склеюються
    expect(variantBaseName('Бур Werk Sds-plus 6х100х160 мм'))
      .not.toBe(variantBaseName('Бур Werk Sds-plus 8х100х160 мм'));
  });

  it('к-сть у дужках фасовкою не вважається — це частина назви', () => {
    // «(уп. 1000 шт)» стоїть не в кінці рядка через дужку, тож не відрізається
    expect(variantBaseName('Шуруп Knauf LN 3 5x11 (уп. 1000 шт)'))
      .toBe('шуруп knauf ln 3 5x11 (уп. 1000 шт)');
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

  it('штуки й рулони — рахунок без множника', () => {
    expect(volumeValue('100 шт')).toBe(100);
    expect(volumeValue('2 рулони')).toBe(2);
    expect(volumeValue('5 рулонів')).toBe(5);
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
