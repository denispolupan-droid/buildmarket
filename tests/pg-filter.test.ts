import { describe, it, expect } from 'vitest';
import { escapeOrTerm, orderNumberFilter, orderSearchOr } from '../lib/pg-filter';

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

describe('orderSearchOr', () => {
  it('ім\'я з кількох слів — послівно і в будь-якому порядку', () => {
    const f = orderSearchOr('Александр Стельмах')!;
    expect(f).toContain('and(or(contact.ilike.%Александр%,company.ilike.%Александр%),or(contact.ilike.%Стельмах%,company.ilike.%Стельмах%))');
    // цілим рядком ім'я більше не шукаємо — саме це й не знаходило перевернутий порядок
    expect(f).not.toContain('contact.ilike.%Александр Стельмах%');
  });

  it('одне слово — звичайний ilike по контакту й компанії', () => {
    const f = orderSearchOr('Стельмах')!;
    expect(f).toContain('contact.ilike.%Стельмах%');
    expect(f).toContain('company.ilike.%Стельмах%');
    expect(f).not.toContain('and(or(');
  });

  it('телефон у будь-якому форматі зводиться до цифр', () => {
    expect(orderSearchOr('+38 (068) 052-92-36')!).toContain('phone_digits.ilike.%380680529236%');
    expect(orderSearchOr('068052')!).toContain('phone_digits.ilike.%068052%');
    // менше трьох цифр — не телефон, зайвої умови немає
    expect(orderSearchOr('26')!).not.toContain('phone_digits');
  });

  it('номер замовлення, початок номера і № кабінету МП', () => {
    expect(orderSearchOr('26101097')!).toContain('order_number.eq.26101097');
    expect(orderSearchOr('261010')!).toContain('and(order_number.gte.26101000,order_number.lte.26101099)');
    expect(orderSearchOr('26101097')!).toContain('prom_order_id.eq.26101097');
    // ТТН задовга для int4 — умови по order_number немає, запит не валиться
    expect(orderSearchOr('20451562287554')!).not.toContain('order_number');
  });

  it('структурні символи фільтра не проходять у запит', () => {
    const f = orderSearchOr('x,is_active.eq.false')!;
    expect(f).not.toContain('%x,is_active');
  });

  it('порожній запит — null', () => {
    expect(orderSearchOr('   ')).toBeNull();
    expect(orderSearchOr('')).toBeNull();
  });
});
