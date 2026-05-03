import { redirect } from 'next/navigation';
import { createSupabaseServer } from '../../../lib/supabase-server';
import { createClient } from '@supabase/supabase-js';
import SuppliersClient from './SuppliersClient';
import Footer from '../../components/Footer';

const serviceClient = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

export default async function SuppliersPage() {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || user.user_metadata?.role !== 'admin') redirect('/');

  const [{ data: suppliers }, { data: brandsData }] = await Promise.all([
    serviceClient
      .from('suppliers')
      .select('*, brand_discounts:supplier_brand_discounts(*), last_sync:supplier_sync_log(rows_updated, rows_unmapped, error_message)')
      .order('name'),
    serviceClient
      .from('products')
      .select('brand')
      .order('brand'),
  ]);

  const brands = [...new Set((brandsData ?? []).map(p => p.brand).filter(Boolean))];

  return (
    <div style={{ background: '#F8FAFC', minHeight: '100vh' }}>
      <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '40px 32px 64px' }}>
        <div style={{ marginBottom: '24px' }}>
          <a href="/admin" style={{ fontSize: '13px', color: '#64748B', textDecoration: 'none' }}>← Панель менеджера</a>
        </div>
        <SuppliersClient initial={suppliers ?? []} brands={brands} />
      </div>
      <Footer />
    </div>
  );
}
