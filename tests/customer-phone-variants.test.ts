import { describe, it, expect } from 'vitest';
import { phoneDigitVariants } from '../lib/phone-variants';

describe('phoneDigitVariants', () => {
  it('усі формати українського номера дають однаковий набір варіантів', () => {
    const a = phoneDigitVariants('+380 (67) 123-45-67');
    const b = phoneDigitVariants('0671234567');
    const c = phoneDigitVariants('380671234567');
    expect(a.sort()).toEqual(b.sort());
    expect(b.sort()).toEqual(c.sort());
    expect(a).toContain('380671234567');
    expect(a).toContain('0671234567');
  });

  it('ненормалізований номер — лише власні цифри', () => {
    expect(phoneDigitVariants('12-34')).toEqual(['1234']);
  });

  it('порожній — порожній список', () => {
    expect(phoneDigitVariants('')).toEqual([]);
    expect(phoneDigitVariants(null)).toEqual([]);
  });
});
