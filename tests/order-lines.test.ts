import { describe, it, expect } from 'vitest';
import { normalizeLines, linesTotal, newOrderLines } from '../lib/orders/lines';

describe('normalizeLines — правила на позиції замовлення (етап C)', () => {
  it('приводить числа, округлює ціну до копійок, рахує підсумок з рядків', () => {
    const r = normalizeLines([
      { sku: ' A ', name: 'Товар', brand: 'B', qty: '2', price: '10,005' },
      { sku: 'C', qty: 1.5, price: 3, cost_price: 2, volume: '1л' },
    ]);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.lines[0]).toMatchObject({ sku: 'A', qty: 2, price: 10.01, is_promo: false, is_bonus: false });
    expect(r.lines[1]).toMatchObject({ sku: 'C', qty: 1.5, price: 3, cost_price: 2, volume: '1л', name: '', brand: '' });
    expect(r.total).toBe(24.52);
  });

  it('вільна позиція без sku допустима (рішення власника 31.10), бонусний рядок за 0 — теж', () => {
    const r = normalizeLines([{ sku: '', name: 'Доставка', qty: 1, price: 0, is_bonus: true }]);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.lines[0]).toMatchObject({ sku: '', is_bonus: true, price: 0 });
  });

  it('відмовляє: порожній масив, не обʼєкт, qty ≤ 0, ціна < 0, крива базова ціна', () => {
    expect(normalizeLines([])).toMatchObject({ ok: false });
    expect(normalizeLines('x')).toMatchObject({ ok: false });
    expect(normalizeLines([1])).toMatchObject({ ok: false, error: expect.stringContaining('не обʼєкт') });
    expect(normalizeLines([{ sku: 'A', qty: 0, price: 1 }])).toMatchObject({ ok: false, error: expect.stringContaining('більшою за нуль') });
    expect(normalizeLines([{ sku: 'A', qty: 1, price: -1 }])).toMatchObject({ ok: false, error: expect.stringContaining('ціна') });
    expect(normalizeLines([{ sku: 'A', qty: 1, price: 1, price_base: 'abc' }])).toMatchObject({ ok: false, error: expect.stringContaining('базова') });
  });

  it('price_base зберігається, якщо є; null/порожнє — відкидається', () => {
    const r = normalizeLines([{ sku: 'A', qty: 1, price: 90, price_base: '100' }, { sku: 'B', qty: 1, price: 5, price_base: null }]);
    expect(r.ok && r.lines[0].price_base).toBe(100);
    expect(r.ok && 'price_base' in r.lines[1]).toBe(false);
  });
});

describe('linesTotal / newOrderLines', () => {
  it('копійки накопичуються по рядках (0.1×3 не дає хвоста)', () => {
    expect(linesTotal([{ qty: 3, price: 0.1 }, { qty: 1, price: 0.2 }])).toBe(0.5);
    expect(linesTotal([])).toBe(0);
  });
  it('newOrderLines віддає items і total_price для insert', () => {
    const p = newOrderLines([{ sku: 'A', qty: 2, price: 10 }, { sku: 'B', qty: 1, price: 0.5 }]);
    expect(p.total_price).toBe(20.5);
    expect(Array.isArray(p.items)).toBe(true);
  });
});
