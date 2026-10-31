import { describe, it, expect } from 'vitest';
import { markupForPriceChange, rozetkaPrice, promPrice } from '../lib/marketplace-pricing';
import { normalizeMpItems, mpRevertItems, mpDriftedSkus, isMpTarget, type MpSnapshotRow } from '../lib/mp-reprice';

describe('markupForPriceChange — націнка під зміну ціни МП', () => {
  it('+5 % до ціни: 10,5 → 16,03; 12 → 17,6 (Lacrysil, Rozetka)', () => {
    expect(markupForPriceChange(10.5, 5)).toBe(16.03);
    expect(markupForPriceChange(12, 5)).toBe(17.6);
  });

  it('від категорійної/нульової націнки: 0 → 5', () => {
    expect(markupForPriceChange(0, 5)).toBe(5);
  });

  it('зниження: −5 % повертає майже туди, звідки піднялись', () => {
    const up = markupForPriceChange(17.9, 5);
    expect(markupForPriceChange(up, -100 * (1 - 1 / 1.05))).toBeCloseTo(17.9, 1);
  });

  it('ціна Prom від нової націнки росте на ~5 % (до округлення вгору на 1 грн)', () => {
    const base = { cost: 497.3, retail: 547, categoryMarkupPct: null, commissionPct: 11.66 };
    const before = promPrice({ ...base, productMarkupPct: 12 });            // 631
    const after  = promPrice({ ...base, productMarkupPct: markupForPriceChange(12, 5) });
    expect(after / before).toBeGreaterThan(1.049);
    expect(after / before).toBeLessThan(1.053);
  });

  it('ціна Rozetka: округлення до 5 грн дає ~5 %, не рівно', () => {
    const base = { cost: 497.3, retail: 547, categoryMarkupPct: 0, commissionPct: 10.8 };
    const before = rozetkaPrice({ ...base, productMarkupPct: 10 });        // 615
    const after  = rozetkaPrice({ ...base, productMarkupPct: markupForPriceChange(10, 5) });
    expect(after).toBeGreaterThan(before);
    expect(Math.abs(after / before - 1.05)).toBeLessThan(0.01);
  });
});

describe('normalizeMpItems', () => {
  it('приймає числа і null, відкидає сміття, не чіпає відсутні поля', () => {
    const { items, errors } = normalizeMpItems([
      { sku: 'A', rozetka_markup_pct: 16.034 },
      { sku: 'B', prom_markup_pct: null },
      { sku: 'C', rozetka_markup_pct: 'x' },
      { sku: '', prom_markup_pct: 1 },
      { sku: 'D' },
    ]);
    expect(items).toEqual([
      { sku: 'A', rozetka_markup_pct: 16.03 },
      { sku: 'B', prom_markup_pct: null },
    ]);
    expect(errors).toHaveLength(2);
  });
});

const SNAP: MpSnapshotRow[] = [
  { sku: 'A', name: 'a', before: { rz_markup: 10.5, rz_price: 615 }, after: { rz_markup: 16.03, rz_price: 645 } },
  { sku: 'B', name: 'b', before: { rz_markup: null, rz_price: 500, prom_markup: 17.9, prom_price: 700 }, after: { rz_markup: 5, rz_price: 525, prom_markup: 23.8, prom_price: 735 } },
];

describe('mpRevertItems — відкат повертає націнки «до» лише в зачеплених каналах', () => {
  it('Rozetka-only знімок не чіпає Prom; null повертає категорійну націнку', () => {
    expect(mpRevertItems(SNAP)).toEqual([
      { sku: 'A', rozetka_markup_pct: 10.5 },
      { sku: 'B', rozetka_markup_pct: null, prom_markup_pct: 17.9 },
    ]);
  });
});

describe('mpDriftedSkus — хто змінився після переоцінки', () => {
  it('збіг з «після» — не дрейф; інше значення або знята націнка — дрейф', () => {
    const current = new Map([
      ['A', { rozetka_markup_pct: 16.03, prom_markup_pct: 99 }],   // prom не в знімку → ігнор
      ['B', { rozetka_markup_pct: 5, prom_markup_pct: 25 }],       // prom 23.8 → 25: дрейф
    ]);
    expect(mpDriftedSkus(SNAP, current)).toEqual(['B']);
  });
});

describe('isMpTarget', () => {
  it('rozetka/prom/mp — так, retail/all — ні', () => {
    expect(isMpTarget('rozetka')).toBe(true);
    expect(isMpTarget('mp')).toBe(true);
    expect(isMpTarget('retail')).toBe(false);
    expect(isMpTarget(null)).toBe(false);
  });
});
