import { redirect } from 'next/navigation';
import { createClient } from '@supabase/supabase-js';
import { createSupabaseServer } from '../../lib/supabase-server';
import { fetchAllRows } from '../../lib/db-paginate';
import AdminOrders from './AdminOrders';
import Link from 'next/link';
import NewOrderButton from './orders/NewOrderButton';
import { SMART_TARIFF_KEY, parseSmartTariff } from '../../lib/rozetka-smart-tariff';
import { ROZETKA_DELIVERY_TARIFF_KEY, parseRozetkaDeliveryTariff } from '../../lib/rozetka-delivery-tariff';
import { PROM_DELIVERY_TARIFF_KEY, parsePromDeliveryTariff } from '../../lib/prom-delivery-fee';

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
  { value: 'ready_to_ship',   label: 'До відправки' },
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

  // «Готово до відправки» = відвантажені, яких НП ще НЕ прийняла; «Відправлено» = вже прийняті НП.
  // Розрізняємо їх за carrier_accepted_at, щоб один заказ не потрапляв у дві вкладки одночасно.
  if (status === 'ready_to_ship') query = query.eq('status', 'shipped').is('carrier_accepted_at', null);
  else if (status === 'shipped')  query = query.eq('status', 'shipped').not('carrier_accepted_at', 'is', null);
  else if (status) query = query.eq('status', status);
  if (dateFrom) query = query.gte('created_at', `${dateFrom}T00:00:00`);
  if (dateTo)   query = query.lte('created_at', `${dateTo}T23:59:59`);

  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  // Status counts + amounts — with same date filter as the main list.
  // Пагінація: без range() лічильники вкладок і суми по статусах мовчки обрізалися б на 1000.
  const [{ data: orders, count }, statusRows, { count: recentReceiptCount }, allAmountRows, { data: promSetting }, { data: rozetkaSetting }] = await Promise.all([
    query,
    fetchAllRows<{ status: string; carrier_accepted_at: string | null; carrier_status_text: string | null; flags: string[] | null }>((f, t) => {
      let q = serviceClient.from('orders').select('status, carrier_accepted_at, carrier_status_text, flags');
      if (dateFrom) q = q.gte('created_at', `${dateFrom}T00:00:00`);
      if (dateTo)   q = q.lte('created_at', `${dateTo}T23:59:59`);
      return q.range(f, t);
    }),
    serviceClient.from('acc_documents')
      .select('id', { count: 'exact', head: true })
      .in('doc_type', ['receipt', 'stock_in'])
      .eq('status', 'confirmed')
      .gte('confirmed_at', oneDayAgo),
    fetchAllRows<{ status: string; total_price: number | null; carrier_accepted_at: string | null }>((f, t) => {
      let q = serviceClient.from('orders').select('status, total_price, carrier_accepted_at').neq('status', 'cancelled');
      if (dateFrom) q = q.gte('created_at', `${dateFrom}T00:00:00`);
      if (dateTo)   q = q.lte('created_at', `${dateTo}T23:59:59`);
      return q.range(f, t);
    }),
    serviceClient.from('app_settings').select('value').eq('key', 'prom_commission_pct').maybeSingle(),
    serviceClient.from('app_settings').select('value').eq('key', 'rozetka_commission_pct').maybeSingle(),
  ]);
  const promCommissionPct = parseFloat(promSetting?.value ?? '3');
  const rozetkaCommissionPct = parseFloat(rozetkaSetting?.value ?? '15');

  // Тарифи зборів за доставку — щоб оцінка економіки замовлення показувала те саме,
  // що потім спишеться з балансу. Читаємо з тих самих ключів, які редагують екрани
  // тарифів; на будь-якій невалідності parse-функції віддають офіційний дефолт.
  const [smartRow, rzDeliveryRow, promDeliveryRow] = await Promise.all([
    serviceClient.from('app_settings').select('value').eq('key', SMART_TARIFF_KEY).maybeSingle(),
    serviceClient.from('app_settings').select('value').eq('key', ROZETKA_DELIVERY_TARIFF_KEY).maybeSingle(),
    serviceClient.from('app_settings').select('value').eq('key', PROM_DELIVERY_TARIFF_KEY).maybeSingle(),
  ]);
  const feeTariffs = {
    smart:           parseSmartTariff(smartRow.data?.value),
    rozetkaDelivery: parseRozetkaDeliveryTariff(rzDeliveryRow.data?.value),
    promDelivery:    parsePromDeliveryTariff(promDeliveryRow.data?.value),
  };

  // Load confirmed sale docs + shipped quantities for orders on this page
  const orderIds = (orders ?? []).map(o => o.id);
  const { data: allDocsRaw } = orderIds.length
    ? await serviceClient
        .from('acc_documents')
        .select('id, order_id, doc_number, doc_type, reversal_of')
        .in('order_id', orderIds)
        .in('doc_type', ['sale', 'return_in'])
        .eq('status', 'confirmed')
    : { data: [] as { id: string; order_id: string; doc_number: string; doc_type: string; reversal_of: string | null }[] };

  const saleDocsRaw = (allDocsRaw ?? []).filter(d => d.doc_type === 'sale');
  const returnDocsRaw = (allDocsRaw ?? []).filter(d => d.doc_type === 'return_in' && !d.reversal_of);

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

  const initialReturnDocs: Record<string, { id: string; number: string }[]> = {};
  for (const doc of returnDocsRaw) {
    if (!initialReturnDocs[doc.order_id]) initialReturnDocs[doc.order_id] = [];
    initialReturnDocs[doc.order_id].push({ id: doc.id, number: doc.doc_number });
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
    const amt = Number(row.total_price ?? 0);
    // shipped розділяємо: не прийнятий НП → «Готово до відправки», прийнятий → «Відправлено».
    if (row.status === 'shipped') {
      acc[row.carrier_accepted_at ? 'shipped' : 'ready_to_ship'] = (acc[row.carrier_accepted_at ? 'shipped' : 'ready_to_ship'] ?? 0) + amt;
    } else if (row.status) {
      acc[row.status] = (acc[row.status] ?? 0) + amt;
    }
    return acc;
  }, {});
  // Загальна сума — напряму з рядків (ready_to_ship дублює shipped, тому не через Object.values).
  const totalAmount = (allAmountRows ?? []).reduce((s, r) => s + Number(r.total_price ?? 0), 0);

  // Count orders per status
  const statusCounts = (statusRows ?? []).reduce<Record<string, number>>((acc, row) => {
    // shipped розділяємо: не прийнятий НП → «Готово до відправки», прийнятий → «Відправлено».
    if (row.status === 'shipped') {
      const key = row.carrier_accepted_at ? 'shipped' : 'ready_to_ship';
      acc[key] = (acc[key] ?? 0) + 1;
    } else if (row.status) {
      acc[row.status] = (acc[row.status] ?? 0) + 1;
    }
    return acc;
  }, {});
  const totalCount = statusRows?.length ?? 0;

  // Невирішені повернення: замовлення скасоване, але перевізник УЖЕ прийняв посилку
  // (carrier_accepted_at) — вона їде назад і з нею треба щось робити. Джерело скасування
  // неважливе (відмова на пошті / скасування в кабінеті МП / наше рішення): раніше тут
  // шукали слово «відмова» в статусі НП і кейс з кабінету Rozetka не рахувався.
  const pendingReturns = (statusRows ?? []).filter(r =>
    r.status === 'cancelled'
    && !!r.carrier_accepted_at
    && !(r.flags ?? []).includes('return_received')
    && !(r.flags ?? []).includes('return_abandoned'),
  ).length;

  const totalPages = Math.ceil((count ?? 0) / PAGE_SIZE);
  const curStatus = status;

  return (
    <div className="admin-orders-page" style={{ padding: '28px 32px 64px' }}>

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <h1 style={{ fontSize: '22px', fontWeight: 800, color: 'var(--text-primary)', margin: 0 }}>
          Замовлення
        </h1>
        <NewOrderButton />
      </div>

      {/* Status tabs + Відправлення — закріплені зверху для швидкого переходу між типами при прокрутці */}
      <div className="admin-status-bar" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', flexWrap: 'wrap', position: 'sticky', top: 0, zIndex: 60, background: 'var(--bg-page)', padding: '20px 0 12px', marginBottom: '8px' }}>
        <div style={{ display: 'flex', alignItems: 'stretch', gap: '8px', flexWrap: 'wrap', flex: 1, minWidth: 0 }}>
          {STATUS_TABS.map(tab => {
            const isActive = curStatus === tab.value;
            const cnt = tab.value === '' ? totalCount : (statusCounts[tab.value] ?? 0);
            const isNew = tab.value === 'new';
            return (
              <Link
                key={tab.value}
                className="admin-status-card"
                href={`/admin?status=${tab.value}${dateFrom ? `&dateFrom=${dateFrom}` : ''}${dateTo ? `&dateTo=${dateTo}` : ''}`}
                style={{
                  display: 'inline-flex', flexDirection: 'column', alignItems: 'center',
                  justifyContent: 'flex-start', gap: '5px', padding: '9px 12px', borderRadius: '12px',
                  textDecoration: 'none', flex: '1 1 0', minWidth: '112px', height: '62px', boxSizing: 'border-box',
                  background: isActive ? '#1E3A5F' : 'var(--bg-card)',
                  border: isActive ? '1px solid #1E3A5F' : '1px solid var(--border-light)',
                  boxShadow: isActive ? '0 3px 10px rgba(30,58,95,0.28)' : '0 1px 2px rgba(15,23,42,0.05)',
                  transition: 'all 0.15s', textAlign: 'center',
                }}
              >
                {/* Рядок 1: назва + лічильник інлайн (чип завжди в одному рядку з назвою). */}
                {/* height 22 + flexShrink 0, а не 30: при 30 рядок УМІЩАВСЯ лише там,
                    де під ним є сума — flexbox стискав його до 22. На картках без суми
                    («Скасовано», «Очікує оплати») він лишався 30, і назва сиділа на 4px
                    нижче, ніж у сусідів. 22 + 5 + 15 = 42 влазить у 44px контент-бокса,
                    тож тепер висота однакова в обох випадках. */}
                <div style={{ height: '22px', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', textAlign: 'center', overflow: 'hidden' }}>
                  {/* inline-flex, а не звичайний inline: чипи лічильників вирівнювались
                      через vertical-align, і на «Скасовано» — де їх ДВА — рядок ставав
                      вищим за решту, через що назва зʼїжджала відносно сусідніх карток. */}
                  <span className="oc-tab-label" style={{
                    display: 'inline-flex', alignItems: 'center', gap: '4px',
                    fontSize: '11.5px', fontWeight: 600, lineHeight: 1.15, letterSpacing: '0px', whiteSpace: 'nowrap',
                    color: isActive ? 'rgba(255,255,255,0.85)' : 'var(--text-muted)',
                  }}>
                    {tab.label}
                    {cnt > 0 && (
                      <span style={{
                        flexShrink: 0, /* .admin-status-card на телефоні звужує ці чипи — див. globals.css */
                        fontSize: '10px', fontWeight: 700, lineHeight: '15px',
                        padding: '0 5px', borderRadius: '7px',
                        background: isActive ? 'rgba(255,255,255,0.22)' : isNew ? '#EF4444' : '#E0ECF8',
                        color: isActive ? '#fff' : isNew ? '#fff' : '#3B6EA5',
                      }}>{cnt}</span>
                    )}
                    {/* Невирішені відмови (посилки їдуть назад — треба забрати з пошти або відмовитись) */}
                    {tab.value === 'cancelled' && pendingReturns > 0 && (
                      <span title={`Посилок у дорозі назад без рішення: ${pendingReturns} — відкрийте замовлення і виберіть «забрати з пошти» чи «залишити»`} style={{
                        flexShrink: 0, /* .admin-status-card на телефоні звужує ці чипи — див. globals.css */
                        fontSize: '10px', fontWeight: 700, lineHeight: '15px',
                        padding: '0 5px', borderRadius: '7px',
                        background: isActive ? 'rgba(255,165,0,0.35)' : '#FFEDD5',
                        color: isActive ? '#FFD9A8' : '#C2410C',
                      }}>↩ {pendingReturns}</span>
                    )}
                  </span>
                </div>
                {/* Рядок 2: сума — головний акцент. */}
                {(() => {
                  const amount = tab.value === '' ? totalAmount : (statusAmounts[tab.value] ?? 0);
                  if (amount <= 0) return null;
                  return (
                    <span style={{
                      fontSize: '15px', fontWeight: 800, lineHeight: 1,
                      color: isActive ? '#93C5FD' : '#15803D',
                      whiteSpace: 'nowrap', letterSpacing: '-0.2px',
                    }}>
                      {amount.toLocaleString('uk-UA', { maximumFractionDigits: 0 })} ₴
                    </span>
                  );
                })()}
              </Link>
            );
          })}
        </div>
      </div>

      {/* Subtitle */}
      <p style={{ fontSize: '13px', color: 'var(--text-muted)', margin: '0 0 16px' }}>
        Всього: {count ?? 0}
        {totalPages > 1 && ` · Стор. ${page} / ${totalPages}`}
      </p>

      <AdminOrders key={curStatus} initialOrders={orders ?? []} currentPage={page} totalPages={totalPages} userRole={userRole} hasRecentReceipts={(recentReceiptCount ?? 0) > 0} expandOrderId={expandOrderId} dateFrom={dateFrom} dateTo={dateTo} statusCounts={statusCounts} currentStatus={curStatus} sortBy={sortBy} sortDir={sortAsc ? 'asc' : 'desc'} promCommissionPct={promCommissionPct} rozetkaCommissionPct={rozetkaCommissionPct} feeTariffs={feeTariffs} initialSaleDocs={initialSaleDocs} initialReturnDocs={initialReturnDocs} initialShippedQty={initialShippedQty} />
    </div>
  );
}
