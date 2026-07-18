import { redirect } from 'next/navigation';
import { createClient } from '@supabase/supabase-js';
import { createSupabaseServer } from '../../lib/supabase-server';
import { fetchAllRows } from '../../lib/db-paginate';
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
  searchParams: Promise<{ page?: string; status?: string; expand?: string; dateFrom?: string; dateTo?: string; sortBy?: string; sortDir?: string }>;
}) {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  const userRole = user?.app_metadata?.role ?? '';
  if (!user || !['admin', 'manager'].includes(userRole)) redirect('/');

  const { page: pageStr, status: statusParam, expand: expandOrderId, dateFrom, dateTo, sortBy: sortByParam, sortDir: sortDirParam } = await searchParams;
  const SORT_COLS: Record<string, string> = { created_at: 'created_at', total_price: 'total_price', order_number: 'order_number' };
  const sortBy  = SORT_COLS[sortByParam ?? ''] ?? 'created_at';
  const sortAsc = sortDirParam === 'asc';
  // Якщо відкриваємо конкретне замовлення — показуємо всі статуси.
  // Без явного ?status= в URL (перший заход на сторінку) — за замовчуванням показуємо нові.
  const status = expandOrderId ? (statusParam ?? '') : (statusParam ?? 'new');
  const page = Math.max(1, parseInt(pageStr ?? '1'));
  const from = (page - 1) * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;

  let query = serviceClient
    .from('orders')
    .select('*', { count: 'exact' })
    .order(sortBy, { ascending: sortAsc })
    .range(from, to);

  if (status)   query = query.eq('status', status);
  if (dateFrom) query = query.gte('created_at', `${dateFrom}T00:00:00`);
  if (dateTo)   query = query.lte('created_at', `${dateTo}T23:59:59`);

  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  // Status counts + amounts — with same date filter as the main list.
  // Пагінація: без range() лічильники вкладок і суми по статусах мовчки обрізалися б на 1000.
  const [{ data: orders, count }, statusRows, { count: recentReceiptCount }, allAmountRows, { data: promSetting }] = await Promise.all([
    query,
    fetchAllRows<{ status: string }>((f, t) => {
      let q = serviceClient.from('orders').select('status');
      if (dateFrom) q = q.gte('created_at', `${dateFrom}T00:00:00`);
      if (dateTo)   q = q.lte('created_at', `${dateTo}T23:59:59`);
      return q.range(f, t);
    }),
    serviceClient.from('acc_documents')
      .select('id', { count: 'exact', head: true })
      .in('doc_type', ['receipt', 'stock_in'])
      .eq('status', 'confirmed')
      .gte('confirmed_at', oneDayAgo),
    fetchAllRows<{ status: string; total_price: number | null }>((f, t) => {
      let q = serviceClient.from('orders').select('status, total_price').neq('status', 'cancelled');
      if (dateFrom) q = q.gte('created_at', `${dateFrom}T00:00:00`);
      if (dateTo)   q = q.lte('created_at', `${dateTo}T23:59:59`);
      return q.range(f, t);
    }),
    serviceClient.from('app_settings').select('value').eq('key', 'prom_commission_pct').maybeSingle(),
  ]);
  const promCommissionPct = parseFloat(promSetting?.value ?? '3');

  // Load confirmed sale docs + shipped quantities for orders on this page
  const orderIds = (orders ?? []).map(o => o.id);
  const { data: saleDocsRaw } = orderIds.length
    ? await serviceClient
        .from('acc_documents')
        .select('id, order_id, doc_number')
        .in('order_id', orderIds)
        .eq('doc_type', 'sale')
        .eq('status', 'confirmed')
    : { data: [] as { id: string; order_id: string; doc_number: string }[] };

  const saleDocIds = (saleDocsRaw ?? []).map(d => d.id);
  const { data: saleLines } = saleDocIds.length
    ? await serviceClient
        .from('acc_document_lines')
        .select('document_id, sku, qty')
        .in('document_id', saleDocIds)
    : { data: [] as { document_id: string; sku: string; qty: number }[] };

  const initialSaleDocs: Record<string, { id: string; number: string }[]> = {};
  for (const doc of saleDocsRaw ?? []) {
    if (!initialSaleDocs[doc.order_id]) initialSaleDocs[doc.order_id] = [];
    initialSaleDocs[doc.order_id].push({ id: doc.id, number: doc.doc_number });
  }

  const docToOrder = new Map((saleDocsRaw ?? []).map(d => [d.id, d.order_id]));
  const initialShippedQty: Record<string, Record<string, number>> = {};
  for (const line of saleLines ?? []) {
    const orderId = docToOrder.get(line.document_id);
    if (!orderId) continue;
    if (!initialShippedQty[orderId]) initialShippedQty[orderId] = {};
    initialShippedQty[orderId][line.sku] = (initialShippedQty[orderId][line.sku] ?? 0) + Number(line.qty);
  }

  // Sum per status
  const statusAmounts = (allAmountRows ?? []).reduce<Record<string, number>>((acc, row) => {
    if (row.status) acc[row.status] = (acc[row.status] ?? 0) + Number(row.total_price ?? 0);
    return acc;
  }, {});
  const totalAmount = Object.values(statusAmounts).reduce((s, n) => s + n, 0);

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
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '6px', flexWrap: 'wrap' }}>
          {STATUS_TABS.map(tab => {
            const isActive = curStatus === tab.value;
            const cnt = tab.value === '' ? totalCount : (statusCounts[tab.value] ?? 0);
            const isNew = tab.value === 'new';
            return (
              <Link
                key={tab.value}
                href={`/admin?status=${tab.value}${dateFrom ? `&dateFrom=${dateFrom}` : ''}${dateTo ? `&dateTo=${dateTo}` : ''}`}
                style={{
                  display: 'inline-flex', flexDirection: 'column', alignItems: 'flex-start',
                  gap: '3px', padding: '7px 14px', borderRadius: '10px',
                  textDecoration: 'none',
                  background: isActive ? '#1E3A5F' : 'var(--bg-card)',
                  color: isActive ? '#fff' : 'var(--text-secondary)',
                  border: `1px solid ${isActive ? '#1E3A5F' : 'var(--border)'}`,
                  transition: 'all 0.15s', minWidth: '80px',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                  <span style={{ fontSize: '13px', fontWeight: isActive ? 700 : 500 }}>{tab.label}</span>
                  {cnt > 0 && (
                    <span style={{
                      background: isActive ? 'rgba(255,255,255,0.22)' : isNew ? '#EF4444' : '#E2E8F0',
                      color: isActive ? '#fff' : isNew ? '#fff' : '#475569',
                      fontSize: '10px', fontWeight: 700,
                      borderRadius: '5px', padding: '0 5px', lineHeight: '16px',
                    }}>{cnt}</span>
                  )}
                </div>
                {(() => {
                  const amount = tab.value === '' ? totalAmount : (statusAmounts[tab.value] ?? 0);
                  // Only reserve the second row for tabs that actually have an amount to
                  // show — a status with zero orders can't have a nonzero total anyway.
                  // Previously this rendered with visibility:hidden for every empty tab,
                  // leaving a uniform blank strip under nearly the whole row.
                  if (amount <= 0) return null;
                  return (
                    <span style={{
                      fontSize: '13px', fontWeight: 800,
                      color: isActive ? '#93C5FD' : '#15803D',
                      whiteSpace: 'nowrap', letterSpacing: '-0.3px',
                    }}>
                      {amount.toLocaleString('uk-UA', { maximumFractionDigits: 0 })} ₴
                    </span>
                  );
                })()}
              </Link>
            );
          })}
        </div>

        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          {/* Експорт Excel */}
          {(() => {
            const p = new URLSearchParams();
            if (curStatus) p.set('status', curStatus);
            if (dateFrom)  p.set('dateFrom', dateFrom);
            if (dateTo)    p.set('dateTo', dateTo);
            return (
              <a href={`/api/admin/orders/export?${p.toString()}`} download
                style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', height: '32px', padding: '0 14px', borderRadius: '8px', textDecoration: 'none', fontSize: '13px', fontWeight: 500, background: '#F0FDF4', color: '#15803D', border: '1px solid #BBF7D0' }}>
                ↓ Excel
              </a>
            );
          })()}
          {/* Реєстр НП */}
          <Link href="/admin/dispatch" style={{
            display: 'inline-flex', alignItems: 'center', gap: '6px',
            height: '32px', padding: '0 14px', borderRadius: '8px',
            textDecoration: 'none', fontSize: '13px', fontWeight: 500,
            background: '#EFF6FF', color: '#1D4ED8', border: '1px solid #BFDBFE',
          }}>
            <Send size={13} /> Реєстр НП
          </Link>
        </div>
      </div>

      {/* Subtitle */}
      <p style={{ fontSize: '13px', color: 'var(--text-muted)', margin: '0 0 16px' }}>
        Всього: {count ?? 0}
        {totalPages > 1 && ` · Стор. ${page} / ${totalPages}`}
      </p>

      <AdminOrders key={curStatus} initialOrders={orders ?? []} currentPage={page} totalPages={totalPages} userRole={userRole} hasRecentReceipts={(recentReceiptCount ?? 0) > 0} expandOrderId={expandOrderId} dateFrom={dateFrom} dateTo={dateTo} statusCounts={statusCounts} currentStatus={curStatus} sortBy={sortBy} sortDir={sortAsc ? 'asc' : 'desc'} promCommissionPct={promCommissionPct} initialSaleDocs={initialSaleDocs} initialShippedQty={initialShippedQty} />
    </div>
  );
}
