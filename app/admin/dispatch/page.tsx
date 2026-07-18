import { createClient } from '@supabase/supabase-js';
import { createSupabaseServer } from '../../../lib/supabase-server';
import { redirect } from 'next/navigation';
import DispatchClient from './DispatchClient';

const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

export default async function DispatchPage() {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || user.app_metadata?.role !== 'admin') redirect('/');

  const { data: orders } = await db
    .from('orders')
    .select('id, order_number, contact, phone, total_price, payment_type, tracking_number, status, delivery_city_name, created_at')
    .not('tracking_number', 'is', null)
    .not('status', 'in', '("delivered","cancelled")')
    .order('created_at', { ascending: false })
    .limit(200);

  return <DispatchClient orders={orders ?? []} />;
}
