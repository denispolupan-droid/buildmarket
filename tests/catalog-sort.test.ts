import { describe, it, expect, vi } from 'vitest';
vi.mock('../lib/env', () => ({ env: { NEXT_PUBLIC_SUPABASE_URL: 'http://x', NEXT_PUBLIC_SUPABASE_ANON_KEY: 'x', SUPABASE_SERVICE_ROLE_KEY: 'x' } }));
import { sortCatalog } from '../lib/supabase';

describe('sortCatalog (каталог із кешів по категоріях = одна вибірка)', () => {
  it('sort_order, далі sku; null sort_order — у кінці; без наявності — у кінець стабільно', () => {
    const rows = [
      { sku: 'B', sort_order: 1, stock: { stock_status: 'in_stock' } },
      { sku: 'A', sort_order: 1, stock: { stock_status: 'out_of_stock' } },
      { sku: 'C', sort_order: null, stock: { stock_status: 'in_stock' } },
      { sku: 'D', sort_order: 0, stock: { stock_status: 'in_stock' } },
      { sku: 'E', sort_order: 2, stock: null },
    ];
    expect(sortCatalog(rows).map(r => r.sku)).toEqual(['D', 'B', 'C', 'A', 'E']);
  });
});
