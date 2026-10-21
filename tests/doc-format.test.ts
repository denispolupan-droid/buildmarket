import { describe, it, expect } from 'vitest';
import { formatMoney, formatQty, formatDocDate, taxIdLabel, kyivDate, formatShortDate } from '../lib/doc-format';

const sp = (s: string) => s.replace(/ /g, ' ');

describe('doc-format', () => {
  it('formatMoney: розряди пробілом, кома перед копійками', () => {
    expect(sp(formatMoney(1275))).toBe('1 275,00');
    expect(sp(formatMoney(85))).toBe('85,00');
    expect(sp(formatMoney(1234567.5))).toBe('1 234 567,50');
    expect(sp(formatMoney(0.1 + 0.2))).toBe('0,30');
  });

  it('formatQty: ціле без копійок, дробове через кому', () => {
    expect(formatQty(15)).toBe('15');
    expect(formatQty(2.5)).toBe('2,5');
    expect(formatQty(1.125)).toBe('1,125');
    expect(sp(formatQty(1200))).toBe('1 200');
  });

  it('formatDocDate: «20 жовтня 2026 р.» за календарною датою', () => {
    expect(formatDocDate('2026-10-20T00:00:00+00:00')).toBe('20 жовтня 2026 р.');
    expect(formatDocDate('2026-01-05')).toBe('5 січня 2026 р.');
  });

  it('kyivDate: момент → календарна дата в Києві', () => {
    expect(kyivDate('2026-10-19T22:30:00Z')).toBe('2026-10-20');
    expect(kyivDate('2026-10-20T10:00:00+00:00')).toBe('2026-10-20');
    expect(formatShortDate('2026-10-20')).toBe('20.10.2026');
  });

  it('taxIdLabel: 8 цифр — ЄДРПОУ, 10 — РНОКПП', () => {
    expect(taxIdLabel('43942149')).toBe('Код ЄДРПОУ');
    expect(taxIdLabel('3198107136')).toBe('РНОКПП');
    expect(taxIdLabel('123')).toBe('Код');
  });
});
