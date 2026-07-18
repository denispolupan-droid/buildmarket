import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServer } from '../../../../../lib/supabase-server';
import { createServiceClient } from '../../../../../lib/supabase';

const db = createServiceClient();

// GET /api/admin/procurement/demand?skus=SKU1,SKU2
// Повертає кількість замовлень і потрібну кількість по кожному SKU
export async function GET(req: NextRequest) {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || !['admin', 'manager'].includes(user.app_metadata?.role ?? '')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const skusParam = new URL(req.url).searchParams.get('skus') ?? '';
  const skus = skusParam.split(',').map(s => s.trim()).filter(Boolean);
  if (!skus.length) return NextResponse.json({ demand: {} });

  // Замовлення зі статусами що потребують товару
  const { data: orders } = await db
    .from('orders')
    .select('id, items')
    .in('status', ['confirmed', 'awaiting_stock']);

  const demand: Record<string, { orders: number; qty: number }> = {};

  for (const sku of skus) {
    let orderCount = 0;
    let totalQty   = 0;
    for (const o of orders ?? []) {
      const item = (o.items as { sku: string; qty: number }[])?.find(i => i.sku === sku);
      if (item) { orderCount++; totalQty += item.qty; }
    }
    if (orderCount > 0) demand[sku] = { orders: orderCount, qty: totalQty };
  }

  return NextResponse.json({ demand });
}
