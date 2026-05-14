import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServer } from '../../../../../../lib/supabase-server';
import { createServiceClient } from '../../../../../../lib/supabase';
import { getOrderFulfillmentInfo } from '../../../../../../lib/accounting/dropship';
import { resolveOrderFulfillment } from '../../../../../../lib/accounting/fulfillment';
import { getOrderReservations } from '../../../../../../lib/accounting/reservations';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || user.user_metadata?.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { id } = await params;
  const db = createServiceClient();

  const { data: order } = await db
    .from('orders')
    .select('items, channel_code')
    .eq('id', id)
    .single();

  if (!order) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const items = (order.items ?? []) as { sku: string; qty: number }[];
  const skus = items.map(i => i.sku);

  const [info, plan, reservations, balances, stockRows] = await Promise.all([
    getOrderFulfillmentInfo(order.items ?? []),
    resolveOrderFulfillment(
      items.map(i => ({ sku: i.sku, qty: i.qty })),
      { channel_code: order.channel_code ?? 'website' },
    ),
    getOrderReservations(id),
    // Own warehouse availability
    db.from('stock_balance')
      .select('sku, qty_available, warehouse_id')
      .in('sku', skus),
    // Supplier stock status
    db.from('product_stock')
      .select('sku, stock_qty, stock_status')
      .in('sku', skus),
  ]);

  // Build per-sku availability maps
  const ownAvailMap = new Map<string, number>();
  for (const b of balances.data ?? []) {
    const current = ownAvailMap.get(b.sku) ?? 0;
    ownAvailMap.set(b.sku, current + Number(b.qty_available));
  }

  const supplierStockMap = new Map<string, boolean>();
  for (const s of stockRows.data ?? []) {
    supplierStockMap.set(s.sku, s.stock_status === 'in_stock');
  }

  // Enrich plan items with availability info
  const enrichedPlan = {
    ...plan,
    items: plan.items.map(src => ({
      ...src,
      available_own:      ownAvailMap.get(src.sku) ?? 0,
      supplier_in_stock:  supplierStockMap.get(src.sku) ?? false,
    })),
  };

  return NextResponse.json({ ...info, plan: enrichedPlan, reservations });
}
