import { describe, it, expect } from 'vitest';
import { brandSlug, legacyBrandSlug } from '../lib/seo/slug';
import { clampDescription } from '../lib/seo/meta';
import { offerExtras, ORG_ID } from '../lib/seo/offer-ld';

// Слаг бренду. Головна вимога — латинські бренди дають ТОЙ САМИЙ слаг, що
// й старий lowercase+дефіси: інакше зміняться робочі адреси /shop/brand/*.
describe('brandSlug', () => {
  it('латинські бренди — без змін відносно старого слага', () => {
    for (const b of ['Ceresit', 'Knauf', 'Lacrysil', 'POLIFARB', 'ESKARO', 'Pattex', 'AURA', 'Ataman', 'Bitugum', 'Dnipro-M']) {
      expect(brandSlug(b)).toBe(legacyBrandSlug(b));
    }
  });

  it('кирилиця транслітерується, а не лишається в URL', () => {
    expect(brandSlug('Сталь')).toBe('stal');
    expect(brandSlug('Титан')).toBe('tytan');
    expect(brandSlug('Дивоцвіт')).toBe('dyvotsvit');
    expect(brandSlug('Байріс')).toBe('bairis');
    expect(brandSlug('Хімік')).toBe('khimik');
    // латинська d усередині кириличної назви — слаг усе одно чистий ASCII
    expect(brandSlug('ХАDО')).toBe('khado');
    for (const b of ['Сталь', 'Дивоцвіт', 'ХАDО']) expect(brandSlug(b)).toMatch(/^[a-z0-9-]+$/);
  });

  it('старий слаг упізнає decoded-адресу для редіректу', () => {
    expect(legacyBrandSlug('Сталь')).toBe('сталь');
    expect(legacyBrandSlug('  Dnipro-M ')).toBe('dnipro-m');
  });
});

describe('clampDescription', () => {
  it('короткий текст не чіпає', () => {
    expect(clampDescription('Герметики для ванної.', 160)).toBe('Герметики для ванної.');
  });

  it('ріже по межі речення, коли вона не надто рано', () => {
    const s = 'Перше речення про герметики достатньо довге, щоб мати сенс. Друге речення теж довге і не влізе в ліміт сто шістдесят символів. Третє.';
    const out = clampDescription(s, 160);
    expect(out.length).toBeLessThanOrEqual(160);
    expect(out.endsWith('.')).toBe(true);
    expect(out).not.toMatch(/…$/);
  });

  it('без речень — по межі слова з трикрапкою', () => {
    const s = Array.from({ length: 40 }, (_, i) => `слово${i}`).join(' ');
    const out = clampDescription(s, 100);
    expect(out.length).toBeLessThanOrEqual(100);
    expect(out.endsWith('…')).toBe(true);
    expect(out).not.toMatch(/ …$/);
  });
});

describe('offerExtras', () => {
  it('додає доставку, повернення, стан і термін дії ціни', () => {
    const o = offerExtras('https://fixline.com.ua/product/x');
    expect(o.url).toBe('https://fixline.com.ua/product/x');
    expect(o.itemCondition).toBe('https://schema.org/NewCondition');
    expect(o.priceValidUntil).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(new Date(o.priceValidUntil).getTime()).toBeGreaterThan(Date.now());
    expect(o.shippingDetails.shippingDestination.addressCountry).toBe('UA');
    expect(o.hasMerchantReturnPolicy.merchantReturnDays).toBe(14);
    expect(o.seller['@id']).toBe(ORG_ID);
  });
});
