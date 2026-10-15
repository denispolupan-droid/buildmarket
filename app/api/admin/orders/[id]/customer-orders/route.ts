import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '../../../../../../lib/supabase';
import { requireStaff } from '../../../../../../lib/auth-guard';
import { fetchAllRows } from '../../../../../../lib/db-paginate';

// Історія клієнта для картки замовлення: скільки замовлень + сумарно (бейдж біля
// імені), список попередніх (розкривається з бейджа) і що з поточного складу
// він уже брав. Клієнт = customer_id, інакше телефон.
const HISTORY_LIMIT = 200;   // для «вже брав»; список показує перші LIST_LIMIT
const LIST_LIMIT = 20;

type Item = { sku: string; name: string; qty: number };
type Row = { id: string; order_number: number; created_at: string; channel_code: string | null; status: string; total_price: number | null; items: Item[] | null };

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireStaff('admin', 'manager');
  if (!auth.ok) return auth.response;

  const { id } = await params;
  const db = createServiceClient();

  const { data: order } = await db.from('orders')
    .select('customer_id, phone, items').eq('id', id).single();
  if (!order) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  // Без контрагента й телефону клієнта не впізнати: eq('phone', '') зліпив би
  // в «історію» всі замовлення без телефону.
  if (!order.customer_id && !order.phone) {
    return NextResponse.json({ count: 1, total: 0, orders: [], more: false, bought: {} });
  }
  const col = order.customer_id ? 'customer_id' : 'phone';
  const val = (order.customer_id ?? order.phone) as string;

  const [totals, { data: history }] = await Promise.all([
    fetchAllRows<{ total_price: number | null }>((f, t) =>
      db.from('orders').select('total_price').eq(col, val).neq('status', 'cancelled').order('id').range(f, t)),
    db.from('orders').select('id, order_number, created_at, channel_code, status, total_price, items')
      .eq(col, val)
      .neq('id', id)
      .order('created_at', { ascending: false })
      .limit(HISTORY_LIMIT),
  ]);

  const rows = (history ?? []) as Row[];

  // Що з поточного складу клієнт уже купував: скільки штук, у скількох
  // замовленнях і коли востаннє. Скасовані не рахуємо — він їх не отримав.
  const current = new Set(((order.items ?? []) as Item[]).map(i => i.sku));
  const bought: Record<string, { qty: number; orders: number; last: string }> = {};
  for (const r of rows) {
    if (r.status === 'cancelled') continue;
    for (const it of r.items ?? []) {
      if (!current.has(it.sku)) continue;
      const b = bought[it.sku] ??= { qty: 0, orders: 0, last: r.created_at };
      b.qty += Number(it.qty) || 0;
      b.orders += 1;
      if (r.created_at > b.last) b.last = r.created_at;
    }
  }

  return NextResponse.json({
    count: totals.length,
    total: totals.reduce((s, r) => s + Number(r.total_price ?? 0), 0),
    orders: rows.slice(0, LIST_LIMIT).map(r => ({
      id: r.id, order_number: r.order_number, created_at: r.created_at,
      channel_code: r.channel_code, status: r.status, total_price: Number(r.total_price ?? 0),
      items: (r.items ?? []).map(i => ({ sku: i.sku, name: i.name, qty: i.qty })),
    })),
    more: rows.length > LIST_LIMIT,
    bought,
  });
}
