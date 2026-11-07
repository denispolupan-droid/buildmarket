import { describe, it, expect } from 'vitest';
import { allocateRegisterFees, allocateProportional, capToLedger, rzPayRate } from '../lib/deal-costs-rules';
import { estimateOrderProfit, type LineEstimate } from '../lib/accounting/estimate-rules';

const sum = (a: { amount: number }[]) => Math.round(a.reduce((s, x) => s + x.amount, 0) * 100) / 100;

describe('allocateRegisterFees — точна комісія RozetkaPay з реєстру', () => {
  it('реєстр 18.08.2026: 4 платежі, комісії 12 + 6 + 14,85 + 5,15 = 38 (= брутто − нетто)', () => {
    const a = allocateRegisterFees([
      { orderId: 'o1', fee: 12, gross: 800, marketplaceOrderId: '1', kind: 'payment' },
      { orderId: 'o2', fee: 6, gross: 400, marketplaceOrderId: '2', kind: 'payment' },
      { orderId: 'o3', fee: 14.85, gross: 990, marketplaceOrderId: '3', kind: 'payment' },
      { orderId: 'o4', fee: 5.15, gross: 303, marketplaceOrderId: '4', kind: 'payment' },
    ]);
    expect(a).toHaveLength(4);
    expect(sum(a)).toBe(38);
  });

  it('повернення в тому ж переказі знімає комісію (реєстр 02.09.2026: 428,19 − 2 × 130,20 = 167,79 = проведеній)', () => {
    const a = allocateRegisterFees([
      { orderId: 'big', fee: 130.2, gross: 8680, marketplaceOrderId: '904872023', kind: 'payment' },
      { orderId: 'big', fee: 130.2, gross: -8680, marketplaceOrderId: '904872023', kind: 'refund' },
      { orderId: 'o2', fee: 167.79, gross: 11034, marketplaceOrderId: 'rest', kind: 'payment' },
    ]);
    expect(a.map(x => x.orderId)).toEqual(['o2']);   // нуль по замовленню — рядка немає
    expect(sum(a)).toBe(167.79);
  });

  it('повернення за платіж із попереднього переказу — від’ємна частка (12.10.2026: 80,80 − 2 × 7,05 = 66,70)', () => {
    const a = allocateRegisterFees([
      { orderId: 'ref', fee: 7.05, gross: -470, marketplaceOrderId: '908242434', kind: 'refund' },
      { orderId: 'o1', fee: 73.75, gross: 4915, marketplaceOrderId: 'rest', kind: 'payment' },
    ]);
    expect(a.find(x => x.orderId === 'ref')!.amount).toBe(-7.05);
    expect(sum(a)).toBe(66.7);
  });
});

describe('allocateProportional — ранні виплати без реєстру', () => {
  it('ділить пропорційно сумам, Σ рівно дорівнює проведеній винагороді (копійки — найбільшій частці)', () => {
    const a = allocateProportional(10, [{ orderId: 'a', weight: 1 }, { orderId: 'b', weight: 1 }, { orderId: 'c', weight: 1 }]);
    expect(sum(a)).toBe(10);
    expect(a.map(x => x.amount).sort()).toEqual([3.33, 3.33, 3.34]);
  });

  it('нульові/від’ємні ваги ігноруються; без ваг або без суми — порожньо', () => {
    expect(allocateProportional(5, [{ orderId: 'a', weight: 0 }, { orderId: 'b', weight: -3 }])).toEqual([]);
    expect(allocateProportional(0, [{ orderId: 'a', weight: 100 }])).toEqual([]);
    const one = allocateProportional(5, [{ orderId: 'a', weight: 100 }, { orderId: 'b', weight: -1 }]);
    expect(one).toEqual([{ orderId: 'a', amount: 5, meta: { rows: [{ id: '', gross: 100, fee: 5 }] } }]);
  });
});

describe('capToLedger — розбивка не більша за проведену суму', () => {
  const allocs = [
    { orderId: 'a', amount: 6, meta: { rows: [] } },
    { orderId: 'b', amount: 4, meta: { rows: [] } },
  ];
  it('у межах проведеної — без змін', () => {
    expect(capToLedger(allocs, 10)).toEqual({ allocs, capped: false });
    expect(capToLedger(allocs, 12).capped).toBe(false);   // решта 2 ₴ лишається «без замовлення»
  });
  it('аварійний шлях ділить лише між додатними частками', () => {
    const r = capToLedger([...allocs, { orderId: 'neg', amount: -1, meta: { rows: [] } }, { orderId: 'c', amount: 5, meta: { rows: [] } }], 7);
    expect(r.capped).toBe(true);
    expect(r.allocs.some(x => x.orderId === 'neg')).toBe(false);
    expect(sum(r.allocs)).toBe(7);
  });

  it('більша — ділиться проведена сума пропорційно, meta зберігається', () => {
    const r = capToLedger(allocs, 5);
    expect(r.capped).toBe(true);
    expect(sum(r.allocs)).toBe(5);
    expect(r.allocs.find(x => x.orderId === 'a')!.amount).toBe(3);
  });
});

describe('rzPayRate — середня ставка для прогнозу', () => {
  it('Σ винагород / Σ брутто; замало даних — null', () => {
    expect(rzPayRate([{ fee: 123.87, gross: 7363 }, { fee: 18.33, gross: 1149 }])).toBeCloseTo(0.01671, 5);
    expect(rzPayRate([{ fee: 5, gross: 300 }])).toBeNull();
  });
});

describe('estimateOrderProfit — винагорода RozetkaPay у прибутку замовлення', () => {
  const lines: LineEstimate[] = [{ sku: 'A', qty: 1, price: 1000, unitCost: 700, fee: 50 }];
  it('факт з розбивки віднімається від валового, але не від чистої оцінки (звірка дрейфу)', () => {
    const e = estimateOrderProfit(1000, lines, { revenue: 1000, cogs: 700, fee: 50, dealExtra: 0 }, 0, { amount: 16.5, source: 'fact' });
    expect(e.paymentFee).toBe(16.5);
    expect(e.paymentFeeSource).toBe('fact');
    expect(e.gross).toBe(233.5);
    expect(e.estimated.gross).toBe(250);
  });
  it('оцінка для ще не виплаченого; без винагороди — 0 і source null', () => {
    expect(estimateOrderProfit(1000, lines, null, 0, { amount: 16, source: 'estimate' }).paymentFeeSource).toBe('estimate');
    const none = estimateOrderProfit(1000, lines);
    expect(none.paymentFee).toBe(0);
    expect(none.paymentFeeSource).toBeNull();
    expect(none.gross).toBe(250);
  });
});
