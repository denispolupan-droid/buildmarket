import { describe, it, expect } from 'vitest';
import { estimateItemPackage, itemPackage, suggestParcelBox, PARCEL_BOXES } from '../lib/package-dims';

describe('оцінка упаковки товару (правила 09.11 для фіда Епіцентру)', () => {
  it('картридж герметика 280 мл', () => {
    expect(estimateItemPackage('Герметик силіконовий Ceresit CS 25 280 мл', 300)).toEqual({ dims: [230, 55, 55], kind: 'картридж' });
  });
  it('балон піни 750 мл — довгий', () => {
    expect(estimateItemPackage('Піна монтажна Lacrysil 65 професійна', 900).dims[0]).toBe(330);
  });
  it('правило: довжина в см і в мм (до 12.11 «2000мм» вважалось блістером)', () => {
    expect(estimateItemPackage('Правило алюмінієве 150 см', 0).dims[0]).toBe(1520);
    expect(estimateItemPackage('Правило-рівень 2000мм профіль', 0).dims[0]).toBe(2020);
  });
  it('шуруп «з буром» — кріплення, не бур', () => {
    expect(estimateItemPackage('Шуруп Knauf LB 3.5х9.5 с буром (уп. 1000 шт)', 2000).kind).toBe('коробка кріплення');
  });
  it('відро з ваги — циліндр, висота найбільша', () => {
    const e = estimateItemPackage('Мастика Bitugum 5 кг', 5000);
    expect(e.kind).toBe('банка/відро');
    expect(e.dims[0]).toBeGreaterThanOrEqual(e.dims[1]);
  });
  it('ручні габарити з картки мають пріоритет; неповні — ігноруються', () => {
    expect(itemPackage({ name: 'Клей', weightG: 750, package_length_mm: 100, package_width_mm: 200, package_height_mm: 90 }))
      .toEqual({ dims: [200, 100, 90], kind: 'з картки', manual: true });
    expect(itemPackage({ name: 'Клей', weightG: 300, package_length_mm: 100, package_width_mm: null, package_height_mm: 90 }).manual).toBe(false);
  });
});

describe('підбір коробки', () => {
  it('коробки — за зростанням об\'єму (перша, що підходить, — найменша)', () => {
    const v = PARCEL_BOXES.map(b => b.dims[0] * b.dims[1] * b.dims[2]);
    expect(v).toEqual([...v].sort((a, b) => a - b));
  });
  it('три картриджі — S; балон піни — «довга»; відро 5 кг — M+', () => {
    expect(suggestParcelBox([{ dims: [230, 55, 55], qty: 3 }])?.label).toBe('S');
    expect(suggestParcelBox([{ dims: [330, 70, 70], qty: 1 }])?.label).toBe('довга');
    expect(suggestParcelBox([{ dims: [215, 200, 200], qty: 1 }])?.label).toBe('M+');
  });
  it('довгий товар, що не влазить у жодну, — коробка за товаром', () => {
    const b = suggestParcelBox([{ dims: [2020, 110, 40], qty: 1 }])!;
    expect(b.label).toBe('за товаром');
    expect(b.dims).toEqual([204, 13, 6]);
  });
  it('забагато для XL — XL з позначкою «ділити на місця»', () => {
    expect(suggestParcelBox([{ dims: [300, 200, 200], qty: 10 }])).toMatchObject({ label: 'XL', overflow: true });
  });
  it('об\'ємна вага НП: Д×Ш×В/4000', () => {
    expect(suggestParcelBox([{ dims: [230, 55, 55], qty: 1 }])?.volumetricKg).toBe(1.11);
  });
  it('без товарів — null', () => {
    expect(suggestParcelBox([])).toBeNull();
  });
});
