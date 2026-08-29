// Зведений звіт про пошуковий трафік: одна сторінка, яка відповідає на «як ми
// росли, за рахунок чого і де найближчий резерв».
//
// Розділ SEO уже показує запити, сторінки й сніпети — але кожне окремо. Тут
// зведення: динаміка, розклад за типами сторінок і висновки. Головне правило —
// ВИСНОВКИ РАХУЮТЬСЯ, а не пишуться текстом. Інакше через місяць звіт почне
// впевнено брехати: «61% дає блог» лишиться на екрані, коли це вже неправда.
//
// Дані: gsc_daily (наша історія по сторінках, з 10.05.2026) + живий звіт Search
// Console по запитах. Запити в історії не зберігаються — Google віддає їх лише
// на льоту, тому по них порівнюємо поточний період з попереднім.

import { createServiceClient } from '../supabase';
import { fetchAllRows } from '../db-paginate';
import { getQueries } from '../gsc';
import {
  buildFindings, pageKind, normPath,
  type Finding, type KindRow, type Metrics, type MonthRow, type OrderRow,
  type PageRow, type Period, type QueryRow, type WeekRow,
} from './report-findings';

export * from './report-findings';

export type SearchReport = {
  generatedAt: string;
  window: { first: string; last: string; days: number };
  curPeriod: Period; prevPeriod: Period;
  cur: Metrics; prev: Metrics;
  months: MonthRow[];
  weeks: WeekRow[];
  kinds: KindRow[];
  topPages: PageRow[];
  growth: PageRow[];
  decline: PageRow[];
  queries: QueryRow[];
  zeroClick: QueryRow[];
  newQueries: QueryRow[];
  orders: OrderRow[];
  findings: Finding[];
  totals: { clicks: number; impressions: number; pages: number; queries: number };
  /** Запити Search Console не відповіли — сторінкові дані все одно показуємо */
  queriesError: string | null;
};

type DailyRow = { date: string; page_path: string; clicks: number; impressions: number; position: number };

function shiftDate(iso: string, days: number): string {
  const t = new Date(iso + 'T00:00:00Z');
  t.setUTCDate(t.getUTCDate() + days);
  return t.toISOString().slice(0, 10);
}

function mondayOf(iso: string): string {
  const t = new Date(iso + 'T00:00:00Z');
  const shift = (t.getUTCDay() + 6) % 7;   // понеділок — початок тижня
  t.setUTCDate(t.getUTCDate() - shift);
  return t.toISOString().slice(0, 10);
}

/** Середня позиція зважується показами: сторінку, яку бачили тисячу разів, не можна
 *  прирівнювати до тієї, яку бачили двічі. */
function metrics(rows: { clicks: number; impressions: number; position: number }[]): Metrics {
  let clicks = 0, impressions = 0, posWeighted = 0;
  for (const r of rows) {
    clicks += Number(r.clicks);
    impressions += Number(r.impressions);
    posWeighted += Number(r.position ?? 0) * Number(r.impressions);
  }
  return {
    clicks,
    impressions,
    ctr: impressions ? (clicks / impressions) * 100 : 0,
    position: impressions ? posWeighted / impressions : 0,
  };
}

export async function buildSearchReport(days: 28 | 90 = 28): Promise<SearchReport> {
  const db = createServiceClient();

  const daily = await fetchAllRows<DailyRow>((f, t) => db
    .from('gsc_daily')
    .select('date, page_path, clicks, impressions, position')
    .order('date', { ascending: true })
    .range(f, t));

  if (!daily.length) {
    throw new Error('У gsc_daily немає даних — спершу має відпрацювати синк Search Console');
  }

  const dates = [...new Set(daily.map(r => r.date))].sort();
  const first = dates[0], last = dates[dates.length - 1];
  const curFrom = shiftDate(last, -(days - 1));
  const prevTo = shiftDate(curFrom, -1);
  const prevFrom = shiftDate(prevTo, -(days - 1));

  const within = (r: DailyRow, a: string, b: string) => r.date >= a && r.date <= b;
  const curRows = daily.filter(r => within(r, curFrom, last));
  const prevRows = daily.filter(r => within(r, prevFrom, prevTo));

  const cur = metrics(curRows);
  const prev = metrics(prevRows);

  // ── помісячно ──────────────────────────────────────────────────────────────
  const monthMap = new Map<string, { rows: DailyRow[]; days: Set<string> }>();
  for (const r of daily) {
    const key = r.date.slice(0, 7);
    const v = monthMap.get(key) ?? { rows: [], days: new Set<string>() };
    v.rows.push(r); v.days.add(r.date);
    monthMap.set(key, v);
  }
  const months: MonthRow[] = [...monthMap.entries()].sort()
    .map(([month, v]) => ({ month, days: v.days.size, ...metrics(v.rows) }));

  // ── потижнево ──────────────────────────────────────────────────────────────
  const weekMap = new Map<string, DailyRow[]>();
  for (const r of daily) {
    const key = mondayOf(r.date);
    weekMap.set(key, [...(weekMap.get(key) ?? []), r]);
  }
  const weeks: WeekRow[] = [...weekMap.entries()].sort()
    .map(([week, rows]) => ({ week, ...metrics(rows) }));

  // ── типи сторінок ──────────────────────────────────────────────────────────
  const kindMap = new Map<string, { cur: DailyRow[]; prev: DailyRow[] }>();
  for (const r of daily) {
    const k = pageKind(r.page_path);
    const v = kindMap.get(k) ?? { cur: [], prev: [] };
    if (within(r, curFrom, last)) v.cur.push(r);
    if (within(r, prevFrom, prevTo)) v.prev.push(r);
    kindMap.set(k, v);
  }
  const kindsRaw = [...kindMap.entries()].map(([kind, v]) => {
    const c = metrics(v.cur), p = metrics(v.prev);
    return { kind, impressions: c.impressions, clicks: c.clicks, prevImpressions: p.impressions, prevClicks: p.clicks, ctr: c.ctr };
  }).filter(k => k.impressions > 0 || k.prevImpressions > 0);
  const kinds: KindRow[] = kindsRaw
    .map(k => ({ ...k, clickShare: cur.clicks ? (k.clicks / cur.clicks) * 100 : 0 }))
    .sort((a, b) => b.impressions - a.impressions);

  // ── сторінки ───────────────────────────────────────────────────────────────
  const agg = (rows: DailyRow[]) => {
    const m = new Map<string, DailyRow[]>();
    for (const r of rows) {
      const p = normPath(r.page_path);
      m.set(p, [...(m.get(p) ?? []), r]);
    }
    return m;
  };
  const curPages = agg(curRows), prevPages = agg(prevRows);
  const pages: PageRow[] = [...new Set([...curPages.keys(), ...prevPages.keys()])].map(path => {
    const c = metrics(curPages.get(path) ?? []);
    const p = metrics(prevPages.get(path) ?? []);
    return {
      path, kind: pageKind(path),
      impressions: c.impressions, clicks: c.clicks, position: c.position,
      prevImpressions: p.impressions, delta: c.impressions - p.impressions,
    };
  });
  const topPages = [...pages].sort((a, b) => b.impressions - a.impressions).slice(0, 15);
  const growth = [...pages].filter(p => p.impressions >= 15).sort((a, b) => b.delta - a.delta).slice(0, 10);
  const decline = [...pages].filter(p => p.prevImpressions >= 15 && p.delta < 0)
    .sort((a, b) => a.delta - b.delta).slice(0, 8);

  // ── запити (лише на льоту) ─────────────────────────────────────────────────
  let queries: QueryRow[] = [], zeroClick: QueryRow[] = [], newQueries: QueryRow[] = [];
  let queriesError: string | null = null;
  try {
    const [curQ, prevQ] = await Promise.all([
      getQueries({ days }),
      getQueries({ days, shiftPeriods: 1 }),
    ]);
    const fold = (rows: { query: string; clicks: number; impressions: number; position: number }[]) => {
      const m = new Map<string, { c: number; i: number; pw: number }>();
      for (const r of rows) {
        const v = m.get(r.query) ?? { c: 0, i: 0, pw: 0 };
        v.c += r.clicks; v.i += r.impressions; v.pw += r.position * r.impressions;
        m.set(r.query, v);
      }
      return m;
    };
    const cq = fold(curQ), pq = fold(prevQ);
    const all: QueryRow[] = [...cq.entries()].map(([query, v]) => ({
      query, clicks: v.c, impressions: v.i,
      position: v.i ? v.pw / v.i : 0,
      prevImpressions: pq.get(query)?.i ?? 0,
    }));
    queries = [...all].sort((a, b) => b.impressions - a.impressions).slice(0, 20);
    zeroClick = [...all].filter(q => q.clicks === 0).sort((a, b) => b.impressions - a.impressions).slice(0, 12);
    newQueries = [...all].filter(q => q.prevImpressions === 0 && q.impressions >= 5)
      .sort((a, b) => b.impressions - a.impressions).slice(0, 10);
  } catch (err) {
    // Звіт без запитів усе одно корисний — не валимо всю сторінку через Google
    queriesError = err instanceof Error ? err.message : String(err);
  }

  // ── замовлення для контексту ───────────────────────────────────────────────
  const orderRows = await fetchAllRows<{ status: string; channel_code: string | null; total_price: number; created_at: string }>((f, t) => db
    .from('orders')
    .select('status, channel_code, total_price, created_at')
    .neq('status', 'cancelled')
    .order('created_at', { ascending: true })
    .range(f, t));
  const orderMap = new Map<string, OrderRow>();
  for (const o of orderRows) {
    const month = String(o.created_at).slice(0, 7);
    const v = orderMap.get(month) ?? { month, count: 0, revenue: 0, fromSite: 0 };
    v.count++; v.revenue += Number(o.total_price ?? 0);
    if ((o.channel_code ?? 'website') === 'website') v.fromSite++;
    orderMap.set(month, v);
  }
  const orders = [...orderMap.values()].sort((a, b) => a.month.localeCompare(b.month)).slice(-6);

  return {
    generatedAt: new Date().toISOString(),
    window: { first, last, days: dates.length },
    curPeriod: { from: curFrom, to: last },
    prevPeriod: { from: prevFrom, to: prevTo },
    cur, prev, months, weeks, kinds, topPages, growth, decline,
    queries, zeroClick, newQueries, orders,
    findings: buildFindings({ cur, prev, kinds, growth, decline, zeroClick, pages, days }),
    totals: {
      clicks: daily.reduce((s, r) => s + Number(r.clicks), 0),
      impressions: daily.reduce((s, r) => s + Number(r.impressions), 0),
      pages: new Set(daily.map(r => normPath(r.page_path))).size,
      queries: queries.length,
    },
    queriesError,
  };
}
