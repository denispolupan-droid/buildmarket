import { describe, it, expect } from 'vitest';
import { parseNpDateTime } from '../lib/np-datetime';

describe('parseNpDateTime', () => {
  it('формат RecipientDateTime (дд.мм.рррр) — літній час, Київ +3', () => {
    // 18 серпня 14:32 за Києвом = 11:32 UTC
    expect(parseNpDateTime('18.08.2026 14:32:11')).toBe('2026-08-18T11:32:11.000Z');
  });

  it('формат ActualDeliveryDate (рррр-мм-дд)', () => {
    expect(parseNpDateTime('2026-08-18 14:32:11')).toBe('2026-08-18T11:32:11.000Z');
  });

  it('взимку зсув +2', () => {
    // 15 січня 09:00 за Києвом = 07:00 UTC
    expect(parseNpDateTime('15.01.2026 09:00:00')).toBe('2026-01-15T07:00:00.000Z');
  });

  it('без секунд теж читається', () => {
    expect(parseNpDateTime('18.08.2026 14:32')).toBe('2026-08-18T11:32:00.000Z');
  });

  it('порожнє й чуже не вигадує', () => {
    expect(parseNpDateTime('')).toBeNull();
    expect(parseNpDateTime('   ')).toBeNull();
    expect(parseNpDateTime(null)).toBeNull();
    expect(parseNpDateTime(undefined)).toBeNull();
    expect(parseNpDateTime(123)).toBeNull();
    expect(parseNpDateTime('18/08/2026 14:32')).toBeNull();
    expect(parseNpDateTime('невідомо')).toBeNull();
  });

  it('неможливу дату відкидає', () => {
    expect(parseNpDateTime('18.13.2026 14:32:11')).toBeNull();
    expect(parseNpDateTime('18.08.2026 25:32:11')).toBeNull();
  });
});
