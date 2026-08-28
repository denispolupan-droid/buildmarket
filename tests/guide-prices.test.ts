import { describe, it, expect } from 'vitest';
import { resolveGuidePrices, resolveText, formatUah, tokenSkus, type PricedProduct } from '../lib/seo/guide-prices';
import type { CategoryMeta } from '../lib/category-descriptions';

const products: PricedProduct[] = [
  { sku: 'A-1', category_slug: 'gruntivky-kontsentraty', price: 66 },
  { sku: 'A-2', category_slug: 'gruntivky-kontsentraty', price: 1586 },
  { sku: 'A-3', category_slug: 'gruntivky-kontsentraty', price: 423 },
  { sku: 'B-1', category_slug: 'farby', price: 250 },
  { sku: 'Z-0', category_slug: 'gruntivky-kontsentraty', price: null }, // без ціни — не рахується
];
const family = ['gruntivky-kontsentraty'];
const ctx = { bySku: new Map(products.filter(p => p.price).map(p => [p.sku, p.price!])), family: [66, 1586, 423], count: 4 };

describe('formatUah', () => {
  it('тисячі через вузький пробіл, без копійок', () => {
    expect(formatUah(66)).toBe('66 грн');
    expect(formatUah(1586.4)).toBe('1 586 грн');
    expect(formatUah(1234567)).toBe('1 234 567 грн');
  });
});

describe('resolveText', () => {
  it('{price:SKU} → ціна товару', () => {
    expect(resolveText('Lotus — {price:A-1} за 1 л.', ctx, [])).toBe('Lotus — 66 грн за 1 л.');
  });
  it('{price:SKU / K} — поділ на константу з тексту (літр розчину, м²)', () => {
    expect(resolveText('З 1 л виходить 5 л, тобто {price:A-1 / 5} за літр розчину.', ctx, [])).toBe('З 1 л виходить 5 л, тобто 13 грн за літр розчину.');
    expect(resolveText('{price:A-2/2,5}', ctx, [])).toBe('634 грн');
  });
  it('{range:…} — мін–макс серед артикулів, з поділом і без', () => {
    expect(resolveText('від {range:A-1,A-3,A-2} за банку', ctx, [])).toBe('від 66–1 586 грн за банку');
    expect(resolveText('{range:A-1,A-3 / 10} за м²', ctx, [])).toBe('7–42 грн за м²');
    expect(resolveText('{range:A-1,A-1}', ctx, [])).toBe('66 грн');
    expect(resolveText('{range} за банку', ctx, [])).toBe('66–1 586 грн за банку');
    expect(resolveText('{range / 2}', ctx, [])).toBe('33–793 грн');
  });
  it('{min} {max} {count} — по родині', () => {
    expect(resolveText('{count} позицій від {min} до {max}.', ctx, [])).toBe('4 позицій від 66 грн до 1 586 грн.');
  });
  it('нерозв\'язаний токен викидає ціле речення, решта лишається', () => {
    const un: string[] = [];
    const out = resolveText('Перше речення. Lotus коштує {price:NOPE} за 1 л. Третє речення про {price:A-1}.', ctx, un);
    expect(out).toBe('Перше речення. Третє речення про 66 грн.');
    expect(un).toEqual(['{price:NOPE}']);
  });
  it('range із частково знятими товарами рахується по тих, що є', () => {
    expect(resolveText('{range:A-1,NOPE,A-3}', ctx, [])).toBe('66–423 грн');
  });
  it('у вивід ніколи не потрапляє сирий токен', () => {
    expect(resolveText('Ціна {price:NOPE}', ctx, [])).toBe('');
    expect(resolveText('Ціна {price:A-1 / 0}', ctx, [])).toBe('');
  });
  it('текст без токенів повертається як є (і фігурні дужки поза токенами не чіпає)', () => {
    expect(resolveText('Звичайний текст.', ctx, [])).toBe('Звичайний текст.');
    expect(resolveText('{інше} лишається', ctx, [])).toBe('{інше} лишається');
  });
});

describe('resolveGuidePrices', () => {
  const meta: CategoryMeta = {
    description: 'Ґрунтовки від {min}.',
    seoText: 'Текст без цін.',
    faq: [
      { q: 'Скільки коштує?', a: 'Від {min} до {max}, наприклад Lotus — {price:A-1}.' },
      { q: 'Знятий товар?', a: 'Коштує {price:GONE}.' },
    ],
    guide: {
      title: 'Як вибрати',
      sections: [
        { h: 'Де купити', p: ['У каталозі {count} позиції.', 'Lotus {price:A-1} за 1 л, тобто {price:A-1 / 4} за літр розчину.'] },
        { h: 'Знятий розділ', p: ['Тільки {price:GONE}.'] },
      ],
    },
    related: [{ href: '/shop/farby', label: 'Фарби' }],
  };

  it('підставляє скрізь: description, FAQ, гайд; порожні розділи й відповіді викидає', () => {
    const { meta: m, unresolved } = resolveGuidePrices(meta, products, family);
    expect(m.description).toBe('Ґрунтовки від 66 грн.');
    expect(m.seoText).toBe('Текст без цін.');
    expect(m.faq).toEqual([{ q: 'Скільки коштує?', a: 'Від 66 грн до 1 586 грн, наприклад Lotus — 66 грн.' }]);
    expect(m.guide?.sections).toEqual([
      { h: 'Де купити', p: ['У каталозі 4 позиції.', 'Lotus 66 грн за 1 л, тобто 17 грн за літр розчину.'] },
    ]);
    expect(m.related).toEqual(meta.related);
    expect(unresolved).toEqual(['{price:GONE}', '{price:GONE}']);
    expect(JSON.stringify(m)).not.toMatch(/\{(price|range|min|max|count)/);
  });

  it('{min}/{max} рахуються лише по родині, а {price} — по всьому каталогу', () => {
    const { meta: m } = resolveGuidePrices({ description: '{min}–{max}, а фарба {price:B-1}' }, products, family);
    expect(m.description).toBe('66 грн–1 586 грн, а фарба 250 грн');
  });

  it('мета без токенів повертається тим самим об\'єктом', () => {
    const plain: CategoryMeta = { description: 'Без токенів' };
    expect(resolveGuidePrices(plain, products, family).meta).toBe(plain);
  });

  it('tokenSkus збирає артикули з price і range', () => {
    expect(tokenSkus(meta).sort()).toEqual(['A-1', 'GONE']);
    expect(tokenSkus({ description: '{range:X-1, X-2 / 3} і {min}' })).toEqual(['X-1', 'X-2']);
  });
});
