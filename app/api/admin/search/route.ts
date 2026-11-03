import { NextRequest, NextResponse } from 'next/server';
import { escapeOrTerm, orderSearchOr, personSearchOr } from '../../../../lib/pg-filter';
import { requireStaff } from '../../../../lib/auth-guard';
import { createServiceClient } from '../../../../lib/supabase-service';
import { withApi } from '../../../../lib/api-handler';

/**
 * Глобальний пошук адмінки (палітра Ctrl+K): замовлення, товари, контрагенти
 * одним запитом. Правила збігу ті самі, що в журналі замовлень і в пошуку
 * клієнтів (lib/pg-filter), щоб палітра знаходила те саме, що й екрани.
 * Жодних цін/собівартості — лише те, що треба, щоб упізнати й перейти.
 */
const LIMIT = 6;

async function _GET(req: NextRequest) {
  const auth = await requireStaff('admin', 'manager');
  if (!auth.ok) return auth.response;

  const q = req.nextUrl.searchParams.get('q')?.trim() ?? '';
  if (q.length < 2) return NextResponse.json({ orders: [], products: [], customers: [] });

  const db = createServiceClient();
  const term = escapeOrTerm(q);
  const orderOr = orderSearchOr(q);
  const personOr = personSearchOr(q);

  const [orders, products, customers] = await Promise.all([
    orderOr
      ? db.from('orders')
          .select('id, order_number, contact, company, status, total_price, created_at')
          .or(orderOr)
          .order('created_at', { ascending: false })
          .limit(LIMIT)
      : Promise.resolve({ data: [] }),
    db.from('products')
      .select('sku, name, brand')
      .or(`sku.ilike.%${term}%,name.ilike.%${term}%,brand.ilike.%${term}%`)
      .order('name')
      .limit(LIMIT),
    personOr
      ? db.from('customers')
          .select('id, name, company, phone, type')
          .eq('is_active', true)
          .or(personOr)
          .order('last_order_at', { ascending: false, nullsFirst: false })
          .limit(LIMIT)
      : Promise.resolve({ data: [] }),
  ]);

  return NextResponse.json({
    orders:    orders.data ?? [],
    products:  products.data ?? [],
    customers: customers.data ?? [],
  });
}

export const GET = withApi('admin/search', _GET);
