import { describe, it, expect } from 'vitest';
import { slaHasPickup, slaGroupKey, buildRozetkaSlaReport } from '../lib/rozetka-sla';

// Набори зняті з живого кабінету (GET /sla/search)
const FXLINE = {
  roz_id: 383849, title: 'FXLine',
  deliveryServices: [
    { delivery_service_name: 'Нова Пошта', title: 'Новая Почта (Курьер)' },
    { delivery_service_name: 'ROZETKA Delivery', title: 'ROZETKA Delivery (Самовывоз)' },
  ],
};
const STANDARD = {
  roz_id: 377188, title: 'SLA Standard (F!X (змінити))', is_standard: true,
  deliveryServices: [{ delivery_service_name: 'Нова Пошта', title: 'Новая Почта (Самовывоз)' }],
};

describe('slaHasPickup', () => {
  it('набір із ROZETKA Delivery дає точки видачі', () => {
    expect(slaHasPickup(FXLINE)).toBe(true);
  });

  it('набір лише з Новою Поштою — ні', () => {
    expect(slaHasPickup(STANDARD)).toBe(false);
    expect(slaHasPickup({ roz_id: 1, title: 'порожній' })).toBe(false);
  });

  it('впізнає й партнерські відділення, і різний регістр', () => {
    expect(slaHasPickup({ roz_id: 2, title: '', deliveryServices: [
      { delivery_service_name: 'Rozetka Delivery (Партнерські відділення)', title: '' },
    ] })).toBe(true);
  });

  it('«Нова Пошта (поштомати)» за точку видачі Rozetka не рахуємо', () => {
    expect(slaHasPickup({ roz_id: 3, title: '', deliveryServices: [
      { delivery_service_name: 'Нова Пошта (поштомати)', title: 'Новая Почта (почтоматы) (Самовывоз)' },
    ] })).toBe(false);
  });
});

describe('slaGroupKey', () => {
  it('бере перших два слова назви', () => {
    expect(slaGroupKey('Емаль Polifarb DekoMal ПФ-115 біла 0.9 кг')).toBe('Емаль Polifarb');
    expect(slaGroupKey('  Диск   відрізний  125 мм ')).toBe('Диск відрізний');
  });

  it('на короткій чи порожній назві не падає', () => {
    expect(slaGroupKey('Клей')).toBe('Клей');
    expect(slaGroupKey('')).toBe('');
  });
});

describe('buildRozetkaSlaReport', () => {
  const items = [
    { article: 'A-1', name: 'Емаль Polifarb біла',    sla_id: 383849, stock_quantity: 5 },
    { article: 'A-2', name: 'Емаль Polifarb сіра',    sla_id: 377188, stock_quantity: 50 },
    { article: 'B-1', name: 'Диск відрізний 125',     sla_id: 377188, stock_quantity: 0 },
    { article: 'B-2', name: 'Диск відрізний 230',     sla_id: 377188, stock_quantity: 12 },
  ];
  const report = buildRozetkaSlaReport([FXLINE, STANDARD], items);

  it('рахує підсумки по наявності точок видачі', () => {
    expect(report.totals).toEqual({ items: 4, withPickup: 1, withoutPickup: 3 });
  });

  it('рахує товари на кожному наборі', () => {
    expect(report.slas.find(s => s.id === 383849)).toMatchObject({ pickup: true,  itemCount: 1 });
    expect(report.slas.find(s => s.id === 377188)).toMatchObject({ pickup: false, itemCount: 3, isStandard: true });
  });

  it('показує групи, де набір розʼїхався, — найбільші згори', () => {
    expect(report.groups).toEqual([
      { group: 'Диск відрізний', off: 2, on: 0 },
      { group: 'Емаль Polifarb', off: 1, on: 1 },
    ]);
  });

  it('перелік без точок сортує за залишком: спершу те, що реально продається', () => {
    expect(report.off.map(i => i.article)).toEqual(['A-2', 'B-2', 'B-1']);
    expect(report.off[0].slaTitle).toBe('SLA Standard (F!X (змінити))');
  });

  it('якщо жоден набір не має точок видачі — усі товари в «без»', () => {
    const r = buildRozetkaSlaReport([STANDARD], items);
    expect(r.totals.withPickup).toBe(0);
    expect(r.totals.withoutPickup).toBe(4);
  });
});
