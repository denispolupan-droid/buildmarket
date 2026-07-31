import { describe, it, expect } from 'vitest';
import { categoryFamilySlugs, categoriesWithProducts, duplicateOfParent } from '../lib/seo/meta';

// Реальна форма дерева з прода: три рівні (farby → farby-3v1 → farby-3v1-akrylovi).
const CATS = [
  { slug: 'farby',               parent_slug: null },
  { slug: 'farby-3v1',           parent_slug: 'farby' },
  { slug: 'farby-3v1-akrylovi',  parent_slug: 'farby-3v1' },
  { slug: 'farby-dlya-pidlohy',  parent_slug: 'farby' },
  { slug: 'klei',                parent_slug: null },
  { slug: 'klei-dlya-shpaler',   parent_slug: 'klei' },
  { slug: 'mastyla',             parent_slug: null },
];

describe('categoryFamilySlugs', () => {
  it('дістає онуків, а не лише прямих дітей', () => {
    expect(new Set(categoryFamilySlugs(CATS, 'farby')))
      .toEqual(new Set(['farby', 'farby-3v1', 'farby-3v1-akrylovi', 'farby-dlya-pidlohy']));
  });

  it('для листка повертає лише його самого', () => {
    expect(categoryFamilySlugs(CATS, 'farby-3v1-akrylovi')).toEqual(['farby-3v1-akrylovi']);
  });

  it('не тягне чужу гілку', () => {
    expect(categoryFamilySlugs(CATS, 'klei')).toEqual(['klei', 'klei-dlya-shpaler']);
  });
});

describe('categoriesWithProducts', () => {
  it('батько живий, якщо товар лежить у внука', () => {
    const live = categoriesWithProducts(CATS, [{ category_slug: 'farby-3v1-akrylovi' }]);
    expect(live.has('farby')).toBe(true);
    expect(live.has('farby-3v1')).toBe(true);
    expect(live.has('farby-3v1-akrylovi')).toBe(true);
  });

  it('категорія без товарів у всій гілці — порожня', () => {
    const live = categoriesWithProducts(CATS, [{ category_slug: 'klei-dlya-shpaler' }]);
    expect(live.has('mastyla')).toBe(false);
    expect(live.has('farby')).toBe(false);
    expect(live.has('klei')).toBe(true);
  });

  it('товар без категорії нікого не оживляє', () => {
    expect(categoriesWithProducts(CATS, [{ category_slug: null }]).size).toBe(0);
  });
});

describe('duplicateOfParent', () => {
  // Реальний кейс: у батька немає власних товарів, наповнена лише одна дитина —
  // дві адреси віддають однаковий листинг.
  const DUP = [
    { slug: 'plastyfikatory',             parent_slug: null },
    { slug: 'plastyfikatory-dlya-betonu', parent_slug: 'plastyfikatory' },
    { slug: 'zamazky-dlya-shviv',         parent_slug: null },
    { slug: 'zamazky-tsementni',          parent_slug: 'zamazky-dlya-shviv' },
    { slug: 'zamazky-epoksydni',          parent_slug: 'zamazky-dlya-shviv' },
    { slug: 'klei',                       parent_slug: null },
    { slug: 'klei-dlya-shpaler',          parent_slug: 'klei' },
    { slug: 'klei-dlya-plytky',           parent_slug: 'klei' },
  ];
  const prod = (c: string, n: number) => Array.from({ length: n }, () => ({ category_slug: c }));

  it('дитина, що дублює батька, канонікалиться на батька', () => {
    const items = prod('plastyfikatory-dlya-betonu', 26);
    expect(duplicateOfParent(DUP, items, 'plastyfikatory-dlya-betonu')).toBe('plastyfikatory');
  });

  it('порожня друга дитина не рятує від дубля', () => {
    // zamazky-epoksydni без товарів → батько = цементні
    const items = prod('zamazky-tsementni', 58);
    expect(duplicateOfParent(DUP, items, 'zamazky-tsementni')).toBe('zamazky-dlya-shviv');
  });

  it('коли наповнені дві дитини — дубля немає', () => {
    const items = [...prod('klei-dlya-shpaler', 26), ...prod('klei-dlya-plytky', 30)];
    expect(duplicateOfParent(DUP, items, 'klei-dlya-shpaler')).toBeNull();
    expect(duplicateOfParent(DUP, items, 'klei-dlya-plytky')).toBeNull();
  });

  it('батьківська категорія ніколи не канонікалиться', () => {
    const items = prod('plastyfikatory-dlya-betonu', 26);
    expect(duplicateOfParent(DUP, items, 'plastyfikatory')).toBeNull();
  });

  it('порожня категорія не вважається дублем', () => {
    expect(duplicateOfParent(DUP, [], 'zamazky-epoksydni')).toBeNull();
  });
});
