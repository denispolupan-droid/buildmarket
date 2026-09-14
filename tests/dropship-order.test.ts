import { describe, it, expect } from 'vitest';
import {
  buildDropshipLines, validateDropshipLine, partnerCancelRefund, npCodFee,
  dropshipParcelKey, dropshipItemName, dropshipOrderable, type DropshipCatalogItem,
} from '../lib/dropship-order';
import { DROPSHIP_MIN } from '../lib/site';
import { dropshipReturnFee } from '../lib/dropship-order';

const item = (over: Partial<DropshipCatalogItem> = {}): DropshipCatalogItem => ({
  sku: 'A-1', name: 'Tangit Нитка Uni-Lock', brand: 'Tangit', volume: null,
  is_active: true, stock_status: 'in_stock', price_drop: 382, ...over,
});
const cat = (...items: DropshipCatalogItem[]) => new Map(items.map(i => [i.sku, i]));

describe('buildDropshipLines', () => {
  it('рахує закупку з каталогу, а ціну продажу — від партнера', () => {
    const r = buildDropshipLines([{ sku: 'A-1', qty: 2, selling_price: 450 }], cat(item()));
    expect(r).toEqual({
      ok: true, totalCost: 764, totalSell: 900,
      lines: [{ sku: 'A-1', name: 'Tangit Нитка Uni-Lock', brand: 'Tangit', qty: 2, price: 450, cost_price: 382 }],
    });
  });

  it('ігнорує cost_price, присланий клієнтом', () => {
    const r = buildDropshipLines([{ sku: 'A-1', qty: 1, selling_price: 400, cost_price: 1 } as never], cat(item()));
    expect(r.ok && r.totalCost).toBe(382);
  });

  it.each([0, -1, 1.5, 'abc', null, 10000])('відхиляє кількість %s', qty => {
    expect(buildDropshipLines([{ sku: 'A-1', qty, selling_price: 400 }], cat(item())).ok).toBe(false);
  });

  it('не дає від\'ємною кількістю зменшити списання нижче мінімуму', () => {
    const r = buildDropshipLines([
      { sku: 'A-1', qty: 1, selling_price: 400 },
      { sku: 'B-1', qty: -1, selling_price: 400 },
    ], cat(item(), item({ sku: 'B-1' })));
    expect(r.ok).toBe(false);
  });

  it('відхиляє ціну продажу нижче закупки', () => {
    const r = buildDropshipLines([{ sku: 'A-1', qty: 1, selling_price: 381.99 }], cat(item()));
    expect(r.ok).toBe(false);
  });

  it('відхиляє відсутній, неактивний, «під замовлення» і без дроп-ціни', () => {
    const line = [{ sku: 'A-1', qty: 1, selling_price: 500 }];
    expect(buildDropshipLines(line, cat()).ok).toBe(false);
    expect(buildDropshipLines(line, cat(item({ is_active: false }))).ok).toBe(false);
    expect(buildDropshipLines(line, cat(item({ stock_status: 'on_order' }))).ok).toBe(false);
    expect(buildDropshipLines(line, cat(item({ price_drop: null }))).ok).toBe(false);
  });

  it('відхиляє дубль артикула', () => {
    const r = buildDropshipLines([
      { sku: 'A-1', qty: 1, selling_price: 400 }, { sku: 'A-1', qty: 1, selling_price: 400 },
    ], cat(item()));
    expect(r.ok).toBe(false);
  });

  it('тримає мінімальну суму за закупкою', () => {
    const cheap = item({ price_drop: DROPSHIP_MIN - 1 });
    expect(buildDropshipLines([{ sku: 'A-1', qty: 1, selling_price: 1000 }], cat(cheap)).ok).toBe(false);
    expect(buildDropshipLines([{ sku: 'A-1', qty: 2, selling_price: 1000 }], cat(cheap)).ok).toBe(true);
  });

  it('порожній список — помилка', () => {
    expect(buildDropshipLines([], cat(item())).ok).toBe(false);
  });
});

describe('validateDropshipLine', () => {
  it('не перевіряє мінімум (його рахують на посилку)', () => {
    const v = validateDropshipLine({ sku: 'A-1', qty: 1, selling_price: 10 }, cat(item({ price_drop: 5 })));
    expect(v.ok).toBe(true);
  });
});

describe('dropshipItemName', () => {
  it('не дублює бренд, якщо він уже в назві', () => {
    expect(dropshipItemName({ name: 'Нитка Tangit Uni-Lock', brand: 'Tangit', volume: null })).toBe('Нитка Tangit Uni-Lock');
    expect(dropshipItemName({ name: 'Затирка CE 40', brand: 'Ceresit', volume: '2 кг' })).toBe('Ceresit Затирка CE 40 2 кг');
  });
});

describe('dropshipOrderable', () => {
  it('лише активні в наявності з дроп-ціною', () => {
    expect(dropshipOrderable(item())).toBe(true);
    expect(dropshipOrderable(item({ price_drop: 0 }))).toBe(false);
    expect(dropshipOrderable(undefined)).toBe(false);
  });
});

describe('partnerCancelRefund', () => {
  it('повертає фактично списане', () => {
    expect(partnerCancelRefund([{ tx_type: 'charge', amount: -382 }], 999)).toEqual({ amount: 382 });
  });

  it('повторне скасування — нуль', () => {
    const txs = [{ tx_type: 'charge', amount: -382 }, { tx_type: 'return_refund', amount: 382 }];
    expect(partnerCancelRefund(txs, 382)).toEqual({ amount: 0, skip: 'nothing_left' });
  });

  it('після зарахування наложки — не повертає', () => {
    const txs = [{ tx_type: 'charge', amount: '-382' }, { tx_type: 'cod_credit', amount: '447.76' }];
    expect(partnerCancelRefund(txs, 382)).toEqual({ amount: 0, skip: 'cod_credited' });
  });

  it('старе списання без order_id — фолбек на закупку з рядків', () => {
    expect(partnerCancelRefund([], 382)).toEqual({ amount: 382 });
    expect(partnerCancelRefund([{ tx_type: 'return_refund', amount: 382 }], 382)).toEqual({ amount: 0, skip: 'nothing_left' });
  });
});

describe('npCodFee', () => {
  it('0,5 % без мінімуму', () => {
    expect(npCodFee(450, 0.5)).toBe(2.25);
    expect(npCodFee(100, 0.5)).toBe(0.5);
    expect(npCodFee(-5, 0.5)).toBe(0);
  });
});

describe('dropshipReturnFee', () => {
  it('утримуємо один тариф — лише повернення', () => {
    expect(dropshipReturnFee(90)).toBe(90);
    expect(dropshipReturnFee(87.456)).toBe(87.46);
  });
  it('невідомий тариф — нуль (менеджер отримає сповіщення)', () => {
    expect(dropshipReturnFee(NaN)).toBe(0);
    expect(dropshipReturnFee(0)).toBe(0);
  });
});

describe('dropshipParcelKey', () => {
  it('однаковий отримувач у різному форматі — одна посилка', () => {
    const a = dropshipParcelKey({ phone: '+38 (099) 123-45-67', city_name: 'Харків ', branch_number: '15' });
    const b = dropshipParcelKey({ phone: '0991234567', city_name: 'харків', branch_number: ' 15' });
    expect(a).toBe(b);
    expect(dropshipParcelKey({ phone: '0991234567', city_name: 'Харків', branch_number: '16' })).not.toBe(a);
  });
});
