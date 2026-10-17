import { describe, it, expect } from 'vitest';
import { kyivBounds, statusDateOrFilter } from '../lib/orders/date-filter';

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
