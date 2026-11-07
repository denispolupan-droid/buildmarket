import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '../../../../../lib/supabase-service';
import { requireStaff } from '../../../../../lib/auth-guard';
import { withApi } from '../../../../../lib/api-handler';
import { loadDemandBySku } from '../../../../../lib/orders/lines-read';

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

  // Читання order_lines — лише через lib/orders/lines-read (єдине місце читання таблиці)
  const demand = Object.fromEntries([...await loadDemandBySku(db, skus, DEMAND_STATUSES)].filter(([, a]) => a.orders > 0));

  return NextResponse.json({ demand });
}

export const GET = withApi('admin/procurement/demand', _GET);
