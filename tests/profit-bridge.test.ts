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

  it('розшифровка кожного рядка в сумі дорівнює рядку', () => {
    const withNums = buildProfitBridge({
      cohort, entries: entries.map(x => ({ ...x, cat: x.orderId === 'X' ? 'Rozetka Доставка: організація видачі' : x.orderId ? x.cat : 'Абонплата Rozetka' })),
      others: [{ id: 'D', group: 'earlier' }, { id: 'X', group: 'cancelled' }],
      orderNumbers: new Map([['A', 1], ['B', 2], ['C', 3], ['D', 4], ['X', 5]]),
    });
    for (const side of [withNums.revenue, withNums.profit]) {
      for (const l of side.lines) {
        if (!l.details?.length) continue;
        expect(Math.round(l.details.reduce((s, d) => s + d.amount, 0) * 100) / 100, `${l.key}`).toBe(l.amount);
      }
    }
    const diff = withNums.revenue.lines.find(l => l.key === 'diff')!;
    expect(diff.details).toEqual([{ label: '№2', amount: -50, sub: 'сума замовлення 500 → проведено 450' }]);
    const canc = withNums.profit.lines.find(l => l.key === 'cancelled')!;
    expect(canc.details).toEqual([{ label: 'Rozetka Доставка: організація видачі', amount: -35, sub: '1 замовл.: №5' }]);
  });

  it('категорії проводок для розшифровки', async () => {
    const { entryCategory } = await import('../lib/accounting/profit-bridge-rules');
    expect(entryCategory('marketplace_fee', 'subscription_fee', 'Rozetka — абонплата за 2026-07', 'rz_subscription')).toBe('Абонплата Rozetka');
    expect(entryCategory('marketplace_fee', 'commission', 'Винагорода RozetkaPay за переказ (операції 2026-11-05)', null)).toBe('Винагорода RozetkaPay');
    expect(entryCategory('acquiring_fee', 'acquiring_fee', 'Комісія банку за еквайринг (1.25%)', null)).toBe('Еквайринг Monobank');
    expect(entryCategory('marketplace_fee', 'commission', 'Rozetka Доставка — організація видачі відправлення (замовлення #26101209)', null)).toBe('Rozetka Доставка: організація видачі');
    // борг за рахунками НП і сторно задвоєної суми — одна категорія (разом 381 − 230 = 151)
    expect(entryCategory('logistics', 'delivery_cost', 'Борг Нова Пошта за договором 1082738 на 19.10.2026', null)).toBe('Нова Пошта: рахунки-фактури за договором (і їх сторно)');
    expect(entryCategory('logistics', 'delivery_cost', 'Сторно: доставка НП за наш рахунок 09.08/11.08 (230) уже сплачена й проведена витратою в рахунках-фактурах НП серпня', null)).toBe('Нова Пошта: рахунки-фактури за договором (і їх сторно)');
  });

  it('opex і податки у валовий не входять (entryEffect → null)', () => {
    expect(entryEffect('opex', null, 100)).toBeNull();
    expect(entryEffect('taxes', null, 100)).toBeNull();
    expect(entryEffect('logistics', 'np_fee', 10)).toEqual({ rev: 0, profit: -10 });
    expect(entryEffect('logistics', 'landed_cost', 10)).toBeNull();
  });
});
