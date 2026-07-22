import { describe, it, expect } from 'vitest';
import {
  selectBracketBasePct,
  computeRozetkaCommissionCore,
  ROZETKA_FEE_MULTIPLIER,
  type RozetkaBracket,
  type ResolvedRozetkaItem,
} from '../lib/rozetka-commission';

// «Інтер'єр та оздоблення» — реальная лестница Rozetka
const INTERIOR: RozetkaBracket[] = [
  { price_from: 0,      base_pct: 15 },
  { price_from: 2000,   base_pct: 10 },
  { price_from: 5000,   base_pct: 7 },
  { price_from: 20000,  base_pct: 5 },
  { price_from: 100000, base_pct: 3 },
];

describe('selectBracketBasePct — выбор бакета по цене', () => {
  it('берёт наибольший price_from ≤ цены', () => {
    expect(selectBracketBasePct(INTERIOR, 545)).toBe(15);
    expect(selectBracketBasePct(INTERIOR, 2355)).toBe(10);
    expect(selectBracketBasePct(INTERIOR, 7000)).toBe(7);
    expect(selectBracketBasePct(INTERIOR, 250000)).toBe(3);
  });

  it('нижняя граница включительно', () => {
    expect(selectBracketBasePct(INTERIOR, 2000)).toBe(10);
    expect(selectBracketBasePct(INTERIOR, 1999)).toBe(15);
    expect(selectBracketBasePct(INTERIOR, 5000)).toBe(7);
  });

  it('порядок строк не важен (не полагаемся на сортировку)', () => {
    const shuffled = [...INTERIOR].reverse();
    expect(selectBracketBasePct(shuffled, 2355)).toBe(10);
  });

  it('цена ниже всех порогов → null', () => {
    const noBase: RozetkaBracket[] = [{ price_from: 2000, base_pct: 15 }];
    expect(selectBracketBasePct(noBase, 500)).toBeNull();
  });

  it('пустой список → null', () => {
    expect(selectBracketBasePct([], 100)).toBeNull();
  });
});

describe('computeRozetkaCommissionCore — расчёт комиссии', () => {
  const mk = (o: Partial<ResolvedRozetkaItem>): ResolvedRozetkaItem => ({
    sku: 'X', qty: 1, price: 100, brackets: null, flatPct: null, category_slug: null, ...o,
  });

  it('эффективная ставка = база × 1.08 (комиссия+сбор)', () => {
    const r = computeRozetkaCommissionCore([mk({ price: 1345, brackets: INTERIOR })], 15);
    expect(r.items[0].commission_pct).toBe(16.2);          // 15 × 1.08
    expect(r.items[0].commission_amt).toBe(217.89);         // 1345 × 16.2%
    expect(r.total_commission).toBe(217.89);
    expect(r.net_revenue).toBe(1127.11);                   // 1345 − 217.89
  });

  it('дороже товар → ниже %: одна категория, разные цены', () => {
    const cheap = computeRozetkaCommissionCore([mk({ price: 545, brackets: INTERIOR })], 15);
    const dear  = computeRozetkaCommissionCore([mk({ price: 2355, brackets: INTERIOR })], 15);
    expect(cheap.items[0].commission_pct).toBe(16.2);       // 15% тир
    expect(dear.items[0].commission_pct).toBe(10.8);        // 10% тир
    expect(dear.items[0].commission_amt).toBe(254.34);      // 2355 × 10.8%
  });

  it('база 18 → 19.44 (Будівельні матеріали, дешёвый тир)', () => {
    const bm: RozetkaBracket[] = [{ price_from: 0, base_pct: 18 }, { price_from: 2000, base_pct: 15 }];
    const r = computeRozetkaCommissionCore([mk({ price: 285, brackets: bm })], 15);
    expect(r.items[0].commission_pct).toBe(19.44);
  });

  it('qty > 1: комиссия от полной суммы позиции', () => {
    const r = computeRozetkaCommissionCore([mk({ price: 1000, qty: 3, brackets: INTERIOR })], 15);
    expect(r.items[0].item_total).toBe(3000);
    // цена за единицу 1000 → тир 15% (16.2); 3000 × 16.2% = 486
    expect(r.items[0].commission_pct).toBe(16.2);
    expect(r.items[0].commission_amt).toBe(486);
  });

  it('нет бакета → fallback на плоскую ставку категории', () => {
    const r = computeRozetkaCommissionCore([mk({ price: 500, brackets: null, flatPct: 12.5 })], 15);
    expect(r.items[0].commission_pct).toBe(12.5);
    expect(r.items[0].commission_amt).toBe(62.5);
  });

  it('нет бакета и нет плоской ставки → fallbackPct', () => {
    const r = computeRozetkaCommissionCore([mk({ price: 500, brackets: null, flatPct: null })], 15);
    expect(r.items[0].commission_pct).toBe(15);
  });

  it('цена ниже всех бакетов, но есть плоская ставка → плоская', () => {
    const noBase: RozetkaBracket[] = [{ price_from: 2000, base_pct: 15 }];
    const r = computeRozetkaCommissionCore([mk({ price: 500, brackets: noBase, flatPct: 19.44 })], 15);
    expect(r.items[0].commission_pct).toBe(19.44);          // бакета нет для 500 → плоская
  });

  it('несколько позиций: суммирование', () => {
    const r = computeRozetkaCommissionCore([
      mk({ sku: 'A', price: 1000, brackets: INTERIOR }),   // 16.2% → 162
      mk({ sku: 'B', price: 3000, brackets: INTERIOR }),   // 10.8% → 324
    ], 15);
    expect(r.total_commission).toBe(162 + 324);
    expect(r.net_revenue).toBe(4000 - 486);
  });

  it('множитель сбора зафиксирован', () => {
    expect(ROZETKA_FEE_MULTIPLIER).toBe(1.08);
  });
});
