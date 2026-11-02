import { describe, it, expect } from 'vitest';
import { buildIncomeBook } from '../lib/accounting/income-book';

describe('buildIncomeBook', () => {
  const rows = [
    { day: '2026-09-30', method: 'novapay', source: 'cod', amount: '100.10', txns: '2' },
    { day: '2026-09-30', method: 'bank', source: 'marketplace', amount: 50, txns: 1 },
    { day: '2026-10-01', method: 'acquiring', source: 'customer', amount: '0.2', txns: 1 },
    { day: '2026-10-01', method: 'cash', source: 'customer', amount: '0.1', txns: 1 },
    { day: '2026-10-01', method: 'owner', source: 'customer', amount: 999, txns: 1 }, // не грошовий рахунок — ігнор
  ];
  const b = buildIncomeBook(rows);

  it('разом = сума методів, без копійчаного дрейфу', () => {
    expect(b.total).toBe(150.4);
    expect(b.byMethod).toEqual({ cash: 0.1, bank: 50, acquiring: 0.2, novapay: 100.1 });
    expect(b.txns).toBe(5);
  });

  it('групує по місяцях і днях у порядку дат', () => {
    expect(b.months.map(m => [m.month, m.total])).toEqual([['2026-09', 150.1], ['2026-10', 0.3]]);
    expect(b.months[1].days[0].byMethod.cash).toBe(0.1);
  });

  it('склад за джерелами', () => {
    expect(b.bySource).toEqual({ cod: 100.1, marketplace: 50, customer: 0.3 });
  });

  it('сторно / повернення (від’ємний рядок, міграція 148) зменшують дохід, txns не додають', () => {
    const s = buildIncomeBook([
      { day: '2026-09-10', method: 'novapay', source: 'cod', amount: '300', txns: 2 },
      { day: '2026-09-20', method: 'novapay', source: 'cod', amount: '-100.5', txns: 0 },
    ]);
    expect(s.total).toBe(199.5);
    expect(s.bySource.cod).toBe(199.5);
    expect(s.txns).toBe(2);
    expect(s.months[0].days.map(d => d.total)).toEqual([300, -100.5]);
  });

  it('порожньо — нулі', () => {
    expect(buildIncomeBook([]).total).toBe(0);
  });
});
