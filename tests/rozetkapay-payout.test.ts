import { describe, it, expect } from 'vitest';
import { parseRzPayPayout } from '../lib/rozetkapay-statement';

// Реальні рядки виписки Mono (05.09.2026): усі гроші площадок приходять від
// «РОЗЕТКА ПЕЙ» одним переказом за операційний день.
describe('parseRzPayPayout — виплата RozetkaPay у виписці Monobank', () => {
  const base = { description: 'Від: ТОВ "РОЗЕТКА ПЕЙ"', counterName: null as string | null };

  it('розбирає період, договір, брутто, винагороду; нетто = сума транзакції', () => {
    const r = parseRzPayPayout({
      ...base, amount: 377747,
      comment: 'Переказ коштів за операції 31.08.2026-31.08.2026 зг.дог.№3198107136-П від 15.07.2026 на суму 3835 грн за виключ. винагор. 57.53 грн за їх переказ. Без ПДВ.',
    });
    expect(r).toEqual({ contract: '3198107136-П', periodFrom: '2026-08-31', periodTo: '2026-08-31', gross: 3835, fee: 57.53, net: 3777.47 });
  });

  it('період з кількох днів (вихідні) і контрагент у counterName', () => {
    const r = parseRzPayPayout({
      description: null, counterName: 'ТОВ "РОЗЕТКА ПЕЙ"', amount: 790027,
      comment: 'Переказ коштів за операції 28.08.2026-30.08.2026 зг.дог.№3198107136-П від 15.07.2026 на суму 8023 грн за виключ. винагор. 122.73 грн за їх переказ. Без ПДВ.',
    });
    expect(r?.periodFrom).toBe('2026-08-28');
    expect(r?.periodTo).toBe('2026-08-30');
    expect(r?.gross).toBe(8023);
    expect(r?.fee).toBe(122.73);
    expect(r?.net).toBe(7900.27);
  });

  it('якщо брутто − винагорода ≠ зараховане, винагорода = різниця (банк — джерело правди)', () => {
    const r = parseRzPayPayout({
      ...base, amount: 100000,
      comment: 'Переказ коштів за операції 01.09.2026-01.09.2026 зг.дог.№3198107136-П на суму 1020 грн за виключ. винагор. 5 грн за їх переказ.',
    });
    expect(r?.gross).toBe(1020);
    expect(r?.fee).toBe(20);
    expect(r?.net).toBe(1000);
  });

  it('еквайринг Універсал Банку і оплата покупця — не виплата', () => {
    expect(parseRzPayPayout({ description: 'Від: АТ "УНІВЕРСАЛ БАНК"', counterName: null, amount: 25958, comment: 'Оплата замовлення №26091002 — FIXLINE.Покриття за проведені трансакції згідно договору еквайринга MI048034, Загалом 263 грн.' })).toBeNull();
    expect(parseRzPayPayout({ description: 'Від: Пєший Дмитро', counterName: null, amount: 93000, comment: 'Сплата за клей' })).toBeNull();
  });

  it('списання (від’ємна сума) ігнорується', () => {
    expect(parseRzPayPayout({ ...base, amount: -5000, comment: 'Переказ коштів за операції 01.09.2026-01.09.2026 зг.дог.№3198107136-П на суму 50 грн' })).toBeNull();
  });
});
