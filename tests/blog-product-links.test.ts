import { describe, it, expect } from 'vitest';
import {
  expandCategories, pickArticleProducts, productLabel,
  buildLinksBlock, upsertLinksBlock, hasLinksBlock, countProductLinks,
  type LinkProduct,
} from '../lib/blog-product-links';

const p = (over: Partial<LinkProduct>): LinkProduct => ({
  sku: 'X', slug: 'x', name: 'Товар', name_ru: null, brand: 'Brand',
  volume: '1 л', price: 100, category_slug: 'cat', in_stock: true, ...over,
});

describe('expandCategories', () => {
  it('додає підкатегорії й не дублює', () => {
    const children = new Map([['germetyky', ['sylikonovi-germetyky', 'akrylovi-germetyky']]]);
    expect(expandCategories(['germetyky', 'sylikonovi-germetyky'], children))
      .toEqual(['germetyky', 'sylikonovi-germetyky', 'akrylovi-germetyky']);
  });
});

describe('pickArticleProducts', () => {
  it('відкидає без ціни і без наявності', () => {
    const out = pickArticleProducts([[
      p({ sku: 'A', price: null }),
      p({ sku: 'B', in_stock: false }),
      p({ sku: 'C', price: 50 }),
    ]]);
    expect(out.map(x => x.sku)).toEqual(['C']);
  });

  it('віддає всі, якщо їх не більше ліміту, за зростанням ціни', () => {
    const out = pickArticleProducts([[p({ sku: 'A', price: 300 }), p({ sku: 'B', price: 100 })]], 4);
    expect(out.map(x => x.sku)).toEqual(['B', 'A']);
  });

  it('будує цінову драбину від найдешевшого до найдорожчого', () => {
    const items = [10, 20, 30, 40, 50, 60, 70, 80].map((price, i) =>
      p({ sku: `S${i}`, price, brand: `B${i}` }));
    const out = pickArticleProducts([items], 4);
    expect(out).toHaveLength(4);
    expect(out[0].price).toBe(10);
    expect(out[3].price).toBe(80);
    // ціни зростають — драбина, а не випадковий набір
    expect(out.map(x => x.price)).toEqual([...out.map(x => x.price)].sort((a, b) => a! - b!));
  });

  it('віддає перевагу різним брендам', () => {
    const items = [
      p({ sku: 'A1', price: 10, brand: 'Alpha' }),
      p({ sku: 'A2', price: 12, brand: 'Alpha' }),
      p({ sku: 'B1', price: 14, brand: 'Beta' }),
      p({ sku: 'A3', price: 90, brand: 'Alpha' }),
      p({ sku: 'C1', price: 95, brand: 'Gamma' }),
    ];
    const brands = new Set(pickArticleProducts([items], 3).map(x => x.brand));
    expect(brands.size).toBeGreaterThanOrEqual(2);
  });

  it('головна категорія не тоне серед суміжних (реальний кейс «клей для плитки»)', () => {
    const tileGlue = [1, 2, 3, 4, 5, 6, 7].map(i => p({ sku: `TG${i}`, price: i * 100, brand: `TG${i}`, category_slug: 'klei-dlya-plytky' }));
    const grout = Array.from({ length: 58 }, (_, i) => p({ sku: `GR${i}`, price: i * 20 + 5, brand: `GR${i}`, category_slug: 'zamazky' }));
    const hydro = Array.from({ length: 29 }, (_, i) => p({ sku: `HY${i}`, price: i * 90 + 7, brand: `HY${i}`, category_slug: 'hidro' }));
    const out = pickArticleProducts([tileGlue, grout, hydro], 4);
    // мінімум дві позиції з головної категорії, і суміжні теж представлені
    expect(out.filter(x => x.category_slug === 'klei-dlya-plytky').length).toBeGreaterThanOrEqual(2);
    expect(new Set(out.map(x => x.category_slug)).size).toBeGreaterThanOrEqual(2);
  });

  it('із суміжної категорії бере найдешевшу позицію (кейс «розчинники» у статті про радіатори)', () => {
    const paints = [200, 400, 900].map((price, i) => p({ sku: `P${i}`, price, brand: `P${i}`, category_slug: 'radiatory' }));
    const solvents = [
      p({ sku: 'S-rust', price: 91, brand: 'Skyline', category_slug: 'rozchynnyky' }),
      p({ sku: 'S-glue', price: 99, brand: 'XADO', category_slug: 'rozchynnyky' }),
      p({ sku: 'S-white', price: 399, brand: 'Skyline2', category_slug: 'rozchynnyky' }),
    ];
    const out = pickArticleProducts([paints, solvents], 4);
    const fromSolvents = out.filter(x => x.category_slug === 'rozchynnyky');
    expect(fromSolvents).toHaveLength(1);
    expect(fromSolvents[0].sku).toBe('S-rust');
  });

  it('одна категорія — усі слоти їй', () => {
    const only = Array.from({ length: 20 }, (_, i) => p({ sku: `S${i}`, price: i * 10 + 10, brand: `B${i}` }));
    expect(pickArticleProducts([only], 4)).toHaveLength(4);
  });

  it('порожні групи не ламають підбір', () => {
    const out = pickArticleProducts([[], [p({ sku: 'A', price: 100 })], []], 4);
    expect(out.map(x => x.sku)).toEqual(['A']);
  });
});

describe('productLabel', () => {
  it('не дублює бренд, якщо він уже в назві', () => {
    expect(productLabel(p({ name: 'Грунтовка БЕТОКОНТАКТ SKYLINE', brand: 'SKYLINE' }), 'uk'))
      .toBe('Грунтовка БЕТОКОНТАКТ SKYLINE');
  });
  it('додає бренд, якщо його в назві немає', () => {
    expect(productLabel(p({ name: 'Ґрунтовка глибокого проникнення', brand: 'Aura' }), 'uk'))
      .toBe('Aura Ґрунтовка глибокого проникнення');
  });
  it('на рос. бере name_ru, коли він є', () => {
    expect(productLabel(p({ name: 'Фарба', name_ru: 'Краска Aura', brand: 'Aura' }), 'ru'))
      .toBe('Краска Aura');
  });
});

describe('buildLinksBlock / upsertLinksBlock', () => {
  const products = [p({ sku: '1-1', slug: 'prod-a', name: 'Ґрунт A', brand: 'Aura', price: 79, volume: '1,4 кг' })];

  it('будує мовно-нейтральні посилання (/ru додає рендер)', () => {
    const html = buildLinksBlock(products, 'uk');
    expect(html).toContain('href="/product/prod-a"');
    expect(html).not.toContain('/ru/product/');
    expect(html).toContain('79 грн');
  });

  it('екранує небезпечні символи в назві', () => {
    const block = buildLinksBlock([p({ name: 'A & <b>B</b>', brand: 'X' })], 'uk');
    expect(block).toContain('&amp;');
    expect(block).not.toContain('<b>');
  });

  it('дописує блок у кінець, якщо його ще немає', () => {
    const out = upsertLinksBlock('<p>Текст</p>', products, 'uk');
    expect(out.startsWith('<p>Текст</p>')).toBe(true);
    expect(hasLinksBlock(out, 'uk')).toBe(true);
  });

  it('повторний запуск оновлює блок, а не дублює його', () => {
    const once = upsertLinksBlock('<p>Текст</p>', products, 'uk');
    const twice = upsertLinksBlock(once, [p({ sku: '2-2', slug: 'prod-b', name: 'Ґрунт B', brand: 'Bura', price: 150 })], 'uk');
    expect(countProductLinks(twice)).toBe(1);
    expect(twice).toContain('/product/prod-b');
    expect(twice).not.toContain('/product/prod-a');
  });

  it('порожній список товарів не змінює статтю', () => {
    expect(upsertLinksBlock('<p>Текст</p>', [], 'uk')).toBe('<p>Текст</p>');
  });

  it('російський блок має власний заголовок і не плутається з українським', () => {
    const ua = upsertLinksBlock('<p>Т</p>', products, 'uk');
    const both = upsertLinksBlock(ua, products, 'ru');
    expect(hasLinksBlock(both, 'uk')).toBe(true);
    expect(hasLinksBlock(both, 'ru')).toBe(true);
  });
});
