import { describe, it, expect } from 'vitest';
import {
  returnableBySku, validateRequestedQty, commissionToReverse, actionsFor, timelineFor, returnTotal, stageOf, kindOf, isReturnReason,
} from '../lib/accounting/returns-rules';

describe('returnableBySku — відвантажено мінус повернуто (і заявлено)', () => {
  it('рахує по SKU, чернетки-заявки теж віднімає, не йде в мінус', () => {
    const m = returnableBySku(
      [{ sku: 'A', qty: 2 }, { sku: 'A', qty: 1 }, { sku: 'B', qty: 1 }],
      [{ sku: 'A', qty: 1 }, { sku: 'B', qty: 5 }, { sku: 'C', qty: 1 }],
    );
    expect(m.get('A')).toBe(2);
    expect(m.get('B')).toBe(0);
    expect(m.has('C')).toBe(false);
  });
});

describe('validateRequestedQty', () => {
  const avail = new Map([['A', 2], ['B', 0]]);
  it('ок у межах', () => expect(validateRequestedQty([{ sku: 'A', qty: 2 }], avail)).toBeNull());
  it('більше доступного', () => expect(validateRequestedQty([{ sku: 'A', qty: 3 }], avail)).toMatch(/доступно 2, запитано 3/));
  it('невідомий SKU', () => expect(validateRequestedQty([{ sku: 'Z', qty: 1 }], avail)).toMatch(/доступно 0/));
  it('нуль / від’ємне', () => expect(validateRequestedQty([{ sku: 'A', qty: 0 }], avail)).toMatch(/більше нуля/));
  it('дубль рядка', () => expect(validateRequestedQty([{ sku: 'A', qty: 1 }, { sku: 'A', qty: 1 }], avail)).toMatch(/дублюється/));
});

describe('commissionToReverse — пропорція від проведеної комісії', () => {
  it('половина замовлення → половина комісії, округлено до копійок', () => {
    expect(commissionToReverse({ postedNet: 100.01, returnedTotal: 450, orderTotal: 900, mpUnaware: false })).toBe(50.01);
  });
  it('не більше повної комісії', () => {
    expect(commissionToReverse({ postedNet: 80, returnedTotal: 1000, orderTotal: 900, mpUnaware: false })).toBe(80);
  });
  it('площадка не в курсі → 0', () => {
    expect(commissionToReverse({ postedNet: 100, returnedTotal: 450, orderTotal: 900, mpUnaware: true })).toBe(0);
  });
  it('комісії не було → 0', () => {
    expect(commissionToReverse({ postedNet: 0, returnedTotal: 450, orderTotal: 900, mpUnaware: false })).toBe(0);
  });
});

describe('actionsFor — дії за стадією', () => {
  it('ПВ-заявка: отримати і скасувати, ПП — ні', () => {
    const a = actionsFor({ kind: 'customer', stage: 'awaiting', status: 'draft' });
    expect(a).toMatchObject({ receive: true, supplierReturn: false, accept: false, cancel: true });
  });
  it('ПВ проведено з залишком → можна ПП; з активними ПП — скасувати не можна', () => {
    expect(actionsFor({ kind: 'customer', stage: 'received', status: 'confirmed', supplierReturnableQty: 1 }).supplierReturn).toBe(true);
    expect(actionsFor({ kind: 'customer', stage: 'received', status: 'confirmed', supplierReturnableQty: 0 }).supplierReturn).toBe(false);
    expect(actionsFor({ kind: 'customer', stage: 'received', status: 'confirmed', hasActiveChildren: true }).cancel).toBe(false);
  });
  it('ПП відправлено → прийняти; прийнято → лише скасувати', () => {
    expect(actionsFor({ kind: 'supplier', stage: 'sent', status: 'confirmed' })).toMatchObject({ accept: true, cancel: true, editTtn: true });
    expect(actionsFor({ kind: 'supplier', stage: 'accepted', status: 'confirmed' })).toMatchObject({ accept: false, cancel: true, editTtn: false });
  });
  it('скасований — нічого', () => {
    expect(Object.values(actionsFor({ kind: 'customer', stage: 'received', status: 'cancelled' })).every(v => v === false)).toBe(true);
  });
});

describe('timelineFor / stageOf / returnTotal', () => {
  it('ПВ: заявка → отримано; скасування додає крок', () => {
    const t = timelineFor({ kind: 'customer', stage: 'awaiting', status: 'draft', createdAt: '2026-10-27T10:00:00Z', confirmedAt: null, meta: null });
    expect(t.map(s => [s.key, s.done])).toEqual([['created', true], ['received', false]]);
    const c = timelineFor({ kind: 'customer', stage: 'received', status: 'cancelled', createdAt: '2026-10-27', confirmedAt: '2026-10-28', meta: { kind: 'customer', stage: 'received', reason: 'surplus' }, cancelledAt: '2026-10-29' });
    expect(c.at(-1)?.key).toBe('cancelled');
  });
  it('старі документи без meta: return_in confirmed = received, draft = awaiting', () => {
    expect(stageOf(null, 'return_in', 'confirmed')).toBe('received');
    expect(stageOf(null, 'return_in', 'draft')).toBe('awaiting');
    expect(stageOf(null, 'supplier_return', 'confirmed')).toBe('sent');
    expect(kindOf('supplier_return')).toBe('supplier');
  });
  it('сума: ПВ за ціною продажу, ПП за собівартістю; сторно з від’ємною кількістю — по модулю', () => {
    const lines = [{ qty: -2, price: 450, cost_price: 300 }];
    expect(returnTotal('customer', lines)).toBe(900);
    expect(returnTotal('supplier', lines)).toBe(600);
  });
  it('isReturnReason', () => {
    expect(isReturnReason('surplus')).toBe(true);
    expect(isReturnReason('whatever')).toBe(false);
  });
});
