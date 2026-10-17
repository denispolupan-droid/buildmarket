import { describe, it, expect } from 'vitest';
import { shouldReprocessMail, RETRY_UNKNOWN_DAYS, type PrevMailImport } from '../lib/mail-registers-rules';

// Класифікація листів і посилання на файл — у tests/novapay-register.test.ts.

const NOW = new Date('2026-10-18T10:00:00Z');
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86400_000).toISOString();
const prev = (p: Partial<PrevMailImport>): PrevMailImport =>
  ({ status: 'done', result: { unknown: [] }, received_at: daysAgo(1), ...p });

describe('shouldReprocessMail — коли лист читаємо ще раз', () => {
  it('нового листа обробляємо завжди', () => {
    expect(shouldReprocessMail(undefined, 'np-register', NOW)).toBe(true);
  });

  it('виписки ще немає — повторюємо, як і раніше', () => {
    expect(shouldReprocessMail(prev({ status: 'no-doc' }), 'np-register', NOW)).toBe(true);
    expect(shouldReprocessMail(prev({ status: 'error' }), 'rzpay-register', NOW)).toBe(true);
  });

  it('усе рознесено — більше не чіпаємо', () => {
    expect(shouldReprocessMail(prev({}), 'np-register', NOW)).toBe(false);
  });

  // #26101021: ЕН перевиписали після імпорту, рядок пішов «без замовлення»,
  // 388,05 ₴ лягли сумою — і лист більше ніколи не перечитувався.
  it('реєстр із рядком без замовлення — перечитуємо, поки свіжий', () => {
    const stuck = prev({ result: { unknown: [{ ttn: '59001797934459', gross: 390 }] }, received_at: daysAgo(6) });
    expect(shouldReprocessMail(stuck, 'np-register', NOW)).toBe(true);
  });

  it('після пільгового вікна зупиняємось: ЕН уже не з’явиться', () => {
    const old = prev({ result: { unknown: [{ ttn: '59001797934459' }] }, received_at: daysAgo(RETRY_UNKNOWN_DAYS + 1) });
    expect(shouldReprocessMail(old, 'np-register', NOW)).toBe(false);
  });

  it('межа вікна включна', () => {
    const edge = prev({ result: { unknown: [{ ttn: '1' }] }, received_at: daysAgo(RETRY_UNKNOWN_DAYS) });
    expect(shouldReprocessMail(edge, 'np-register', NOW)).toBe(true);
  });

  it('RozetkaPay не перечитуємо: там інший шлях проведення', () => {
    const stuck = prev({ result: { unknown: [{ ttn: '1' }] }, received_at: daysAgo(1) });
    expect(shouldReprocessMail(stuck, 'rzpay-register', NOW)).toBe(false);
  });

  it('биті дані не змушують качати вкладення щогодини', () => {
    expect(shouldReprocessMail(prev({ result: null, received_at: daysAgo(1) }), 'np-register', NOW)).toBe(false);
    expect(shouldReprocessMail(prev({ result: { unknown: [{ ttn: '1' }] }, received_at: null }), 'np-register', NOW)).toBe(false);
  });
});
