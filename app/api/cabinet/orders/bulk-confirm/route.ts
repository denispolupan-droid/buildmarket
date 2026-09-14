import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { requireCustomer } from '../../../../../lib/auth-guard';
import { createDropshipOrder, getDropshipCustomer } from '../../../../../lib/dropship-order-create';
import { dropshipParcelKey } from '../../../../../lib/dropship-order';

const serviceClient = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

type Row = {
  row_num: number; sku: string; qty: number; selling_price: number;
  last_name: string; first_name: string; mid_name: string; phone: string;
  city_name: string; city_ref: string; warehouse_name: string; warehouse_ref: string; branch_number: string;
};

/**
 * Одна посилка з Excel-імпорту → одне замовлення. ТТН тут більше не створюється:
 * раніше роут робив її напряму в НП старим полем BackwardDeliveryData (НП його
 * відхиляє для ФОП з «Контролем оплати»), з env-ключем і вагою «1 кг», і замовлення
 * лишалось «Нове» поза відвантаженням — крон доставки його не бачив, і накладений
 * платіж партнеру не нараховувався ніколи. Тепер це звичайне замовлення, ТТН
 * створює менеджер стандартним вікном після підтвердження наявності.
 */
export async function POST(req: NextRequest) {
  const auth = await requireCustomer('dropship');
  if (!auth.ok) return auth.response;

  const customer = await getDropshipCustomer(serviceClient, auth.user.id);
  if (!customer) return NextResponse.json({ error: 'Партнера не знайдено' }, { status: 404 });

  const body = await req.json().catch(() => null) as { rows?: Row[] } | null;
  const rows = Array.isArray(body?.rows) ? body!.rows : [];
  const rowNums = rows.map(r => Number(r?.row_num) || 0);
  if (!rows.length) return NextResponse.json({ error: 'Немає рядків для обробки' }, { status: 400 });

  const keys = new Set(rows.map(r => dropshipParcelKey({
    phone: String(r.phone ?? ''), city_name: String(r.city_name ?? ''), branch_number: String(r.branch_number ?? ''),
  })));
  const refs = new Set(rows.map(r => `${r.city_ref}|${r.warehouse_ref}`));
  if (keys.size !== 1 || refs.size !== 1) {
    return NextResponse.json({ results: [{ row_nums: rowNums, status: 'error', error: 'Рядки посилки мають різних отримувачів' }] });
  }

  const first = rows[0];
  const res = await createDropshipOrder(serviceClient, {
    customer,
    fallbackEmail: auth.user.email ?? null,
    items:     rows.map(r => ({ sku: r.sku, qty: r.qty, selling_price: r.selling_price })),
    recipient: first,
    hasCod:    true,
    comment:   `Імпорт з Excel, рядки ${rowNums.join(', ')}`,
    source:    'excel',
  });

  return NextResponse.json({
    results: [res.ok
      ? { row_nums: rowNums, status: 'ok', order_number: res.order_number, total_cost: res.total_cost }
      : { row_nums: rowNums, status: 'error', error: res.error }],
  });
}
