import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServer } from '../../../../../lib/supabase-server';
import { createClient } from '@supabase/supabase-js';

const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

const SELECT = `
  id, qty, cost_price, batch_cost, sale_price, doc_type, moved_at, document_id, order_id,
  doc:document_id ( doc_number, doc_type, doc_date )
`;

// Effective cost per unit for a movement, including landed costs:
// - outgoing: use batch_cost / abs(qty)  — FIFO cost written at time of sale, includes LC
// - incoming: use cost_price             — from movement record (may not include post-receipt LC,
//                                          but closing_value from batches corrects the final number)
function effectiveUnitCost(qty: number, cost_price: number, batch_cost: number | null): number {
  if (qty < 0 && batch_cost != null) {
    return Math.abs(batch_cost) / Math.abs(qty);
  }
  return cost_price;
}

export async function GET(req: NextRequest) {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || user.app_metadata?.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const sku          = searchParams.get('sku');
  const warehouse_id = searchParams.get('warehouse_id');
  const date_from    = searchParams.get('date_from');
  const date_to      = searchParams.get('date_to');

  if (!sku || !warehouse_id) {
    return NextResponse.json({ error: 'sku and warehouse_id required' }, { status: 400 });
  }

  const wid = Number(warehouse_id);

  // Opening balance = all movements BEFORE period start, using effective cost (with LC for outgoing)
  let opening_qty  = 0;
  let opening_cost = 0;
  if (date_from) {
    const { data: before } = await db
      .from('stock_movements')
      .select('qty, cost_price, batch_cost')
      .eq('sku', sku)
      .eq('warehouse_id', wid)
      .lt('moved_at', `${date_from}T00:00:00`);
    for (const m of before ?? []) {
      const unitCost = effectiveUnitCost(Number(m.qty), Number(m.cost_price), m.batch_cost);
      opening_qty  += Number(m.qty);
      opening_cost += Number(m.qty) * unitCost;
    }
  }

  // Period movements — chronological for report
  let query = db
    .from('stock_movements')
    .select(SELECT)
    .eq('sku', sku)
    .eq('warehouse_id', wid);

  if (date_from) query = query.gte('moved_at', `${date_from}T00:00:00`);
  if (date_to)   query = query.lte('moved_at', `${date_to}T23:59:59`);

  const { data: movements, error } = await query
    .order('moved_at', { ascending: true })
    .limit(1000);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Add effective_unit_cost to each movement row
  const enriched = (movements ?? []).map(m => ({
    ...m,
    effective_unit_cost: effectiveUnitCost(Number(m.qty), Number(m.cost_price), m.batch_cost ?? null),
  }));

  // Closing value — directly from stock_batches (accurate, always includes LC)
  const { data: batches } = await db
    .from('stock_batches')
    .select('remaining_qty, cost_price')
    .eq('sku', sku)
    .eq('warehouse_id', wid)
    .gt('remaining_qty', 0);

  const closing_value = (batches ?? [])
    .reduce((s, b) => s + Number(b.remaining_qty) * Number(b.cost_price), 0);

  return NextResponse.json({
    movements: enriched,
    opening_qty,
    opening_cost,
    closing_value,   // from stock_batches — single source of truth for inventory value
  });
}
