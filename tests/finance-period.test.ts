import { describe, it, expect } from 'vitest';
import { resolvePeriod, addDays, ymdRange, monthStartYmd } from '../app/admin/finance/period';

describe('resolvePeriod — межі періодів фінансів за Києвом', () => {
  it('01.11 01:30 за Києвом (31.10 23:30 UTC) — уже листопад: від 31.10T22:00Z', () => {
    const now = new Date('2026-10-31T23:30:00Z');
    const r = resolvePeriod('cur_month', now);
    expect(r.fromYmd).toBe('2026-11-01');
    expect(r.periodFrom.toISOString()).toBe('2026-10-31T22:00:00.000Z');   // зима, +2
    expect(r.periodTo).toBeNull();
    expect(r.days).toEqual(['2026-11-01']);
    expect(r.periodLabel).toBe('Лис 2026');
    expect(r.kyivMonth0).toBe(10);
  });

  it('літній місяць починається о 21:00Z попереднього дня (+3)', () => {
    const r = resolvePeriod('cur_month', new Date('2026-07-15T10:00:00Z'));
    expect(r.periodFrom.toISOString()).toBe('2026-06-30T21:00:00.000Z');
    expect(r.days.length).toBe(15);
    expect(r.days[0]).toBe('2026-07-01');
    expect(r.days.at(-1)).toBe('2026-07-15');
  });

  it('минулий місяць: [1-ше, 1-ше наступного), днів — повний місяць; попередній період — стільки ж днів назад', () => {
    const r = resolvePeriod('prev_month', new Date('2026-11-08T10:00:00Z'));
    expect(r.fromYmd).toBe('2026-10-01');
    expect(r.toYmdIncl).toBe('2026-10-31');
    expect(r.days.length).toBe(31);
    expect(r.periodTo!.toISOString()).toBe('2026-10-31T22:00:00.000Z');
    expect(r.periodLabel).toBe('Жов 2026');
    expect(r.prevDays.length).toBe(31);
    expect(r.prevDays[0]).toBe('2026-08-31');
    expect(r.prevDays.at(-1)).toBe('2026-09-30');
  });

  it('перехід на зимовий час усередині періоду не дублює і не губить день', () => {
    // 25.10.2026 — остання неділя жовтня, стрілки назад
    const r = resolvePeriod('cur_month', new Date('2026-10-28T12:00:00Z'));
    expect(r.days.length).toBe(28);
    expect(new Set(r.days).size).toBe(28);
    expect(r.periodFrom.toISOString()).toBe('2026-09-30T21:00:00.000Z');  // ще літо
  });

  it('січень: минулий місяць — грудень попереднього року; квартал і рік — з 1 січня', () => {
    const now = new Date('2026-01-10T12:00:00Z');
    expect(resolvePeriod('prev_month', now).periodLabel).toBe('Гру 2025');
    expect(resolvePeriod('prev_month', now).fromYmd).toBe('2025-12-01');
    expect(resolvePeriod('quarter', now).fromYmd).toBe('2026-01-01');
    expect(resolvePeriod('ytd', now).fromYmd).toBe('2026-01-01');
    expect(resolvePeriod('quarter', now).periodLabel).toBe('1-й квартал 2026');
  });

  it('невідомий пресет → поточний місяць', () => {
    expect(resolvePeriod('nope', new Date('2026-11-08T10:00:00Z')).preset).toBe('cur_month');
  });
});

describe('календарна арифметика', () => {
  it('addDays через межу місяця й року', () => {
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
  });
  it('ymdRange включно з обома кінцями', () => {
    expect(ymdRange('2026-01-30', '2026-02-02')).toEqual(['2026-01-30', '2026-01-31', '2026-02-01', '2026-02-02']);
    expect(ymdRange('2026-02-02', '2026-02-01')).toEqual([]);
  });
  it('monthStartYmd нормалізує місяць поза 0..11', () => {
    expect(monthStartYmd(2026, -1)).toBe('2025-12-01');
    expect(monthStartYmd(2026, 12)).toBe('2027-01-01');
  });
});
