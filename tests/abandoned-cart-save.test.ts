import { describe, it, expect } from 'vitest';
import { cartSkus, normalizeCartItems, type CatalogRow } from '../lib/abandoned-cart-save';
import { buildAbandonedCartEmail } from '../lib/abandoned-cart-email';
import { cronAuthorized } from '../lib/cron-auth';

const catalog = new Map<string, CatalogRow>([
  ['1205-021', { sku: '1205-021', name: 'Шпатлівка Siltek Acril Finish 15 кг', brand: 'Siltek', volume: '15 кг', name_ru: null }],
  ['1603-016', { sku: '1603-016', name: 'Клей', brand: 'Ceresit', volume: null }],
]);

const good = {
  sku: '1205-021', name: '<b>фейк</b>', brand: 'x', volume: 'y', price: 1050, qty: 2, min_order: 1,
  nl1: 'Шпатлівка', nl2: 'Siltek', bc: '#fff', ac: '#000', img_type: 'canister', imageUrl: '/img/products/a.webp',
};

describe('normalizeCartItems — кошик для нагадувань (03.10.2026)', () => {
  it('назва/бренд/фасування беруться з каталогу, структура CartItem зберігається для відновлення', () => {
    const r = normalizeCartItems([good], catalog);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.items[0]).toMatchObject({
      sku: '1205-021', name: 'Шпатлівка Siltek Acril Finish 15 кг', brand: 'Siltek', volume: '15 кг',
      price: 1050, qty: 2, nl1: 'Шпатлівка', bc: '#fff', img_type: 'canister', imageUrl: '/img/products/a.webp',
    });
    expect(r.total).toBe(2100);
  });

  it('невідомий SKU — відмова цілком, а не тихе збереження чужого тексту', () => {
    expect(normalizeCartItems([{ ...good, sku: 'HACK-001' }], catalog)).toEqual({ ok: false, reason: 'unknown_sku' });
  });

  it('сміття в числах і зайві поля відкидаються', () => {
    const r = normalizeCartItems([
      { ...good, qty: -1 },
      { ...good, sku: '1603-016', qty: '3', price: '10.5', evil: 'x', imageUrl: 'javascript:alert(1)' },
    ], catalog);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.items).toHaveLength(1);
    expect(r.items[0].qty).toBe(3);
    expect(r.items[0].price).toBe(10.5);
    expect('evil' in r.items[0]).toBe(false);
    expect('imageUrl' in r.items[0]).toBe(false);
  });

  it('порожньо / не масив — empty', () => {
    expect(normalizeCartItems([], catalog)).toEqual({ ok: false, reason: 'empty' });
    expect(normalizeCartItems('x', catalog)).toEqual({ ok: false, reason: 'empty' });
    expect(cartSkus(null)).toEqual([]);
    expect(cartSkus([{ sku: 'a' }, { sku: 'a' }, { sku: 5 }])).toEqual(['a']);
  });
});

describe('buildAbandonedCartEmail — екранування', () => {
  it('HTML у назві стає текстом, числа лишаються числами', () => {
    const html = buildAbandonedCartEmail({
      items: [{ name: '<img src=x onerror=alert(1)>', brand: 'A&B', qty: 1, price: 10, volume: '"5" кг' }],
      totalPrice: 10, restoreUrl: 'https://fixline.com.ua/cart?restore=t', reminderStep: 1,
    });
    expect(html).not.toContain('<img src=x');
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;');
    expect(html).toContain('A&amp;B');
    expect(html).toContain('&quot;5&quot; кг');
    expect(html).toContain('Разом: 10&nbsp;₴');
  });
});

describe('cronAuthorized — закрито без секрету', () => {
  const saved = process.env.CRON_SECRET;
  it('без CRON_SECRET не пускає нікого, навіть «Bearer undefined»', () => {
    delete process.env.CRON_SECRET;
    expect(cronAuthorized('Bearer undefined')).toBe(false);
    expect(cronAuthorized(null)).toBe(false);
  });
  it('із секретом — лише точний збіг', () => {
    process.env.CRON_SECRET = 'abc123';
    expect(cronAuthorized('Bearer abc123')).toBe(true);
    expect(cronAuthorized('Bearer abc124')).toBe(false);
    expect(cronAuthorized('Bearer abc12')).toBe(false);
    expect(cronAuthorized('abc123')).toBe(false);
    if (saved === undefined) delete process.env.CRON_SECRET; else process.env.CRON_SECRET = saved;
  });
});
