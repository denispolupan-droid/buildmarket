import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServer } from '../../../../../lib/supabase-server';
import { createClient } from '@supabase/supabase-js';

const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

export async function GET(req: NextRequest) {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || !['admin', 'manager'].includes(user.user_metadata?.role ?? '')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

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
