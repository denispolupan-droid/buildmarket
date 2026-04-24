import { redirect } from 'next/navigation';
import { createClient } from '@supabase/supabase-js';
import { createSupabaseServer } from '../../lib/supabase-server';
import AdminOrders from './AdminOrders';
import Footer from '../components/Footer';

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

  const counts = {
    total: orders?.length ?? 0,
    new: orders?.filter(o => o.status === 'new').length ?? 0,
  };

  return (
    <>
      <div style={{ background: '#F8FAFC', minHeight: '100vh' }}>
        <div style={{ maxWidth: '1100px', margin: '0 auto', padding: '40px 32px 64px' }}>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '32px' }}>
            <div>
              <h1 style={{ fontSize: '22px', fontWeight: 800, color: '#0F172A', margin: 0 }}>
                Панель менеджера
              </h1>
              <p style={{ fontSize: '13px', color: '#64748B', marginTop: '4px' }}>
                Всього замовлень: {counts.total}
                {counts.new > 0 && (
                  <span style={{ marginLeft: '10px', color: '#1E3A5F', fontWeight: 700 }}>
                    · Нових: {counts.new}
                  </span>
                )}
              </p>
            </div>
          </div>

          <AdminOrders initialOrders={orders ?? []} />
        </div>
      </div>
      <Footer />
    </>
  );
}
