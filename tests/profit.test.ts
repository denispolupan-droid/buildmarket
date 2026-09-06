import { describe, it, expect } from 'vitest';
import { classifyPLEntry, plContribution, summarizePL } from '../lib/accounting/profit-rules';

describe('classifyPLEntry — єдине визначення прибутку', () => {
  it('виручка, COGS, витрати угод', () => {
    expect(classifyPLEntry('revenue', 'sale')).toBe('revenue');
    expect(classifyPLEntry('cogs', 'cogs')).toBe('cogs');
    expect(classifyPLEntry('marketplace_fee', 'commission')).toBe('deal');
    expect(classifyPLEntry('acquiring_fee', 'acquiring_fee')).toBe('deal');
    expect(classifyPLEntry('logistics', 'np_fee')).toBe('deal');
    expect(classifyPLEntry('logistics', 'delivery_cost')).toBe('deal');
  });
  it('операційні витрати, податки, поза прибутком', () => {
    expect(classifyPLEntry('logistics', 'expense')).toBe('opex');
    expect(classifyPLEntry('opex', 'expense')).toBe('opex');
    expect(classifyPLEntry('taxes', 'expense')).toBe('taxes');
    expect(classifyPLEntry('correction', 'correction')).toBe('correction');
    expect(classifyPLEntry('correction', 'cash_out')).toBe('opex');   // РКО з каси
    expect(classifyPLEntry('owner', 'owner_draw')).toBe('other');
    expect(classifyPLEntry('bank', 'payment')).toBe('other');
  });
});

describe('summarizePL — валовий і чистий', () => {
  const rows = [
    { account_type: 'revenue', doc_type: 'sale', amount: -1000 },
    { account_type: 'cogs', doc_type: 'cogs', amount: 600 },
    { account_type: 'marketplace_fee', doc_type: 'commission', amount: 50 },
    { account_type: 'logistics', doc_type: 'np_fee', amount: 5 },
    { account_type: 'acquiring_fee', doc_type: 'acquiring_fee', amount: 3 },
    { account_type: 'opex', doc_type: 'expense', amount: 100 },
    { account_type: 'logistics', doc_type: 'expense', amount: 20 },
    { account_type: 'taxes', doc_type: 'expense', amount: 30 },
    { account_type: 'correction', doc_type: 'correction', amount: 77 },
    { account_type: 'owner', doc_type: 'owner_draw', amount: 500 },
  ];
  it('рахує всі рівні', () => {
    const s = summarizePL(rows);
    expect(s.revenue).toBe(1000);
    expect(s.cogs).toBe(600);
    expect(s.deal).toEqual({ marketplaceFee: 50, npDelivery: 5, acquiringFee: 3, total: 58 });
    expect(s.grossProfit).toBe(342);
    expect(s.opex).toEqual({ byAccount: { opex: 100, logistics: 20 }, total: 120 });
    expect(s.taxes).toBe(30);
    expect(s.netProfit).toBe(192);
    expect(s.corrections).toBe(77);   // довідково, не в прибутку
  });
  it('plContribution: знак відносно прибутку', () => {
    expect(plContribution('revenue', 'sale', -100).delta).toBe(100);
    expect(plContribution('cogs', 'cogs', 60).delta).toBe(-60);
    expect(plContribution('owner', 'owner_draw', 500).delta).toBe(0);
    expect(plContribution('correction', 'cash_out', -40).delta).toBe(-40);
  });
});
