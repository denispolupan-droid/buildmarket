import { redirect } from 'next/navigation';
import { createClient } from '@supabase/supabase-js';
import { createSupabaseServer } from '../../lib/supabase-server';
import AdminOrders from './AdminOrders';

const serviceClient = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

export default async function AdminPage() {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || user.user_metadata?.role !== 'admin') redirect('/');

  const { data: orders } = await serviceClient
    .from('orders')
    .select('*')
    .order('created_at', { ascending: false });

  const newCount = orders?.filter(o => o.status === 'new').length ?? 0;

  return (
    <div style={{ padding: '32px 36px 64px' }}>
      <div style={{ marginBottom: '28px' }}>
        <h1 style={{ fontSize: '20px', fontWeight: 800, color: '#0F172A', margin: 0 }}>Замовлення</h1>
        <p style={{ fontSize: '13px', color: '#64748B', marginTop: '4px' }}>
          Всього: {orders?.length ?? 0}
          {newCount > 0 && (
            <span style={{ marginLeft: '10px', color: '#DC2626', fontWeight: 700 }}>· Нових: {newCount}</span>
          )}
        </p>
      </div>
      <AdminOrders initialOrders={orders ?? []} />
    </div>
  );
}
