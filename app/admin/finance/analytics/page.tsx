import Link from 'next/link';
import FinanceTabs from '../FinanceTabs';
import { fetchAllRows } from '../../../../lib/db-paginate';
import { loadOrderLines, linesOf } from '../../../../lib/orders/lines-read';
import { loadProfitEstimates } from '../../../../lib/accounting/estimate';
import { summarizePL, PL_ACCOUNTS } from '../../../../lib/accounting/profit-rules';
import { requireStaffPage } from '../../../../lib/auth-guard';
import { createServiceClient } from '../../../../lib/supabase-service';
import { fmtInt as fmt } from '../../../../lib/format';
import { loadProfitBridge } from '../../../../lib/accounting/profit-bridge';
import { resolvePeriod } from '../overview-data';
import ProfitBridgeCard from '../ProfitBridgeCard';
import OverviewSummary from '../OverviewSummary';
import { SOURCE_META } from '../channel-meta';
import { attributeOwnSales } from '../../../../lib/accounting/stock-supplier';

const db = createServiceClient();

export const dynamic = 'force-dynamic';

const UA_MONTHS = ['Січ','Лют','Бер','Кві','Тра','Чер','Лип','Серп','Вер','Жов','Лис','Гру'];

const CHANNEL_LABELS: Record<string, string> = {
  website:  'Сайт',
  prom:     'Prom.ua',
  rozetka:  'Rozetka',
  epicentr: 'Епіцентр',
  b2b:      'Опт (B2B)',
  phone:    'Телефон',
  retail:   'Роздріб',
  dropship: 'Дроп',
};

export default async function FinancePage({ searchParams }: { searchParams: Promise<{ p?: string }> }) {
  // Гейт сторінки: layout пускає admin|manager, а дані тут — лише для admin (аудит 31.10.2026)
  await requireStaffPage('admin');
  // Останні 6 місяців
  const now      = new Date();
  const sixAgo   = new Date(now);
  sixAgo.setMonth(sixAgo.getMonth() - 5);
  sixAgo.setDate(1); sixAgo.setHours(0, 0, 0, 0);

  // ── Період дашборда: пресет через ?p= (місяць за замовчуванням) ──────────
  // Ті самі межі періоду, що на «Огляді» (resolvePeriod): інакше одна й та сама
  // цифра «факт» розходилась між вкладками через межі доби (07.11.2026)
  const { p } = await searchParams;
  const { preset, periodFrom, periodTo, prevFrom, periodLabel } = resolvePeriod(p);
  const kyivYmd = (d: Date) => d.toLocaleDateString('en-CA', { timeZone: 'Europe/Kyiv' });

  const monthStart = periodFrom.toISOString();

  // Замовлення (не нові і не скасовані) за останні 6 місяців
  //    Пагінація: за 6 місяців кількість замовлень легко > 1000 → дашборд занижував виручку.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- untyped supabase client
  const ordersFromDate = new Date(Math.min(sixAgo.getTime(), prevFrom.getTime()));
  const orders = await fetchAllRows<any>((f, t) => db
    .from('orders')
    .select('id, order_number, status, total_price, created_at, channel_code, customer_id, phone, contact, company')
    .not('status', 'in', '(new,cancelled)')
    .gte('created_at', ordersFromDate.toISOString())
    .order('created_at', { ascending: false })
    .order('id')   // тайбрейкер: однакові created_at інакше дають нестабільні сторінки
    .range(f, t));
  // Позиції — з таблиці order_lines (етап B, docs/ORDER-LINES-PLAN.md), не з jsonb:
  // та сама форма { sku, qty, price }, але без payload у кожному рядку замовлення.
  const linesByOrder = await loadOrderLines(db, orders.map(o => o.id as string));
  for (const o of orders) o.items = linesOf(linesByOrder, o.id as string);

  // Підтверджені РН з реальною FIFO-собівартістю, прив'язані до замовлень
  const accDocs = await fetchAllRows((f, t) => db
    .from('acc_documents')
    .select('id, order_id, doc_date, total_amount, total_cost, channel_code')
    .eq('doc_type', 'sale')
    .eq('status', 'confirmed')
    .is('reversal_of', null)   // без сторно-документів (їх оригінал 'cancelled' і вже виключений)
    .not('order_id', 'is', null)
    .gte('doc_date', sixAgo.toISOString())
    .order('id')
    .range(f, t));

  // ── Фактичний облік за поточний місяць — з леджера money_entries ──────────
  // Дашборд нижче — оперативна оцінка по замовленнях (вкл. невідвантажені).
  // Ця смужка — точні цифри з проведених документів, ті самі, що у «Звітах».
  const monthStartDate = kyivYmd(periodFrom);
  // Вікно: попередній період + поточний — щоб картка «Виручка · факт» мала дельту
  const prevFromDate = kyivYmd(prevFrom);
  // Пагінація обов'язкова: два місяці P&L-проводок — це > 1000 рядків (вересень 2026:
  // 1637 у вікні), без fetchAllRows PostgREST мовчки віддавав перші 1000 — картки
  // «Виручка · факт» показували 0, а «Валовий прибуток» −121 746 замість +11 403.
  const ledgerAllRows = await fetchAllRows<{ account_type: string; amount: number; doc_type: string | null; business_date: string }>((f, t) => {
    let q = db
      .from('money_entries')
      .select('account_type, amount, doc_type, business_date')
      .in('account_type', PL_ACCOUNTS)
      .gte('business_date', prevFromDate);
    if (periodTo) q = q.lt('business_date', kyivYmd(periodTo));
    return q.order('id').range(f, t);
  });
  const ledgerRows     = ledgerAllRows.filter(r => r.business_date >= monthStartDate);
  const ledgerPrevRows = ledgerAllRows.filter(r => r.business_date < monthStartDate);

  // Те саме визначення, що на «Огляді» й у «Звітах» (lib/accounting/profit-rules):
  // валовий = виручка − COGS − витрати угод (комісії МП, еквайринг, доставка/збори
  // НП). До 12.09 тут не рахувались еквайринг і збори НП за переказ наложки —
  // картка розходилась з «Оглядом» на їхню суму (166 ₴ за вересень).
  const pl = summarizePL(ledgerRows);
  const ledger = {
    revenue:    pl.revenue,
    cogs:       pl.cogs,
    commission: pl.deal.marketplaceFee,
    // еквайринг + доставка/збори НП — решта витрат угод
    delivery:   pl.deal.total - pl.deal.marketplaceFee,
  };
  const ledgerGross = pl.grossProfit;
  const prevPL = summarizePL(ledgerPrevRows);
  const prevLedgerRevenue = -ledgerPrevRows.filter(r => r.account_type === 'revenue')
    .reduce((s, r) => s + Number(r.amount), 0);

  // ── Прибуток по кожному замовленню: факт із леджера (COGS FIFO нетто повернень,
  // комісія МП з доп. зборами, еквайринг/збори НП) або, поки не вручено, прогноз
  // (поточна закупівля + оцінювач комісій каналу). Один модуль на всі екрани —
  // lib/accounting/estimate; до 04.11.2026 тут була своя копія з плоскою ставкою
  // категорії для Rozetka замість порогів, і прогноз розходився з «Оглядом».
  const estimates = await loadProfitEstimates(db, orders, { lines: linesByOrder });

  // Рядки підтверджених РН — для собівартості по SKU в таблиці топ-товарів.
  // .in() — порціями: id РН за 6 місяців ідуть в URL запиту, і 07.11.2026 на 651 РН
  // (~24 КБ) PostgREST відповів «Bad Request» → 500 усієї сторінки.
  const accDocIds = accDocs.map(d => d.id as string);
  const DOC_CHUNK = 200;
  const accDocChunks: string[][] = [];
  for (let i = 0; i < accDocIds.length; i += DOC_CHUNK) accDocChunks.push(accDocIds.slice(i, i + DOC_CHUNK));
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- untyped supabase client
  const accLines: any[] = (await Promise.all(accDocChunks.map(c =>
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- untyped supabase client
    fetchAllRows<any>((f, t) => db.from('acc_document_lines').select('sku, qty, price, cost_price, supplier_id, document_id').in('document_id', c).order('id').range(f, t)),
  ))).flat();

  // Зважена середня собівартість за SKU з FIFO-даних РН
  const skuCostAgg: Record<string, { totalCost: number; totalQty: number }> = {};
  for (const line of accLines ?? []) {
    if (!skuCostAgg[line.sku]) skuCostAgg[line.sku] = { totalCost: 0, totalQty: 0 };
    skuCostAgg[line.sku].totalCost += Number(line.cost_price ?? 0) * Number(line.qty ?? 0);
    skuCostAgg[line.sku].totalQty  += Number(line.qty ?? 0);
  }
  const skuAccCostMap = new Map(
    Object.entries(skuCostAgg).map(([sku, a]) => [sku, a.totalQty > 0 ? a.totalCost / a.totalQty : 0])
  );

  // Всі SKU з усіх замовлень — для назв товарів, брендів і категорій
  const allOrderSkus = [...new Set(
    (orders ?? []).flatMap(o => (o.items ?? []).map((i: { sku: string }) => i.sku))
  )];
  const skuChunks: string[][] = [];
  for (let i = 0; i < allOrderSkus.length; i += 200) skuChunks.push(allOrderSkus.slice(i, i + 200));
  const productNames = (await Promise.all(skuChunks.map(c =>
    db.from('products').select('sku, name, brand, category_slug').in('sku', c).limit(200).then(r => r.data ?? []),
  ))).flat();
  const prodMap  = new Map(productNames.map(p => [p.sku, p]));

  type OrderRow = {
    id: string; order_number: number; status: string;
    total_price: number; created_at: string; channel_code: string | null;
    cost: number; commission: number; margin: number;
    /** Виручка угоди: проведена (вручені) або сума замовлення — база для margin і % у блоках «факт». */
    revenue: number;
    items: { sku: string; qty: number; price: number }[];
    customer_id: string | null; phone: string | null;
  };

  // margin — валовий за визначенням profit-rules: для вручених мінус ще й
  // еквайринг/збори НП (тому для них margin ≠ total − cost − commission на їхню суму)
  const rows: OrderRow[] = (orders ?? []).map(o => {
    const e = estimates.get(o.id);
    const cost = e?.cogs ?? 0, commission = e?.fee ?? 0;
    const revenue = e?.revenue ?? Number(o.total_price);
    return { ...o, cost, commission, revenue, margin: e?.gross ?? (revenue - cost - commission) };
  });

  // ── Поточний місяць ────────────────────────────────────────────────────────

  const periodToIso   = periodTo?.toISOString();
  const thisMonthRows = rows.filter(r => r.created_at >= monthStart && (!periodToIso || r.created_at < periodToIso));
  const prevFromIso   = prevFrom.toISOString();
  const prevMonthRows = rows.filter(r => r.created_at >= prevFromIso && r.created_at < monthStart);

  const sumRevenue    = (arr: OrderRow[]) => arr.reduce((s, r) => s + r.total_price, 0);
  const sumCost       = (arr: OrderRow[]) => arr.reduce((s, r) => s + r.cost, 0);
  const sumCommission = (arr: OrderRow[]) => arr.reduce((s, r) => s + r.commission, 0);
  const sumMargin     = (arr: OrderRow[]) => arr.reduce((s, r) => s + r.margin, 0);

  const cur = { revenue: sumRevenue(thisMonthRows), cost: sumCost(thisMonthRows), commission: sumCommission(thisMonthRows), margin: sumMargin(thisMonthRows), count: thisMonthRows.length };
  const prv = { revenue: sumRevenue(prevMonthRows), cost: sumCost(prevMonthRows), commission: sumCommission(prevMonthRows), margin: sumMargin(prevMonthRows), count: prevMonthRows.length };


  // ── Щомісячні дані (останні 6 місяців) ────────────────────────────────────

  const months: { label: string; key: string; revenue: number; margin: number; count: number }[] = [];
  for (let i = 5; i >= 0; i--) {
    const d     = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key   = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const label = `${UA_MONTHS[d.getMonth()]} ${d.getFullYear() !== now.getFullYear() ? d.getFullYear() : ''}`.trim();
    const mRows = rows.filter(r => r.created_at.slice(0, 7) === key);
    months.push({ label, key, revenue: sumRevenue(mRows), margin: sumMargin(mRows), count: mRows.length });
  }

  // ── Помісячно за обліком (6 міс.): P&L-проводки за датою проводки — для таблиці
  // «По місяцях · факт обліку» і тренду комісій МП (скільки % виручки з'їдає площадка) ──
  const feeTrendRows = await fetchAllRows<{ account_type: string; amount: number; counterparty_id: string | null; business_date: string; doc_type: string | null; order_id: string | null }>((f, t) => db
    .from('money_entries')
    .select('account_type, amount, counterparty_id, business_date, doc_type, order_id')
    .in('account_type', PL_ACCOUNTS)
    .gte('business_date', kyivYmd(sixAgo))
    .order('id')
    .range(f, t));
  const monthsFact = months.map(m => {
    const inMonth = feeTrendRows.filter(r => r.business_date.slice(0, 7) === m.key);
    const mpl = summarizePL(inMonth);
    const delivered = new Set(inMonth.filter(r => r.account_type === 'revenue' && r.doc_type === 'sale' && r.order_id).map(r => r.order_id)).size;
    return { label: m.label, key: m.key, revenue: mpl.revenue, gross: mpl.grossProfit, net: mpl.netProfit, delivered,
      pct: mpl.revenue > 0 ? Math.round(mpl.grossProfit / mpl.revenue * 1000) / 10 : null };
  });
  const monthsFactHasData = monthsFact.some(m => m.revenue !== 0 || m.gross !== 0);
  const feeTrend = months.map(m => {
    const inMonth = feeTrendRows.filter(r => r.business_date.slice(0, 7) === m.key);
    const rev  = -inMonth.filter(r => r.account_type === 'revenue').reduce((s, r) => s + Number(r.amount), 0);
    const prom = inMonth.filter(r => r.account_type === 'marketplace_fee' && r.counterparty_id === 'prom').reduce((s, r) => s + Number(r.amount), 0);
    const roz  = inMonth.filter(r => r.account_type === 'marketplace_fee' && r.counterparty_id === 'rozetka').reduce((s, r) => s + Number(r.amount), 0);
    const fee  = prom + roz;
    return { label: m.label, rev, prom, roz, fee, pct: rev > 0 ? Math.round((fee / rev) * 1000) / 10 : 0 };
  });
  const feeTrendHasData = feeTrend.some(m => m.fee !== 0);

  // ── Топ товарів по маржі ───────────────────────────────────────────────────

  // Топ товарів і розбивка по каналах — ТІЛЬКИ доставлені замовлення місяця (факт),
  // інакше в «прибуток» потрапляли товари, які ще навіть не відвантажені.
  const deliveredMonthRows = thisMonthRows.filter(r => r.status === 'delivered');

  const skuStats: Record<string, { revenue: number; cost: number; qty: number }> = {};
  for (const row of deliveredMonthRows) {
    // Рядки з оцінки: комісія рядка — оцінювач каналу; собівартість — FIFO із
    // проведених РН по SKU, інакше поточна закупівля з рядка оцінки
    for (const item of (estimates.get(row.id)?.lines ?? [])) {
      if (!skuStats[item.sku]) skuStats[item.sku] = { revenue: 0, cost: 0, qty: 0 };
      skuStats[item.sku].revenue += item.price * item.qty;
      skuStats[item.sku].cost   += (skuAccCostMap.get(item.sku) ?? item.unitCost ?? 0) * item.qty + item.fee;
      skuStats[item.sku].qty    += item.qty;
    }
  }

  // ── Збиткові / тонкі угоди (факт, доставлені за період): чистий прибуток < 0
  // або < 5% від виручки — ловить бонуси-подарунки, помилки прайсу, важкі комісії.
  const THIN_PCT = 5;
  // Причина одним рядком — що «з'їло» прибуток: собівартість чи збори (у % від виручки);
  // повна розкладка сумами — у підказці рядка
  const thinWhy = (r: OrderRow) => {
    const e = estimates.get(r.id);
    if (!e) return { reason: '', title: '' };
    const fees = e.fee + e.dealExtra + e.paymentFee;
    const pctOf = (v: number) => Math.round(v / e.revenue * 100);
    const reason = e.revenue <= 0 ? 'продажу немає (досилка / повернення)'
      : e.cogs >= e.revenue ? `собівартість ${pctOf(e.cogs)}% ціни`
      : `собів. ${pctOf(e.cogs)}% · збори ${pctOf(fees)}%`;
    const title = `виручка ${fmt(e.revenue)} ₴ − собівартість ${fmt(e.cogs)} ₴ − комісія площадки ${fmt(e.fee)} ₴`
      + (e.dealExtra ? ` − НП/еквайринг ${fmt(e.dealExtra)} ₴` : '') + (e.paymentFee ? ` − комісія за оплату ${fmt(e.paymentFee)} ₴` : '')
      + ` = ${fmt(e.gross)} ₴`;
    return { reason, title };
  };
  const thinDeals = deliveredMonthRows
    .map(r => ({ ...r, ...thinWhy(r), date: `${r.created_at.slice(8, 10)}.${r.created_at.slice(5, 7)}`, pct: r.revenue > 0 ? Math.round((r.margin / r.revenue) * 1000) / 10 : 0 }))
    .filter(r => r.margin < 0 || r.pct < THIN_PCT)
    .sort((a, b) => a.margin - b.margin)
    .slice(0, 10);

  // ── Валовий прибуток по брендах (факт: доставлені за період; комісія МП врахована в cost) ──
  const brandStats: Record<string, { revenue: number; margin: number; qty: number }> = {};
  for (const [sku, s] of Object.entries(skuStats)) {
    const brand = prodMap.get(sku)?.brand || '— без бренду —';
    if (!brandStats[brand]) brandStats[brand] = { revenue: 0, margin: 0, qty: 0 };
    brandStats[brand].revenue += s.revenue;
    brandStats[brand].margin  += s.revenue - s.cost;
    brandStats[brand].qty     += s.qty;
  }
  const brands = Object.entries(brandStats).sort((a, b) => b[1].margin - a[1].margin).slice(0, 8);

  // ── Валовий прибуток за кореневими категоріями (та сама база, що бренди) ──
  const { data: allCats } = await db.from('categories').select('slug, name, parent_slug');
  const catBySlug = new Map((allCats ?? []).map(c => [c.slug as string, c]));
  const rootCatName = (slug: string | null | undefined): string => {
    let cur = slug ? catBySlug.get(slug) : undefined;
    for (let i = 0; cur?.parent_slug && i < 6; i++) cur = catBySlug.get(cur.parent_slug) ?? cur;
    return (cur?.name as string) ?? '— без категорії —';
  };
  const catStats: Record<string, { revenue: number; margin: number; qty: number }> = {};
  for (const [sku, s] of Object.entries(skuStats)) {
    const cat = rootCatName(prodMap.get(sku)?.category_slug);
    if (!catStats[cat]) catStats[cat] = { revenue: 0, margin: 0, qty: 0 };
    catStats[cat].revenue += s.revenue;
    catStats[cat].margin  += s.revenue - s.cost;
    catStats[cat].qty     += s.qty;
  }
  const categories = Object.entries(catStats).sort((a, b) => b[1].margin - a[1].margin).slice(0, 8);
  const catTotalMargin = categories.reduce((s, [, c]) => s + Math.max(0, c.margin), 0);

  // ── Топ клієнти за прибутком (факт: доставлені за період) ──
  const clientStats = new Map<string, { name: string; revenue: number; margin: number; orders: number }>();
  for (const r of deliveredMonthRows) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ro = r as any;
    const name = String(ro.company || ro.contact || ro.phone || '—').trim();
    const key = ro.customer_id || name.toLowerCase();
    const c = clientStats.get(key) ?? { name, revenue: 0, margin: 0, orders: 0 };
    c.revenue += r.revenue; c.margin += r.margin; c.orders += 1;
    clientStats.set(key, c);
  }
  const topClients = [...clientStats.values()].sort((a, b) => b.margin - a.margin).slice(0, 8);

  // ── Валовий прибуток по постачальниках (факт: рядки проведених РН періоду) ──
  // supplier_id є лише в dropship-рядків; null = відвантаження з нашого складу.
  const periodDocIds = new Set(
    (accDocs ?? [])
      .filter(d => {
        const dd = String(d.doc_date ?? '');
        return dd >= monthStartDate && (!periodTo || dd < kyivYmd(periodTo));
      })
      .map(d => d.id as string),
  );
  // Продане з НАШОГО складу (supplier_id = null у рядку РН) — постачальник за
  // партіями FIFO (stock_batches): інакше «Ринок» і складський товар ЗРХ падали в «Наш склад».
  const docDate = new Map((accDocs ?? []).map(d => [d.id as string, String(d.doc_date ?? '')]));
  const ownLines = accLines.filter(l => l.supplier_id == null);
  const { data: batchRows } = ownLines.length
    ? await db.from('stock_batches').select('sku, supplier_id, initial_qty, received_at').in('sku', [...new Set(ownLines.map(l => l.sku as string))]).limit(2000)
    : { data: [] };
  const ownShares = attributeOwnSales(
    (batchRows ?? []).map(b => ({ sku: b.sku as string, supplierId: b.supplier_id as number | null, qty: Number(b.initial_qty), receivedAt: String(b.received_at) })),
    ownLines.map((l, i) => ({ key: `${l.document_id}:${l.sku}:${i}`, sku: l.sku as string, qty: Number(l.qty ?? 0), date: docDate.get(l.document_id) ?? '' })),
  );
  const ownKeyOf = new Map(ownLines.map((l, i) => [l, `${l.document_id}:${l.sku}:${i}`]));

  const supplierStats: Record<string, { revenue: number; margin: number; qty: number; stockQty: number }> = {};
  const addSupplier = (key: string, rev: number, margin: number, qty: number, fromStock: boolean) => {
    if (!supplierStats[key]) supplierStats[key] = { revenue: 0, margin: 0, qty: 0, stockQty: 0 };
    supplierStats[key].revenue += rev;
    supplierStats[key].margin  += margin;
    supplierStats[key].qty     += qty;
    if (fromStock) supplierStats[key].stockQty += qty;
  };
  for (const l of accLines) {
    if (!periodDocIds.has(l.document_id)) continue;
    const qty = Number(l.qty ?? 0);
    const rev = Number(l.price ?? 0) * qty;
    const margin = rev - Number(l.cost_price ?? 0) * qty;
    if (l.supplier_id != null) { addSupplier(String(l.supplier_id), rev, margin, qty, false); continue; }
    // складський рядок: ділимо пропорційно кількості по партіях різних постачальників
    const shares = ownShares.get(ownKeyOf.get(l) ?? '') ?? [{ supplierId: null, qty }];
    for (const s of shares) {
      const k = qty > 0 ? s.qty / qty : 0;
      addSupplier(s.supplierId != null ? String(s.supplierId) : 'own', rev * k, margin * k, s.qty, true);
    }
  }
  const supplierIds = Object.keys(supplierStats).filter(k => k !== 'own').map(Number);
  const { data: supplierNames } = supplierIds.length > 0
    ? await db.from('suppliers').select('id, name').in('id', supplierIds)
    : { data: [] };
  const supplierNameMap = new Map((supplierNames ?? []).map(s => [String(s.id), s.name as string]));
  const suppliers = Object.entries(supplierStats)
    .map(([key, s]) => ({ key, name: key === 'own' ? 'Наш склад' : (supplierNameMap.get(key) ?? `Постачальник #${key}`), ...s }))
    .sort((a, b) => b.margin - a.margin);

  // ── Нові vs повторні клієнти (доставлені за період, факт). Ідентичність:
  // customer_id, інакше нормалізований телефон. «Повторне» = у клієнта вже було
  // замовлення раніше (в межах завантаженого вікна історії).
  const custKey = (r: OrderRow) => r.customer_id ?? (r.phone ? r.phone.replace(/\D/g, '').slice(-10) : null);
  const firstOrderAt = new Map<string, string>();
  for (const r of [...rows].sort((a, b) => a.created_at.localeCompare(b.created_at))) {
    const k = custKey(r);
    if (k && !firstOrderAt.has(k)) firstOrderAt.set(k, r.created_at);
  }
  const repeatAgg = { new: { count: 0, margin: 0 }, repeat: { count: 0, margin: 0 } };
  for (const r of deliveredMonthRows) {
    const k = custKey(r);
    const isRepeat = !!k && (firstOrderAt.get(k) ?? r.created_at) < r.created_at;
    const bucket = isRepeat ? repeatAgg.repeat : repeatAgg.new;
    bucket.count += 1;
    bucket.margin += r.margin;
  }
  const repeatShare = (repeatAgg.new.count + repeatAgg.repeat.count) > 0
    ? Math.round(repeatAgg.repeat.count / (repeatAgg.new.count + repeatAgg.repeat.count) * 100) : 0;

  // ── ABC-аналіз: клас за накопиченою часткою прибутку (A ≤80%, B ≤95%, C решта; збиткові → C)
  const abcRanked = Object.entries(skuStats)
    .map(([sku, s]) => ({ sku, margin: s.revenue - s.cost }))
    .sort((a, b) => b.margin - a.margin);
  const abcTotal = abcRanked.filter(x => x.margin > 0).reduce((s, x) => s + x.margin, 0);
  const abcClass = new Map<string, 'A' | 'B' | 'C'>();
  let abcCum = 0;
  for (const x of abcRanked) {
    if (x.margin <= 0 || abcTotal <= 0) { abcClass.set(x.sku, 'C'); continue; }
    abcCum += x.margin;
    abcClass.set(x.sku, abcCum <= abcTotal * 0.8 ? 'A' : abcCum <= abcTotal * 0.95 ? 'B' : 'C');
  }
  const abcCounts = { A: 0, B: 0, C: 0 };
  for (const cls of abcClass.values()) abcCounts[cls]++;

  const topProducts = Object.entries(skuStats)
    .map(([sku, s]) => ({
      sku, ...s,
      margin:     s.revenue - s.cost,
      margin_pct: s.revenue > 0 ? Math.round((s.revenue - s.cost) / s.revenue * 100) : 0,
      name:       prodMap.get(sku)?.name ?? sku,
      brand:      prodMap.get(sku)?.brand ?? '',
      abc:        abcClass.get(sku) ?? 'C',
    }))
    .sort((a, b) => b.margin - a.margin)
    .slice(0, 15);   // 15 — заповнює висоту поруч із «По каналах» і «Клієнти» (07.11.2026)

  // ── По каналах ────────────────────────────────────────────────────────────

  const channelStats: Record<string, { revenue: number; margin: number; count: number }> = {};
  for (const row of deliveredMonthRows) {
    const ch = row.channel_code ?? 'website';
    if (!channelStats[ch]) channelStats[ch] = { revenue: 0, margin: 0, count: 0 };
    channelStats[ch].revenue += row.revenue;
    channelStats[ch].margin  += row.margin;
    channelStats[ch].count   += 1;
  }
  const channels = Object.entries(channelStats).sort((a, b) => b[1].revenue - a[1].revenue);
  const totalRevenue = channels.reduce((s, [, c]) => s + c.revenue, 0) || 1;

  // ── Міст «замовлення → облік» — той самий модуль і блок, що на «Огляді» ──
  const bridge = await loadProfitBridge(db, {
    fromYmd: monthStartDate, toYmd: periodTo ? kyivYmd(periodTo) : null, fromIso: monthStart,
    cohort: thisMonthRows.map(r => ({
      id: r.id, status: r.status, total: Number(r.total_price), hasFact: estimates.get(r.id)?.cogsSource === 'fact', estGross: r.margin,
    })),
  });
  // Чистий — від валового того самого читання (мосту): картки й розбір не можуть розійтися
  const netFact = Math.round((bridge.profit.fact - pl.opex.total - pl.taxes) * 100) / 100;

  // ── Render ─────────────────────────────────────────────────────────────────

  const curMonthLabel = periodLabel;

  return (
    <div style={{ padding: '28px 32px 64px', maxWidth: '1400px' }}>

      {/* Header */}
      <div style={{ marginBottom: '16px' }}>
        <h1 style={{ fontSize: '22px', fontWeight: 800, color: 'var(--text-primary)', margin: 0 }}>
          Аналітика продажів
        </h1>
        <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginTop: '4px' }}>
          Воронка угод, ABC-аналіз, канали, бренди, постачальники. «Факт» — з бухгалтерських проводок, решта — прогнозна оцінка.
        </p>
      </div>

      <FinanceTabs />

      {/* Період дашборда */}
      <div className="fin-period-row" style={{ display: 'flex', gap: '8px', margin: '18px 0 16px', alignItems: 'center', flexWrap: 'wrap' }}>
        {[
          { key: 'cur_month',  label: 'Цей місяць' },
          { key: 'prev_month', label: 'Минулий місяць' },
          { key: 'quarter',    label: 'Квартал' },
          { key: 'ytd',        label: 'Рік' },
        ].map(pr => (
          <Link key={pr.key} href={pr.key === 'cur_month' ? '/admin/finance/analytics' : `/admin/finance/analytics?p=${pr.key}`}
            className={`fin-pill${preset === pr.key ? ' active' : ''}`}>
            {pr.label}
          </Link>
        ))}
        <a href={`/api/admin/finance/profit-export?from=${monthStartDate}&to=${kyivYmd(periodTo ? new Date(periodTo.getTime() - 86400000) : now)}`}
          download className="fin-pill export">
          ↓ Excel · прибуток по угодах
        </a>
      </div>

      {/* «Підсумок» — той самий стиль, що на «Огляді»; тут ще й чистий прибуток.
          Усе факту — з того ж читання леджера, що й розбір нижче */}
      {(() => {
        const rev = bridge.revenue.fact;
        const gross = bridge.profit.fact;
        const pctOfRev = (v: number) => (rev > 0 ? `${Math.round(v / rev * 1000) / 10}%` : '—');
        const openRows = thisMonthRows.filter(r => estimates.get(r.id)?.cogsSource !== 'fact');
        const openSum = openRows.reduce((s, r) => s + Number(r.total_price), 0);
        const openProfit = openRows.reduce((s, r) => s + r.margin, 0);
        const fees = pl.deal.marketplaceFee + pl.deal.acquiringFee;
        return (
          <div style={{ marginBottom: '16px' }}>
            <OverviewSummary
              title={`Підсумок · ${curMonthLabel}`}
              prevLabel="до попереднього періоду"
              parts={[
                {
                  label: 'Виручка', value: `${fmt(rev)} ₴`, cur: rev, prev: prevLedgerRevenue > 0 ? prevLedgerRevenue : null,
                  hint: 'Проведені продажі з обліку (продаж фіксується в день вручення). Розбір від суми замовлень — нижче.',
                  metrics: [
                    { label: `замовлено · ${fmt(thisMonthRows.length)}`, value: `${fmt(bridge.revenue.start)} ₴`, hint: 'Сума підтверджених замовлень, створених за період (без нових і скасованих)' },
                    { label: `в роботі й у дорозі · ${fmt(openRows.length)}`, value: `${fmt(openSum)} ₴`, hint: 'Ще не вручені — виручкою стануть у день вручення' },
                    { label: 'середній чек', value: thisMonthRows.length ? `${fmt(bridge.revenue.start / thisMonthRows.length)} ₴` : '—' },
                    { label: 'вручено замовлень', value: fmt(deliveredMonthRows.length) },
                  ],
                  bar: {
                    title: 'виручка вручених за каналами',
                    segments: channels.map(([ch, st]) => ({ label: SOURCE_META[ch]?.label ?? CHANNEL_LABELS[ch] ?? ch, amount: st.revenue, color: (SOURCE_META[ch] ?? SOURCE_META.other).color })),
                  },
                },
                {
                  label: 'Прибуток', value: `${fmt(gross)} ₴`, valueColor: gross >= 0 ? '#15803D' : '#DC2626', cur: gross, prev: prevPL.revenue > 0 ? prevPL.grossProfit : null,
                  hint: 'Валовий — виручка мінус собівартість FIFO і всі прямі витрати на продажі. Чистий — ще мінус операційні витрати й податки. Розбір по рядках — нижче.',
                  metrics: [
                    { label: 'маржа від виручки', value: rev > 0 ? `${Math.round(gross / rev * 1000) / 10}%` : '—' },
                    { label: 'комісії й оплата', value: pctOfRev(fees), hint: `${fmt(fees)} ₴ — комісії площадок, RozetkaPay, еквайринг, збори Rozetka Доставки` },
                    { label: `в роботі й у дорозі · прогноз`, value: `+${fmt(openProfit)} ₴`, hint: 'Прогноз валового по замовленнях періоду, ще не вручених — у факт ще не входить' },
                    { label: 'чистий прибуток', value: `${fmt(netFact)} ₴`, hint: `Валовий − операційні витрати ${fmt(pl.opex.total)} ₴ − податки ${fmt(pl.taxes)} ₴` },
                  ],
                  bar: {
                    title: 'куди йде кожна гривня виручки',
                    segments: [
                      { label: 'собівартість', amount: pl.cogs, color: '#94A3B8' },
                      { label: 'комісії й оплата', amount: fees, color: '#EA8A00' },
                      { label: 'НП', amount: pl.deal.npDelivery, color: '#8B5CF6' },
                      { label: 'опер. витрати', amount: Math.max(0, pl.opex.total + pl.taxes), color: '#64748B' },
                      { label: 'чистий прибуток', amount: Math.max(0, netFact), color: '#16A34A' },
                    ],
                  },
                },
              ]} />
          </div>
        );
      })()}

      {/* Розбір: від суми замовлень до виручки і до ЧИСТОГО прибутку — згорнутий, «розгорнути» (одне читання
          леджера: чистий = валовий цього ж мосту − опер. витрати − податки) */}
      <ProfitBridgeCard
        bridge={{ ...bridge, opex: pl.opex.total, opexBy: pl.opex.byAccount, taxes: pl.taxes, net: netFact }}
        periodLabel={curMonthLabel} />

      {/* Динаміка 6 місяців + комісії МП */}
      <div className="fin-grid-12" style={{ marginBottom: '16px' }}>
        {/* Замість графіка «за датою створення» (змішував факт із прогнозом) — таблиця
            за обліком: місяці порівнюються рядками, цифри ті самі, що в «Звітах» */}
        <div className="fin-card" style={{ gridColumn: 'span 7' }}>
          <div className="fin-card-title">По місяцях · факт обліку <span className="fin-card-sub">· за датою проводки (продаж = вручення): виручка, валовий прибуток і маржа, чистий після операційних витрат і податків</span></div>
          {monthsFactHasData ? (
            <table className="fin-table fin-month-table">
              <thead>
                <tr>
                  <th>Місяць</th><th className="num">Вручено</th><th className="num">Виручка</th>
                  <th className="num">Валовий</th><th className="num">Маржа</th><th className="num">Чистий</th>
                </tr>
              </thead>
              <tbody>
                {monthsFact.map(m => (
                  <tr key={m.key}>
                    <td className="muted">{m.label}</td>
                    <td className="num muted">{m.delivered > 0 ? fmt(m.delivered) : '—'}</td>
                    <td className="num">{m.revenue !== 0 ? `${fmt(m.revenue)} ₴` : '—'}</td>
                    <td className="num" style={{ color: m.gross < 0 ? 'var(--color-danger)' : undefined }}>{m.gross !== 0 ? `${fmt(m.gross)} ₴` : '—'}</td>
                    <td className="num muted">{m.pct === null ? '—' : `${m.pct}%`}</td>
                    <td className="num" style={{ color: m.net < 0 ? 'var(--color-danger)' : 'var(--color-success)' }}>{m.net !== 0 ? `${fmt(m.net)} ₴` : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div style={{ padding: '32px 0', textAlign: 'center', color: 'var(--text-muted)', fontSize: '13px' }}>Немає даних</div>
          )}
        </div>

        <div className="fin-card" style={{ gridColumn: 'span 5' }}>
          <div className="fin-card-title">Комісії маркетплейсів <span className="fin-card-sub">· факт з обліку за місяць: сума комісій і % від фактичної виручки каналу</span></div>
          {feeTrendHasData ? (
            <table className="fin-table">
              <tbody>
                {feeTrend.map(m => (
                  <tr key={m.label}>
                    <td className="muted" style={{ width: '70px' }}>{m.label}</td>
                    <td className="num" style={{ color: m.fee > 0 ? '#C2410C' : 'var(--text-muted)', width: '60px' }}>{m.fee > 0 ? `${m.pct}%` : '—'}</td>
                    <td className="num">{m.fee > 0 ? `−${fmt(m.fee)} ₴` : ''}</td>
                    <td className="num muted" style={{ fontWeight: 500 }}>{m.roz > 0 ? `Rozetka ${fmt(m.roz)}` : ''}</td>
                    <td className="num muted" style={{ fontWeight: 500 }}>{m.prom > 0 ? `Prom ${fmt(m.prom)}` : ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div style={{ padding: '32px 0', textAlign: 'center', color: 'var(--text-muted)', fontSize: '13px' }}>Немає даних</div>
          )}
        </div>
      </div>

      {/* Збиткові / тонкі угоди (факт) */}
      {thinDeals.length > 0 && (
        <div className="fin-card" style={{ marginBottom: '16px' }}>
          <div className="fin-card-title">Збиткові та тонкі угоди <span className="fin-card-sub">· замовлення: виручка → валовий прибуток після комісій і % від виручки · доставлені за {curMonthLabel} з прибутком &lt; {THIN_PCT}% — перевірте ціну/комісію</span></div>
          {/* Компактно: дві колонки, кожна цифра у своїй колонці фіксованої ширини
              (раніше «прибуток · %» одним рядком різної довжини — цифри «танцювали») */}
          <div className="fin-thin-grid">
            {[thinDeals.slice(0, Math.ceil(thinDeals.length / 2)), thinDeals.slice(Math.ceil(thinDeals.length / 2))].map((col, ci) => (
              <div key={ci}>
                {ci === 0 || col.length ? (
                  <div className="fin-thin-row fin-thin-head">
                    <span /><span>Замовлення</span><span>Дата</span><span>Канал · причина</span><span className="num">Виручка</span><span className="num">Прибуток</span><span className="num">%</span>
                  </div>
                ) : null}
                {col.map(d => (
                  <Link key={d.id} href={`/admin?expand=${d.id}`} className="fin-thin-row" title={d.title}>
                    <span className={`fin-dot ${d.margin < 0 ? 'red' : 'orange'}`} />
                    <span className="fin-thin-num">#{d.order_number}</span>
                    <span className="fin-thin-date">{d.date}</span>
                    <span className="fin-thin-ch">
                      {CHANNEL_LABELS[d.channel_code ?? 'website'] ?? d.channel_code}
                      {d.reason && <span className="fin-thin-why"> · {d.reason}</span>}
                    </span>
                    <span className="num">{fmt(d.revenue)} ₴</span>
                    <span className="num" style={{ fontWeight: 700, color: d.margin < 0 ? 'var(--color-danger)' : 'var(--color-warn)' }}>{d.margin < 0 ? '−' : '+'}{fmt(Math.abs(d.margin))} ₴</span>
                    <span className="num" style={{ color: d.margin < 0 ? 'var(--color-danger)' : 'var(--color-warn)' }}>{d.pct < 0 ? '−' : ''}{Math.abs(d.pct)}%</span>
                  </Link>
                ))}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Топ товарів + канали/клієнти */}
      <div className="fin-grid-12" style={{ marginBottom: '16px' }}>
        <div className="fin-card" style={{ gridColumn: 'span 8' }}>
          <div className="fin-card-title">
            Топ товарів за прибутком <span className="fin-card-sub">· виручка → собівартість (з комісіями) → валовий прибуток · доставлені за {curMonthLabel} · ABC: <b style={{ color: 'var(--color-success)' }}>A {abcCounts.A}</b> (80% прибутку) / <b style={{ color: 'var(--color-warn)' }}>B {abcCounts.B}</b> / C {abcCounts.C}</span>
          </div>
          {topProducts.length === 0 ? (
            <div style={{ padding: '32px 0', textAlign: 'center', color: 'var(--text-muted)', fontSize: '13px' }}>Немає даних за період</div>
          ) : (
            <table className="fin-table">
              <tbody>
                {topProducts.map(p => (
                  <tr key={p.sku}>
                    <td style={{ width: '26px' }}>
                      <span title={p.abc === 'A' ? 'Клас A — топ, дає 80% прибутку' : p.abc === 'B' ? 'Клас B — середняк (наступні 15% прибутку)' : 'Клас C — хвіст (5% прибутку або збиткові)'}
                        style={{ fontSize: '10px', fontWeight: 800, width: '18px', height: '18px', borderRadius: '5px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                          color: p.abc === 'A' ? 'var(--color-success)' : p.abc === 'B' ? 'var(--color-warn)' : 'var(--text-muted)',
                          background: p.abc === 'A' ? '#DCFCE7' : p.abc === 'B' ? '#FEF3C7' : 'var(--bg-soft)',
                          border: `1px solid ${p.abc === 'A' ? 'var(--border-success)' : p.abc === 'B' ? 'var(--border-warn)' : 'var(--border)'}` }}>
                        {p.abc}
                      </span>
                    </td>
                    <td className="name" style={{ maxWidth: '380px' }}>
                      {p.brand} {p.name}
                      <div style={{ fontSize: '10px', color: 'var(--text-muted)', fontFamily: 'monospace' }}>{p.sku}</div>
                    </td>
                    <td className="num muted" style={{ fontWeight: 500 }}>{p.qty} шт</td>
                    <td className="num">{fmt(p.revenue)} ₴</td>
                    <td className="num muted" style={{ fontWeight: 500 }}>−{fmt(p.cost)} ₴</td>
                    <td className="num" style={{ color: p.margin >= 0 ? 'var(--color-success)' : 'var(--color-danger)' }}>
                      {p.margin >= 0 ? '+' : ''}{fmt(p.margin)} ₴
                      <span style={{ fontSize: '10.5px', color: 'var(--text-muted)', fontWeight: 500 }}> · {p.margin_pct}%</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div style={{ gridColumn: 'span 4', display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div className="fin-card">
            <div className="fin-card-title">По каналах <span className="fin-card-sub">· виручка і її частка, валовий прибуток після комісій, замовлень і прибуток на замовлення · доставлені за {curMonthLabel}</span></div>
            {channels.length === 0 ? (
              <div style={{ padding: '32px 0', textAlign: 'center', color: 'var(--text-muted)', fontSize: '13px' }}>Немає даних</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', marginTop: '14px' }}>
                {channels.map(([ch, stats]) => {
                  const pct = Math.round(stats.revenue / totalRevenue * 100);
                  return (
                    <div key={ch}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12.5px', marginBottom: '4px' }}>
                        <span style={{ color: 'var(--text-secondary)', fontWeight: 600 }}>{CHANNEL_LABELS[ch] ?? ch}</span>
                        <span style={{ fontWeight: 700, color: 'var(--text-primary)', fontVariantNumeric: 'tabular-nums' }}>
                          {fmt(stats.revenue)} ₴ <span style={{ color: 'var(--text-muted)', fontWeight: 500 }}>({pct}%)</span>
                        </span>
                      </div>
                      <div className="fin-funnel-track"><div className="fin-funnel-fill" style={{ width: `${pct}%` }} /></div>
                      <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '3px', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                        прибуток <span style={{ color: stats.margin >= 0 ? 'var(--color-success)' : 'var(--color-danger)', fontWeight: 600 }}>{fmt(stats.margin)} ₴</span> · {stats.count} замовл. · {fmt(stats.count > 0 ? stats.margin / stats.count : 0)} ₴/замовл.
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="fin-card">
            <div className="fin-card-title">Клієнти <span className="fin-card-sub">· нові vs повторні: замовлень, виручка, валовий прибуток · доставлені за {curMonthLabel}</span></div>
            <table className="fin-table">
              <tbody>
                <tr>
                  <td className="muted">Нові</td>
                  <td className="num">{repeatAgg.new.count} замовл.</td>
                  <td className="num" style={{ color: repeatAgg.new.margin >= 0 ? 'var(--color-success)' : 'var(--color-danger)' }}>{fmt(repeatAgg.new.margin)} ₴</td>
                </tr>
                <tr>
                  <td className="muted">Повторні</td>
                  <td className="num">{repeatAgg.repeat.count} замовл.</td>
                  <td className="num" style={{ color: repeatAgg.repeat.margin >= 0 ? 'var(--color-success)' : 'var(--color-danger)' }}>{fmt(repeatAgg.repeat.margin)} ₴</td>
                </tr>
                <tr>
                  <td className="muted">Частка повторних</td>
                  <td className="num" colSpan={2} style={{ color: 'var(--brand-blue)' }}>{repeatShare}%</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Категорії і топ клієнти — факт (доставлені за період) */}
      <div className="fin-two-col" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
        <div className="fin-card">
          <div className="fin-card-title">Валовий прибуток за категоріями <span className="fin-card-sub">· прибуток після комісій по кореневих категоріях · доставлені за {curMonthLabel}</span></div>
          {categories.length === 0 ? (
            <div style={{ padding: '32px 0', textAlign: 'center', color: 'var(--text-muted)', fontSize: '13px' }}>Немає даних</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '11px', marginTop: '14px' }}>
              {categories.map(([name, c]) => {
                const share = catTotalMargin > 0 ? Math.round(Math.max(0, c.margin) / catTotalMargin * 1000) / 10 : 0;
                return (
                  <div key={name}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12.5px', marginBottom: '4px', gap: '10px' }}>
                      <span style={{ color: 'var(--text-secondary)', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>{name}</span>
                      <span style={{ fontWeight: 700, fontVariantNumeric: 'tabular-nums', flexShrink: 0, color: c.margin >= 0 ? 'var(--text-primary)' : 'var(--color-danger)' }}>
                        {c.margin >= 0 ? '' : '−'}{fmt(Math.abs(c.margin))} ₴
                        <span style={{ color: 'var(--text-muted)', fontWeight: 500 }}> · {share}%</span>
                      </span>
                    </div>
                    <div className="fin-funnel-track">
                      <div className="fin-funnel-fill" style={{ width: `${Math.max(2, share)}%`, background: c.margin >= 0 ? undefined : 'var(--color-danger)' }} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="fin-card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
            <div className="fin-card-title">Топ клієнти за прибутком <span className="fin-card-sub">· замовлень, виручка, валовий прибуток після комісій · доставлені за {curMonthLabel}</span></div>
            <Link href="/admin/finance/mutual?group=customers" style={{ fontSize: '12px', color: 'var(--brand-blue)', textDecoration: 'none', fontWeight: 600 }}>всі клієнти →</Link>
          </div>
          {topClients.length === 0 ? (
            <div style={{ padding: '32px 0', textAlign: 'center', color: 'var(--text-muted)', fontSize: '13px' }}>Немає даних</div>
          ) : (
            <table className="fin-table">
              <tbody>
                {topClients.map(c => (
                  <tr key={c.name}>
                    <td className="name">{c.name}</td>
                    <td className="num muted" style={{ fontWeight: 500 }}>{c.orders} зам. · {fmt(c.revenue)} ₴</td>
                    <td className="num" style={{ width: '100px', color: c.margin >= 0 ? 'var(--color-success)' : 'var(--color-danger)' }}>
                      {c.margin >= 0 ? '+' : ''}{fmt(c.margin)} ₴
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Прибуток по брендах і постачальниках — факт (доставлені за період). Кожна
          цифра у своїй колонці (шт / виручка / прибуток / %), як у «тонких угодах» */}
      <div className="fin-two-col" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
        {[
          {
            title: 'Валовий прибуток по брендах', sub: `· прибуток після комісій · доставлені за ${curMonthLabel}`,
            rows: brands.map(([brand, s]) => ({ key: brand, name: brand, note: '', ...s })),
          },
          {
            title: 'Валовий прибуток по постачальниках', sub: `· прибуток ДО комісій · доставлені за ${curMonthLabel}; товар зі складу — за партіями FIFO`,
            rows: suppliers.map(s => ({ ...s, note: s.stockQty > 0 && s.key !== 'own' ? `зі складу ${Math.round(s.stockQty * 100) / 100} шт` : '' })),
          },
        ].map(card => (
          <div key={card.title} className="fin-card">
            <div className="fin-card-title">{card.title} <span className="fin-card-sub">{card.sub}</span></div>
            {card.rows.length === 0 ? (
              <div style={{ padding: '32px 0', textAlign: 'center', color: 'var(--text-muted)', fontSize: '13px' }}>Немає даних</div>
            ) : (
              <table className="fin-table fin-month-table">
                <thead>
                  <tr><th /><th className="num">Шт</th><th className="num">Виручка</th><th className="num">Прибуток</th><th className="num">%</th></tr>
                </thead>
                <tbody>
                  {card.rows.map(r => {
                    const pct = r.revenue > 0 ? Math.round((r.margin / r.revenue) * 100) : 0;
                    const color = r.margin >= 0 ? 'var(--color-success)' : 'var(--color-danger)';
                    return (
                      <tr key={r.key}>
                        <td className="name">
                          {r.name}
                          {r.note && <span style={{ display: 'block', fontSize: '11px', color: 'var(--text-muted)', fontWeight: 500 }}>{r.note}</span>}
                        </td>
                        <td className="num muted" style={{ width: '56px' }}>{fmt(r.qty)}</td>
                        <td className="num" style={{ width: '96px' }}>{fmt(r.revenue)} ₴</td>
                        <td className="num" style={{ width: '96px', color }}>{r.margin >= 0 ? '+' : '−'}{fmt(Math.abs(r.margin))} ₴</td>
                        <td className="num" style={{ width: '48px', color }}>{pct}%</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
