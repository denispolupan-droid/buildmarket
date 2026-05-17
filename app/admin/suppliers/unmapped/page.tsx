import { redirect } from 'next/navigation';
import { createSupabaseServer } from '../../../../lib/supabase-server';
import { createClient } from '@supabase/supabase-js';
import UnmappedClient from './UnmappedClient';
import Footer from '../../../components/Footer';

const serviceClient = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

export default async function UnmappedPage() {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || user.user_metadata?.role !== 'admin') redirect('/');

  const { data: unmapped } = await serviceClient
    .from('supplier_unmapped_skus')
    .select('*, suppliers(name)')
    .order('first_seen_at', { ascending: false });

  const rows = (unmapped ?? []).map(r => ({
    supplier_id:   r.supplier_id,
    supplier_sku:  r.supplier_sku,
    sample_name:   r.sample_name,
    price_in:      r.price_in,
    first_seen_at: r.first_seen_at,
    supplier_name: (r.suppliers as { name: string } | null)?.name ?? `#${r.supplier_id}`,
  }));

  return (
    <div style={{ background: 'var(--bg-soft)', minHeight: '100vh' }}>
      <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '40px 32px 64px' }}>
        <div style={{ marginBottom: '20px' }}>
          <a href="/admin/suppliers" style={{ fontSize: '13px', color: 'var(--text-secondary)', textDecoration: 'none' }}>← Постачальники</a>
        </div>
        <div style={{ marginBottom: '24px' }}>
          <h1 style={{ fontSize: '22px', fontWeight: 800, color: 'var(--text-primary)', margin: 0 }}>Немаплені артикули</h1>
          <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginTop: '4px' }}>
            Артикули постачальників, для яких не знайдено відповідного товару в каталозі.
          </p>
        </div>
        <UnmappedClient initial={rows} />
      </div>
      <Footer />
    </div>
  );
}
