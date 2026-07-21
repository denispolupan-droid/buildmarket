import { describe, it, expect } from 'vitest';
import { extractOrderNumber, classifyMonoTxn } from '../lib/mono-statement';

describe('extractOrderNumber — номер замовлення з призначення платежу', () => {
  it('реальний comment ФОП: «згідно рахунку №26071021»', () => {
    expect(extractOrderNumber('За клей універсальний згідно рахунку №26071021 від 21 липня 2026р. Без ПДВ'))
      .toBe(26071021);
  });

  it('«Оплата за замовлення №26071021»', () => {
    expect(extractOrderNumber('Оплата за замовлення №26071021 від 21.07.2026. Без ПДВ')).toBe(26071021);
  });

  it('рахунок без №', () => {
    expect(extractOrderNumber('оплата рахунку 26071099')).toBe(26071099);
  });

  it('голий довгий номер у comment', () => {
    expect(extractOrderNumber('26071050')).toBe(26071050);
  });

  it('не чіпляється за рік «2026р.» чи суму', () => {
    // немає №/рахунку/замовлення і немає 7+ значного числа → null
    expect(extractOrderNumber('Поповнення від 2026р на суму 900')).toBeNull();
  });

  it('фолбек на description, якщо comment порожній', () => {
    expect(extractOrderNumber(null, 'Оплата за замовлення №26071021')).toBe(26071021);
  });

  it('немає номера → null', () => {
    expect(extractOrderNumber('Від: ТОВ "РОЗЕТКА ПЕЙ"', 'Від: ТОВ "РОЗЕТКА ПЕЙ"')).toBeNull();
  });
});

describe('classifyMonoTxn — класифікація транзакції', () => {
  const base = { id: 'x', time: 1784638949, description: '', comment: '' };

  it('надходження з №заказу → order (сума в грн)', () => {
    const r = classifyMonoTxn({ ...base, amount: 90000, comment: 'рахунку №26071021' });
    expect(r).toEqual({ kind: 'order', orderNumber: 26071021, amount: 900 });
  });

  it('надходження без номера → unmatched (виплата Rozetka)', () => {
    const r = classifyMonoTxn({ ...base, amount: 31520, comment: '', description: 'Від: ТОВ "РОЗЕТКА ПЕЙ"' });
    expect(r).toEqual({ kind: 'unmatched', amount: 315.2 });
  });

  it('списання (amount<0) → null', () => {
    expect(classifyMonoTxn({ ...base, amount: -5000, comment: 'рахунку №26071021' })).toBeNull();
  });

  it('нульова сума → null', () => {
    expect(classifyMonoTxn({ ...base, amount: 0 })).toBeNull();
  });
});
