import { describe, it, expect } from 'vitest';
import { safeEqual } from '../lib/safe-equal';

describe('safeEqual — порівняння секретів за сталий час (аудит 31.10, §5)', () => {
  it('рівні рядки → true', () => {
    expect(safeEqual('abc-123', 'abc-123')).toBe(true);
  });
  it('різні або різної довжини → false', () => {
    expect(safeEqual('abc-123', 'abc-124')).toBe(false);
    expect(safeEqual('abc', 'abcd')).toBe(false);
    expect(safeEqual('', '')).toBe(false);
  });
  it('порожній/відсутній секрет ніколи не збігається — закрито за замовчуванням', () => {
    expect(safeEqual(null, 'x')).toBe(false);
    expect(safeEqual('x', undefined)).toBe(false);
    expect(safeEqual(undefined, undefined)).toBe(false);
  });
});
