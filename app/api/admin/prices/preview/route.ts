import { NextRequest, NextResponse } from 'next/server';
import { requireStaff } from '../../../../../lib/auth-guard';
import { createServiceClient } from '../../../../../lib/supabase-service';
import { withApi } from '../../../../../lib/api-handler';

const db = createServiceClient();

async function _GET(req: NextRequest) {
  const auth = await requireStaff('admin', 'manager');
  if (!auth.ok) return auth.response;

  const { searchParams } = new URL(req.url);
  const type   = searchParams.get('type')   ?? '';
  const value  = parseFloat(searchParams.get('value') ?? '');
  const target = searchParams.get('target') ?? 'retail';
  const skusRaw = searchParams.get('skus')  ?? '';

  if (!type || isNaN(value) || !skusRaw) {
    return NextResponse.json({ count: 0, delta: 0 });
  }

  const skus = skusRaw.split(',').filter(Boolean);
  if (skus.length === 0) return NextResponse.json({ count: 0, delta: 0 });

  const { data: rows } = await db
    .from('product_stock')
    .select('sku, price_cost, price_unit, price_retail, price_drop, stock_qty')
    .in('sku', skus);

  if (!rows?.length) return NextResponse.json({ count: 0, delta: 0 });

  function applyFormula(base: number | null, cost: number | null): number | null {
    if (type === 'multiply_cost') return cost != null ? Math.round(cost * value) : base;
    if (type === 'increase_pct')  return base != null ? Math.round(base * (1 + value / 100)) : base;
    if (type === 'fixed')         return Math.round(value);
    return base;
  }

  let totalDelta = 0;
  let count = 0;

  for (const row of rows) {
    const qty = row.stock_qty ?? 0;
    const targets = target === 'all'
      ? ['retail', 'unit', 'drop'] as const
      : [target as 'retail' | 'unit' | 'drop'];

    for (const t of targets) {
      const fieldMap = { retail: 'price_retail', unit: 'price_unit', drop: 'price_drop' } as const;
      const before = row[fieldMap[t]] as number | null;
      const after  = applyFormula(before, row.price_cost as number | null);
      if (before != null && after != null) {
        totalDelta += (after - before) * qty;
      }
    }
    count++;
  }

  return NextResponse.json({ count, delta: Math.round(totalDelta) });
}

export const GET = withApi('admin/prices/preview', _GET);
