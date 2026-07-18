import { redirect } from 'next/navigation';
import { createSupabaseServer } from '../../../../lib/supabase-server';
import { createClient } from '@supabase/supabase-js';
import { fetchAllRows } from '../../../../lib/db-paginate';
import PromOrdersClient from './PromOrdersClient';

const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

export const metadata = { title: 'Замовлення Prom.ua — Адмін' };

export default async function PromOrdersPage() {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || user.app_metadata?.role !== 'admin') redirect('/');

  // statsRows пагінується: без range() статистика/виручка каналу prom обрізалися б на 1000.
  const [{ data: orders, count }, statsRows] = await Promise.all([
    db.from('orders')
      .select('id, order_number, created_at, status, contact, phone, total_price, prom_order_id', { count: 'exact' })
      .eq('channel_code', 'prom')
      .order('created_at', { ascending: false })
      .limit(50),
    fetchAllRows<{ status: string; total_price: number | null }>((f, t) => db
      .from('orders')
      .select('status, total_price')
      .eq('channel_code', 'prom')
      .range(f, t)),
  ]);

  const statuses = ['new', 'confirmed', 'shipped', 'delivered', 'cancelled'];
  const stats = statuses.map(s => ({
    status: s,
    count:  (statsRows ?? []).filter(r => r.status === s).length,
    amount: (statsRows ?? []).filter(r => r.status === s).reduce((a, r) => a + Number(r.total_price ?? 0), 0),
  }));
  const totalRevenue = (statsRows ?? [])
    .filter(r => r.status !== 'cancelled')
    .reduce((a, r) => a + Number(r.total_price ?? 0), 0);

  return (
    <PromOrdersClient
      orders={orders ?? []}
      totalOrders={count ?? 0}
      stats={stats}
      totalRevenue={totalRevenue}
    />
  );
}
