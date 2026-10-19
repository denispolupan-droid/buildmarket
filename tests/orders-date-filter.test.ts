import { describe, it, expect } from 'vitest';
import { kyivBounds, statusDateOrFilter, createdOrFilter, matchesEventDate, matchesCreatedDate } from '../lib/orders/date-filter';

describe('«Всі» — за датою створення: «з 18.10» не показує замовлення від 16.10 (19.10.2026)', () => {
  const from18 = kyivBounds('2026-10-18');
  const o100 = { status: 'shipped', created_at: '2026-10-16T14:42:00Z', shipped_at: '2026-10-19T06:29:00Z' };
  it('створене 16.10, відправлене 19.10: на «Всі» немає, на «Відправлено» є', () => {
    expect(matchesCreatedDate(o100, from18)).toBe(false);
    expect(matchesEventDate(o100, from18)).toBe(true);
  });
});

describe('«Всі» — за датою створення, вкладки статусів — за датою події', () => {
  const b = kyivBounds('2026-10-18', '2026-10-18');
  // #26101103: створено 16.10, відправлено 19.10 — не належить до 18.10 ні за яким правилом
  const o103 = { status: 'shipped', created_at: '2026-10-16T20:27:00Z', shipped_at: '2026-10-19T06:29:00Z' };
  // #26101105: створено й відправлено 18.10
  const o105 = { status: 'shipped', created_at: '2026-10-18T07:42:00Z', shipped_at: '2026-10-18T15:58:00Z' };
  // #26101104: створено 18.10, відправлено 19.10 — у «Всі» є, у «Відправлено» немає
  const o104 = { status: 'shipped', created_at: '2026-10-18T05:37:00Z', shipped_at: '2026-10-19T06:29:00Z' };

  it('правила в коді збігаються з очікуваним', () => {
    expect([o103, o105, o104].map(o => matchesCreatedDate(o, b))).toEqual([false, true, true]);
    expect([o103, o105, o104].map(o => matchesEventDate(o, b))).toEqual([false, true, false]);
  });
  it('createdOrFilter — лише created_at', () => {
    expect(createdOrFilter(b)).toBe('and(created_at.gte.2026-10-17T21:00:00Z,created_at.lt.2026-10-18T21:00:00Z)');
    expect(createdOrFilter({})).toBeNull();
  });
});

describe('kyivBounds — межі періоду за київським днем', () => {
  it('літній час (UTC+3): день починається о 21:00 UTC попереднього дня', () => {
    expect(kyivBounds('2026-10-17', '2026-10-17')).toEqual({
      gte: '2026-10-16T21:00:00Z',
      lt: '2026-10-17T21:00:00Z',
    });
  });

  it('зимовий час (UTC+2)', () => {
    expect(kyivBounds('2026-12-01', '2026-12-01')).toEqual({
      gte: '2026-11-30T22:00:00Z',
      lt: '2026-12-01T22:00:00Z',
    });
  });

  it('межі незалежні; без дат — порожньо', () => {
    expect(kyivBounds('2026-10-17')).toEqual({ gte: '2026-10-16T21:00:00Z' });
    expect(kyivBounds(undefined, '2026-10-17')).toEqual({ lt: '2026-10-17T21:00:00Z' });
    expect(kyivBounds()).toEqual({});
  });
});

describe('statusDateOrFilter — дата події за статусом', () => {
  const b = { gte: '2026-10-16T21:00:00Z', lt: '2026-10-17T21:00:00Z' };
  const f = statusDateOrFilter(b)!;

  it('доставлені — за delivered_at, скасовані — за cancelled_at, відправлені — за shipped_at', () => {
    expect(f).toContain('and(status.eq.delivered,delivered_at.gte.2026-10-16T21:00:00Z,delivered_at.lt.2026-10-17T21:00:00Z)');
    expect(f).toContain('and(status.eq.cancelled,cancelled_at.gte.');
    expect(f).toContain('and(status.eq.shipped,shipped_at.gte.');
  });

  it('решта статусів — за created_at', () => {
    expect(f).toContain('and(status.not.in.(delivered,cancelled,shipped),created_at.gte.2026-10-16T21:00:00Z,created_at.lt.2026-10-17T21:00:00Z)');
  });

  it('без крапок у значеннях (вони ламають розбір or() у PostgREST) і без періоду — null', () => {
    expect(f).not.toMatch(/\d\.\d{3}Z/);
    expect(statusDateOrFilter({})).toBeNull();
  });
});
