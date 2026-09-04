import { describe, it, expect } from 'vitest';
import { computeCategoryFacets, resolveFacets, facetTokens, facetNum, facetProductTokens, categoryChainOf, subtreeSlugs } from '../lib/facets';
import type { Category } from '../types';

const defs = [
  { id: 1, label: 'Основа',           is_filter: true,  is_multiselect: false, sort_order: 100 },
  { id: 2, label: 'Ступінь блиску',   is_filter: true,  is_multiselect: false, sort_order: 210 },
  { id: 3, label: 'Поверхня',         is_filter: true,  is_multiselect: true,  sort_order: 305 },
  { id: 4, label: 'Витрата матеріалу', is_filter: false, is_multiselect: false, sort_order: 400 },
  { id: 5, label: 'Клас зносостійкості', is_filter: false, is_multiselect: false, sort_order: 469 },
];
const tree = [
  { slug: 'farby', parent_slug: null }, { slug: 'farby-3v1', parent_slug: 'farby' },
  { slug: 'moltkovi-farby', parent_slug: 'farby-3v1' }, { slug: 'vodoemiulsiyni-interierni', parent_slug: 'farby' },
  { slug: 'antygrybok', parent_slug: 'gruntivky' }, { slug: 'gruntivky', parent_slug: null },
];
const values = [
  { definition_id: 1, value: 'Алкідна',  category_slugs: ['farby'], sort_order: 10 },
  { definition_id: 1, value: 'Акрилова', category_slugs: ['farby'], sort_order: 20 },
  { definition_id: 2, value: 'Глянцевий', category_slugs: [], sort_order: 10 },
  { definition_id: 2, value: 'Матовий',   category_slugs: [], sort_order: 20 },
  { definition_id: 3, value: 'Метал',  category_slugs: ['farby'], sort_order: 10 },
  { definition_id: 3, value: 'Дерево', category_slugs: ['farby'], sort_order: 20 },
];
const catRows = [
  // явний список: Клас зносостійкості — фільтр попри глобальний false; Основа — ні, попри глобальний true
  { category_slug: 'vodoemiulsiyni-interierni', definition_id: 1, is_filter: false, filter_order: null },
  { category_slug: 'vodoemiulsiyni-interierni', definition_id: 2, is_filter: true,  filter_order: 2 },
  { category_slug: 'vodoemiulsiyni-interierni', definition_id: 5, is_filter: true,  filter_order: 1 },
  { category_slug: 'vodoemiulsiyni-interierni', definition_id: 4, is_filter: null,  filter_order: null },
  // без явного списку: успадковує глобальні is_filter
  { category_slug: 'moltkovi-farby', definition_id: 1, is_filter: null, filter_order: null },
  { category_slug: 'moltkovi-farby', definition_id: 3, is_filter: null, filter_order: null },
  { category_slug: 'moltkovi-farby', definition_id: 4, is_filter: null, filter_order: null },
  { category_slug: 'antygrybok', definition_id: 1, is_filter: null, filter_order: null },
];

describe('computeCategoryFacets', () => {
  const facets = computeCategoryFacets(defs, catRows, values, tree);
  it('явний список категорії: лише is_filter=true, у порядку filter_order', () => {
    expect(facets['vodoemiulsiyni-interierni'].map(f => f.label)).toEqual(['Клас зносостійкості', 'Ступінь блиску']);
  });
  it('без явного списку — глобальні фільтри в порядку словника, значення родини через ланцюжок предків', () => {
    expect(facets['moltkovi-farby']).toEqual([
      { label: 'Основа', values: ['Алкідна', 'Акрилова'], multi: false },
      { label: 'Поверхня', values: ['Метал', 'Дерево'], multi: true },
    ]);
  });
  it('значення, прив’язані до чужої родини, не потрапляють; глобальні — потрапляють', () => {
    expect(facets['antygrybok']).toEqual([{ label: 'Основа', values: [], multi: false }]);
    expect(facets['vodoemiulsiyni-interierni'][1].values).toEqual(['Глянцевий', 'Матовий']);
  });
  it('категорія без рядків у словнику — без фасетів', () => {
    expect(facets['farby']).toBeUndefined();
  });
});

describe('resolveFacets', () => {
  const cat = (slug: string, parent: string | null, facets?: Category['facets']): Category =>
    ({ id: 0, slug, name: slug, sort_order: 0, parent_slug: parent, prom_section_url: null, prom_section_id: null, created_at: '', facets });
  const cats = [
    cat('farby', null),
    cat('farby-3v1', 'farby'),
    cat('moltkovi-farby', 'farby-3v1', [{ label: 'Основа', values: ['Алкідна'], multi: false }, { label: 'Ефект', values: ['Молотковий'], multi: true }]),
    cat('laky', 'farby', [{ label: 'Основа', values: ['Алкідна', 'Акрилова'], multi: false }, { label: 'Поверхня', values: ['Дерево'], multi: true }]),
    cat('klei', null, [{ label: 'Тип клею', values: [], multi: false }]),
  ];
  it('батьківська категорія — об’єднання нащадків, порядок першої появи, значення злиті', () => {
    expect(resolveFacets(cats, 'farby')).toEqual([
      { label: 'Основа', values: ['Алкідна', 'Акрилова'], multi: false },
      { label: 'Ефект', values: ['Молотковий'], multi: true },
      { label: 'Поверхня', values: ['Дерево'], multi: true },
    ]);
  });
  it('листова категорія — лише свої; без категорії — нічого', () => {
    expect(resolveFacets(cats, 'laky').map(f => f.label)).toEqual(['Основа', 'Поверхня']);
    expect(resolveFacets(cats, null)).toEqual([]);
    expect(resolveFacets(cats, 'farby-3v1').map(f => f.label)).toEqual(['Основа', 'Ефект']);
  });
});

describe('facetTokens / categoryChainOf', () => {
  it('ріже лише по «;» — кома всередині значення лишається', () => {
    expect(facetTokens('Метал; Бетон, цегла, штукатурка ;Дерево')).toEqual(['Метал', 'Бетон, цегла, штукатурка', 'Дерево']);
    expect(facetTokens(null)).toEqual([]);
  });
  it('ланцюжок категорій', () => {
    expect(categoryChainOf(tree, 'moltkovi-farby')).toEqual(['moltkovi-farby', 'farby-3v1', 'farby']);
    expect(categoryChainOf(tree, 'nope')).toEqual(['nope']);
  });
});

describe('subtreeSlugs', () => {
  it('сама категорія + діти + онуки, без зациклення', () => {
    expect(subtreeSlugs(tree, 'farby').sort()).toEqual(['farby', 'farby-3v1', 'moltkovi-farby', 'vodoemiulsiyni-interierni'].sort());
    expect(subtreeSlugs(tree, 'moltkovi-farby')).toEqual(['moltkovi-farby']);
    expect(subtreeSlugs([{ slug: 'a', parent_slug: 'b' }, { slug: 'b', parent_slug: 'a' }], 'a').sort()).toEqual(['a', 'b']);
  });
});

describe('facetNum — числове сортування значень', () => {
  it('парсить число з одиницею, приводячи до мм', () => {
    expect(facetNum('48 мм')).toBe(48);
    expect(facetNum('22,23 мм')).toBeCloseTo(22.23);
    expect(facetNum('1,5 м')).toBe(1500);
    expect(facetNum('3 м.п.')).toBe(3000);
    expect(facetNum('1 м')).toBe(1000);   // «1 м» стає ПІСЛЯ «150 мм», а не між 1 і 19
    expect(facetNum('P150')).toBe(150);
    expect(Number.isNaN(facetNum('Метал'))).toBe(true);
  });
  it('діапазон бере перше число', () => {
    expect(facetNum('2–6 мм')).toBe(2);
    expect(facetNum('2,2–2,6 мм')).toBeCloseTo(2.2);
  });
});

describe('facetProductTokens — кошики числових фасетів', () => {
  it('«Ширина шва» падає в кошик за максимумом діапазону', () => {
    expect(facetProductTokens('Ширина шва', '2–6 мм')).toEqual(['До 6 мм']);
    expect(facetProductTokens('Ширина шва', 'до 5 мм')).toEqual(['До 6 мм']);
    expect(facetProductTokens('Ширина шва', '2–15 мм')).toEqual(['7–15 мм']);
    expect(facetProductTokens('Ширина шва', '2–22 мм')).toEqual(['Понад 15 мм']);
    expect(facetProductTokens('Ширина шва', 'широкий')).toEqual([]);
  });
  it('решта лейблів — звичайний розріз по «;»', () => {
    expect(facetProductTokens('Поверхня', 'Метал; Дерево')).toEqual(['Метал', 'Дерево']);
    expect(facetProductTokens('Ширина', '48 мм')).toEqual(['48 мм']);
  });
});
