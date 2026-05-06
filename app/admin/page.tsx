import { redirect } from 'next/navigation';
import { createClient } from '@supabase/supabase-js';
import { createSupabaseServer } from '../../lib/supabase-server';
import AdminOrders from './AdminOrders';

const serviceClient = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

const PAGE_SIZE = 50;

export default async function AdminPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; status?: string }>;
}) {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || user.user_metadata?.role !== 'admin') redirect('/');

  const { page: pageStr, status } = await searchParams;
  const page = Math.max(1, parseInt(pageStr ?? '1'));
  const from = (page - 1) * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;

  let query = serviceClient
    .from('orders')
    .select('*', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(from, to);

  if (status) query = query.eq('status', status);

  const { data: orders, count } = await query;
  const totalPages = Math.ceil((count ?? 0) / PAGE_SIZE);

  const { count: newCount } = await serviceClient
    .from('orders')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'new');

  return (
    <div style={{ padding: '32px 36px 64px' }}>
      <div style={{ marginBottom: '28px' }}>
        <h1 style={{ fontSize: '20px', fontWeight: 800, color: '#0F172A', margin: 0 }}>Замовлення</h1>
        <p style={{ fontSize: '13px', color: '#64748B', marginTop: '4px' }}>
          Всього: {count ?? 0}
          {(newCount ?? 0) > 0 && (
            <span style={{ marginLeft: '10px', color: '#DC2626', fontWeight: 700 }}>· Нових: {newCount}</span>
          )}
          {totalPages > 1 && (
            <span style={{ marginLeft: '10px' }}>· Сторінка {page} з {totalPages}</span>
          )}
        </p>
      </div>
      <AdminOrders initialOrders={orders ?? []} currentPage={page} totalPages={totalPages} />
    </div>
  );
}
