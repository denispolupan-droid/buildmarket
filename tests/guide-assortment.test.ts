import { describe, it, expect } from 'vitest';
import { resolveGuidePrices, familyBrands, familyTop, joinList, type PricedProduct } from '../lib/seo/guide-prices';

const pina: PricedProduct[] = [
  { sku: 'L-1', category_slug: 'pina', price: 120, brand: 'Lacrysil', name: 'Піна Lacrysil 320 мл', inStock: true },
  { sku: 'L-2', category_slug: 'pina', price: 180, brand: 'Lacrysil', name: 'Піна Lacrysil професійна 750 мл', inStock: true },
  { sku: 'C-1', category_slug: 'pina', price: 210, brand: 'Ceresit', name: 'Піна Ceresit TS 62', inStock: false },
  { sku: 'C-2', category_slug: 'pina', price: 230, brand: 'Ceresit', name: 'Піна Ceresit TS 61 зимова', inStock: true },
  { sku: 'P-1', category_slug: 'pina', price: 260, brand: 'Pattex', name: 'Піна-клей Pattex 6 в 1', inStock: true },
  { sku: 'X-1', category_slug: 'pina', price: null, brand: 'Soudal', name: 'Піна Soudal', inStock: true }, // без ціни — не рахується
  { sku: 'F-1', category_slug: 'farby', price: 99, brand: 'Aura', name: 'Фарба Aura', inStock: true },
];

describe('асортимент у гайді: {brands} і {top:N} (07.11.2026)', () => {
  it('joinList: «і» / «и»', () => {
    expect(joinList(['A'])).toBe('A');
    expect(joinList(['A', 'B', 'C'])).toBe('A, B і C');
    expect(joinList(['A', 'B'], 'ru')).toBe('A и B');
  });
  it('бренди родини — за кількістю товарів з ціною', () => {
    expect(familyBrands(pina.filter(p => p.category_slug === 'pina'))).toEqual(['Ceresit', 'Lacrysil', 'Pattex']);
  });
  it('top — лише в наявності, по бренду по черзі (більший бренд у наявності першим), базовий варіант', () => {
    expect(familyTop(pina.filter(p => p.category_slug === 'pina')).map(p => p.sku)).toEqual(['L-1', 'C-2', 'P-1', 'L-2']);
  });
  it('у тексті: бренди змінюються з асортиментом, top — посиланнями', () => {
    const meta = { description: 'd', guide: { title: 't', sections: [{ h: 'Де купити', p: ['У FIXLINE піна {brands} коштує від {min}. Зараз у наявності: {top:2}.'] }] } };
    const out = resolveGuidePrices(meta, pina, ['pina']).meta;
    expect(out.guide!.sections[0].p[0]).toBe('У FIXLINE піна Ceresit, Lacrysil і Pattex коштує від 120 грн. Зараз у наявності: [Піна Lacrysil 320 мл](/product/L-1) і [Піна Ceresit TS 61 зимова](/product/C-2).');
    const ru = resolveGuidePrices({ description: '{brands}' }, pina, ['pina'], 'ru').meta;
    expect(ru.description).toBe('Ceresit, Lacrysil и Pattex');
  });
  it('порожня родина — речення з токеном викидається', () => {
    const out = resolveGuidePrices({ description: 'Перше. Бренди: {brands}.' }, pina, ['nema']).meta;
    expect(out.description).toBe('Перше.');
  });
});
