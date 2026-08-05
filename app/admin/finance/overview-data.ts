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

export type KpiSeries = { value: number; prev: number | null; daily: number[] };

export type OverviewData = {
  periodLabel: string;
  prevLabel: string;
  from: string;           // YYYY-MM-DD
  to: string;             // YYYY-MM-DD (включно, для експорту)
  dayLabels: string[];    // підписи днів періоду ('1', '5'…)
  kpi: {
    revenue: KpiSeries;   // факт з леджера
    profit: KpiSeries;    // валовий факт: revenue - cogs - fee - delivery
    margin: { value: number | null; prev: number | null };
    orders: KpiSeries;    // к-ть замовлень (когорта періоду, без скасованих)
    avgCheck: { value: number | null; prev: number | null };
  };
  funnel: { label: string; count: number; amount: number }[];
  conversion: number | null;           // створено → доставлено, %
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
  topClients: { name: string; revenue: number; orders: number; share: number }[];
  topProducts: { sku: string; name: string; qty: number; revenue: number }[];
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

export async function getOverview(p?: string): Promise<OverviewData & { preset: Preset }> {
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

  const [ledgerRows, orderRows, balRows, arRows, agingRows, apRows, lowStockRows, attnRows, promBal, rozetkaBal, todayRows, payToday] = await Promise.all([
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
    // 9. Оплати клієнтів сьогодні (кредит рахунку customer)
    db.from('money_entries')
      .select('amount, txn_id')
      .eq('account_type', 'customer')
      .in('doc_type', ['payment', 'customer_payment'])
      .lt('amount', 0)
      .eq('business_date', today.ymd)
      .then(r => r.data ?? []),
  ]);

  // ── Леджер: щоденні ряди поточного періоду + суми попереднього ────────────
  const revDaily = new Array(days.length).fill(0);
  const profDaily = new Array(days.length).fill(0);
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
  const sum = (arr: { total_price: number }[]) => arr.reduce((s, o) => s + Number(o.total_price ?? 0), 0);
  const curOrdSum = sum(curOrders);
  // «Оплачено» — остання стадія: більшість продажів — накладений платіж,
  // гроші приходять ПІСЛЯ доставки, тож до відправлення стадія була б брехлива
  const paid = curOrders.filter(o => o.payment_confirmed || Number(o.amount_paid ?? 0) > 0);
  const confirmed = curOrders.filter(o => o.confirmed_at || !['new', 'pending_payment'].includes(o.status));
  const funnel = [
    { label: 'Створено',    count: curOrders.length, amount: curOrdSum },
    { label: 'Підтверджено', count: confirmed.length, amount: sum(confirmed) },
    { label: 'Відправлено', count: curOrders.filter(o => o.shipped_at).length, amount: sum(curOrders.filter(o => o.shipped_at)) },
    { label: 'Доставлено',  count: curOrders.filter(o => o.delivered_at).length, amount: sum(curOrders.filter(o => o.delivered_at)) },
    { label: 'Оплачено',    count: paid.length, amount: sum(paid) },
  ];
  const delivered = funnel.find(f => f.label === 'Доставлено')!;
  const conversion = curOrders.length ? Math.round(delivered.count / curOrders.length * 1000) / 10 : null;

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

  // Топ клієнти (по виручці когорти; ключ — компанія/контакт/телефон)
  const clMap = new Map<string, { name: string; revenue: number; orders: number }>();
  for (const o of curOrders) {
    const name = (o.company || o.contact || o.phone || '—').trim();
    const key = o.customer_id || name.toLowerCase();
    const c = clMap.get(key) ?? { name, revenue: 0, orders: 0 };
    c.revenue += Number(o.total_price ?? 0); c.orders += 1;
    clMap.set(key, c);
  }
  const topClients = [...clMap.values()].sort((a, b) => b.revenue - a.revenue).slice(0, 5)
    .map(c => ({ ...c, share: curOrdSum ? Math.round(c.revenue / curOrdSum * 1000) / 10 : 0 }));

  // Топ товари (по виручці позицій когорти)
  const skuMap = new Map<string, { qty: number; revenue: number }>();
  for (const o of curOrders) {
    for (const it of (o.items ?? []) as { sku: string; qty: number; price: number }[]) {
      const s = skuMap.get(it.sku) ?? { qty: 0, revenue: 0 };
      s.qty += Number(it.qty ?? 0); s.revenue += Number(it.qty ?? 0) * Number(it.price ?? 0);
      skuMap.set(it.sku, s);
    }
  }
  const topSkus = [...skuMap.entries()].sort((a, b) => b[1].revenue - a[1].revenue).slice(0, 5);
  const { data: prodNames } = topSkus.length
    ? await db.from('products').select('sku, name').in('sku', topSkus.map(([sku]) => sku))
    : { data: [] as { sku: string; name: string }[] };
  const nameBySku = new Map((prodNames ?? []).map(p => [p.sku, p.name]));
  const topProducts = topSkus.map(([sku, s]) => ({ sku, name: nameBySku.get(sku) ?? sku, ...s }));

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

  return {
    preset, periodLabel,
    prevLabel: 'до попереднього періоду',
    from: fromStr,
    to: dstr(periodTo ? new Date(periodTo.getTime() - 86400000) : now),
    dayLabels: days.map(d => String(Number(d.slice(8, 10)))),
    kpi: {
      revenue:  { value: curRev, prev: prevRev, daily: revDaily },
      profit:   { value: curProfit, prev: prevProfit, daily: profDaily },
      margin:   { value: pct(curProfit, curRev), prev: pct(prevProfit, prevRev) },
      orders:   { value: curOrders.length, prev: prevOrders.length, daily: ordDaily },
      avgCheck: {
        value: curOrders.length ? Math.round(curOrdSum / curOrders.length) : null,
        prev:  prevOrders.length ? Math.round(sum(prevOrders) / prevOrders.length) : null,
      },
    },
    funnel, conversion,
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
    channels, topClients, topProducts,
  };
}
