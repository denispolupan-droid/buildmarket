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
import { escapeOrTerm } from '../../lib/pg-filter';
import { ROZETKA_DELIVERY_TYPE } from '../../lib/rozetka-delivery';
import { RZ_DELIVERY_TYPE } from '../../lib/rz-delivery';
import { PAYMENT_METHOD_ORDER, type PaymentMethodCode } from '../../lib/payment-method';

const serviceClient = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

const PAGE_SIZE = 50;

// Порядок — за робочим циклом (рішення власника): нові → підтверджені →
// очікують оплати → далі логістика і термінальні статуси.
const STATUS_TABS = [
  { value: '',                label: 'Всі' },
  { value: 'new',             label: 'Нові',            badge: true },
  { value: 'confirmed',       label: 'Підтверджено' },
  { value: 'pending_payment', label: 'Очікує оплати' },
  { value: 'awaiting_stock',  label: 'Очікуємо товар' },
  { value: 'ready_to_ship',   label: 'До відправки' },
  { value: 'shipped',         label: 'Відправлено' },
  { value: 'delivered',       label: 'Доставлено' },
  { value: 'cancelled',       label: 'Скасовано' },
] as const;

export default async function AdminPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; status?: string; expand?: string; dateFrom?: string; dateTo?: string; sortBy?: string; sortDir?: string; q?: string; channel?: string; carrier?: string; pay?: string }>;
}) {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  const userRole = user?.app_metadata?.role ?? '';
  if (!user || !['admin', 'manager'].includes(userRole)) redirect('/');

  const {
    page: pageStr, status: statusParam, expand: expandOrderId, dateFrom, dateTo,
    sortBy: sortByParam, sortDir: sortDirParam, q: qParam, channel: channelParam, carrier: carrierParam,
    pay: payParam,
  } = await searchParams;
  const search  = (qParam ?? '').trim();
  const channel = channelParam ?? '';
  const carrier = carrierParam ?? '';
  // Форма оплати — код із generated-колонки orders.payment_method_code
  // (див. міграцію 099). Фільтрувати по payment_type не можна: у частини
  // замовлень маркетплейсів він розходиться з фактичним способом оплати.
  const pay = PAYMENT_METHOD_ORDER.includes(payParam as PaymentMethodCode) ? payParam! : '';
  const SORT_COLS: Record<string, string> = { created_at: 'created_at', total_price: 'total_price', order_number: 'order_number' };
  const sortBy  = SORT_COLS[sortByParam ?? ''] ?? 'created_at';
  const sortAsc = sortDirParam === 'asc';
  // Якщо відкриваємо конкретне замовлення — показуємо всі статуси.
  // Без явного ?status= в URL (перший заход на сторінку) — за замовчуванням показуємо нові.
  const status = expandOrderId ? (statusParam ?? '') : (statusParam ?? 'new');
  const page = Math.max(1, parseInt(pageStr ?? '1'));
  const from = (page - 1) * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;

  /**
   * Пошук і фільтри каналу/перевізника рахує БАЗА, а не браузер. Раніше вони
   * жили в AdminOrders і застосовувалися до вже завантаженої сторінки з 50
   * рядків — пошук за телефоном чи ТТН просто не знаходив замовлення, яке
   * лежало на другій сторінці. Ця ж функція накладається і на вибірку для
   * лічильників, щоб цифри на вкладках збігалися зі списком.
   */
  function applyOrderFilters<T>(query: T, opts?: { ignoreFacets?: boolean }): T {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let q = query as any;
    if (dateFrom) q = q.gte('created_at', `${dateFrom}T00:00:00`);
    if (dateTo)   q = q.lte('created_at', `${dateTo}T23:59:59`);
    if (!opts?.ignoreFacets) {
      // Замовлення з сайту історично лежать і як 'website', і як NULL
      if (channel === 'website') q = q.or('channel_code.is.null,channel_code.eq.website');
      else if (channel)          q = q.eq('channel_code', channel);
      // Самовивіз перевізника не має і не потрапляє в жоден фільтр (як carrierOf у клієнті)
      // Обидва «Rozetka» — і маркетплейсна доставка в точку видачі, і власний
      // договір rz-delivery для замовлень сайту: для менеджера це одні й ті самі
      // точки й один процес здачі, різне лише API накладної.
      if (carrier === 'rozetka')   q = q.in('delivery_type', [ROZETKA_DELIVERY_TYPE, RZ_DELIVERY_TYPE]);
      else if (carrier === 'nova') q = q.not('delivery_type', 'in', `(${ROZETKA_DELIVERY_TYPE},${RZ_DELIVERY_TYPE},pickup)`);
      if (pay) q = q.eq('payment_method_code', pay);
    }
    if (search) {
      const term = escapeOrTerm(search);
      const digits = search.replace(/\D/g, '');
      const ors = [
        `contact.ilike.%${term}%`,
        `company.ilike.%${term}%`,
        `tracking_number.ilike.%${term}%`,
        `phone.ilike.%${term}%`,
        `delivery_city_name.ilike.%${term}%`,
      ];
      // Телефони лежать у різних форматах ('380…' з Rozetka, '+380…' з Prom,
      // '+38 (066) …' із сайту), тому пробуємо і як ввели, і самі цифри.
      if (digits.length >= 3) ors.push(`phone.ilike.%${digits}%`);
      // order_number — int4, і будь-яке довге число (ТТН, телефон) валило ВЕСЬ
      // запит помилкою «out of range for type integer». Тому порівнюємо з ним
      // лише те, що фізично може бути номером замовлення.
      if (/^\d{1,10}$/.test(term) && Number(term) <= 2147483647) ors.push(`order_number.eq.${term}`);
      // Номер замовлення в кабінеті маркетплейсу — його називають і покупець, і
      // підтримка Prom/Rozetka, а знайти замовлення по ньому досі було нічим.
      // Обидві колонки BIGINT, тож тільки точний збіг і тільки для цифр.
      if (/^\d{4,18}$/.test(digits)) {
        ors.push(`prom_order_id.eq.${digits}`);
        ors.push(`rozetka_order_id.eq.${digits}`);
      }
      q = q.or(ors.join(','));
    }
    return q as T;
  }

  /**
   * Вкладка статусу. Винесена окремо від applyOrderFilters, бо накладається не
   * тільки на список, а й на фасетні лічильники чіпів — інакше на вкладці
   * «Підтверджено 4» чіпи показували «Rozetka 92 · Не оплачені 86», тобто
   * цифри з усієї бази замість поточного зрізу.
   *
   * «Готово до відправки» = відвантажені, яких НП ще НЕ прийняла; «Відправлено»
   * = вже прийняті НП. Розрізняємо за carrier_accepted_at, щоб одне замовлення
   * не потрапляло у дві вкладки одночасно.
   */
  function applyStatusFilter<T>(query: T): T {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let q = query as any;
    if (status === 'ready_to_ship') q = q.eq('status', 'shipped').is('carrier_accepted_at', null);
    else if (status === 'shipped')  q = q.eq('status', 'shipped').not('carrier_accepted_at', 'is', null);
    else if (status) q = q.eq('status', status);
    return q as T;
  }

  const query = applyStatusFilter(applyOrderFilters(
    serviceClient
      .from('orders')
      .select('*', { count: 'exact' })
      .order(sortBy, { ascending: sortAsc })
      .range(from, to),
  ));

  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  // Status counts + amounts — with same date filter as the main list.
  // Пагінація: без range() лічильники вкладок і суми по статусах мовчки обрізалися б на 1000.
  const [{ data: orders, count }, statusRows, { count: recentReceiptCount }, channelRows, { data: promSetting }, { data: rozetkaSetting }] = await Promise.all([
    query,
    // Лічильники вкладок — по тому ж зрізу, що й список (пошук/канал/перевізник),
    // інакше вкладка каже «89», а в списку три рядки.
    fetchAllRows<{ status: string; carrier_accepted_at: string | null; carrier_status_text: string | null; flags: string[] | null; total_price: number | null }>((f, t) =>
      applyOrderFilters(serviceClient.from('orders').select('status, carrier_accepted_at, carrier_status_text, flags, total_price')).range(f, t),
    ),
    serviceClient.from('acc_documents')
      .select('id', { count: 'exact', head: true })
      .in('doc_type', ['receipt', 'stock_in'])
      .eq('status', 'confirmed')
      .gte('confirmed_at', oneDayAgo),
    // Лічильники каналів, перевізників і оплати рахуються по ПОТОЧНІЙ вкладці
    // статусу (і по даті/пошуку), але БЕЗ фільтрів самих чіпів — класична
    // фасетна логіка: інакше, ставши на «Rozetka», всі інші канали показали б
    // нуль і перемкнутися між ними було б неможливо.
    fetchAllRows<{ channel_code: string | null; delivery_type: string | null; payment_method_code: string | null }>((f, t) =>
      applyStatusFilter(applyOrderFilters(
        serviceClient.from('orders').select('channel_code, delivery_type, payment_method_code'),
        { ignoreFacets: true },
      )).range(f, t),
    ),
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

  // Мініатюра першої позиції для рядка списку. Одним запитом на всю сторінку:
  // розгорнута картка вантажить фото сама, але робити по запиту на кожен рядок
  // списку — це 50 запитів із браузера на один екран.
  // Скільки мініатюр реально показує рядок: на десктопі дві, на телефоні три
  // (ItemThumbs max=3). Беремо більше з двох — інакше третя плитка на телефоні
  // назавжди лишалась сірою заглушкою.
  const ROW_THUMBS = 3;
  const firstSkus = [...new Set(
    ((orders ?? []) as { items?: { sku?: string }[] }[])
      .flatMap(o => (o.items ?? []).slice(0, ROW_THUMBS).map(i => i.sku))
      .filter((s): s is string => !!s),
  )];
  const { data: thumbRows } = firstSkus.length
    ? await serviceClient.from('products').select('sku, image').in('sku', firstSkus)
    : { data: [] as { sku: string; image: string | null }[] };
  const productThumbs: Record<string, string> = {};
  for (const row of (thumbRows ?? []) as { sku: string; image: string | null }[]) {
    if (row.image) productThumbs[row.sku] = row.image;
  }

  // Load sale docs (+чернетки — щоб РН можна було друкувати одразу після
  // відвантаження, не чекаючи доставки/проведення) + shipped quantities
  const orderIds = (orders ?? []).map(o => o.id);
  const { data: allDocsRaw } = orderIds.length
    ? await serviceClient
        .from('acc_documents')
        .select('id, order_id, doc_number, doc_type, reversal_of, status')
        .in('order_id', orderIds)
        .in('doc_type', ['sale', 'return_in'])
        .in('status', ['confirmed', 'draft'])
    : { data: [] as { id: string; order_id: string; doc_number: string; doc_type: string; reversal_of: string | null; status: string }[] };

  const saleDocsRaw = (allDocsRaw ?? []).filter(d => d.doc_type === 'sale');
  const returnDocsRaw = (allDocsRaw ?? []).filter(d => d.doc_type === 'return_in' && !d.reversal_of && d.status === 'confirmed');

  // Відвантажені кількості — ЛИШЕ з проведених РН (чернетки сюди не входять,
  // щоб не міняти семантику кнопки «Відвантажити»)
  const saleDocIds = (saleDocsRaw ?? []).filter(d => d.status === 'confirmed').map(d => d.id);
  const { data: saleLines } = saleDocIds.length
    ? await serviceClient
        .from('acc_document_lines')
        .select('document_id, sku, qty')
        .in('document_id', saleDocIds)
    : { data: [] as { document_id: string; sku: string; qty: number }[] };

  const initialSaleDocs: Record<string, { id: string; number: string; status: string }[]> = {};
  for (const doc of saleDocsRaw ?? []) {
    if (!initialSaleDocs[doc.order_id]) initialSaleDocs[doc.order_id] = [];
    initialSaleDocs[doc.order_id].push({ id: doc.id, number: doc.doc_number, status: doc.status });
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

  // Sum per status. Скасовані в суми не входять — вони не виручка.
  const amountRows = (statusRows ?? []).filter(r => r.status !== 'cancelled');
  const statusAmounts = amountRows.reduce<Record<string, number>>((acc, row) => {
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
  const totalAmount = amountRows.reduce((s, r) => s + Number(r.total_price ?? 0), 0);

  // Лічильники для чіпів каналу й перевізника (фасети — без власного фільтра)
  const channelCounts = (channelRows ?? []).reduce<Record<string, number>>((acc, r) => {
    const key = r.channel_code ?? 'website';
    acc[key] = (acc[key] ?? 0) + 1;
    return acc;
  }, {});
  const carrierCounts = (channelRows ?? []).reduce<Record<string, number>>((acc, r) => {
    if (r.delivery_type === 'pickup') return acc;
    const key = (r.delivery_type === ROZETKA_DELIVERY_TYPE || r.delivery_type === RZ_DELIVERY_TYPE) ? 'rozetka' : 'nova';
    acc[key] = (acc[key] ?? 0) + 1;
    return acc;
  }, {});
  const payCounts = (channelRows ?? []).reduce<Record<string, number>>((acc, r) => {
    const key = r.payment_method_code ?? 'other';
    acc[key] = (acc[key] ?? 0) + 1;
    return acc;
  }, {});

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
                  background: isActive ? '#D8E6F5' : 'var(--bg-card)',
                  border: isActive ? '1.5px solid #1E3A5F' : '1px solid var(--border-light)',
                  boxShadow: isActive ? '0 2px 8px rgba(30,58,95,0.12)' : '0 1px 2px rgba(15,23,42,0.05)',
                  transition: 'all 0.15s', textAlign: 'center',
                }}
              >
                {/* Рядок 1: назва + лічильник інлайн (чип завжди в одному рядку з назвою). */}
                {/* height 22 + flexShrink 0, а не 30: при 30 рядок УМІЩАВСЯ лише там,
                    де під ним є сума — flexbox стискав його до 22. На картках без суми
                    («Скасовано», «Очікує оплати») він лишався 30, і назва сиділа на 4px
                    нижче, ніж у сусідів. 22 + 5 + 15 = 42 влазить у 44px контент-бокса,
                    тож тепер висота однакова в обох випадках. */}
                {(() => {
                  const amount = tab.value === '' ? totalAmount : (statusAmounts[tab.value] ?? 0);
                  const hasAmount = amount > 0;
                  // Лічильник замовлень — завжди в рядку з назвою: він читається як
                  // частина заголовка («Скасовано 15»), а не як окреме значення.
                  const countChip = cnt > 0 && (
                    <span style={{
                      flexShrink: 0,
                      fontSize: '10px', fontWeight: 700, lineHeight: '15px',
                      padding: '0 5px', borderRadius: '7px',
                      background: isNew ? '#EF4444' : isActive ? '#D5E4F4' : '#E0ECF8',
                      color: isNew ? '#fff' : isActive ? '#1E3A5F' : '#3B6EA5',
                    }}>{cnt}</span>
                  );
                  // Невирішені відмови (посилки їдуть назад — треба забрати з пошти
                  // або відмовитись). Окреме попередження, не частина заголовка, тож
                  // стоїть нижче — там, де в інших картках сума.
                  const returnsChip = tab.value === 'cancelled' && pendingReturns > 0 && (
                    <span title={`Посилок у дорозі назад без рішення: ${pendingReturns} — відкрийте замовлення і виберіть «забрати з пошти» чи «залишити»`} style={{
                      flexShrink: 0,
                      fontSize: '10px', fontWeight: 700, lineHeight: '15px',
                      padding: '0 5px', borderRadius: '7px',
                      background: '#FFEDD5',
                      color: '#C2410C',
                    }}>↩ {pendingReturns}</span>
                  );
                  return (
                    <>
                      {/* Рядок 1: назва + лічильник замовлень. Разом вони вміщаються
                          скрізь; не вміщалося тільки коли сюди ж додавався чип відмов —
                          його й винесено на другий рядок. */}
                      <div style={{ height: '22px', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', textAlign: 'center', overflow: 'hidden' }}>
                        {/* inline-flex, а не звичайний inline: чипи вирівнювались через
                            vertical-align, і на «Скасовано» — де їх ДВА — рядок ставав
                            вищим за решту, через що назва зʼїжджала відносно сусідів. */}
                        <span className="oc-tab-label" style={{
                          display: 'inline-flex', alignItems: 'center', gap: '4px',
                          fontSize: '11.5px', fontWeight: 600, lineHeight: 1.15, letterSpacing: '0px', whiteSpace: 'nowrap',
                          color: isActive ? '#1E3A5F' : 'var(--text-muted)',
                        }}>
                          {tab.label}
                          {countChip}
                        </span>
                      </div>
                      {/* Рядок 2: сума — головний акцент. Якщо суми немає, тут стоїть
                          попередження про невирішені відмови (лише «Скасовано»). */}
                      {hasAmount ? (
                        <span style={{
                          fontSize: '15px', fontWeight: 800, lineHeight: 1,
                          color: '#15803D',
                          whiteSpace: 'nowrap', letterSpacing: '-0.2px',
                        }}>
                          {amount.toLocaleString('uk-UA', { maximumFractionDigits: 0 })} ₴
                        </span>
                      ) : returnsChip ? (
                        <span style={{ display: 'inline-flex', alignItems: 'center' }}>{returnsChip}</span>
                      ) : null}
                    </>
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

      <AdminOrders key={curStatus} initialSearch={search} channelFilter={channel} carrierFilter={carrier} payFilter={pay} channelCounts={channelCounts} carrierCounts={carrierCounts} payCounts={payCounts} totalFound={count ?? 0} productThumbs={productThumbs} initialOrders={orders ?? []} currentPage={page} totalPages={totalPages} userRole={userRole} hasRecentReceipts={(recentReceiptCount ?? 0) > 0} expandOrderId={expandOrderId} dateFrom={dateFrom} dateTo={dateTo} statusCounts={statusCounts} currentStatus={curStatus} sortBy={sortBy} sortDir={sortAsc ? 'asc' : 'desc'} promCommissionPct={promCommissionPct} rozetkaCommissionPct={rozetkaCommissionPct} feeTariffs={feeTariffs} initialSaleDocs={initialSaleDocs} initialReturnDocs={initialReturnDocs} initialShippedQty={initialShippedQty} />
    </div>
  );
}
