import { describe, it, expect } from 'vitest';
import { computePromDeliveryFee, isPromCheapDelivery, parsePromDeliveryTariff, DEFAULT_PROM_DELIVERY_TARIFF } from '../lib/prom-delivery-fee';

describe('computePromDeliveryFee — тариф «дешевої доставки» Prom', () => {
  it('офіційні пороги: до 200 → 0, 200–699.99 → 10, від 700 → 30', () => {
    expect(computePromDeliveryFee(0)).toBe(0);
    expect(computePromDeliveryFee(199.99)).toBe(0);
    expect(computePromDeliveryFee(200)).toBe(10);
    expect(computePromDeliveryFee(699.99)).toBe(10);
    expect(computePromDeliveryFee(700)).toBe(30);
    expect(computePromDeliveryFee(10000)).toBe(30);
  });

  it('живі кейси з виписки кабінету 2026-07-29', () => {
    expect(computePromDeliveryFee(208)).toBe(10);   // #26071047
    expect(computePromDeliveryFee(456)).toBe(10);   // #26071036
    expect(computePromDeliveryFee(626)).toBe(10);   // #26071051
    expect(computePromDeliveryFee(1713)).toBe(30);  // #26071017
  });
});

describe('isPromCheapDelivery — ознака акції у payload Prom', () => {
  it('розпізнає ps_promotion російською і українською', () => {
    expect(isPromCheapDelivery({ ps_promotion: { name: 'Дешевая доставка' } })).toBe(true);
    expect(isPromCheapDelivery({ ps_promotion: { name: 'Дешева доставка' } })).toBe(true);
  });

  it('відсутній/інший promo або порожній payload → false', () => {
    expect(isPromCheapDelivery({ ps_promotion: null })).toBe(false);
    expect(isPromCheapDelivery({ ps_promotion: { name: 'Знижка на доставку' } })).toBe(false);
    expect(isPromCheapDelivery({})).toBe(false);
    expect(isPromCheapDelivery(null)).toBe(false);
    expect(isPromCheapDelivery(undefined)).toBe(false);
  });
});

describe('parsePromDeliveryTariff — розбір налаштування з адмінки', () => {
  it('валідний JSON парситься і застосовується у розрахунку', () => {
    const raw = JSON.stringify({ brackets: [{ from: 150, fee: 15 }, { from: 500, fee: 25 }] });
    const t = parsePromDeliveryTariff(raw);
    expect(t).toEqual([{ from: 150, fee: 15 }, { from: 500, fee: 25 }]);
    expect(computePromDeliveryFee(100, t)).toBe(0);
    expect(computePromDeliveryFee(150, t)).toBe(15);
    expect(computePromDeliveryFee(499.99, t)).toBe(15);
    expect(computePromDeliveryFee(500, t)).toBe(25);
  });

  it('порожнє / зіпсоване / незростаючі пороги → дефолт', () => {
    expect(parsePromDeliveryTariff(null)).toEqual(DEFAULT_PROM_DELIVERY_TARIFF);
    expect(parsePromDeliveryTariff('не json')).toEqual(DEFAULT_PROM_DELIVERY_TARIFF);
    expect(parsePromDeliveryTariff('{}')).toEqual(DEFAULT_PROM_DELIVERY_TARIFF);
    expect(parsePromDeliveryTariff(JSON.stringify({ brackets: [] }))).toEqual(DEFAULT_PROM_DELIVERY_TARIFF);
    expect(parsePromDeliveryTariff(JSON.stringify({ brackets: [{ from: 700, fee: 30 }, { from: 200, fee: 10 }] }))).toEqual(DEFAULT_PROM_DELIVERY_TARIFF);
    expect(parsePromDeliveryTariff(JSON.stringify({ brackets: [{ from: -1, fee: 10 }] }))).toEqual(DEFAULT_PROM_DELIVERY_TARIFF);
    expect(parsePromDeliveryTariff(JSON.stringify({ brackets: [{ from: 200, fee: -5 }] }))).toEqual(DEFAULT_PROM_DELIVERY_TARIFF);
  });
});
