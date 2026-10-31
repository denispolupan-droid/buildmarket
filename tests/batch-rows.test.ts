import { describe, it, expect } from 'vitest';
import { groupByColumnSet } from '../lib/batch-rows';

describe('groupByColumnSet', () => {
  it('рядки з різним набором колонок — у різних групах (відсутнє поле не стане NULL)', () => {
    const rows = [
      { sku: 'A', stock_qty: 1, price_cost: 10 },
      { sku: 'B', stock_qty: 2 },                 // захищена собівартість
      { stock_qty: 3, sku: 'C', price_cost: 5 },  // порядок ключів не важливий
    ];
    const g = groupByColumnSet(rows);
    expect(g).toHaveLength(2);
    expect(g[0].map(r => r.sku)).toEqual(['A', 'C']);
    expect(g[1].map(r => r.sku)).toEqual(['B']);
  });
  it('null — це значення, а не відсутність', () => {
    expect(groupByColumnSet([{ a: 1, b: null }, { a: 2, b: 3 }])).toHaveLength(1);
  });
});
