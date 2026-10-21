import { describe, it, expect } from 'vitest';
import { feedVendor } from '../lib/brand-feed';
import { resolveCountry } from '../lib/brand-country';
import { EPICENTR_BRAND_CODE } from '../lib/epicentr-dictionaries';

describe('feedVendor', () => {
  it('віддає площадкам старе написання перейменованих брендів', () => {
    expect(feedVendor('Aura')).toBe('AURA');
    expect(feedVendor('XADO')).toBe('ХАDО');
    expect(feedVendor('Поляра-Хим')).toBe('ПОЛЯРА-ХИМ');
  });
  it('інші бренди — як є', () => {
    expect(feedVendor('Ceresit')).toBe('Ceresit');
    expect(feedVendor(null)).toBeNull();
  });
  it('перейменовані бренди не губляться в довідниках площадок', () => {
    expect(EPICENTR_BRAND_CODE[feedVendor('Aura')]).toBeTruthy();
    expect(resolveCountry([], 'Aura')).toBe('Україна');
    expect(resolveCountry([], 'XADO')).toBe('Україна');
  });
});
