import { describe, it, expect, vi } from 'vitest';

vi.mock('../lib/supabase', () => ({ createServiceClient: () => ({}) }));

import { orderGoodsAmount } from '../lib/accounting/reconcile-sale-docs';

describe('orderGoodsAmount — товарна сума замовлення так, як її бачить РН', () => {
  it('дропшип: за дроп-ціною партнера, а не за ціною його покупця (#26101112, 22.10.2026)', () => {
    expect(orderGoodsAmount('dropship', [{ sku: '1505-005', qty: 1, price: 879, cost_price: 674.5 }])).toBe(674.5);
  });
  it('дропшип без дроп-ціни — за ціною рядка, як і в накладній', () => {
    expect(orderGoodsAmount('dropship', [{ qty: 2, price: 382 }])).toBe(764);
  });
  it('інші канали — за ціною продажу навіть із cost_price у рядку', () => {
    expect(orderGoodsAmount('site', [{ qty: 3, price: 100, cost_price: 70 }])).toBe(300);
    expect(orderGoodsAmount(null, null)).toBe(0);
  });
});
