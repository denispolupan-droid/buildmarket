import { describe, it, expect } from 'vitest';
import { formatPricelistPrice, pricelistCategoryMatch } from '../lib/pricelist-rules';

describe('formatPricelistPrice', () => {
  it('завжди два знаки після коми', () => {
    expect(formatPricelistPrice(722.5)).toBe('722,50');
    expect(formatPricelistPrice(705)).toBe('705,00');
    // розділювач тисяч в uk-UA — нерозривний пробіл, тому нормалізуємо
    expect(formatPricelistPrice(1169.13).replace(/\s/g, ' ')).toBe('1 169,13');
    expect(formatPricelistPrice(179.499)).toBe('179,50');
  });
});

describe('pricelistCategoryMatch', () => {
  const sel = new Set(['piny']);

  it('«усі категорії» пропускає будь-який товар, навіть без категорії', () => {
    expect(pricelistCategoryMatch('piny', null)).toBe(true);
    expect(pricelistCategoryMatch(null, null)).toBe(true);
  });

  it('за вибраними категоріями товар без категорії НЕ потрапляє', () => {
    expect(pricelistCategoryMatch(null, sel)).toBe(false);
    expect(pricelistCategoryMatch(undefined, sel)).toBe(false);
  });

  it('пряме співпадіння або вибраний батько', () => {
    expect(pricelistCategoryMatch('piny', sel)).toBe(true);
    expect(pricelistCategoryMatch('piny-pistoletni', sel, 'piny')).toBe(true);
    expect(pricelistCategoryMatch('kleyi', sel, 'khimiya')).toBe(false);
  });
});
