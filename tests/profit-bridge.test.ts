import { describe, it, expect } from 'vitest';
import { buildProfitBridge, entryEffect, type BridgeEntry } from '../lib/accounting/profit-bridge-rules';

const e = (orderId: string | null, inPeriod: boolean, acc: string, amount: number, doc: string | null = null): BridgeEntry => ({ orderId, inPeriod, ...entryEffect(acc, doc, amount)! });

describe('buildProfitBridge — замовлення періоду → факт обліку', () => {
  // A — вручене в періоді; B — вручене, але частина проводок у наступному періоді;
  // C — у дорозі (збір видачі вже списано); D — створене раніше, вручене в періоді;
  // X — скасоване (збір видачі); без замовлення — абонплата
  const cohort = [
    { id: 'A', status: 'delivered', total: 1000, hasFact: true, estGross: 1000 - 700 - 50 - 15 },
    { id: 'B', status: 'delivered', total: 500,  hasFact: true, estGross: 500 - 300 - 20 },
    { id: 'C', status: 'shipped',   total: 800,  hasFact: false, estGross: 150 },
  ];
  const entries: BridgeEntry[] = [
    e('A', true, 'revenue', -1000), e('A', true, 'cogs', 700), e('A', true, 'marketplace_fee', 50),
    e('A', true, 'marketplace_fee', 15),                                // винагорода RozetkaPay, рознесена
    e('B', true, 'revenue', -450), e('B', true, 'cogs', 300),           // частковий повернення: виручка 450
    e('B', false, 'marketplace_fee', 20),                               // комісія вже наступного періоду
    e('C', true, 'marketplace_fee', 35),
    e('D', true, 'revenue', -300), e('D', true, 'cogs', 200),
    e('X', true, 'marketplace_fee', 35),
    e(null, true, 'marketplace_fee', 120),                              // абонплата
    e(null, true, 'opex', 999),                                         // операційні — у валовий не входять
  ].filter(x => x.rev !== undefined);
  const b = buildProfitBridge({ cohort, entries, others: [{ id: 'D', group: 'earlier' }, { id: 'X', group: 'cancelled' }] });

  it('виручка: сума замовлень → факт, нерозкладено 0', () => {
    expect(b.revenue.start).toBe(2300);
    expect(b.revenue.fact).toBe(1750);   // 1000 + 450 + 300
    expect(b.revenue.unexplained).toBe(0);
    const l = Object.fromEntries(b.revenue.lines.map(x => [x.key, x.amount]));
    expect(l.open).toBe(-800);
    expect(l.diff).toBe(-50);
    expect(l.earlier).toBe(300);
  });

  it('прибуток: вручені → факт, кожна різниця окремим рядком, нерозкладено 0', () => {
    expect(b.profit.start).toBe(235 + 180);
    // факт: A 235 + B (450−300) + C −35 + D 100 + X −35 + абонплата −120
    expect(b.profit.fact).toBe(235 + 150 - 35 + 100 - 35 - 120);
    expect(b.profit.unexplained).toBe(0);
    const l = Object.fromEntries(b.profit.lines.map(x => [x.key, x.amount]));
    expect(l.est).toBe(-50);       // B: прогноз брав суму 500, факт виручки 450
    expect(l.out).toBe(20);        // комісія B поза періодом — повертаємо
    expect(l.earlier).toBe(100);
    expect(l.open).toBe(-35);
    expect(l.cancelled).toBe(-35);
    expect(l.none).toBe(-120);
  });

  it('opex і податки у валовий не входять (entryEffect → null)', () => {
    expect(entryEffect('opex', null, 100)).toBeNull();
    expect(entryEffect('taxes', null, 100)).toBeNull();
    expect(entryEffect('logistics', 'np_fee', 10)).toEqual({ rev: 0, profit: -10 });
    expect(entryEffect('logistics', 'landed_cost', 10)).toBeNull();
  });
});
