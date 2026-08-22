import { describe, it, expect } from 'vitest';
import { planAllocation, validateManual, type OpenCharge } from '../lib/accounting/allocation';

const charges: OpenCharge[] = [
  { id: 'c1', date: '2026-07-20', remaining: 188.40 },
  { id: 'c2', date: '2026-07-21', remaining: 1351.20 },
  { id: 'c3', date: '2026-07-22', remaining: 677.20 },
];

describe('planAllocation — автоматичне рознесення', () => {
  it('«найстаріші» гасить із найдавнішого і ріже останній борг частково', () => {
    const plan = planAllocation(charges, 500, 'oldest');
    expect(plan.lines).toEqual([
      { chargeId: 'c1', amount: 188.40 },
      { chargeId: 'c2', amount: 311.60 },
    ]);
    expect(plan.unallocated).toBe(0);
  });

  it('«найновіші» йде з іншого кінця', () => {
    const plan = planAllocation(charges, 800, 'newest');
    expect(plan.lines).toEqual([
      { chargeId: 'c3', amount: 677.20 },
      { chargeId: 'c2', amount: 122.80 },
    ]);
  });

  it('оплата більша за борг лишає аванс, а не «закриває» зайве', () => {
    const plan = planAllocation(charges, 3000, 'oldest');
    expect(plan.lines.reduce((s, l) => s + l.amount, 0)).toBeCloseTo(2216.80, 2);
    expect(plan.unallocated).toBeCloseTo(783.20, 2);
  });

  it('копійки сходяться до копійки: сума рознесень дорівнює оплаті', () => {
    const kop: OpenCharge[] = [
      { id: 'a', date: '2026-01-01', remaining: 0.10 },
      { id: 'b', date: '2026-01-02', remaining: 0.20 },
    ];
    const plan = planAllocation(kop, 0.30, 'oldest');
    const kopSum = plan.lines.reduce((s, l) => s + Math.round(l.amount * 100), 0);
    expect(kopSum).toBe(30);
    expect(plan.unallocated).toBe(0);
  });

  it('порядок стабільний за однакової дати', () => {
    const same: OpenCharge[] = [
      { id: 'z', date: '2026-05-05', remaining: 100 },
      { id: 'a', date: '2026-05-05', remaining: 100 },
    ];
    expect(planAllocation(same, 100, 'oldest').lines[0].chargeId).toBe('a');
    expect(planAllocation(same, 100, 'oldest').lines[0].chargeId).toBe('a');
  });

  it('нульова або відʼємна оплата нічого не гасить', () => {
    expect(planAllocation(charges, 0, 'oldest')).toEqual({ lines: [], unallocated: 0 });
    expect(planAllocation(charges, -5, 'oldest').lines).toEqual([]);
  });

  it('закриті борги пропускає', () => {
    const withClosed: OpenCharge[] = [{ id: 'closed', date: '2026-01-01', remaining: 0 }, ...charges];
    expect(planAllocation(withClosed, 100, 'oldest').lines).toEqual([{ chargeId: 'c1', amount: 100 }]);
  });
});

describe('validateManual — ручний вибір', () => {
  it('пропускає коректний план і рахує залишок оплати', () => {
    const res = validateManual(charges, 1000, [{ chargeId: 'c1', amount: 188.40 }, { chargeId: 'c3', amount: 500 }]);
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.plan.unallocated).toBeCloseTo(311.60, 2);
  });

  it('не дає рознести більше, ніж лишилось по документу', () => {
    const res = validateManual(charges, 1000, [{ chargeId: 'c1', amount: 200 }]);
    expect(res.ok).toBe(false);
  });

  it('не дає рознести більше за саму оплату', () => {
    const res = validateManual(charges, 100, [{ chargeId: 'c2', amount: 500 }]);
    expect(res.ok).toBe(false);
  });

  it('ловить чужий документ і дубль', () => {
    expect(validateManual(charges, 500, [{ chargeId: 'нема', amount: 10 }]).ok).toBe(false);
    expect(validateManual(charges, 500, [{ chargeId: 'c1', amount: 10 }, { chargeId: 'c1', amount: 10 }]).ok).toBe(false);
  });

  it('нуль і відʼємне не приймає', () => {
    expect(validateManual(charges, 500, [{ chargeId: 'c1', amount: 0 }]).ok).toBe(false);
    expect(validateManual(charges, 500, [{ chargeId: 'c1', amount: -10 }]).ok).toBe(false);
  });
});
