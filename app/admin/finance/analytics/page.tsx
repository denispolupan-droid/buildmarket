import { createClient } from '@supabase/supabase-js';
import Link from 'next/link';
import FinanceTabs from '../FinanceTabs';
import { DualLineChart } from '../overview-charts';
import { fetchAllRows } from '../../../../lib/db-paginate';

const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

export const dynamic = 'force-dynamic';

const UA_MONTHS = ['Січ','Лют','Бер','Кві','Тра','Чер','Лип','Серп','Вер','Жов','Лис','Гру'];

const CHANNEL_LABELS: Record<string, string> = {
  website:  'Сайт',
  prom:     'Prom.ua',
  rozetka:  'Rozetka',
  b2b:      'Опт (B2B)',
  phone:    'Телефон',
  retail:   'Роздріб',
  dropship: 'Дроп',
};

function fmt(n: number) {
  return n.toLocaleString('uk-UA', { maximumFractionDigits: 0 });
}

export default async function FinancePage({ searchParams }: { searchParams: Promise<{ p?: string }> }) {
  // Останні 6 місяців
  const now      = new Date();
  const sixAgo   = new Date(now);
  sixAgo.setMonth(sixAgo.getMonth() - 5);
  sixAgo.setDate(1); sixAgo.setHours(0, 0, 0, 0);

  // ── Період дашборда: пресет через ?p= (місяць за замовчуванням) ──────────
  const { p } = await searchParams;
  const preset = ['cur_month', 'prev_month', 'quarter', 'ytd'].includes(p ?? '') ? p! : 'cur_month';
  let periodFrom: Date, periodTo: Date | null = null;  // null = відкритий період (до сьогодні)
  if (preset === 'prev_month') {
    periodFrom = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    periodTo   = new Date(now.getFullYear(), now.getMonth(), 1);
  } else if (preset === 'quarter') {
    periodFrom = new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3, 1);
  } else if (preset === 'ytd') {
    periodFrom = new Date(now.getFullYear(), 0, 1);
  } else {
    periodFrom = new Date(now.getFullYear(), now.getMonth(), 1);
  }
  // Попередній період тієї ж довжини — для порівняння
  const periodEnd = periodTo ?? now;
  const spanMs    = periodEnd.getTime() - periodFrom.getTime();
  const prevFrom  = new Date(periodFrom.getTime() - spanMs);
  const periodLabel = preset === 'cur_month'  ? `${UA_MONTHS[now.getMonth()]} ${now.getFullYear()}`
                    : preset === 'prev_month' ? `${UA_MONTHS[(now.getMonth() + 11) % 12]} ${now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear()}`
                    : preset === 'quarter'    ? `${Math.floor(now.getMonth() / 3) + 1}-й квартал ${now.getFullYear()}`
                    : `${now.getFullYear()} рік`;

  const monthStart = periodFrom.toISOString();

  // Замовлення (не нові і не скасовані) за останні 6 місяців
  //    Пагінація: за 6 місяців кількість замовлень легко > 1000 → дашборд занижував виручку.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- untyped supabase client
  const ordersFromDate = new Date(Math.min(sixAgo.getTime(), prevFrom.getTime()));
  const orders = await fetchAllRows<any>((f, t) => db
    .from('orders')
    .select('id, order_number, status, total_price, created_at, channel_code, items, customer_id, phone')
    .not('status', 'in', '(new,cancelled)')
    .gte('created_at', ordersFromDate.toISOString())
    .order('created_at', { ascending: false })
    .range(f, t));

  // Підтверджені РН з реальною FIFO-собівартістю, прив'язані до замовлень
  const accDocs = await fetchAllRows((f, t) => db
    .from('acc_documents')
    .select('id, order_id, doc_date, total_amount, total_cost, channel_code')
    .eq('doc_type', 'sale')
    .eq('status', 'confirmed')
    .is('reversal_of', null)   // без сторно-документів (їх оригінал 'cancelled' і вже виключений)
    .not('order_id', 'is', null)
    .gte('doc_date', sixAgo.toISOString())
    .range(f, t));

  // ── Фактичний облік за поточний місяць — з леджера money_entries ──────────
  // Дашборд нижче — оперативна оцінка по замовленнях (вкл. невідвантажені).
  // Ця смужка — точні цифри з проведених документів, ті самі, що у «Звітах».
  const monthStartDate = monthStart.slice(0, 10);
  let ledgerQuery = db
    .from('money_entries')
    .select('account_type, amount, doc_type')
    .in('account_type', ['revenue', 'cogs', 'marketplace_fee', 'logistics'])
    .gte('business_date', monthStartDate);
  if (periodTo) ledgerQuery = ledgerQuery.lt('business_date', periodTo.toISOString().slice(0, 10));
  const { data: ledgerRows } = await ledgerQuery;

  const ledgerSum = (type: string) =>
    (ledgerRows ?? []).filter(r => r.account_type === type)
      .reduce((s, r) => s + Number(r.amount), 0);
  const ledger = {
    revenue:    -ledgerSum('revenue'),        // кредитовий рахунок → знак мінус
    cogs:        ledgerSum('cogs'),
    commission:  ledgerSum('marketplace_fee'),
    // Доставка НП за наш рахунок (logistics ділиться з landed-cost закупівель → фільтр doc_type)
    delivery:    (ledgerRows ?? []).filter(r => r.account_type === 'logistics' && r.doc_type === 'delivery_cost')
                   .reduce((s, r) => s + Number(r.amount), 0),
  };
  const ledgerGross = ledger.revenue - ledger.cogs - ledger.commission - ledger.delivery;

  // ── Факт по кожному замовленню з леджера: COGS (FIFO, нетто повернень) і комісія МП
  // (включно з доп. зборами типу «Дешева доставка Prom»). Це ті самі числа, що бачить
  // картка замовлення в режимі «Факт» — дашборд більше не розходиться з нею.
  const perOrderEntries = await fetchAllRows<{ order_id: string; account_type: string; amount: number }>((f, t) => db
    .from('money_entries')
    .select('order_id, account_type, amount')
    .in('account_type', ['cogs', 'marketplace_fee'])
    .not('order_id', 'is', null)
    .gte('business_date', sixAgo.toISOString().slice(0, 10))
    .range(f, t));
  const cogsByOrder = new Map<string, number>();
  const feeByOrder  = new Map<string, number>();
  for (const e of perOrderEntries ?? []) {
    const m = e.account_type === 'cogs' ? cogsByOrder : feeByOrder;
    m.set(e.order_id, (m.get(e.order_id) ?? 0) + Number(e.amount));
  }

  // order_id → собівартість із шапки підтвердженої РН (фолбек, якщо проводок ще немає)
  const accCostByOrder = new Map(
    (accDocs ?? []).map(d => [d.order_id as string, Number(d.total_cost ?? 0)])
  );

  // Рядки підтверджених РН — для собівартості по SKU в таблиці топ-товарів
  const accDocIds = accDocs.map(d => d.id as string);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- untyped supabase client
  const accLines: any[] = accDocIds.length > 0
    ? await fetchAllRows<any>((f, t) => db.from('acc_document_lines').select('sku, qty, price, cost_price, supplier_id, document_id').in('document_id', accDocIds).range(f, t))
    : [];

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

  // Всі SKU з усіх замовлень — для назв товарів і fallback-собівартості
  const allOrderSkus = [...new Set(
    (orders ?? []).flatMap(o => (o.items ?? []).map((i: { sku: string }) => i.sku))
  )];

  // Fallback: product_stock.price_cost для замовлень без підтвердженої РН
  const ordersWithoutAcc = (orders ?? []).filter(o => !accCostByOrder.has(o.id));
  const fallbackSkus = [...new Set(
    ordersWithoutAcc.flatMap(o => (o.items ?? []).map((i: { sku: string }) => i.sku))
  )];

  const { data: stockPrices } = fallbackSkus.length > 0
    ? await db.from('product_stock').select('sku, price_cost').in('sku', fallbackSkus)
    : { data: [] };

  const { data: productNames } = allOrderSkus.length > 0
    ? await db.from('products').select('sku, name, brand, category_slug, categories(prom_commission_pct, prom_commission_pct_econom, rozetka_commission_pct)').in('sku', allOrderSkus)
    : { data: [] };

  const costMap  = new Map((stockPrices ?? []).map(s => [s.sku, Number(s.price_cost ?? 0)]));
  const prodMap  = new Map((productNames ?? []).map(p => [p.sku, p]));

  // Комісія маркетплейсів по SKU/категорії — та сама ставка, що йде в леджер при доставці
  // (lib/prom-commission.ts / lib/rozetka-commission.ts), щоб маржа тут з ним не розходилась.
  const { data: commissionSettings } = await db
    .from('app_settings')
    .select('key, value')
    .in('key', ['prom_plan', 'prom_commission_pct', 'rozetka_commission_pct']);
  const settingsMap     = Object.fromEntries((commissionSettings ?? []).map(s => [s.key, s.value]));
  const promPlan        = (settingsMap.prom_plan ?? 'single') as 'single' | 'econom';
  // Дефолт '3' — як у prom-sync/completion, щоб оцінка тут не розходилась із фактом
  const promFallbackPct = parseFloat(settingsMap.prom_commission_pct ?? '3');
  const rozFallbackPct  = parseFloat(settingsMap.rozetka_commission_pct ?? '15');

  const commissionPctMap = new Map<string, { prom: number; rozetka: number }>();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const p of (productNames ?? []) as any[]) {
    const promRaw = promPlan === 'econom' ? p.categories?.prom_commission_pct_econom : p.categories?.prom_commission_pct;
    const promPctParsed = promRaw != null ? parseFloat(String(promRaw)) : NaN;
    const rozRaw = p.categories?.rozetka_commission_pct;
    const rozPctParsed = rozRaw != null ? parseFloat(String(rozRaw)) : NaN;
    commissionPctMap.set(p.sku, {
      prom:    isNaN(promPctParsed) ? promFallbackPct : promPctParsed,
      rozetka: isNaN(rozPctParsed)  ? rozFallbackPct  : rozPctParsed,
    });
  }

  function orderCommission(o: { channel_code: string | null; items: { sku: string; qty: number; price: number }[] }) {
    if (o.channel_code !== 'prom' && o.channel_code !== 'rozetka') return 0;
    const ch = o.channel_code as 'prom' | 'rozetka';
    const total = (o.items ?? []).reduce((s, item) =>
      s + item.qty * item.price * (commissionPctMap.get(item.sku)?.[ch] ?? 0) / 100, 0);
    return Math.round(total * 100) / 100;
  }

  type OrderRow = {
    id: string; order_number: number; status: string;
    total_price: number; created_at: string; channel_code: string | null;
    cost: number; commission: number; margin: number;
    items: { sku: string; qty: number; price: number }[];
    customer_id: string | null; phone: string | null;
  };

  const rows: OrderRow[] = (orders ?? []).map(o => {
    // Пріоритет: факт із леджера → шапка РН → оцінка за поточною закупівлею
    const cost = cogsByOrder.has(o.id)
      ? cogsByOrder.get(o.id)!
      : accCostByOrder.has(o.id)
      ? accCostByOrder.get(o.id)!
      : (o.items ?? []).reduce((s: number, item: { sku: string; qty: number }) =>
          s + (costMap.get(item.sku) ?? 0) * item.qty, 0);
    // Комісія: факт із леджера (проведені) → оцінка за ставками категорій
    const commission = feeByOrder.get(o.id) ?? orderCommission(o);
    return { ...o, cost, commission, margin: o.total_price - cost - commission };
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

  const revDelta   = prv.revenue > 0 ? Math.round((cur.revenue - prv.revenue) / prv.revenue * 100) : null;

  // ── Воронка угод: знімок «зараз», незалежно від місяця створення ──────────
  // «В дорозі» — відвантажені, ще не доставлені: очікуваний прибуток і комісії
  // (те, що просив бачити окремо). «В роботі» — підтверджені, ще не відвантажені.
  const stageAgg = (arr: OrderRow[]) => ({
    revenue: sumRevenue(arr), commission: sumCommission(arr), margin: sumMargin(arr), count: arr.length,
  });
  const transit = stageAgg(rows.filter(r => r.status === 'shipped'));
  const inWork  = stageAgg(rows.filter(r => ['confirmed', 'awaiting_stock', 'picking', 'pending_payment'].includes(r.status)));

  // Факт доставленого за місяць — з леджера (ledger.*, пораховано вище)
  const factPct = ledger.revenue > 0 ? Math.round(ledgerGross / ledger.revenue * 100) : 0;

  // ── Щомісячні дані (останні 6 місяців) ────────────────────────────────────

  const months: { label: string; key: string; revenue: number; margin: number; count: number }[] = [];
  for (let i = 5; i >= 0; i--) {
    const d     = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key   = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const label = `${UA_MONTHS[d.getMonth()]} ${d.getFullYear() !== now.getFullYear() ? d.getFullYear() : ''}`.trim();
    const mRows = rows.filter(r => r.created_at.slice(0, 7) === key);
    months.push({ label, key, revenue: sumRevenue(mRows), margin: sumMargin(mRows), count: mRows.length });
  }

  // ── Тренд комісій МП по місяцях (факт із леджера): скільки % виручки з'їдає маркетплейс ──
  const feeTrendRows = await fetchAllRows<{ account_type: string; amount: number; counterparty_id: string | null; business_date: string }>((f, t) => db
    .from('money_entries')
    .select('account_type, amount, counterparty_id, business_date')
    .in('account_type', ['marketplace_fee', 'revenue'])
    .gte('business_date', sixAgo.toISOString().slice(0, 10))
    .range(f, t));
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
    const ch = row.channel_code === 'prom' || row.channel_code === 'rozetka' ? row.channel_code : null;
    for (const item of (row.items ?? [])) {
      if (!skuStats[item.sku]) skuStats[item.sku] = { revenue: 0, cost: 0, qty: 0 };
      const itemCommission = ch ? item.price * item.qty * (commissionPctMap.get(item.sku)?.[ch] ?? 0) / 100 : 0;
      skuStats[item.sku].revenue += item.price * item.qty;
      skuStats[item.sku].cost   += (skuAccCostMap.get(item.sku) ?? costMap.get(item.sku) ?? 0) * item.qty + itemCommission;
      skuStats[item.sku].qty    += item.qty;
    }
  }

  // ── Збиткові / тонкі угоди (факт, доставлені за період): чистий прибуток < 0
  // або < 5% від виручки — ловить бонуси-подарунки, помилки прайсу, важкі комісії.
  const THIN_PCT = 5;
  const thinDeals = deliveredMonthRows
    .map(r => ({ ...r, pct: r.total_price > 0 ? Math.round((r.margin / r.total_price) * 1000) / 10 : 0 }))
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

  // ── Валовий прибуток по постачальниках (факт: рядки проведених РН періоду) ──
  // supplier_id є лише в dropship-рядків; null = відвантаження з нашого складу.
  const periodDocIds = new Set(
    (accDocs ?? [])
      .filter(d => {
        const dd = String(d.doc_date ?? '');
        return dd >= monthStartDate && (!periodTo || dd < periodTo.toISOString().slice(0, 10));
      })
      .map(d => d.id as string),
  );
  const supplierStats: Record<string, { revenue: number; margin: number; qty: number }> = {};
  for (const l of accLines) {
    if (!periodDocIds.has(l.document_id)) continue;
    const key = l.supplier_id != null ? String(l.supplier_id) : 'own';
    if (!supplierStats[key]) supplierStats[key] = { revenue: 0, margin: 0, qty: 0 };
    const rev = Number(l.price ?? 0) * Number(l.qty ?? 0);
    supplierStats[key].revenue += rev;
    supplierStats[key].margin  += rev - Number(l.cost_price ?? 0) * Number(l.qty ?? 0);
    supplierStats[key].qty     += Number(l.qty ?? 0);
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
    .slice(0, 8);

  // ── По каналах ────────────────────────────────────────────────────────────

  const channelStats: Record<string, { revenue: number; margin: number; count: number }> = {};
  for (const row of deliveredMonthRows) {
    const ch = row.channel_code ?? 'website';
    if (!channelStats[ch]) channelStats[ch] = { revenue: 0, margin: 0, count: 0 };
    channelStats[ch].revenue += row.total_price;
    channelStats[ch].margin  += row.margin;
    channelStats[ch].count   += 1;
  }
  const channels = Object.entries(channelStats).sort((a, b) => b[1].revenue - a[1].revenue);
  const totalRevenue = channels.reduce((s, [, c]) => s + c.revenue, 0) || 1;

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
      <div className="fin-period-row" style={{ display: 'flex', gap: '8px', marginBottom: '16px', alignItems: 'center', flexWrap: 'wrap' }}>
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
        <a href={`/api/admin/finance/profit-export?from=${monthStartDate}&to=${(periodTo ? new Date(periodTo.getTime() - 86400000) : now).toISOString().slice(0, 10)}`}
          download className="fin-pill export">
          ↓ Excel · прибуток по угодах
        </a>
      </div>

      {/* Воронка угоди: замовлення за період → в роботі → в дорозі → доставлено (факт).
          Одна логіка: «оцінка» = прогноз по замовленнях, «факт» = проводки обліку. */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px', marginBottom: '16px' }}>
        {[
          {
            label: `Замовлення · ${curMonthLabel}`, value: `${fmt(cur.revenue)} ₴`, color: 'var(--text-primary)',
            sub: `${cur.count} замовлень${revDelta !== null ? ` · ${revDelta >= 0 ? '+' : ''}${revDelta}% до попереднього періоду` : ''}`,
            hint: 'Усі підтверджені замовлення, створені за період (без нових і скасованих): в роботі, відвантажені й доставлені. Сума за цінами продажу.',
          },
          {
            label: 'В роботі · зараз', value: `${fmt(inWork.margin)} ₴`, color: 'var(--text-primary)',
            sub: `${inWork.count} замовл. · виручка ${fmt(inWork.revenue)} ₴${inWork.commission > 0 ? ` · комісії −${fmt(inWork.commission)} ₴` : ''}`,
            hint: 'Очікуваний чистий прибуток по підтвердженим, ще не відвантаженим замовленням (оцінка: собівартість за закупівлею, комісії за ставками маркетплейсів).',
          },
          {
            label: 'В дорозі · зараз', value: `${fmt(transit.margin)} ₴`, color: 'var(--text-primary)',
            sub: `${transit.count} замовл. · виручка ${fmt(transit.revenue)} ₴${transit.commission > 0 ? ` · комісії −${fmt(transit.commission)} ₴` : ''}`,
            hint: 'Очікуваний чистий прибуток по відвантаженим, ще не доставленим посилкам. Проведеться в облік після вручення (продаж = доставка).',
          },
          {
            label: `Доставлено · факт · ${curMonthLabel}`, value: `${fmt(ledgerGross)} ₴`,
            color: ledgerGross >= 0 ? '#15803D' : '#DC2626',
            sub: `${factPct}% від виручки · виручка ${fmt(ledger.revenue)} ₴ · комісії −${fmt(ledger.commission)} ₴${ledger.delivery > 0 ? ` · доставка −${fmt(ledger.delivery)} ₴` : ''}`,
            hint: 'Чистий прибуток з бухгалтерських проводок: виручка проведених РН − FIFO-собівартість − комісії маркетплейсів − доставка НП за наш рахунок. Ті самі цифри, що в P&L.',
          },
        ].map(card => (
          <div key={card.label} className="fin-card fin-kpi">
            <div className="fin-kpi-label">{card.label}</div>
            <div className="fin-kpi-value" style={{ color: card.color }}>{card.value}</div>
            <div className="fin-kpi-cmp" style={{ marginTop: '4px' }}>{card.sub}</div>
            <div className="fin-hint">{card.hint}</div>
          </div>
        ))}
      </div>

      {/* Динаміка 6 місяців + комісії МП */}
      <div className="fin-grid-12" style={{ marginBottom: '16px' }}>
        <div className="fin-card" style={{ gridColumn: 'span 7' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div className="fin-card-title">Виручка та прибуток по місяцях <span className="fin-card-sub">· за датою створення замовлення</span></div>
            <div style={{ display: 'flex', gap: '14px', fontSize: '11.5px', color: 'var(--text-secondary)' }}>
              <span><span className="fin-dot" style={{ background: 'var(--brand-blue)' }} /> Виручка</span>
              <span><span className="fin-dot" style={{ background: '#15803D' }} /> Прибуток</span>
            </div>
          </div>
          <div style={{ marginTop: '12px' }}>
            <DualLineChart a={months.map(m => m.revenue)} b={months.map(m => m.margin)} labels={months.map(m => m.label)} aLabel="Виручка" bLabel="Прибуток" />
          </div>
        </div>

        <div className="fin-card" style={{ gridColumn: 'span 5' }}>
          <div className="fin-card-title">Комісії маркетплейсів <span className="fin-card-sub">· факт з обліку, % від фактичної виручки</span></div>
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
          <div className="fin-card-title">Збиткові та тонкі угоди <span className="fin-card-sub">· доставлені за {curMonthLabel} з чистим прибутком &lt; {THIN_PCT}% — перевірте ціну/комісію</span></div>
          <div style={{ display: 'flex', flexDirection: 'column', marginTop: '6px' }}>
            {thinDeals.map(d => (
              <Link key={d.id} href={`/admin?expand=${d.id}`} className="fin-attn">
                <span className={`fin-dot big ${d.margin < 0 ? 'red' : 'orange'}`} />
                <span style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'baseline', gap: '12px' }}>
                  <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--brand-blue)', fontVariantNumeric: 'tabular-nums' }}>#{d.order_number}</span>
                  <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{CHANNEL_LABELS[d.channel_code ?? 'website'] ?? d.channel_code}</span>
                  <span style={{ fontSize: '12.5px', color: 'var(--text-secondary)', marginLeft: 'auto', fontVariantNumeric: 'tabular-nums' }}>виручка {fmt(d.total_price)} ₴</span>
                  <span style={{ fontSize: '13px', fontWeight: 700, fontVariantNumeric: 'tabular-nums', width: '110px', textAlign: 'right', color: d.margin < 0 ? '#DC2626' : '#B45309' }}>
                    {d.margin < 0 ? '' : '+'}{fmt(d.margin)} ₴ · {d.pct}%
                  </span>
                </span>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Топ товарів + канали/клієнти */}
      <div className="fin-grid-12" style={{ marginBottom: '16px' }}>
        <div className="fin-card" style={{ gridColumn: 'span 8' }}>
          <div className="fin-card-title">
            Топ товарів за прибутком <span className="fin-card-sub">· доставлені за {curMonthLabel} · ABC: <b style={{ color: '#15803D' }}>A {abcCounts.A}</b> (80% прибутку) / <b style={{ color: '#B45309' }}>B {abcCounts.B}</b> / C {abcCounts.C}</span>
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
                          color: p.abc === 'A' ? '#15803D' : p.abc === 'B' ? '#B45309' : 'var(--text-muted)',
                          background: p.abc === 'A' ? '#DCFCE7' : p.abc === 'B' ? '#FEF3C7' : 'var(--bg-soft)',
                          border: `1px solid ${p.abc === 'A' ? '#86EFAC' : p.abc === 'B' ? '#FCD34D' : 'var(--border)'}` }}>
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
                    <td className="num" style={{ color: p.margin >= 0 ? '#15803D' : '#DC2626' }}>
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
            <div className="fin-card-title">По каналах <span className="fin-card-sub">· доставлені за {curMonthLabel}</span></div>
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
                        прибуток <span style={{ color: stats.margin >= 0 ? '#15803D' : '#DC2626', fontWeight: 600 }}>{fmt(stats.margin)} ₴</span> · {stats.count} замовл. · {fmt(stats.count > 0 ? stats.margin / stats.count : 0)} ₴/замовл.
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="fin-card">
            <div className="fin-card-title">Клієнти <span className="fin-card-sub">· доставлені за {curMonthLabel}</span></div>
            <table className="fin-table">
              <tbody>
                <tr>
                  <td className="muted">Нові</td>
                  <td className="num">{repeatAgg.new.count} замовл.</td>
                  <td className="num" style={{ color: repeatAgg.new.margin >= 0 ? '#15803D' : '#DC2626' }}>{fmt(repeatAgg.new.margin)} ₴</td>
                </tr>
                <tr>
                  <td className="muted">Повторні</td>
                  <td className="num">{repeatAgg.repeat.count} замовл.</td>
                  <td className="num" style={{ color: repeatAgg.repeat.margin >= 0 ? '#15803D' : '#DC2626' }}>{fmt(repeatAgg.repeat.margin)} ₴</td>
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

      {/* Прибуток по брендах і постачальниках — факт (доставлені за період) */}
      <div className="fin-two-col" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
        <div className="fin-card">
          <div className="fin-card-title">Прибуток по брендах <span className="fin-card-sub">· доставлені за {curMonthLabel}, з урахуванням комісій</span></div>
          {brands.length === 0 ? (
            <div style={{ padding: '32px 0', textAlign: 'center', color: 'var(--text-muted)', fontSize: '13px' }}>Немає даних</div>
          ) : (
            <table className="fin-table">
              <tbody>
                {brands.map(([brand, s]) => {
                  const pctB = s.revenue > 0 ? Math.round((s.margin / s.revenue) * 100) : 0;
                  return (
                    <tr key={brand}>
                      <td className="name">{brand}</td>
                      <td className="num muted" style={{ fontWeight: 500 }}>{s.qty} шт · {fmt(s.revenue)} ₴</td>
                      <td className="num" style={{ width: '110px', color: s.margin >= 0 ? '#15803D' : '#DC2626' }}>
                        {s.margin >= 0 ? '+' : ''}{fmt(s.margin)} ₴ · {pctB}%
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        <div className="fin-card">
          <div className="fin-card-title">Валовий прибуток по постачальниках <span className="fin-card-sub">· доставлені за {curMonthLabel}, до комісій</span></div>
          {suppliers.length === 0 ? (
            <div style={{ padding: '32px 0', textAlign: 'center', color: 'var(--text-muted)', fontSize: '13px' }}>Немає даних</div>
          ) : (
            <table className="fin-table">
              <tbody>
                {suppliers.map(s => {
                  const pctS = s.revenue > 0 ? Math.round((s.margin / s.revenue) * 100) : 0;
                  return (
                    <tr key={s.key}>
                      <td className="name">{s.name}</td>
                      <td className="num muted" style={{ fontWeight: 500 }}>{s.qty} шт · {fmt(s.revenue)} ₴</td>
                      <td className="num" style={{ width: '110px', color: s.margin >= 0 ? '#15803D' : '#DC2626' }}>
                        {s.margin >= 0 ? '+' : ''}{fmt(s.margin)} ₴ · {pctS}%
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
