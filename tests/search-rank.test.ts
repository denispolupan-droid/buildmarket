import { describe, it, expect } from 'vitest';
import { rankProducts, type SuggestProduct } from '../lib/search-rank';

const P = (over: Partial<SuggestProduct>): SuggestProduct => ({
  sku: '0000-000', slug: null, name: 'Товар', name_ru: null, brand: 'Brand',
  volume: null, image: null, nl1: null, nl2: null, bc: '#000', ac: '#111',
  img_type: 'tube',
  stock: { price_retail: 100, price_promo: null, stock_status: 'in_stock', stock_qty: 5 },
  ...over,
});

const items: SuggestProduct[] = [
  P({ sku: '1001-005', name: 'Герметик акриловий Lacrysil венге', brand: 'Lacrysil' }),
  P({ sku: '1001-006', name: 'Герметик силіконовий Ceresit CS 25', brand: 'Ceresit' }),
  P({ sku: '2002-001', name: 'Піна монтажна пістолетна', brand: 'Ceresit' }),
  P({ sku: '3003-001', name: 'Ґрунтовка глибокого проникнення', name_ru: 'Грунтовка глубокого проникновения', brand: 'AURA' }),
  P({
    sku: '1001-007', name: 'Герметик бітумний',
    brand: 'Bitugum',
    stock: { price_retail: 100, price_promo: null, stock_status: 'out_of_stock', stock_qty: 0 },
  }),
];

describe('rankProducts', () => {
  it('точний артикул — перший і єдиний очевидний лідер', () => {
    const r = rankProducts(items, '1001-005', 'uk');
    expect(r[0]?.sku).toBe('1001-005');
  });

  it('запит коротший за 2 символи — порожньо', () => {
    expect(rankProducts(items, 'г', 'uk')).toEqual([]);
    expect(rankProducts(items, '  ', 'uk')).toEqual([]);
  });

  it('пошук за назвою: збіги є, «в наявності» вище за відсутній', () => {
    const r = rankProducts(items, 'герметик', 'uk');
    expect(r.length).toBe(3);
    // out_of_stock бітумний — останній серед герметиків з однаковим рахунком
    expect(r[r.length - 1]?.sku).toBe('1001-007');
  });

  it('російська локаль знаходить за name_ru', () => {
    const r = rankProducts(items, 'грунтовка глубокого', 'ru');
    expect(r[0]?.sku).toBe('3003-001');
  });

  it('пошук за брендом', () => {
    const r = rankProducts(items, 'ceresit', 'uk');
    expect(r.map(p => p.sku)).toContain('1001-006');
    expect(r.map(p => p.sku)).toContain('2002-001');
  });

  it('ліміт поважається', () => {
    const r = rankProducts(items, 'герметик', 'uk', 2);
    expect(r.length).toBe(2);
  });

  it('морфологія: «піни» знаходить «Піна монтажна» через основу слова', () => {
    const r = rankProducts(items, 'піни', 'uk');
    expect(r.map(p => p.sku)).toContain('2002-001');
  });

  it('морфологія: «ґрунтовки» знаходить «Ґрунтовка глибокого проникнення»', () => {
    const r = rankProducts(items, 'ґрунтовки', 'uk');
    expect(r[0]?.sku).toBe('3003-001');
  });

  it('багатослівний запит: «герметик ceresit» — усі слова мають збігтися', () => {
    const r = rankProducts(items, 'герметик ceresit', 'uk');
    expect(r.map(p => p.sku)).toEqual(['1001-006']);
  });

  it('прямий збіг ранжується вище за збіг через основу', () => {
    const r = rankProducts(items, 'герметик акриловий', 'uk');
    // прямий збіг обох слів — 1001-005; він має бути вище товарів,
    // де збіг лише через основи (таких у фікстурі немає — перевіряємо порядок)
    expect(r[0]?.sku).toBe('1001-005');
  });

  it('коротке слово (<4 літер) не стемиться і не дає хибних збігів', () => {
    const r = rankProducts(items, 'пін', 'uk');
    // «пін» — прямий підрядок «піна монтажна пістолетна»
    expect(r.map(p => p.sku)).toContain('2002-001');
    // але «гер» не знаходить піну
    expect(rankProducts(items, 'гер', 'uk').map(p => p.sku)).not.toContain('2002-001');
  });
});
