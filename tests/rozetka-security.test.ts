import { describe, it, expect } from 'vitest';
import { parseSecurityRows, compareSmart, smartFeeStep } from '../lib/rozetka-security';

const FEES = [12, 18, 30];
const sheet = [
  ['ID', 'Дата транзакції', 'Тип транзакції', 'Списано', 'Нараховано', 'Баланс'],
  [1, '2026-09-03 10:00:00', 'Гарантійний платіж', 0, 5000, 5000],
  [2, '2026-09-03 11:00:00', 'Розподілення гарантійного платежу (роялті)', -418.61, 0, 4581.39],
  [3, '2026-09-03 16:02:02', 'Розподілення гарантійного платежу (Smart)', -260, 0, 4321.39],
  [4, '2026-09-03 17:01:27', 'Розподілення гарантійного платежу (Smart)', -36, 0, 4285.39],
  [5, '2026-10-06 11:01:39', 'Розподілення гарантійного платежу (Smart)', '-18,00', 0, 4267.39],
  ['', '', '', '', '', ''],
];

describe('історія гарантійного платежу Rozetka', () => {
  it('розбирає файл і рахує лише Smart', () => {
    const rows = parseSecurityRows(sheet);
    expect(rows).toHaveLength(5);
    const c = compareSmart(rows, 54, FEES);
    expect(c.theirTotal).toBe(314);
    expect(c.delta).toBe(260);
    expect(c.count).toBe(3);
    expect(c.from).toBe('2026-09-03');
    expect(c.to).toBe('2026-10-06');
  });
  it('пачка за кілька замовлень (36 = 18 + 18) — не «без замовлення»; 260 — так', () => {
    expect(smartFeeStep(FEES)).toBe(600);
    const c = compareSmart(parseSecurityRows(sheet), 0, FEES);
    expect(c.unattributed).toEqual([{ id: 3, ts: '2026-09-03 16:02:02', amount: 260 }]);
  });
  it('чужий файл — зрозуміла помилка', () => {
    expect(() => parseSecurityRows([['Дата', 'Сума']])).toThrow(/гарантійного платежу/);
  });
});
