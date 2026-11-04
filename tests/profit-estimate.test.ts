import { describe, it, expect } from 'vitest';
import { estimateOrderProfit, summarizeDrift, DRIFT_PCT_OF_REVENUE, DRIFT_MIN_ORDERS, type LineEstimate } from '../lib/accounting/estimate-rules';
import { chunkByDistinctSku } from '../lib/marketplace/fees-rules';

const lines: LineEstimate[] = [
  { sku: 'A', qty: 2, price: 100, unitCost: 60, fee: 10 },
  { sku: 'B', qty: 1, price: 50,  unitCost: 20, fee: 2.5 },
];

describe('estimateOrderProfit — прогноз валового прибутку замовлення', () => {
  it('без факту: собівартість і комісія — оцінка, валовий = виручка − COGS − комісія', () => {
    const e = estimateOrderProfit(250, lines);
    expect(e.cogsSource).toBe('estimate');
    expect(e.feeSource).toBe('estimate');
    expect(e.cogs).toBe(140);
    expect(e.fee).toBe(12.5);
    expect(e.dealExtra).toBe(0);
    expect(e.gross).toBe(97.5);
    expect(e.estimated).toEqual({ cogs: 140, fee: 12.5, gross: 97.5 });
    expect(e.unknownCostSkus).toEqual([]);
  });

  it('факт із леджера має пріоритет над оцінкою, а чиста оцінка зберігається окремо для звірки', () => {
    const e = estimateOrderProfit(250, lines, { cogs: 151.3, fee: 9, dealExtra: 4.2 });
    expect(e.cogsSource).toBe('fact');
    expect(e.feeSource).toBe('fact');
    expect(e.cogs).toBe(151.3);
    expect(e.fee).toBe(9);
    expect(e.dealExtra).toBe(4.2);
    expect(e.gross).toBe(85.5);
    expect(e.estimated.gross).toBe(97.5);
  });

  it('частковий факт: є COGS, комісії ще немає — комісія береться з оцінки', () => {
    const e = estimateOrderProfit(250, lines, { cogs: 150, fee: null, dealExtra: 0 });
    expect(e.cogsSource).toBe('fact');
    expect(e.feeSource).toBe('estimate');
    expect(e.gross).toBe(250 - 150 - 12.5);
  });

  it('факт COGS = 0 (продаж сторновано поверненням) — це факт, а не відсутність факту', () => {
    const e = estimateOrderProfit(250, lines, { cogs: 0, fee: 0, dealExtra: 0 });
    expect(e.cogsSource).toBe('fact');
    expect(e.cogs).toBe(0);
    expect(e.gross).toBe(250);
  });

  it('SKU без закупівельної ціни потрапляє в unknownCostSkus, його собівартість у прогнозі = 0', () => {
    const e = estimateOrderProfit(300, [...lines, { sku: 'C', qty: 3, price: 10, unitCost: null, fee: 0 }, { sku: 'C', qty: 1, price: 10, unitCost: null, fee: 0 }]);
    expect(e.unknownCostSkus).toEqual(['C']);
    expect(e.cogs).toBe(140);
  });

  it('збір рівня замовлення (Smart, «Дешева доставка») додається до оцінки комісії, але не до рядків', () => {
    const e = estimateOrderProfit(250, lines, null, 30);
    expect(e.orderFee).toBe(30);
    expect(e.fee).toBe(42.5);
    expect(e.gross).toBe(250 - 140 - 42.5);
    expect(e.lines.reduce((s, l) => s + l.fee, 0)).toBe(12.5);
    // факт комісії перекриває і рядкову оцінку, і збір рівня замовлення
    const f = estimateOrderProfit(250, lines, { cogs: null, fee: 40, dealExtra: 0 }, 30);
    expect(f.fee).toBe(40);
    expect(f.estimated.fee).toBe(42.5);
  });

  it('порожнє замовлення: нулі й валовий = виручці', () => {
    const e = estimateOrderProfit(0, []);
    expect(e.gross).toBe(0);
    expect(e.lines).toEqual([]);
  });
});

describe('summarizeDrift — звірка прогнозу з фактом по вручених', () => {
  const row = (n: number, est: number, fact: number) => ({ orderNumber: n, revenue: 1000, estGross: est, factGross: fact });

  it('менше мінімуму замовлень — завжди ok (вибірка не показова)', () => {
    const rows = Array.from({ length: DRIFT_MIN_ORDERS - 1 }, (_, i) => row(i, 200, 100));
    const s = summarizeDrift(rows);
    expect(s.ok).toBe(true);
    expect(s.pct).toBe(100);
    expect(s.pctOfRevenue).toBe(10);
  });

  it('поріг — у % від виручки: 10 замовлень × 1000 ₴, 2 % = 200 ₴ сумарного розходження', () => {
    const base = Array.from({ length: 10 }, (_, i) => row(i, 100, 100));
    const limitDiff = 10 * 1000 * DRIFT_PCT_OF_REVENUE / 100;
    expect(summarizeDrift([...base.slice(0, 9), row(99, 100 + limitDiff - 1, 100)]).ok).toBe(true);
    expect(summarizeDrift([...base.slice(0, 9), row(99, 100 + limitDiff + 1, 100)]).ok).toBe(false);
  });

  it('тонкий валовий: 20 % похибки валового = 2 % виручки — рух цін, ще ok', () => {
    const s = summarizeDrift(Array.from({ length: 6 }, (_, i) => row(i, 120, 100)));
    expect(s.pct).toBe(20);
    expect(s.pctOfRevenue).toBe(2);
    expect(s.ok).toBe(true);
  });

  it('знак дрейфу: прогноз нижчий за факт — від’ємний відсоток, поріг працює в обидва боки', () => {
    const s = summarizeDrift(Array.from({ length: 6 }, (_, i) => row(i, 60, 100)));
    expect(s.pct).toBe(-40);
    expect(s.pctOfRevenue).toBe(-4);
    expect(s.ok).toBe(false);
  });

  it('складові сумуються окремо — видно, дрейфує закупівля чи ставки', () => {
    const s = summarizeDrift([
      { orderNumber: 1, revenue: 1000, estGross: 100, factGross: 90, estCogs: 800, factCogs: 805, estFee: 100, factFee: 105 },
      { orderNumber: 2, revenue: 1000, estGross: 100, factGross: 100, estCogs: 800, factCogs: 800, estFee: 100, factFee: 100 },
    ]);
    expect(s.cogs).toEqual({ est: 1600, fact: 1605 });
    expect(s.fee).toEqual({ est: 200, fact: 205 });
  });

  it('worst — найбільші розходження по модулю, зі знаком', () => {
    const s = summarizeDrift([row(1, 100, 100), row(2, 50, 100), row(3, 130, 100), row(4, 100, 101), row(5, 100, 100), row(6, 100, 100)], { worstN: 2 });
    expect(s.worst.map(w => w.orderNumber)).toEqual([2, 3]);
    expect(s.worst[0].diff).toBe(-50);
  });

  it('нульовий факт — pct null і ok (ділити нема на що)', () => {
    const s = summarizeDrift(Array.from({ length: 6 }, (_, i) => row(i, 10, 0)));
    expect(s.pct).toBeNull();
    expect(s.ok).toBe(true);
  });
});

describe('chunkByDistinctSku — пачки оцінювача комісій', () => {
  it('ріже за кількістю РІЗНИХ SKU, зберігаючи порядок позицій', () => {
    const items = ['a', 'a', 'b', 'c', 'c', 'd', 'e'].map((sku, i) => ({ sku, i }));
    const chunks = chunkByDistinctSku(items, 2);
    expect(chunks.map(c => c.map(x => x.sku))).toEqual([['a', 'a', 'b'], ['c', 'c', 'd'], ['e']]);
    expect(chunks.flat().map(x => x.i)).toEqual([0, 1, 2, 3, 4, 5, 6]);
  });

  it('порожній вхід — порожній результат; все вміщається — одна пачка', () => {
    expect(chunkByDistinctSku([])).toEqual([]);
    expect(chunkByDistinctSku([{ sku: 'x' }, { sku: 'y' }]).length).toBe(1);
  });
});
