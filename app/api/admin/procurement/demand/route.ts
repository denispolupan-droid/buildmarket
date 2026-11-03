import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '../../../../../lib/supabase-service';
import { requireStaff } from '../../../../../lib/auth-guard';
import { withApi } from '../../../../../lib/api-handler';
import { fetchAllRows } from '../../../../../lib/db-paginate';

const db = createServiceClient();

// Статуси, у яких замовлення ще потребує товару
const DEMAND_STATUSES = ['confirmed', 'awaiting_stock'];

// GET /api/admin/procurement/demand?skus=SKU1,SKU2
// Повертає кількість замовлень і потрібну кількість по кожному SKU.
// Етап B order_lines (03.11.2026): раніше тягнув УСІ замовлення зі статусами
// й перебирав jsonb items по кожному SKU (O(skus × orders), без ліміту);
// тепер — один запит до order_lines по потрібних SKU з фільтром статусу
// замовлення через вбудований зв'язок.
async function _GET(req: NextRequest) {
  const auth = await requireStaff('admin', 'manager');
  if (!auth.ok) return auth.response;

  const skusParam = new URL(req.url).searchParams.get('skus') ?? '';
  const skus = [...new Set(skusParam.split(',').map(s => s.trim()).filter(Boolean))].slice(0, 500);
  if (!skus.length) return NextResponse.json({ demand: {} });

  const rows = await fetchAllRows((f, t) => db
    .from('order_lines')
    .select('sku, qty, order_id, orders!inner(status)')
    .in('sku', skus)
    .in('orders.status', DEMAND_STATUSES)
    .order('id')
    .range(f, t));

  // Те саме правило, що й раніше: замовлення рахується раз на SKU, кількість — сума рядків
  const agg = new Map<string, { orders: Set<string>; qty: number }>();
  for (const r of rows) {
    const a = agg.get(r.sku) ?? { orders: new Set<string>(), qty: 0 };
    a.orders.add(r.order_id);
    a.qty += Number(r.qty) || 0;
    agg.set(r.sku, a);
  }
  const demand: Record<string, { orders: number; qty: number }> = {};
  for (const [sku, a] of agg) if (a.orders.size > 0) demand[sku] = { orders: a.orders.size, qty: a.qty };

  return NextResponse.json({ demand });
}

export const GET = withApi('admin/procurement/demand', _GET);
