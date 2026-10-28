import { describe, it, expect } from 'vitest';
import { normalizeBrandDiscounts } from '../lib/supplier-brand-discounts';

describe('normalizeBrandDiscounts', () => {
  it('зводить рядки форми до чисел і null, не тягне id', () => {
    const r = normalizeBrandDiscounts([
      { id: 7, supplier_id: 1, brand: 'Aura', discount_pct: '10', markup_retail: '', markup_wholesale: '2,5', markup_drop: null, keep_price: false },
    ]);
    expect(r).toEqual({
      ok: true,
      rows: [{ brand: 'Aura', discount_pct: 10, markup_retail: null, markup_wholesale: 2.5, markup_drop: null, keep_price: false }],
    });
  });

  it('порожній список і null — нуль рядків', () => {
    expect(normalizeBrandDiscounts(null)).toEqual({ ok: true, rows: [] });
    expect(normalizeBrandDiscounts([])).toEqual({ ok: true, rows: [] });
  });

  it('рядок без бренду — помилка, нічого не повертає', () => {
    const r = normalizeBrandDiscounts([{ brand: '', discount_pct: 5 }]);
    expect(r.ok).toBe(false);
  });

  it('дубль бренду — помилка', () => {
    const r = normalizeBrandDiscounts([{ brand: 'Aura', discount_pct: 5 }, { brand: 'Aura', discount_pct: 7 }]);
    expect(r.ok).toBe(false);
  });

  it('не число в націнці — помилка з назвою бренду', () => {
    const r = normalizeBrandDiscounts([{ brand: 'Pattex', discount_pct: 5, markup_retail: 'abc' }]);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain('Pattex');
  });

  it('знижка поза 0..99.99 — помилка; порожня знижка = 0', () => {
    expect(normalizeBrandDiscounts([{ brand: 'A', discount_pct: 100 }]).ok).toBe(false);
    expect(normalizeBrandDiscounts([{ brand: 'A', discount_pct: -1 }]).ok).toBe(false);
    const r = normalizeBrandDiscounts([{ brand: 'A', discount_pct: '' }]);
    expect(r.ok && r.rows[0].discount_pct).toBe(0);
  });

  it('keep_price лише з явного true', () => {
    const r = normalizeBrandDiscounts([{ brand: 'A', discount_pct: 1, keep_price: 'true' }, { brand: 'B', discount_pct: 1, keep_price: true }]);
    expect(r.ok && r.rows.map(x => x.keep_price)).toEqual([false, true]);
  });
});
