import { redirect } from 'next/navigation';
import { createSupabaseServer } from '../../../../lib/supabase-server';
import { createClient } from '@supabase/supabase-js';
import RozetkaOrdersClient from './RozetkaOrdersClient';

export const metadata = { title: 'Замовлення Rozetka — Адмін' };

const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

export default async function RozetkaOrdersPage() {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || user.user_metadata?.role !== 'admin') redirect('/');

  const [{ data: loginRow }, { data: recentOrders }, { count: totalSynced }] = await Promise.all([
    db.from('app_settings').select('value').eq('key', 'rozetka_login').maybeSingle(),
    db.from('orders')
      .select('id, order_number, created_at, contact, total_price, status, rozetka_order_id')
      .eq('channel_code', 'rozetka')
      .order('created_at', { ascending: false })
      .limit(20),
    db.from('orders').select('*', { count: 'exact', head: true }).eq('channel_code', 'rozetka'),
  ]);

  return (
    <RozetkaOrdersClient
      hasCredentials={!!loginRow?.value}
      recentOrders={recentOrders ?? []}
      totalSynced={totalSynced ?? 0}
    />
  );
}
