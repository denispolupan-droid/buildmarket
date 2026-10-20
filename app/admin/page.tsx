import { redirect } from 'next/navigation';
import { createClient } from '@supabase/supabase-js';
import { createSupabaseServer } from '../../lib/supabase-server';
import { fetchAllRows } from '../../lib/db-paginate';
import AdminOrders from './AdminOrders';
import { settlementMap, type SettlementEntry } from '../../lib/accounting/order-settlement';
import Link from 'next/link';
import NewOrderButton from './orders/NewOrderButton';
import { SMART_TARIFF_KEY, parseSmartTariff } from '../../lib/rozetka-smart-tariff';
import { ROZETKA_DELIVERY_TARIFF_KEY, parseRozetkaDeliveryTariff } from '../../lib/rozetka-delivery-tariff';
import { PROM_DELIVERY_TARIFF_KEY, parsePromDeliveryTariff } from '../../lib/prom-delivery-fee';
import { escapeOrTerm, orderNumberFilter } from '../../lib/pg-filter';
import { ROZETKA_DELIVERY_TYPE } from '../../lib/rozetka-delivery';
import { RZ_DELIVERY_TYPE } from '../../lib/rz-delivery';
import { PAYMENT_METHOD_ORDER, type PaymentMethodCode } from '../../lib/payment-method';
import { kyivBounds, statusDateOrFilter, createdOrFilter, matchesEventDate, matchesCreatedDate } from '../../lib/orders/date-filter';
import { ORDER_TAB_ORDER, ORDER_TAB_LABELS } from '../../lib/orders/status';

const serviceClient = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

const PAGE_SIZE = 50;

// Порядок — за робочим циклом (рішення власника): нові → підтверджені →
// очікують оплати → далі логістика і термінальні статуси.
// Порядок і підписи вкладок — з lib/orders/status, поруч зі списком статусів
// і правилами переходів, щоб не розходились.
const STATUS_TABS = ORDER_TAB_ORDER.map(value => ({ value, label: ORDER_TAB_LABELS[value] }));

export default async function AdminPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; status?: string; expand?: string; dateFrom?: string; dateTo?: string; sortBy?: string; sortDir?: string; q?: string; channel?: string; carrier?: string; pay?: string; ret?: string; sent?: string }>;
}) {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  const userRole = user?.app_metadata?.role ?? '';
  if (!user || !['admin', 'manager'].includes(userRole)) redirect('/');

  const {
    page: pageStr, status: statusParam, expand: expandOrderId, dateFrom, dateTo,
    sortBy: sortByParam, sortDir: sortDirParam, q: qParam, channel: channelParam, carrier: carrierParam,
    pay: payParam, ret: retParam, sent: sentParam,
  } = await searchParams;
  const search  = (qParam ?? '').trim();
  const channel = channelParam ?? '';
  const carrier = carrierParam ?? '';
  // Чи надіслано постачальнику (orders.supplier_sent_at): фільтр колонки «Відпр.»
  const sent = sentParam === 'sent' || sentParam === 'unsent' ? sentParam : '';
  // Форма оплати — код із generated-колонки orders.payment_method_code
  // (див. міграцію 099). Фільтрувати по payment_type не можна: у частини
  // замовлень маркетплейсів він розходиться з фактичним способом оплати.
  const pay = PAYMENT_METHOD_ORDER.includes(payParam as PaymentMethodCode) ? payParam! : '';
  // Зріз «повернення без рішення» (див. applyReturnPendingFilter нижче)
  const ret = retParam === 'pending' ? 'pending' : '';
  // Сортування — кліком по заголовку колонки журналу (15.10.2026); тут — білий
  // список колонок, бо значення приходить з адресного рядка.
  const SORT_COLS: Record<string, string> = {
    created_at: 'created_at', total_price: 'total_price', order_number: 'order_number',
    contact: 'contact', delivery_type: 'delivery_type', status: 'status',
    channel_code: 'channel_code', payment_method_code: 'payment_method_code', fulfillment_mode: 'fulfillment_mode',
  };
  const sortBy  = SORT_COLS[sortByParam ?? ''] ?? 'created_at';
  const sortAsc = sortDirParam === 'asc';
  // Якщо відкриваємо конкретне замовлення — показуємо всі статуси.
  // Без явного ?status= в URL (перший заход на сторінку) — за замовчуванням показуємо нові.
  const status = expandOrderId ? (statusParam ?? '') : (statusParam ?? 'new');
  // Період за київським днем; межі незалежні — лише «з» означає «з дати і далі»
  const periodBounds = kyivBounds(dateFrom, dateTo);
  const allTab = status === '' && !ret;
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
  function applyOrderFilters<T>(query: T, opts?: { ignoreFacets?: boolean; dateMode?: 'tab' | 'union' | 'event' }): T {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let q = query as any;
    // Період за київським днем (lib/orders/date-filter). Вкладка «Всі» — за
    // датою створення, вкладки статусів — за датою події (доставлено →
    // delivered_at тощо). 'union' — для лічильників вкладок: вибираємо рядки,
    // що проходять будь-яке з правил, а розкладаємо вже в коді.
    const dateOr = opts?.dateMode === 'union'
      ? [statusDateOrFilter(periodBounds), createdOrFilter(periodBounds)].filter(Boolean).join(',') || null
      : (allTab && opts?.dateMode !== 'event' ? createdOrFilter(periodBounds) : statusDateOrFilter(periodBounds));
    if (dateOr) q = q.or(dateOr);
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
      if (sent === 'sent')        q = q.not('supplier_sent_at', 'is', null);
      else if (sent === 'unsent') q = q.is('supplier_sent_at', null);
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
      // '+38 (068) 052-92-36' із сайту), тому цифри запиту шукаємо в
      // phone_digits — колонці без роздільників (міграція 133). До неї
      // «068052» не знаходило нічого, бо в базі між цифрами стояли ) і -.
      if (digits.length >= 3) ors.push(`phone_digits.ilike.%${digits}%`);
      // Номер замовлення — повний або з початку («261010» → 26101000…26101099),
      // див. orderNumberFilter. Довге число (ТТН, телефон) туди не потрапляє:
      // int4 на ньому валив би ВЕСЬ запит «out of range for type integer».
      const byNumber = orderNumberFilter(term);
      if (byNumber) ors.push(byNumber);
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
  /**
   * «Повернення без рішення» — посилка фізично їде назад, а менеджер ще не
   * сказав, що з нею робити (забрати з пошти чи залишити). Три джерела, бо
   * повернення починається по-різному:
   *   скасоване замовлення, яке перевізник УЖЕ прийняв (carrier_accepted_at) —
   *   відмова на пошті, скасування в кабінеті МП чи наше рішення;
   *   оформлена заявка на повернення НП (np_return_ref) — буває і на
   *   доставленому замовленні;
   *   відома зворотна накладна (np_return_tracking).
   * Рішення лежить у flags (return_received / return_abandoned) — прийняті
   * звідси випадають. Той самий предикат рахує isReturnPending у AdminOrders,
   * тому мітка «↩ забрати?» в рядку і цей фільтр завжди показують одне й те саме.
   */
  function applyReturnPendingFilter<T>(query: T): T {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let q = query as any;
    q = q.or('and(status.eq.cancelled,carrier_accepted_at.not.is.null),np_return_ref.not.is.null,np_return_tracking.not.is.null');
    // flags — text[] NOT NULL DEFAULT '{}' (міграція 077), тож заперечення по
    // масиву не губить рядки, як губило б на nullable-колонці.
    q = q.not('flags', 'cs', '{return_received}').not('flags', 'cs', '{return_abandoned}');
    return q as T;
  }

  function applyStatusFilter<T>(query: T): T {
    // Зріз повернень навмисно ПЕРЕКРИВАЄ вкладку статусу: такі замовлення
    // шукають не по статусу, а по факту «висить без рішення», і частина з них
    // (заявка на повернення НП) лежить поза «Скасовано».
    if (ret === 'pending') return applyReturnPendingFilter(query);
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
  const [{ data: orders, count }, statusRows, { count: recentReceiptCount }, channelRows, { count: pendingReturnsRaw }, { data: promSetting }, { data: rozetkaSetting }] = await Promise.all([
    query,
    // Лічильники вкладок — по тому ж зрізу, що й список (пошук/канал/перевізник),
    // інакше вкладка каже «89», а в списку три рядки.
    // Дати події — щоб розкласти рядки за правилом вкладки (див. eventRows нижче)
    fetchAllRows<{ status: string; carrier_accepted_at: string | null; total_price: number | null; created_at: string | null; delivered_at: string | null; cancelled_at: string | null; shipped_at: string | null }>((f, t) =>
      applyOrderFilters(serviceClient.from('orders').select('status, carrier_accepted_at, total_price, created_at, delivered_at, cancelled_at, shipped_at'), { dateMode: 'union' }).order('id').range(f, t),
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
    fetchAllRows<{ channel_code: string | null; delivery_type: string | null; payment_method_code: string | null; supplier_sent_at: string | null }>((f, t) =>
      applyStatusFilter(applyOrderFilters(
        serviceClient.from('orders').select('channel_code, delivery_type, payment_method_code, supplier_sent_at'),
        { ignoreFacets: true },
      )).order('id').range(f, t),
    ),
    // Скільки посилок їде назад без рішення — тим самим запитом, що й сам зріз,
    // тому цифра на чіпі завжди дорівнює довжині списку під ним.
    applyReturnPendingFilter(applyOrderFilters(
      serviceClient.from('orders').select('id', { count: 'exact', head: true }),
      { dateMode: 'event' },
    )),
    serviceClient.from('app_settings').select('value').eq('key', 'prom_commission_pct').maybeSingle(),
    serviceClient.from('app_settings').select('value').eq('key', 'rozetka_commission_pct').maybeSingle(),
  ]);
  const promCommissionPct = parseFloat(promSetting?.value ?? '3');
  const rozetkaCommissionPct = parseFloat(rozetkaSetting?.value ?? '15');

  // Сума саме того, що в списку: той самий зріз, що й основний запит (вкладка,
  // період, пошук, фільтри колонок, «повернення без рішення»), по всіх
  // сторінках. Раніше підсумок брав суму вкладки без фільтрів, а для зрізу
  // повернень не показував її зовсім (19.10.2026).
  // Скасовані в суму не входять (вони не виручка) — окрім вкладки «Скасовано» й
  // зрізу повернень, де весь список і є скасованими.
  const filteredRows = await fetchAllRows<{ total_price: number | null; status: string }>((f, t) =>
    applyStatusFilter(applyOrderFilters(serviceClient.from('orders').select('total_price, status'))).order('id').range(f, t),
  );
  const countCancelled = status === 'cancelled' || !!ret;
  const filteredAmount = filteredRows
    .filter(r => countCancelled || r.status !== 'cancelled')
    .reduce((s, r) => s + Number(r.total_price ?? 0), 0);

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

  // «Виплачено»: чи дійшли гроші за замовлення до наших рахунків — з леджера
  // (рахунок customer по order_id, lib/accounting/order-settlement)
  const { data: settleRaw } = orderIds.length
    ? await serviceClient
        .from('money_entries')
        .select('order_id, counterparty_id, amount, doc_type')
        .eq('account_type', 'customer')
        .in('order_id', orderIds)
        .limit(5000)
    : { data: [] as SettlementEntry[] };
  const initialSettlement = settlementMap((settleRaw ?? []) as SettlementEntry[]);

  const saleDocsRaw = (allDocsRaw ?? []).filter(d => d.doc_type === 'sale');
  const returnDocsRaw = (allDocsRaw ?? []).filter(d => d.doc_type === 'return_in' && !d.reversal_of && d.status === 'confirmed');

  // Відвантажені кількості — ЛИШЕ з проведених РН (чернетки сюди не входять,
  // щоб не міняти семантику кнопки «Відвантажити»)
  const saleDocIds = (saleDocsRaw ?? []).filter(d => d.status === 'confirmed' && !d.reversal_of).map(d => d.id); // сторно-РН (від'ємні рядки) не рахуємо — кейс #26091002, 01.09.2026
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

  // statusRows — об'єднання двох правил періоду. Вкладки статусів рахуються за
  // датою події, «Всі» — за датою створення (як і їхні списки).
  const eventRows   = (statusRows ?? []).filter(r => matchesEventDate(r, periodBounds));
  const createdRows = (statusRows ?? []).filter(r => matchesCreatedDate(r, periodBounds));


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
  // Надіслано постачальнику / ще ні — для меню колонки «Відпр.»
  const sentCounts = (channelRows ?? []).reduce<Record<string, number>>((acc, r) => {
    const key = r.supplier_sent_at ? 'sent' : 'unsent';
    acc[key] = (acc[key] ?? 0) + 1;
    return acc;
  }, {});

  // Count orders per status
  const statusCounts = eventRows.reduce<Record<string, number>>((acc, row) => {
    // shipped розділяємо: не прийнятий НП → «Готово до відправки», прийнятий → «Відправлено».
    if (row.status === 'shipped') {
      const key = row.carrier_accepted_at ? 'shipped' : 'ready_to_ship';
      acc[key] = (acc[key] ?? 0) + 1;
    } else if (row.status) {
      acc[row.status] = (acc[row.status] ?? 0) + 1;
    }
    return acc;
  }, {});
  const totalCount = createdRows.length;

  // Невирішені повернення — рахує БД тим самим предикатом, що фільтрує список
  // (applyReturnPendingFilter): посилка їде назад, рішення «забрати / залишити»
  // ще немає.
  const pendingReturns = pendingReturnsRaw ?? 0;

  const totalPages = Math.ceil((count ?? 0) / PAGE_SIZE);
  const curStatus = status;

  return (
    <div className="admin-orders-page" style={{ padding: '20px 16px 64px' }}>

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <h1 style={{ fontSize: '22px', fontWeight: 800, color: 'var(--text-primary)', margin: 0 }}>
          Замовлення
        </h1>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          {/* Реєстр НП — рідко потрібен, тож живе тут, а не в панелі фільтрів */}
          <Link href="/admin/dispatch" className="admin-np-link" title="Реєстри відправлень Нової Пошти">
            Реєстр НП
          </Link>
          <NewOrderButton />
        </div>
      </div>

      {/* Вкладки статусів — як у «Фінансах» (.fin-tab): підкреслення замість
          плиток, лічильник у рядку з назвою. Сума активної вкладки — рядком
          нижче, великим числом (редизайн 15.10.2026, варіант A). Закріплені
          зверху для швидкого переходу між статусами при прокрутці. */}
      <div className="admin-status-bar" style={{ position: 'sticky', top: 0, zIndex: 60, background: 'var(--bg-page)', padding: '12px 0 0', marginBottom: '12px' }}>
        <nav aria-label="Статуси" className="admin-status-tabs">
          {STATUS_TABS.map(tab => {
            // Поки активний зріз повернень, список не відповідає жодній вкладці —
            // підсвічувати одну з них означало б збрехати про те, що на екрані.
            const isActive = !ret && curStatus === tab.value;
            const cnt = tab.value === '' ? totalCount : (statusCounts[tab.value] ?? 0);
            const isNew = tab.value === 'new';
            // Невирішені відмови (посилки їдуть назад — треба забрати з пошти
            // або відмовитись) — окреме попередження біля «Скасовано».
            const returnsChip = tab.value === 'cancelled' && pendingReturns > 0 && (
              <span className="admin-status-returns" title={`Посилок у дорозі назад без рішення: ${pendingReturns} — відкрийте замовлення і виберіть «забрати з пошти» чи «залишити». Усі одразу — фільтр «↩ Повернення без рішення» під вкладками`}>↩ {pendingReturns}</span>
            );
            return (
              <Link
                key={tab.value}
                className={`admin-status-tab${isActive ? ' active' : ''}${cnt === 0 && tab.value ? ' empty' : ''}`}
                aria-current={isActive ? 'page' : undefined}
                href={`/admin?status=${tab.value}${dateFrom ? `&dateFrom=${dateFrom}` : ''}${dateTo ? `&dateTo=${dateTo}` : ''}`}
              >
                {tab.label}
                {cnt > 0 && <span className={`admin-status-count${isNew ? ' alert' : ''}`}>{cnt}</span>}
                {returnsChip}
              </Link>
            );
          })}
        </nav>
      </div>

      {/* Підсумок активної вкладки (сума, кількість, середній чек) малює
          AdminOrders — в одному рядку з фільтром періоду. Для зрізу повернень
          вкладки немає, тож суми не передаємо. */}

      <AdminOrders key={`${curStatus}|${ret}`} initialSearch={search} channelFilter={channel} carrierFilter={carrier} payFilter={pay} sentFilter={sent} sentCounts={sentCounts} retFilter={ret} pendingReturns={pendingReturns} channelCounts={channelCounts} carrierCounts={carrierCounts} payCounts={payCounts} totalFound={count ?? 0} summaryAmount={filteredAmount} productThumbs={productThumbs} initialOrders={orders ?? []} currentPage={page} totalPages={totalPages} userRole={userRole} hasRecentReceipts={(recentReceiptCount ?? 0) > 0} expandOrderId={expandOrderId} dateFrom={dateFrom} dateTo={dateTo} statusCounts={statusCounts} currentStatus={ret ? '' : curStatus} sortBy={sortBy} sortDir={sortAsc ? 'asc' : 'desc'} promCommissionPct={promCommissionPct} rozetkaCommissionPct={rozetkaCommissionPct} feeTariffs={feeTariffs} initialSaleDocs={initialSaleDocs} initialReturnDocs={initialReturnDocs} initialShippedQty={initialShippedQty} initialSettlement={initialSettlement} />
    </div>
  );
}
