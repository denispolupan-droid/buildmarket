import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServer } from '../../../../../../lib/supabase-server';
import { createReservation, releaseReservation } from '../../../../../../lib/accounting/reservations';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || user.user_metadata?.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { id } = await params;
  const body = await req.json();
  const { items } = body as {
    items: { sku: string; warehouse_id: number; qty: number }[];
  };

  if (!Array.isArray(items) || items.length === 0) {
    return NextResponse.json({ error: 'items required' }, { status: 400 });
  }

  // Release existing active reservations first (idempotent re-reserve)
  await releaseReservation(id, 'manual');

  // Group by warehouse_id
  const byWarehouse = new Map<number, { sku: string; qty: number }[]>();
  for (const item of items) {
    if (!byWarehouse.has(item.warehouse_id)) byWarehouse.set(item.warehouse_id, []);
    byWarehouse.get(item.warehouse_id)!.push({ sku: item.sku, qty: item.qty });
  }

  let totalReserved = 0;
  const insufficient: { sku: string; requested: number; available: number }[] = [];

  for (const [warehouseId, warehouseItems] of byWarehouse) {
    const result = await createReservation({
      order_id:     id,
      warehouse_id: warehouseId,
      items:        warehouseItems,
    });
    totalReserved += result.reserved.length;
    insufficient.push(...result.insufficient);
  }

  return NextResponse.json({ ok: true, reserved: totalReserved, insufficient });
}
