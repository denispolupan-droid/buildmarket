import { NextRequest, NextResponse } from 'next/server';
import { requireStaff } from '../../../../../../lib/auth-guard';
import { createServiceClient } from '../../../../../../lib/supabase-service';
import { withApi } from '../../../../../../lib/api-handler';

/**
 * Історія контрагента для картки в «Контрагентах» (аудит 31.10, п. 22):
 * останні замовлення й сальдо по рахунках леджера. Без цін закупки.
 */
const LIMIT = 15;

async function _GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireStaff('admin', 'manager');
  if (!auth.ok) return auth.response;
  const { id } = await params;
  const db = createServiceClient();

  const [orders, balances, total] = await Promise.all([
    db.from('orders')
      .select('id, order_number, created_at, status, total_price, channel_code, tracking_number, payment_confirmed')
      .eq('customer_id', id)
      .order('created_at', { ascending: false })
      .limit(LIMIT),
    db.from('counterparty_balances')
      .select('account_type, balance')
      .eq('counterparty_id', id),
    db.from('orders')
      .select('id', { count: 'exact', head: true })
      .eq('customer_id', id),
  ]);
  if (orders.error) return NextResponse.json({ error: orders.error.message }, { status: 500 });

  return NextResponse.json({
    orders: orders.data ?? [],
    total: total.count ?? 0,
    // customer: «+» = винен нам; partner: баланс дропшип-партнера в леджері
    balances: Object.fromEntries((balances.data ?? []).map(b => [b.account_type, Number(b.balance)])),
  });
}

export const GET = withApi('admin/partners/[id]/history', _GET);
