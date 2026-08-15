import { describe, it, expect } from 'vitest';
import { computeProductGaps, hasAnyGap, normKey, type SeoStateRow } from '../lib/seo/product-gaps';

// Класифікація «пробіл / не пробіл» — єдине місце, де вирішується, за що ми
// платимо генерацією. Тест фіксує саме її, а не спосіб вибірки з БД.

const full: SeoStateRow = {
  sku: '1001-001',
  slug: 'test',
  name: 'Тест',
  brand: 'FIXLINE',
  category_slug: 'grunty',
  desc_len: 1800,
  desc_ru_len: 1750,
  no_ru: false,
  no_keywords: false,
  no_image: false,
  faq_count: 4,
  faq_untranslated: 0,
  chars_count: 10,
};

const gapsFor = (patch: Partial<SeoStateRow>, extra: Parameters<typeof computeProductGaps>[0] = { products: [], chars: [], dict: [], categoryChars: [] }) =>
  computeProductGaps({ ...extra, products: [{ ...full, ...patch }] })[0].gaps;

describe('computeProductGaps', () => {
  it('повна картка не має жодного пробілу', () => {
    const item = computeProductGaps({ products: [full], chars: [], dict: [], categoryChars: [] })[0];
    expect(hasAnyGap(item)).toBe(false);
  });

  it('короткий опис ловиться за порогом', () => {
    expect(gapsFor({ desc_len: 100 }).thinDesc).toBe(true);
    expect(gapsFor({ desc_len: 1800 }).thinDesc).toBe(false);
  });

  it('рос. версія вважається відсталою при розриві понад 25%', () => {
    expect(gapsFor({ desc_len: 1000, desc_ru_len: 700 }).ruDesc).toBe(true);
    expect(gapsFor({ desc_len: 1000, desc_ru_len: 800 }).ruDesc).toBe(false);
  });

  it('неперекладений FAQ теж рахується пробілом рос. версії', () => {
    expect(gapsFor({ faq_untranslated: 1 }).ruDesc).toBe(true);
  });

  it('відсутність FAQ, keywords, фото і характеристик — окремі пробіли', () => {
    expect(gapsFor({ faq_count: 0 }).noFaq).toBe(true);
    expect(gapsFor({ no_keywords: true }).noKeywords).toBe(true);
    expect(gapsFor({ no_image: true }).noImage).toBe(true);
    expect(gapsFor({ chars_count: 0 }).noChars).toBe(true);
  });

  it('обовʼязкова характеристика категорії, якої немає у товару', () => {
    const [item] = computeProductGaps({
      products: [full],
      chars: [{ product_sku: '1001-001', label: 'Основа' }],
      dict: [{ label: 'Основа', aliases: [] }, { label: 'Витрата', aliases: [] }],
      categoryChars: [
        { category_slug: 'grunty', required: true, characteristic_definitions: { label: 'Основа' } },
        { category_slug: 'grunty', required: true, characteristic_definitions: { label: 'Витрата' } },
      ],
    });
    expect(item.gaps.missingRequired).toBe(true);
    expect(item.missingLabels).toEqual(['Витрата']);
  });

  it('вкладена таблиця у формі масиву (як її типізує PostgREST) читається так само', () => {
    const [item] = computeProductGaps({
      products: [full],
      chars: [],
      dict: [{ label: 'Основа', aliases: [] }],
      categoryChars: [
        { category_slug: 'grunty', required: true, characteristic_definitions: [{ label: 'Основа' }] },
      ],
    });
    expect(item.gaps.missingRequired).toBe(true);
  });

  it('лейбл-синонім позначається як ненормований, але зараховується', () => {
    const [item] = computeProductGaps({
      products: [full],
      chars: [{ product_sku: '1001-001', label: 'основа' }],
      dict: [{ label: 'Основа', aliases: ['База'] }],
      categoryChars: [
        { category_slug: 'grunty', required: true, characteristic_definitions: { label: 'Основа' } },
      ],
    });
    expect(item.gaps.dirtyChars).toBe(true);
    expect(item.gaps.missingRequired).toBe(false);
  });

  it('legacy «Сфера застосування» закриває обидві цільові характеристики', () => {
    const [item] = computeProductGaps({
      products: [full],
      chars: [{ product_sku: '1001-001', label: 'Сфера застосування' }],
      dict: [{ label: 'Тип використання', aliases: [] }, { label: 'Область застосування', aliases: [] }],
      categoryChars: [
        { category_slug: 'grunty', required: true, characteristic_definitions: { label: 'Тип використання' } },
        { category_slug: 'grunty', required: true, characteristic_definitions: { label: 'Область застосування' } },
      ],
    });
    expect(item.gaps.missingRequired).toBe(false);
    expect(item.gaps.dirtyChars).toBe(true);
  });

  it('необовʼязкові характеристики категорії не створюють пробілу', () => {
    const [item] = computeProductGaps({
      products: [full],
      chars: [{ product_sku: '1001-001', label: 'Основа' }],
      dict: [{ label: 'Основа', aliases: [] }, { label: 'Колір', aliases: [] }],
      categoryChars: [
        { category_slug: 'grunty', required: false, characteristic_definitions: { label: 'Колір' } },
      ],
    });
    expect(item.gaps.missingRequired).toBe(false);
  });
});

describe('normKey', () => {
  it('зводить апострофи різних накреслень і подвійні пробіли', () => {
    expect(normKey("Об'єм")).toBe(normKey('Об’єм'));
    expect(normKey('Тип  використання ')).toBe('тип використання');
  });
});
