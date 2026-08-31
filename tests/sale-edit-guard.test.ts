import { describe, it, expect } from 'vitest';
import { evaluateSaleEdit, kyivMonth, type SaleEditFacts } from '../lib/accounting/sale-edit-guard';

const NOW = new Date('2026-08-27T10:00:00Z');

function facts(over: Partial<SaleEditFacts> = {}): SaleEditFacts {
  return {
    source: 'order-card',
    confirmedDocs: 0,
    draftDocs: 1,
    amountPaid: 0,
    channelCode: 'website',
    closedPeriods: [],
    totalBefore: 1000,
    totalAfter: 1000,
    dateBefore: '2026-08-20T09:00:00Z',
    dateAfter: null,
    now: NOW,
    ...over,
  };
}
const codes = (f: SaleEditFacts) => evaluateSaleEdit(f).issues.map(i => i.code);

describe('kyivMonth', () => {
  it('рахує місяць за Києвом, а не за UTC', () => {
    // 31 липня 22:00 UTC — це вже 1 серпня в Києві
    expect(kyivMonth('2026-07-31T22:00:00Z')).toBe('2026-08');
    expect(kyivMonth('2026-08-01T00:30:00Z')).toBe('2026-08');
  });
  it('не падає на сміттєвій даті', () => {
    expect(kyivMonth('не дата')).toBe('');
  });
});

describe('evaluateSaleEdit', () => {
  it('звичайна правка чернетки — жодних зауважень', () => {
    expect(codes(facts())).toEqual([]);
  });

  it('проведена РН — блокер', () => {
    const v = evaluateSaleEdit(facts({ confirmedDocs: 1, draftDocs: 0 }));
    expect(v.blockers.map(b => b.code)).toEqual(['confirmed_sale_doc']);
    expect(v.blockers[0].message).toContain('Виправити');
  });

  it('кілька чернеток — блокер, але не поверх проведеної', () => {
    expect(codes(facts({ draftDocs: 2 }))).toContain('multiple_draft_parcels');
    // якщо є проведена — причина одна й головна, не дублюємо
    expect(codes(facts({ confirmedDocs: 1, draftDocs: 2 }))).toEqual(['confirmed_sale_doc']);
  });

  it('сума нижча за оплачену — попередження', () => {
    const v = evaluateSaleEdit(facts({ amountPaid: 1000, totalAfter: 600 }));
    expect(v.warnings.map(w => w.code)).toContain('below_paid');
  });

  it('оплата рівно в суму — тиша (копійчана похибка не рахується)', () => {
    expect(codes(facts({ amountPaid: 1000, totalAfter: 1000 }))).toEqual([]);
    expect(codes(facts({ amountPaid: 1000, totalAfter: 999.995 }))).toEqual([]);
  });

  it('закритий період ловиться і по новій, і по старій даті', () => {
    expect(codes(facts({ closedPeriods: ['2026-08'] }))).toContain('closed_period');
    expect(codes(facts({
      dateBefore: '2026-07-10T09:00:00Z', dateAfter: '2026-08-10T09:00:00Z', closedPeriods: ['2026-07'],
    }))).toContain('closed_period');
  });

  it('дата в майбутньому — блокер, доба допуску не рахується', () => {
    expect(codes(facts({ dateAfter: '2026-09-10T09:00:00Z' }))).toContain('future_date');
    expect(codes(facts({ dateAfter: '2026-08-27T20:00:00Z' }))).not.toContain('future_date');
  });

  it('перенесення в попередній місяць — попередження', () => {
    const v = evaluateSaleEdit(facts({ dateBefore: '2026-08-20T09:00:00Z', dateAfter: '2026-07-15T09:00:00Z' }));
    expect(v.warnings.map(w => w.code)).toContain('backdated');
    expect(v.blockers).toEqual([]);
  });

  it('зміна дати всередині поточного місяця — не турбуємо', () => {
    expect(codes(facts({ dateAfter: '2026-08-25T09:00:00Z' }))).toEqual([]);
  });

  it('замовлення маркетплейсу — попередження про кабінет', () => {
    expect(codes(facts({ channelCode: 'rozetka' }))).toContain('marketplace_order');
    expect(codes(facts({ channelCode: 'prom' }))).toContain('marketplace_order');
  });

  it('різка зміна суми — попередження лише коли й відсоток, і гривні великі', () => {
    expect(codes(facts({ totalAfter: 3000 }))).toContain('big_total_change');
    // 30% від 300 грн — це 90 грн, шум
    expect(codes(facts({ totalBefore: 300, totalAfter: 600 }))).not.toContain('big_total_change');
    // 400 грн зі 100 000 — великі гроші, але 0.4%
    expect(codes(facts({ totalBefore: 100_000, totalAfter: 100_400 }))).not.toContain('big_total_change');
  });

  it('у режимі спостереження правка проходить, але блокер зафіксовано', () => {
    const v = evaluateSaleEdit(facts({ confirmedDocs: 1 }));
    expect(v.blockers.length).toBe(1);
    expect(v.allowed).toBe(true); // EDIT_GUARD_ENFORCE = false
  });
});
