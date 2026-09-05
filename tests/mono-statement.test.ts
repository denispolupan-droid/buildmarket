import { describe, it, expect } from 'vitest';
import { extractOrderNumber, classifyMonoTxn, isAcquiringSettlement, extractAcquiringGross } from '../lib/mono-statement';

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

// Покриття еквайрингу — рядок від банку за карткові оплати на сайті. Номера
// замовлення в ньому немає, тож автозарахування не спрацює; але сам факт означає,
// що замовлення МУСИТЬ існувати. Реальний рядок 05.08.2026, за яким і знайшлася
// втрата замовлення на 104 ₴.
describe('еквайринг у виписці', () => {
  const acquiring = {
    id: '3GM4gse68LLOuDm6xg',
    time: 1786013730,
    amount: 10265,
    description: 'Від: АТ "УНІВЕРСАЛ БАНК"',
    comment: 'Замовлення — FIXLINE.Покриття за проведені трансакції згідно договору еквайринга MI048034, Загалом 104 грн. Комісія банку 1.35 грн.',
  };

  it('розпізнається як покриття еквайрингу', () => {
    expect(isAcquiringSettlement(acquiring)).toBe(true);
  });

  it('виплата маркетплейсу — не еквайринг', () => {
    expect(isAcquiringSettlement({
      id: 'y', time: 1786013730, amount: 39400,
      description: 'Від: ТОВ "РОЗЕТКА ПЕЙ"',
      comment: 'Переказ коштів за операції 04.08.2026-04.08.2026 зг.дог.№3198107136-П',
    })).toBe(false);
  });

  it('дістає суму покупця до комісії банку, а не зараховану', () => {
    expect(extractAcquiringGross(acquiring.comment)).toBe(104);
  });

  it('розуміє суму з пробілами й комою', () => {
    expect(extractAcquiringGross('Загалом 1 552,50 грн. Комісія банку 20 грн.')).toBe(1552.5);
  });

  it('без «Загалом» повертає null, а не вигадує число', () => {
    expect(extractAcquiringGross('Покриття за трансакції')).toBeNull();
    expect(extractAcquiringGross(null)).toBeNull();
  });

  it('номер замовлення з такого рядка не вигадується', () => {
    expect(extractOrderNumber(acquiring.comment, acquiring.description)).toBeNull();
  });
});

// Покриття еквайрингу З номером замовлення в призначенні. Реальний рядок
// 02.09.2026 (259,58 ₴ за замовлення #26091002 на 263 ₴): до фіксу класифікатор
// віддавав перевагу номеру й зараховував рядок ДРУГОЮ оплатою поверх вебхука.
describe('classifyMonoTxn — еквайринг з номером замовлення не є оплатою', () => {
  const row = {
    id: 'gDsXAYEfzs5yo6T58Q',
    time: 1788321248,
    amount: 25958,
    description: 'Від: АТ "УНІВЕРСАЛ БАНК"',
    comment: 'Оплата замовлення №26091002 — FIXLINE.Покриття за проведені трансакції згідно договору еквайринга MI048034, Загалом 263 грн. Комісія банку 3.42 грн.',
  };

  it('класифікується як acquiring, а не order', () => {
    const r = classifyMonoTxn(row);
    expect(r?.kind).toBe('acquiring');
    if (r?.kind === 'acquiring') {
      expect(r.orderNumber).toBe(26091002);
      expect(r.amount).toBe(259.58);
      expect(r.gross).toBe(263);
    }
  });

  it('без «Загалом» gross = зарахована сума', () => {
    const r = classifyMonoTxn({ ...row, comment: 'Покриття за проведені трансакції згідно договору еквайринга' });
    expect(r?.kind).toBe('acquiring');
    if (r?.kind === 'acquiring') expect(r.gross).toBe(259.58);
  });

  it('звичайна оплата з номером лишається order', () => {
    const r = classifyMonoTxn({ ...row, comment: 'Оплата за замовлення №26091002' });
    expect(r?.kind).toBe('order');
  });
});
