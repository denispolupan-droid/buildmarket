import { describe, it, expect } from 'vitest';
import { escapeOrTerm, orderNumberFilter } from '../lib/pg-filter';

describe('escapeOrTerm', () => {
  it('прибирає структурні символи фільтра PostgREST', () => {
    expect(escapeOrTerm('x,is_active.eq.false')).toBe('x is_active.eq.false');
    expect(escapeOrTerm('a(b)"c\\')).toBe('a b  c');
  });
});

describe('orderNumberFilter', () => {
  it('повний номер — точний збіг', () => {
    expect(orderNumberFilter('26101033')).toBe('order_number.eq.26101033');
  });
  it('початок номера — діапазон «починається з»', () => {
    expect(orderNumberFilter('261010')).toBe('and(order_number.gte.26101000,order_number.lte.26101099)');
    expect(orderNumberFilter('2610')).toBe('and(order_number.gte.26100000,order_number.lte.26109999)');
    expect(orderNumberFilter('2')).toBe('and(order_number.gte.20000000,order_number.lte.29999999)');
  });
  it('не номер — null: ТТН, телефон, текст, порожнє', () => {
    expect(orderNumberFilter('101203327000')).toBeNull();
    expect(orderNumberFilter('0939002601')).toBeNull();
    expect(orderNumberFilter('Романов')).toBeNull();
    expect(orderNumberFilter('')).toBeNull();
    expect(orderNumberFilter('2610 10')).toBeNull();
  });
});
