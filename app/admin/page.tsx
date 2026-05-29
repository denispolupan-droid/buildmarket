import { redirect } from 'next/navigation';
import { createClient } from '@supabase/supabase-js';
import { createSupabaseServer } from '../../lib/supabase-server';
import AdminOrders from './AdminOrders';
import Link from 'next/link';
import { Send } from 'lucide-react';
import NewOrderButton from './orders/NewOrderButton';

const serviceClient = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

const PAGE_SIZE = 50;

const STATUS_TABS = [
  { value: '',                label: 'Всі' },
  { value: 'new',             label: 'Нові',            badge: true },
  { value: 'pending_payment', label: 'Очікує оплати' },
  { value: 'confirmed',       label: 'Підтверджено' },
  { value: 'awaiting_stock',  label: 'Очікуємо товар' },
  { value: 'picking',         label: 'Збирається' },
  { value: 'shipped',         label: 'Відправлено' },
  { value: 'delivered',       label: 'Доставлено' },
  { value: 'cancelled',       label: 'Скасовано' },
] as const;

export default async function AdminPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; status?: string; expand?: string }>;
}) {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  const userRole = user?.user_metadata?.role ?? '';
  if (!user || !['admin', 'manager'].includes(userRole)) redirect('/');

  const { page: pageStr, status: statusParam, expand: expandOrderId } = await searchParams;
  // Якщо відкриваємо конкретне замовлення — показуємо всі статуси
  const status = expandOrderId ? (statusParam ?? '') : (statusParam ?? 'new');
  const page = Math.max(1, parseInt(pageStr ?? '1'));
  const from = (page - 1) * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;

  let query = serviceClient
    .from('orders')
    .select('*', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(from, to);

  if (status) query = query.eq('status', status);

  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  const [{ data: orders, count }, { data: statusRows }, { count: recentReceiptCount }] = await Promise.all([
    query,
    serviceClient.from('orders').select('status'),
    serviceClient.from('acc_documents')
      .select('id', { count: 'exact', head: true })
      .in('doc_type', ['receipt', 'stock_in'])
      .eq('status', 'confirmed')
      .gte('confirmed_at', oneDayAgo),
  ]);

  // Count orders per status
  const statusCounts = (statusRows ?? []).reduce<Record<string, number>>((acc, row) => {
    if (row.status) acc[row.status] = (acc[row.status] ?? 0) + 1;
    return acc;
  }, {});
  const totalCount = statusRows?.length ?? 0;

  const totalPages = Math.ceil((count ?? 0) / PAGE_SIZE);
  const curStatus = status;

  return (
    <div style={{ padding: '28px 32px 64px' }}>

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <h1 style={{ fontSize: '22px', fontWeight: 800, color: 'var(--text-primary)', margin: 0 }}>
          Замовлення
        </h1>
        <NewOrderButton />
      </div>

      {/* Status tabs + Відправлення */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', marginBottom: '20px', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
          {STATUS_TABS.map(tab => {
            const isActive = curStatus === tab.value;
            const cnt = tab.value === '' ? totalCount : (statusCounts[tab.value] ?? 0);
            const isNew = tab.value === 'new';
            return (
              <Link
                key={tab.value}
                href={`/admin?status=${tab.value}`}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: '5px',
                  height: '32px', padding: '0 14px', borderRadius: '8px',
                  textDecoration: 'none', fontSize: '13px', fontWeight: isActive ? 700 : 400,
                  background: isActive ? '#1E3A5F' : 'var(--bg-card)',
                  color: isActive ? '#fff' : 'var(--text-secondary)',
                  border: `1px solid ${isActive ? '#1E3A5F' : 'var(--border)'}`,
                  transition: 'all 0.15s',
                }}
              >
                {tab.label}
                {cnt > 0 && (
                  <span style={{
                    background: isActive
                      ? 'rgba(255,255,255,0.25)'
                      : isNew ? '#EF4444' : '#E2E8F0',
                    color: isActive ? '#fff' : isNew ? '#fff' : '#475569',
                    fontSize: '10px', fontWeight: 700,
                    borderRadius: '5px', padding: '0 5px', lineHeight: '16px',
                  }}>
                    {cnt}
                  </span>
                )}
              </Link>
            );
          })}
        </div>

        {/* Реєстр НП — окрема кнопка-посилання */}
        <Link href="/admin/dispatch" style={{
          display: 'inline-flex', alignItems: 'center', gap: '6px',
          height: '32px', padding: '0 14px', borderRadius: '8px',
          textDecoration: 'none', fontSize: '13px', fontWeight: 500,
          background: '#EFF6FF', color: '#1D4ED8',
          border: '1px solid #BFDBFE',
        }}>
          <Send size={13} />
          Реєстр НП
        </Link>
      </div>

      {/* Subtitle */}
      <p style={{ fontSize: '13px', color: 'var(--text-muted)', margin: '0 0 16px' }}>
        Всього: {count ?? 0}
        {totalPages > 1 && ` · Стор. ${page} / ${totalPages}`}
      </p>

      <AdminOrders key={curStatus} initialOrders={orders ?? []} currentPage={page} totalPages={totalPages} userRole={userRole} hasRecentReceipts={(recentReceiptCount ?? 0) > 0} expandOrderId={expandOrderId} />
    </div>
  );
}
