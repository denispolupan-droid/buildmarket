import { redirect } from 'next/navigation';
import { createSupabaseServer } from '../../../lib/supabase-server';
import SuppliersClient from './SuppliersClient';
import { createServiceClient } from '../../../lib/supabase-service';

const serviceClient = createServiceClient();

export default async function SuppliersPage() {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || user.app_metadata?.role !== 'admin') redirect('/');

  const [{ data: suppliers }, { data: brandsData }, { data: syncLogs }] = await Promise.all([
    serviceClient
      .from('suppliers')
      .select('*, brand_discounts:supplier_brand_discounts(*)')
      .order('name'),
    serviceClient
      .from('products')
      .select('brand')
      .order('brand'),
    serviceClient
      .from('supplier_sync_log')
      .select('supplier_id, rows_updated, rows_unmapped, error_message')
      .order('started_at', { ascending: false })
      .limit(100),
  ]);

  // Беремо останній лог синку для кожного постачальника
  const lastSyncMap = new Map<number, { rows_updated: number; rows_unmapped: number; error_message: string | null }>();
  for (const log of syncLogs ?? []) {
    if (!lastSyncMap.has(log.supplier_id)) lastSyncMap.set(log.supplier_id, log);
  }

  const suppliersWithSync = (suppliers ?? []).map(s => ({
    ...s,
    last_sync: lastSyncMap.has(s.id) ? [lastSyncMap.get(s.id)] : [],
  }));

  const brands = [...new Set((brandsData ?? []).map((p: { brand: string }) => p.brand).filter(Boolean))];

  return (
    <div style={{ padding: '32px 36px 64px' }}>
      <SuppliersClient initial={suppliersWithSync as unknown as Parameters<typeof SuppliersClient>[0]['initial']} brands={brands} />
    </div>
  );
}
