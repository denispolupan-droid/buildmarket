import { redirect } from 'next/navigation';
import { createSupabaseServer } from '../../../lib/supabase-server';
import { createClient } from '@supabase/supabase-js';
import SuppliersClient from './SuppliersClient';

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
    <div style={{ padding: '32px 36px 64px' }}>
      <SuppliersClient initial={suppliers ?? []} brands={brands} />
    </div>
  );
}
