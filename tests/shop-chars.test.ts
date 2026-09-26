import { describe, it, expect } from 'vitest';
import { stripCharsOutside, mergeChars } from '../lib/shop-chars';

const P = (sku: string, cat: string, chars = [{ label: 'Колір', value: 'Білий' }]) =>
  ({ sku, category_slug: cat, characteristics: chars });

describe('stripCharsOutside', () => {
  it('лишає характеристики лише товарам відкритої гілки', () => {
    const out = stripCharsOutside([P('a', 'akrylovi-germetyky'), P('b', 'laky')], new Set(['akrylovi-germetyky']));
    expect(out[0].characteristics).toHaveLength(1);
    expect(out[1].characteristics).toEqual([]);
  });
  it('не створює нових об\'єктів там, де нічого не змінює', () => {
    const a = P('a', 'laky'), b = P('b', 'farby', []);
    const out = stripCharsOutside([a, b], new Set(['laky']));
    expect(out[0]).toBe(a);
    expect(out[1]).toBe(b);
  });
});

describe('mergeChars', () => {
  it('накладає довантажені характеристики й повертає той самий масив без змін', () => {
    const list = [P('a', 'laky', []), P('b', 'laky', [])];
    expect(mergeChars(list, new Map())).toBe(list);
    const out = mergeChars(list, new Map([['b', [{ label: 'Основа', value: 'Акрил' }]]]));
    expect(out[0]).toBe(list[0]);
    expect(out[1].characteristics[0].value).toBe('Акрил');
  });
});
