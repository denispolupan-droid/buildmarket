import { createClient } from '@supabase/supabase-js';
import { fetchAllRows } from '../../../lib/db-paginate';
import { getMarketplaceBalance } from '../../../lib/accounting/money';

// Дані для «Огляду» фінансів (BI-дашборд). Усі гроші рахуються тут, на
// сервері, з тих самих джерел, що й наявні звіти:
//  - факт (виручка/COGS/комісії/доставка) — леджер money_entries;
//  - воронка/канали/топи — orders за період (когорта за created_at);
//  - залишки рахунків — сума проводок по грошових рахунках (як у Звітах);
//  - дебіторка/кредиторка — view ar_balances і кеш counterparty_balances.

const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

export type Preset = 'cur_month' | 'prev_month' | 'quarter' | 'ytd';

export type KpiSeries = { value: number; prev: number | null; daily: number[]; prevDaily: number[] };

export type OverviewData = {
  periodLabel: string;
  prevLabel: string;
  from: string;           // YYYY-MM-DD
  to: string;             // YYYY-MM-DD (включно, для експорту)
  dayLabels: string[];    // підписи днів періоду ('1', '5'…)
  kpi: {
    revenue: KpiSeries;   // факт з леджера
    profit: KpiSeries;    // валовий факт: revenue - cogs - fee - delivery (для графіка динаміки)
    /* Очікуваний валовий прибуток по ВСІХ замовленнях періоду (та сама база,
       що «Замовлення · сума»): доставлені — факт з леджера, решта — оцінка */
    profitEst: { value: number; prev: number };
    margin: { value: number | null; prev: number | null };      // від оцінки (profitEst / orderSum)
    orders: KpiSeries;    // к-ть замовлень (когорта періоду, без скасованих)
    orderSum: { value: number; prev: number };  // сума створених замовлень (оцінка до доставки)
    avgCheck: { value: number | null; prev: number | null };
  };
  /* Останні 6 місяців (старіший → поточний) для стовпчиків у KPI-картках —
     не залежить від обраного пресета періоду */
  monthly: {
    labels: string[];
    revenue: number[];
    profit: number[];
    profitEst: number[];
    orders: number[];
    orderSum: number[];
    margin: (number | null)[];
    avgCheck: (number | null)[];
  };
  /* Знімок «де гроші зараз»: замовлення по живих стадіях, незалежно від
     періоду (замінив когортну воронку — та змішувала дозрівання зі втратами) */
  pipeline: { key: string; label: string; count: number; sum: number; stuck: string | null; href: string; tone?: 'warn' }[];
  /* Викуп по зрілих замовленнях періоду (створені понад 10 днів тому,
     встигли завершитись): доставлено vs відмова/повернення після відправки */
  buyout: { delivered: number; refused: number; refusedSum: number; pct: number | null };
  accounts: { monobank: number; novapay: number; cash: number; total: number };
  mp: { prom: number; rozetka: number };
  ar: { total: number; overdueCount: number; overdueSum: number };
  ap: { total: number };
  lowStockCount: number;
  attention: {
    pendingPayment: { count: number; sum: number };
    awaitingStock: { count: number };
  };
  today: {
    orders: number; revenue: number; shipped: number;
    paidCount: number; paidSum: number; avgCheck: number | null;
  };
  channels: { code: string; count: number; revenue: number; share: number }[];
  /* Вікно великого графіка динаміки: останні N днів (7/30/90) незалежно від
     пресета періоду; null = графік живе на щоденних рядах періоду (як досі) */
  chartWindow: { labels: string[]; revenue: number[]; profit: number[] } | null;
  /* План виручки на поточний місяць (app_settings) проти факту з обліку */
  plan: {
    value: number | null;      // план, ₴ (null = не задано)
    fact: number;              // факт виручки поточного місяця з леджера
    forecast: number;          // прогноз на місяць за поточним темпом
    daysPassed: number;
    daysInMonth: number;
    monthLabel: string;
  };
};

const UA_MONTHS = ['Січ','Лют','Бер','Кві','Тра','Чер','Лип','Серп','Вер','Жов','Лис','Гру'];

// Календарна дата за Києвом (toISOString зсував би 1-ше число місяця на «31-ше»)
function dstr(d: Date) { return d.toLocaleDateString('en-CA', { timeZone: 'Europe/Kyiv' }); }

/** Початок сьогоднішньої доби за Києвом у UTC (created_at — timestamptz) */
function kyivMidnightUtc(now: Date): { iso: string; ymd: string } {
  const ymd = now.toLocaleDateString('en-CA', { timeZone: 'Europe/Kyiv' });
  const kyivClock = new Date(now.toLocaleString('en-US', { timeZone: 'Europe/Kyiv' }));
  const utcClock  = new Date(now.toLocaleString('en-US', { timeZone: 'UTC' }));
  const offsetMs  = kyivClock.getTime() - utcClock.getTime();
  return { iso: new Date(Date.parse(`${ymd}T00:00:00Z`) - offsetMs).toISOString(), ymd };
}

export function resolvePeriod(p?: string) {
  const now = new Date();
  const preset: Preset = (['cur_month', 'prev_month', 'quarter', 'ytd'] as const).includes(p as Preset) ? p as Preset : 'cur_month';
  let periodFrom: Date, periodTo: Date | null = null;
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
  const periodEnd = periodTo ?? now;
  const spanMs    = periodEnd.getTime() - periodFrom.getTime();
  const prevFrom  = new Date(periodFrom.getTime() - spanMs);
  const periodLabel = preset === 'cur_month'  ? `${UA_MONTHS[now.getMonth()]} ${now.getFullYear()}`
                    : preset === 'prev_month' ? `${UA_MONTHS[(now.getMonth() + 11) % 12]} ${now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear()}`
                    : preset === 'quarter'    ? `${Math.floor(now.getMonth() / 3) + 1}-й квартал ${now.getFullYear()}`
                    : `${now.getFullYear()} рік`;
  return { now, preset, periodFrom, periodTo, periodEnd, prevFrom, periodLabel };
}

export async function getOverview(p?: string, chartDays?: number): Promise<OverviewData & { preset: Preset }> {
  const { now, preset, periodFrom, periodTo, periodEnd, prevFrom, periodLabel } = resolvePeriod(p);
  const fromStr = dstr(periodFrom);
  const endStr  = dstr(periodEnd);      // ексклюзивна межа для prev/поділу
  const prevStr = dstr(prevFrom);
  const today   = kyivMidnightUtc(now);

  // Дні періоду для щоденних рядів
  const days: string[] = [];
  for (let d = new Date(periodFrom); d < periodEnd || days.length === 0; d.setDate(d.getDate() + 1)) {
    days.push(dstr(d));
    if (days.length > 370) break;
  }
  const dayIdx = new Map(days.map((d, i) => [d, i]));
  // Дні попереднього періоду — для «привида» в спарклайнах (накопичення)
  const prevDays: string[] = [];
  for (let d = new Date(prevFrom); d < periodFrom; d.setDate(d.getDate() + 1)) {
    prevDays.push(dstr(d));
    if (prevDays.length > 370) break;
  }
  const prevDayIdx = new Map(prevDays.map((d, i) => [d, i]));

  // Вікно помісячних стовпчиків: 6 календарних місяців включно з поточним
  const monthlyFrom = new Date(now.getFullYear(), now.getMonth() - 5, 1);
  const monthlyFromStr = dstr(monthlyFrom);
  const monthlyFromIso = monthlyFrom.toISOString();
  const monthKeys: string[] = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    monthKeys.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  }

  const [ledgerRows, orderRows, balRows, arRows, agingRows, apRows, lowStockRows, attnRows, promBal, rozetkaBal, todayRows, monthlyLedger, monthlyOrders, payToday, pipelineRows, refusedRows] = await Promise.all([
    // 1. Леджер за поточний + попередній період (для дельт) — щоденні ряди
    fetchAllRows<{ business_date: string; account_type: string; doc_type: string | null; amount: number }>((f, t) => {
      let q = db.from('money_entries')
        .select('business_date, account_type, doc_type, amount')
        .in('account_type', ['revenue', 'cogs', 'marketplace_fee', 'logistics'])
        .gte('business_date', prevStr);
      if (periodTo) q = q.lt('business_date', endStr);
      return q.range(f, t);
    }),
    // 2. Замовлення когорти (поточний + попередній період)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- untyped supabase client
    fetchAllRows<any>((f, t) => {
      let q = db.from('orders')
        .select('id, status, total_price, created_at, confirmed_at, shipped_at, delivered_at, payment_confirmed, amount_paid, channel_code, customer_id, phone, company, contact, items')
        .neq('status', 'cancelled')
        .gte('created_at', prevFrom.toISOString());
      if (periodTo) q = q.lt('created_at', periodTo.toISOString());
      return q.range(f, t);
    }),
    // 3. Залишки грошових рахунків (за весь час, як у Звітах)
    fetchAllRows<{ account_type: string; amount: number }>((f, t) => db
      .from('money_entries').select('account_type, amount')
      .in('account_type', ['bank', 'acquiring', 'novapay', 'cash'])
      .range(f, t)),
    // 4. Дебіторка
    db.from('ar_balances').select('balance').then(r => r.data ?? []),
    // 5. Прострочена дебіторка
    db.from('ar_aging').select('balance, days_overdue').gt('days_overdue', 0).then(r => r.data ?? []),
    // 6. Кредиторка (кеш балансів; від'ємний баланс = ми винні)
    db.from('counterparty_balances').select('balance').eq('account_type', 'supplier').then(r => r.data ?? []),
    // 7. Низькі залишки складу
    db.from('stock_balance').select('qty_available, min_reorder_qty').gt('min_reorder_qty', 0).then(r => r.data ?? []),
    // 8. Поточні статуси, що потребують уваги (незалежно від періоду)
    db.from('orders').select('status, total_price').in('status', ['pending_payment', 'awaiting_stock']).then(r => r.data ?? []),
    getMarketplaceBalance('prom'),
    getMarketplaceBalance('rozetka'),
    // Сьогоднішні замовлення/відправлення — незалежно від обраного періоду
    db.from('orders').select('total_price, created_at, shipped_at, status')
      .or(`created_at.gte.${today.iso},shipped_at.gte.${today.iso}`)
      .then(r => r.data ?? []),
    // Помісячні агрегати за 6 місяців (для стовпчиків KPI) — окремо від
    // періодних вибірок, щоб не залежати від пресета
    fetchAllRows<{ business_date: string; account_type: string; doc_type: string | null; amount: number }>((f, t) => db
      .from('money_entries')
      .select('business_date, account_type, doc_type, amount')
      .in('account_type', ['revenue', 'cogs', 'marketplace_fee', 'logistics'])
      .gte('business_date', monthlyFromStr)
      .range(f, t)),
    // items/channel потрібні для очікуваного прибутку по місяцях (profitEst)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- untyped supabase client
    fetchAllRows<any>((f, t) => db
      .from('orders')
      .select('id, created_at, total_price, channel_code, items')
      .neq('status', 'cancelled')
      .gte('created_at', monthlyFromIso)
      .range(f, t)),
    // 9. Оплати клієнтів сьогодні (кредит рахунку customer)
    db.from('money_entries')
      .select('amount, txn_id')
      .eq('account_type', 'customer')
      .in('doc_type', ['payment', 'customer_payment'])
      .lt('amount', 0)
      .eq('business_date', today.ymd)
      .then(r => r.data ?? []),
    // 10. Знімок живих стадій «де гроші зараз» (незалежно від періоду)
    fetchAllRows<{ status: string; total_price: number; shipped_at: string | null; carrier_accepted_at: string | null; created_at: string }>((f, t) => db
      .from('orders')
      .select('status, total_price, shipped_at, carrier_accepted_at, created_at')
      .in('status', ['new', 'pending_payment', 'confirmed', 'awaiting_stock', 'picking', 'shipped'])
      .range(f, t)),
    // 11. Відмови для «викупу»: скасовані ПІСЛЯ відправки замовлення періоду
    fetchAllRows<{ total_price: number; created_at: string }>((f, t) => {
      let q = db.from('orders')
        .select('total_price, created_at')
        .eq('status', 'cancelled')
        .not('shipped_at', 'is', null)
        .gte('created_at', periodFrom.toISOString());
      if (periodTo) q = q.lt('created_at', periodTo.toISOString());
      return q.range(f, t);
    }),
  ]);

  // ── Леджер: щоденні ряди поточного періоду + суми попереднього ────────────
  const revDaily = new Array(days.length).fill(0);
  const profDaily = new Array(days.length).fill(0);
  const prevRevDaily = new Array(prevDays.length).fill(0);
  const prevProfDaily = new Array(prevDays.length).fill(0);
  let curRev = 0, curCogs = 0, curFee = 0, curDeliv = 0;
  let prevRev = 0, prevCogs = 0, prevFee = 0, prevDeliv = 0;
  for (const r of ledgerRows) {
    const amt = Number(r.amount);
    const isCur = r.business_date >= fromStr;
    const isDeliveryCost = r.account_type === 'logistics' && r.doc_type === 'delivery_cost';
    if (r.account_type === 'logistics' && !isDeliveryCost) continue; // landed-cost логістика — не з продажів
    const rev  = r.account_type === 'revenue' ? -amt : 0;
    const cost = r.account_type === 'cogs' ? amt : r.account_type === 'marketplace_fee' ? amt : isDeliveryCost ? amt : 0;
    if (isCur) {
      curRev += rev;
      if (r.account_type === 'cogs') curCogs += amt;
      else if (r.account_type === 'marketplace_fee') curFee += amt;
      else if (isDeliveryCost) curDeliv += amt;
      const i = dayIdx.get(r.business_date);
      if (i !== undefined) { revDaily[i] += rev; profDaily[i] += rev - cost; }
    } else {
      prevRev += rev;
      if (r.account_type === 'cogs') prevCogs += amt;
      else if (r.account_type === 'marketplace_fee') prevFee += amt;
      else if (isDeliveryCost) prevDeliv += amt;
      const i = prevDayIdx.get(r.business_date);
      if (i !== undefined) { prevRevDaily[i] += rev; prevProfDaily[i] += rev - cost; }
    }
  }
  const curProfit  = curRev - curCogs - curFee - curDeliv;
  const prevProfit = prevRev - prevCogs - prevFee - prevDeliv;

  // ── Замовлення: воронка, канали, топи, середній чек ────────────────────────
  const fromIso = periodFrom.toISOString();
  const curOrders  = orderRows.filter(o => o.created_at >= fromIso);
  const prevOrders = orderRows.filter(o => o.created_at < fromIso);
  const ordDaily = new Array(days.length).fill(0);
  for (const o of curOrders) {
    const i = dayIdx.get(String(o.created_at).slice(0, 10));
    if (i !== undefined) ordDaily[i] += 1;
  }
  const prevOrdDaily = new Array(prevDays.length).fill(0);
  for (const o of prevOrders) {
    const i = prevDayIdx.get(String(o.created_at).slice(0, 10));
    if (i !== undefined) prevOrdDaily[i] += 1;
  }
  const sum = (arr: { total_price: number }[]) => arr.reduce((s, o) => s + Number(o.total_price ?? 0), 0);
  const curOrdSum = sum(curOrders);

  // ── Знімок «де гроші зараз»: живі стадії + маркери застряглого ─────────────
  const d7ago = new Date(now.getTime() - 7 * 86400000).toISOString();
  const d3ago = new Date(now.getTime() - 3 * 86400000).toISOString();
  const stage = (rows: typeof pipelineRows, stuck: string | null) =>
    ({ count: rows.length, sum: sum(rows), stuck });
  const pNew     = pipelineRows.filter(o => o.status === 'new');
  const pConf    = pipelineRows.filter(o => ['confirmed', 'awaiting_stock', 'picking'].includes(o.status));
  const pReady   = pipelineRows.filter(o => o.status === 'shipped' && !o.carrier_accepted_at);
  const pTransit = pipelineRows.filter(o => o.status === 'shipped' && o.carrier_accepted_at);
  const pPay     = pipelineRows.filter(o => o.status === 'pending_payment');
  // «В дорозі понад 7 дн» — окремий рядок (рішення власника): довга доставка —
  // це вже не рух, а сигнал перевірити посилку/завершити замовлення.
  const pTransitFresh = pTransit.filter(o => (o.shipped_at ?? '') >= d7ago);
  const pTransitStuck = pTransit.filter(o => (o.shipped_at ?? '') < d7ago);
  const payStuck      = pPay.filter(o => o.created_at < d3ago).length;
  const pipeline = [
    { key: 'new',      label: 'Нові',                     href: '/admin?status=new',             ...stage(pNew, null) },
    { key: 'conf',     label: 'Підтверджені / збираються', href: '/admin?status=confirmed',       ...stage(pConf, null) },
    { key: 'ready',    label: 'До відправки',              href: '/admin?status=ready_to_ship',   ...stage(pReady, null) },
    { key: 'transit',  label: 'В дорозі',                  href: '/admin?status=shipped',         ...stage(pTransitFresh, null) },
    { key: 'transit7', label: 'В дорозі понад 7 дн',       href: '/admin?status=shipped',         tone: 'warn' as const, ...stage(pTransitStuck, null) },
    { key: 'pay',      label: 'Очікують оплати',           href: '/admin?status=pending_payment', ...stage(pPay, payStuck > 0 ? `${payStuck} довше 3 дн` : null) },
  ];

  // ── Викуп: зрілі замовлення періоду (створені понад 10 днів тому) ──────────
  // «Відмова» = скасоване ПІСЛЯ відправки (невикуп/повернення). Ще не
  // завершені (в дорозі) у знаменник не входять.
  const maturityCutoff = new Date(now.getTime() - 10 * 86400000).toISOString();
  const maturedDelivered = curOrders.filter(o => o.delivered_at && o.created_at <= maturityCutoff).length;
  const maturedRefused   = refusedRows.filter(o => o.created_at <= maturityCutoff);
  const buyout = {
    delivered: maturedDelivered,
    refused: maturedRefused.length,
    refusedSum: sum(maturedRefused),
    pct: maturedDelivered + maturedRefused.length > 0
      ? Math.round(maturedDelivered / (maturedDelivered + maturedRefused.length) * 1000) / 10
      : null,
  };

  // Канали
  const chMap = new Map<string, { count: number; revenue: number }>();
  for (const o of curOrders) {
    const code = o.channel_code || 'other';
    const c = chMap.get(code) ?? { count: 0, revenue: 0 };
    c.count += 1; c.revenue += Number(o.total_price ?? 0);
    chMap.set(code, c);
  }
  const channels = [...chMap.entries()]
    .map(([code, c]) => ({ code, ...c, share: curOrdSum ? Math.round(c.revenue / curOrdSum * 1000) / 10 : 0 }))
    .sort((a, b) => b.revenue - a.revenue);

  // ── Сьогодні (окрема вибірка — не залежить від обраного періоду) ──────────
  const todayAll = todayRows as { total_price: number; created_at: string; shipped_at: string | null; status: string }[];
  const todayOrders = todayAll.filter(o => o.created_at >= today.iso && o.status !== 'cancelled');
  const shippedToday = todayAll.filter(o => o.shipped_at && o.shipped_at >= today.iso).length;
  const paidTxns = new Set((payToday as { txn_id: string }[]).map(r => r.txn_id));
  const paidSum = (payToday as { amount: number }[]).reduce((s, r) => s + Math.abs(Number(r.amount)), 0);

  // ── Рахунки, борги, склад ──────────────────────────────────────────────────
  const accounts = { monobank: 0, novapay: 0, cash: 0, total: 0 };
  for (const r of balRows) {
    const v = Number(r.amount);
    if (r.account_type === 'bank' || r.account_type === 'acquiring') accounts.monobank += v;
    else if (r.account_type === 'novapay') accounts.novapay += v;
    else if (r.account_type === 'cash') accounts.cash += v;
  }
  accounts.total = accounts.monobank + accounts.novapay + accounts.cash;

  const arTotal = (arRows as { balance: number }[]).reduce((s, r) => s + Math.max(0, Number(r.balance)), 0);
  const overdue = agingRows as { balance: number; days_overdue: number }[];
  const apTotal = (apRows as { balance: number }[]).reduce((s, r) => s + Math.max(0, -Number(r.balance)), 0);
  const lowStockCount = (lowStockRows as { qty_available: number; min_reorder_qty: number }[])
    .filter(r => Number(r.qty_available) <= Number(r.min_reorder_qty)).length;
  const attn = attnRows as { status: string; total_price: number }[];
  const pendingPayment = attn.filter(a => a.status === 'pending_payment');

  const pct = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 1000) / 10 : null);

  // ── Очікуваний валовий прибуток по замовленнях (та сама база, що orderSum:
  // усі створені за період, без скасованих). Доставлені — факт із проводок
  // (COGS FIFO + комісії, включно з доп. зборами), ще не доставлені — оцінка:
  // поточна закупівельна ціна + ставки комісій категорій (як в Аналітиці).
  type EstOrder = { id: string; channel_code: string | null; total_price: number; created_at: string; items: { sku: string; qty: number; price: number }[] | null };
  const estById = new Map<string, EstOrder>();
  for (const o of [...orderRows, ...monthlyOrders] as EstOrder[]) estById.set(o.id, o);
  const estIds  = [...estById.keys()];
  const estSkus = [...new Set([...estById.values()].flatMap(o => (o.items ?? []).map(i => i.sku)))];
  const chunk = <T,>(arr: T[], n: number): T[][] => {
    const out: T[][] = [];
    for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
    return out;
  };
  const [stockCostRows, prodCatRows, commSettings, perOrderRows] = await Promise.all([
    Promise.all(chunk(estSkus, 200).map(c => db.from('product_stock').select('sku, price_cost').in('sku', c).then(r => r.data ?? []))).then(a => a.flat()),
    Promise.all(chunk(estSkus, 200).map(c => db.from('products').select('sku, categories(prom_commission_pct, prom_commission_pct_econom, rozetka_commission_pct)').in('sku', c).then(r => r.data ?? []))).then(a => a.flat()),
    db.from('app_settings').select('key, value').in('key', ['prom_plan', 'prom_commission_pct', 'rozetka_commission_pct']).then(r => r.data ?? []),
    Promise.all(chunk(estIds, 150).map(c => db.from('money_entries').select('order_id, account_type, amount').in('account_type', ['cogs', 'marketplace_fee']).in('order_id', c).then(r => r.data ?? []))).then(a => a.flat()),
  ]);
  const commCfg = Object.fromEntries(commSettings.map(s => [s.key, s.value]));
  // Дефолти — як у prom-sync/completion, щоб оцінка не розходилась із фактом
  const promPlan     = (commCfg.prom_plan ?? 'single') as 'single' | 'econom';
  const promFallback = parseFloat(commCfg.prom_commission_pct ?? '3');
  const rozFallback  = parseFloat(commCfg.rozetka_commission_pct ?? '15');
  const ratesBySku = new Map<string, { prom: number; rozetka: number }>();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- embedded relation
  for (const p of prodCatRows as any[]) {
    const promRaw = promPlan === 'econom' ? p.categories?.prom_commission_pct_econom : p.categories?.prom_commission_pct;
    const promPct = parseFloat(String(promRaw));
    const rozPct  = parseFloat(String(p.categories?.rozetka_commission_pct));
    ratesBySku.set(p.sku, {
      prom:    Number.isFinite(promPct) ? promPct : promFallback,
      rozetka: Number.isFinite(rozPct)  ? rozPct  : rozFallback,
    });
  }
  const costBySku = new Map(stockCostRows.map(r => [r.sku as string, Number(r.price_cost ?? 0)]));
  const factCogs = new Map<string, number>();
  const factFee  = new Map<string, number>();
  for (const e of perOrderRows as { order_id: string; account_type: string; amount: number }[]) {
    const m = e.account_type === 'cogs' ? factCogs : factFee;
    m.set(e.order_id, (m.get(e.order_id) ?? 0) + Number(e.amount));
  }
  const orderMargin = (o: EstOrder): number => {
    const items = o.items ?? [];
    const cost = factCogs.has(o.id)
      ? factCogs.get(o.id)!
      : items.reduce((s, i) => s + (costBySku.get(i.sku) ?? 0) * Number(i.qty ?? 0), 0);
    const ch = o.channel_code === 'prom' || o.channel_code === 'rozetka' ? o.channel_code : null;
    const fee = factFee.has(o.id)
      ? factFee.get(o.id)!
      : ch
      ? items.reduce((s, i) => s + Number(i.price ?? 0) * Number(i.qty ?? 0) * ((ratesBySku.get(i.sku)?.[ch] ?? 0) / 100), 0)
      : 0;
    return Number(o.total_price ?? 0) - cost - fee;
  };
  const curProfitEst  = (curOrders as EstOrder[]).reduce((s, o) => s + orderMargin(o), 0);
  const prevProfitEst = (prevOrders as EstOrder[]).reduce((s, o) => s + orderMargin(o), 0);
  const prevOrdSum    = sum(prevOrders);

  // ── Помісячні агрегати (6 міс.) для стовпчиків KPI ─────────────────────────
  const mIdx = new Map(monthKeys.map((k, i) => [k, i]));
  const mRev = new Array(6).fill(0), mCogs = new Array(6).fill(0), mFee = new Array(6).fill(0), mDeliv = new Array(6).fill(0);
  for (const r of monthlyLedger) {
    const i = mIdx.get(r.business_date.slice(0, 7));
    if (i === undefined) continue;
    const amt = Number(r.amount);
    if (r.account_type === 'revenue') mRev[i] += -amt;
    else if (r.account_type === 'cogs') mCogs[i] += amt;
    else if (r.account_type === 'marketplace_fee') mFee[i] += amt;
    else if (r.account_type === 'logistics' && r.doc_type === 'delivery_cost') mDeliv[i] += amt;
  }
  const mProfit = mRev.map((v, i) => v - mCogs[i] - mFee[i] - mDeliv[i]);
  const mOrd = new Array(6).fill(0), mOrdSum = new Array(6).fill(0), mProfitEst = new Array(6).fill(0);
  for (const o of monthlyOrders as EstOrder[]) {
    // created_at → київський місяць
    const key = new Date(o.created_at).toLocaleDateString('en-CA', { timeZone: 'Europe/Kyiv' }).slice(0, 7);
    const i = mIdx.get(key);
    if (i === undefined) continue;
    mOrd[i] += 1; mOrdSum[i] += Number(o.total_price ?? 0); mProfitEst[i] += orderMargin(o);
  }
  const monthly = {
    labels: monthKeys.map(k => UA_MONTHS[Number(k.slice(5, 7)) - 1]),
    revenue: mRev,
    profit: mProfit,
    profitEst: mProfitEst,
    orders: mOrd,
    orderSum: mOrdSum,
    // Маржа — від тієї самої бази, що «Замовлення · сума»: очікуваний прибуток ÷ сума замовлень
    margin: mOrdSum.map((v, i) => pct(mProfitEst[i], v)),
    avgCheck: mOrd.map((n, i) => (n > 0 ? Math.round(mOrdSum[i] / n) : null)),
  };

  // ── Вікно 7/30/90 днів для великого графіка (незалежно від пресета) ────────
  const chartWinDays: string[] = [];
  if (chartDays) {
    const start = new Date(now);
    start.setDate(start.getDate() - (chartDays - 1));
    for (let d = new Date(start), i = 0; i < chartDays; d.setDate(d.getDate() + 1), i++) chartWinDays.push(dstr(d));
  }

  // ── Другий батч: вікно графіка, план ───────────────────────────────────────
  const [chartLedger, planRow] = await Promise.all([
    chartDays
      ? fetchAllRows<{ business_date: string; account_type: string; doc_type: string | null; amount: number }>((f, t) => db
          .from('money_entries')
          .select('business_date, account_type, doc_type, amount')
          .in('account_type', ['revenue', 'cogs', 'marketplace_fee', 'logistics'])
          .gte('business_date', chartWinDays[0])
          .range(f, t))
      : Promise.resolve([] as { business_date: string; account_type: string; doc_type: string | null; amount: number }[]),
    db.from('app_settings').select('value').eq('key', 'finance_month_plan').maybeSingle().then(r => r.data),
  ]);

  let chartWindow: OverviewData['chartWindow'] = null;
  if (chartDays) {
    const cwIdx = new Map(chartWinDays.map((d, i) => [d, i]));
    const cwRev = new Array(chartWinDays.length).fill(0);
    const cwProf = new Array(chartWinDays.length).fill(0);
    for (const r of chartLedger) {
      const i = cwIdx.get(r.business_date);
      if (i === undefined) continue;
      const amt = Number(r.amount);
      const isDeliveryCost = r.account_type === 'logistics' && r.doc_type === 'delivery_cost';
      if (r.account_type === 'logistics' && !isDeliveryCost) continue;
      const rev  = r.account_type === 'revenue' ? -amt : 0;
      const cost = r.account_type === 'cogs' || r.account_type === 'marketplace_fee' || isDeliveryCost ? amt : 0;
      cwRev[i] += rev; cwProf[i] += rev - cost;
    }
    chartWindow = {
      // «7» днів підписуємо всі, довші вікна — день місяця
      labels: chartWinDays.map(d => String(Number(d.slice(8, 10)))),
      revenue: cwRev,
      profit: cwProf,
    };
  }

  // ── План виручки на поточний місяць ────────────────────────────────────────
  const kyivToday = today.ymd;                        // YYYY-MM-DD за Києвом
  const daysPassed = Number(kyivToday.slice(8, 10));
  const daysInMonth = new Date(Number(kyivToday.slice(0, 4)), Number(kyivToday.slice(5, 7)), 0).getDate();
  const monthFact = mRev[5];                          // поточний місяць із помісячних агрегатів
  const planValue = planRow?.value != null && planRow.value !== '' ? Number(planRow.value) : null;
  const plan = {
    value: Number.isFinite(planValue as number) ? planValue : null,
    fact: monthFact,
    forecast: daysPassed > 0 ? Math.round(monthFact / daysPassed * daysInMonth) : monthFact,
    daysPassed,
    daysInMonth,
    monthLabel: `${UA_MONTHS[Number(kyivToday.slice(5, 7)) - 1]} ${kyivToday.slice(0, 4)}`,
  };

  return {
    preset, periodLabel,
    prevLabel: 'до попереднього періоду',
    from: fromStr,
    to: dstr(periodTo ? new Date(periodTo.getTime() - 86400000) : now),
    dayLabels: days.map(d => String(Number(d.slice(8, 10)))),
    kpi: {
      revenue:  { value: curRev, prev: prevRev, daily: revDaily, prevDaily: prevRevDaily },
      profit:   { value: curProfit, prev: prevProfit, daily: profDaily, prevDaily: prevProfDaily },
      profitEst: { value: curProfitEst, prev: prevProfitEst },
      margin:   { value: pct(curProfitEst, curOrdSum), prev: pct(prevProfitEst, prevOrdSum) },
      orders:   { value: curOrders.length, prev: prevOrders.length, daily: ordDaily, prevDaily: prevOrdDaily },
      orderSum: { value: curOrdSum, prev: prevOrdSum },
      avgCheck: {
        value: curOrders.length ? Math.round(curOrdSum / curOrders.length) : null,
        prev:  prevOrders.length ? Math.round(sum(prevOrders) / prevOrders.length) : null,
      },
    },
    monthly,
    pipeline, buyout,
    accounts,
    mp: { prom: promBal, rozetka: rozetkaBal },
    ar: {
      total: arTotal,
      overdueCount: overdue.length,
      overdueSum: overdue.reduce((s, r) => s + Number(r.balance), 0),
    },
    ap: { total: apTotal },
    lowStockCount,
    attention: {
      pendingPayment: { count: pendingPayment.length, sum: pendingPayment.reduce((s, a) => s + Number(a.total_price ?? 0), 0) },
      awaitingStock: { count: attn.filter(a => a.status === 'awaiting_stock').length },
    },
    today: {
      orders: todayOrders.length,
      revenue: sum(todayOrders),
      shipped: shippedToday,
      paidCount: paidTxns.size,
      paidSum,
      avgCheck: todayOrders.length ? Math.round(sum(todayOrders) / todayOrders.length) : null,
    },
    channels,
    chartWindow, plan,
  };
}
