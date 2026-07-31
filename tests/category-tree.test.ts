import { describe, it, expect } from 'vitest';
import { categoryFamilySlugs, categoriesWithProducts } from '../lib/seo/meta';

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
