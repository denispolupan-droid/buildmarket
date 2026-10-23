import { createServiceClient } from './supabase';
import { fetchAllRows } from './db-paginate';
import { productRows, listDataSources, latestUpload } from './merchant';
import { sendTelegramResult, escTg } from './telegram';
import { alertAdmin } from './alert';
import { getRozetkaSellerRating } from './rozetka-api';
import { SITE_URL } from './site';
import { kyivHuman } from './kyiv-date';
import {
  type Reading, type Previous, type WatchLevel, type CwvCategory,
  CWV_HUMAN, cwvOverall, trendState, diffReading,
} from './metric-watch-rules';

/**
 * Сторож показників: раз на день (і щогодини — доступність сайту) перевіряє
 * важливе для продажів і SEO та пише в Telegram ЛИШЕ коли щось змінилось —
 * стан показника або склад набору (товари, канали). Щоденна зведенка — це
 * ранковий дайджест (lib/ops-digest), а тут — сигнали «зверни увагу».
 *
 * Стан минулої перевірки — app_settings (ключ на кожен розклад), без окремої
 * таблиці. Перший запуск лише фіксує базу й надсилає одне повідомлення
 * «що зараз». Вимикач: app_settings.metric_watch = 'off'.
 *
 * Додати показник: функція (db) => Reading у DAILY/HOURLY. state — коротке
 * значення, перехід між якими варто повідомити; text — людською мовою.
 */

type Db = ReturnType<typeof createServiceClient>;
type Check = { key: string; title: string; run: (db: Db) => Promise<Reading> };

const DAY = 86_400_000;
const isoDay = (ms: number) => new Date(ms).toISOString().slice(0, 10);
const pct = (n: number) => `${n > 0 ? '+' : ''}${n}%`;

// ── Швидкість для реальних відвідувачів (CrUX) ──────────────────────────────

/**
 * Дані Chrome UX Report — те саме джерело, що звіт Core Web Vitals у Search
 * Console. Потрібен API-ключ (CRUX_API_KEY): сервісний акаунт API не приймає,
 * а безключовий PageSpeed впирається в спільну добову квоту. 404 від API —
 * «недостатньо даних» (замало відвідувачів), це нормальний стан.
 * Коли повертатися до відкладеної правки шрифту (гілка perf/font-no-preload):
 * стан мобільних стане «потребує покращення» чи «погано».
 */
function cwvCheck(formFactor: 'PHONE' | 'DESKTOP'): Check['run'] {
  return async () => {
    const key = process.env.CRUX_API_KEY;
    if (!key) return { state: 'not_configured', level: 'info', text: 'не налаштовано: потрібен CRUX_API_KEY' };
    const res = await fetch(`https://chromeuxreport.googleapis.com/v1/records:queryRecord?key=${encodeURIComponent(key)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ origin: SITE_URL, formFactor }),
    });
    if (res.status === 404) return { state: 'no_data', level: 'info', text: 'Google ще не має достатньо даних від реальних відвідувачів' };
    if (!res.ok) throw new Error(`CrUX ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const j = await res.json() as { record?: { metrics?: Record<string, { percentiles?: { p75?: number | string } }> } };
    const m = j.record?.metrics ?? {};
    const p75 = (k: string) => m[k]?.percentiles?.p75 != null ? Number(m[k]!.percentiles!.p75) : undefined;
    const r = cwvOverall({
      largest_contentful_paint: p75('largest_contentful_paint'),
      interaction_to_next_paint: p75('interaction_to_next_paint'),
      cumulative_layout_shift: p75('cumulative_layout_shift'),
    });
    if (!r) return { state: 'no_data', level: 'info', text: 'Google ще не має достатньо даних від реальних відвідувачів' };
    const level: Record<CwvCategory, WatchLevel> = { good: 'green', needs_improvement: 'yellow', poor: 'red' };
    return { state: r.overall, level: level[r.overall], text: `${CWV_HUMAN[r.overall]}: ${r.parts.join(', ')}` };
  };
}

// ── Google пошук (знімки gsc_daily, крон gsc-snapshot) ──────────────────────

type GscRow = { date: string; page_path: string; clicks: number };

// Дві перевірки (увесь сайт і магазин) читають ті самі рядки — один запит на запуск
const gscMemo = new WeakMap<Db, Promise<{ rows: GscRow[]; latest: string | null }>>();
function gscRows(db: Db) {
  if (!gscMemo.has(db)) gscMemo.set(db, loadGscRows(db));
  return gscMemo.get(db)!;
}

async function loadGscRows(db: Db): Promise<{ rows: GscRow[]; latest: string | null }> {
  const { data: last } = await db.from('gsc_daily').select('date').order('date', { ascending: false }).limit(1);
  const latest = (last?.[0]?.date as string | undefined) ?? null;
  if (!latest) return { rows: [], latest };
  const from = isoDay(new Date(latest).getTime() - 34 * DAY);
  const rows = await fetchAllRows<GscRow>((a, b) => db.from('gsc_daily')
    .select('date, page_path, clicks').gte('date', from).lte('date', latest)
    .order('date').order('page_path').range(a, b));
  return { rows, latest };
}

/** Кліки за 7 днів до останньої повної дати проти середнього тижня за 4 попередні. */
function gscTrend(filter: (path: string) => boolean, minBase: number): Check['run'] {
  return async db => {
    const { rows, latest } = await gscRows(db);
    if (!latest) return { state: 'low_data', level: 'info', text: 'знімків Search Console ще немає' };
    const end = new Date(latest).getTime();
    const weekStart = isoDay(end - 6 * DAY), prevStart = isoDay(end - 34 * DAY);
    let cur = 0, prev = 0;
    for (const r of rows) {
      if (!filter(r.page_path)) continue;
      if (r.date >= weekStart) cur += r.clicks; else if (r.date >= prevStart) prev += r.clicks;
    }
    const t = trendState(cur, prev, { dropPct: 30, growPct: 40, minBase });
    const text = `${cur} кліків за 7 днів (до ${latest}) проти ${Math.round(t.base)} у середньому за тиждень раніше${t.state === 'low_data' ? '' : ` — ${pct(t.changePct)}`}`;
    return { state: t.state, level: t.state === 'drop' ? 'red' : t.state === 'growth' ? 'green' : 'info', text };
  };
}

const isShopPage = (p: string) => /^(\/ru)?\/(product|shop)(\/|$)/.test(p);

async function gscFreshness(db: Db): Promise<Reading> {
  const { data } = await db.from('gsc_daily').select('date').order('date', { ascending: false }).limit(1);
  const latest = data?.[0]?.date as string | undefined;
  const age = latest ? Math.floor((Date.now() - new Date(latest).getTime()) / DAY) : Infinity;
  // Search Console сам віддає дані з затримкою 2–3 дні; 6+ — знімки не пишуться
  return age >= 6
    ? { state: 'stale', level: 'yellow', text: `останні дані Search Console за ${latest ?? '—'} — крон gsc-snapshot не оновлює їх ${Number.isFinite(age) ? age + ' дн' : ''}` }
    : { state: 'ok', level: 'green', text: `дані за ${latest}` };
}

// ── Merchant Center ─────────────────────────────────────────────────────────

async function merchantProducts(): Promise<Reading> {
  const rows = await productRows();
  const bad = rows.filter(r => r.aggregatedReportingContextStatus === 'NOT_ELIGIBLE_OR_DISAPPROVED');
  const partly = rows.filter(r => r.aggregatedReportingContextStatus === 'ELIGIBLE_LIMITED');
  const codes = new Map<string, number>();
  for (const r of [...bad, ...partly]) for (const i of r.itemIssues ?? []) {
    const c = i.issueType?.code ?? '?';
    codes.set(c, (codes.get(c) ?? 0) + 1);
  }
  const top = [...codes.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4).map(([c, n]) => `${c} ×${n}`).join(', ');
  // Поріг 1 % — поодиноке відхилення (битий фото-лінк) не варте тривоги, масове — так
  const state = bad.length > Math.max(3, rows.length * 0.01) ? 'disapproved' : partly.length > rows.length * 0.1 ? 'limited' : 'ok';
  return {
    state, level: state === 'disapproved' ? 'red' : state === 'limited' ? 'yellow' : 'green',
    text: `товарів ${rows.length}: відхилено ${bad.length}, обмежено ${partly.length}${top ? ` (${top})` : ''}`,
  };
}

async function merchantFeeds(): Promise<Reading> {
  const sources = (await listDataSources()).filter(s => s.input === 'FILE');
  const problems: string[] = [];
  for (const s of sources) {
    const u = await latestUpload(s.name);
    const age = u.uploadTime ? Math.floor((Date.now() - new Date(u.uploadTime).getTime()) / DAY) : Infinity;
    if (u.processingState === 'FAILED') problems.push(`${s.displayName}: остання виборка не вдалась`);
    else if (age >= 2) problems.push(`${s.displayName}: Google не забирав фід ${Number.isFinite(age) ? age + ' дн' : 'жодного разу'}`);
  }
  return problems.length
    ? { state: 'problem', level: 'red', text: problems.join('; '), set: problems }
    : { state: 'ok', level: 'green', text: `${sources.length} фіди забираються щодня` };
}

// ── Реклама ─────────────────────────────────────────────────────────────────

async function adsRunning(db: Db): Promise<Reading> {
  // Крон ads-spend пише лише дні з витратами — порожньо = кампанія не крутиться
  const since = isoDay(Date.now() - 4 * DAY);
  const { data } = await db.from('ads_spend').select('date, cost_micros').gte('date', since).order('date').limit(100);
  const spent = (data ?? []).reduce((s, r) => s + Number(r.cost_micros), 0) / 1e6;
  const { data: last } = await db.from('ads_spend').select('date').gt('cost_micros', 0).order('date', { ascending: false }).limit(1);
  return spent > 0
    ? { state: 'running', level: 'green', text: `Google Ads витрачає: ${Math.round(spent)} грн за 3 дні` }
    : { state: 'stopped', level: 'yellow', text: `Google Ads не витрачає з ${last?.[0]?.date ?? '—'} (баланс, кампанія або збій звіту)` };
}

// ── Замовлення ──────────────────────────────────────────────────────────────

type OrderLite = { channel_code: string | null; status: string; created_at: string; items: { sku?: string; qty?: number }[] | null };

async function recentOrders(db: Db, days: number): Promise<OrderLite[]> {
  return fetchAllRows<OrderLite>((a, b) => db.from('orders')
    .select('channel_code, status, created_at, items')
    .gte('created_at', new Date(Date.now() - days * DAY).toISOString())
    .neq('status', 'cancelled').order('id').range(a, b));
}

async function ordersTrend(db: Db): Promise<Reading> {
  const rows = await recentOrders(db, 35);
  const weekAgo = new Date(Date.now() - 7 * DAY).toISOString();
  const cur = rows.filter(r => r.created_at >= weekAgo).length;
  const t = trendState(cur, rows.length - cur, { dropPct: 40, growPct: 50, minBase: 5 });
  return {
    state: t.state, level: t.state === 'drop' ? 'red' : t.state === 'growth' ? 'green' : 'info',
    text: `${cur} замовлень за 7 днів (усі канали) проти ${t.base.toFixed(1).replace('.', ',')} у середньому за тиждень раніше${t.state === 'low_data' ? '' : ` — ${pct(t.changePct)}`}`,
  };
}

/** Маркетплейс, з якого звичайно йдуть замовлення щодня, замовк на 2 доби — синк, вітрина чи рейтинг. */
async function silentChannels(db: Db): Promise<Reading> {
  const rows = await recentOrders(db, 30);
  const twoDays = new Date(Date.now() - 2 * DAY).toISOString();
  const silent: string[] = [];
  const labels: Record<string, string> = { rozetka: 'Rozetka', prom: 'Prom', epicentr: 'Епіцентр' };
  for (const ch of Object.keys(labels)) {
    const all = rows.filter(r => r.channel_code === ch);
    const perDay = all.filter(r => r.created_at < twoDays).length / 28;
    if (perDay >= 1.5 && !all.some(r => r.created_at >= twoDays)) silent.push(labels[ch]);
  }
  return silent.length
    ? { state: 'silent', level: 'red', text: `жодного замовлення за 2 доби: ${silent.join(', ')} (зазвичай щодня)`, set: silent }
    : { state: 'ok', level: 'green', text: 'маркетплейси приносять замовлення як зазвичай', set: [] };
}

/**
 * Рейтинг продавця на Rozetka: падіння зірок або нова погана оцінка (1–2 із 5) —
 * привід подзвонити покупцю, поки відгук свіжий. Від рейтингу залежить показ на вітрині.
 */
async function rozetkaRating(): Promise<Reading> {
  const r = await getRozetkaSellerRating();
  const bad = Number(r.mark_bad_cnt ?? 0) + Number(r.mark_worst_cnt ?? 0);
  const stars = Number(r.stars ?? 0);
  return {
    state: `${stars.toFixed(1)}|${bad}`,
    level: stars < 4 ? 'red' : stars < 4.5 || bad > 0 ? 'yellow' : 'green',
    text: `${stars.toFixed(1)} ★ з ${r.mark_all_cnt} оцінок; поганих (1–2 ★): ${bad}; до відправки в середньому ${Math.round(Number(r.avg_diff_delivery_time ?? 0) / 60)} год`,
  };
}

// ── Товари, що продаються ───────────────────────────────────────────────────

/** Ходові товари (≥ 2 шт за 60 днів по всіх каналах), яких немає в наявності. */
async function bestsellersOut(db: Db): Promise<Reading> {
  const orders = await recentOrders(db, 60);
  const sold = new Map<string, number>();
  for (const o of orders) for (const i of o.items ?? []) if (i.sku) sold.set(i.sku, (sold.get(i.sku) ?? 0) + Number(i.qty ?? 1));
  const hot = [...sold.entries()].filter(([, q]) => q >= 2).map(([s]) => s);
  if (!hot.length) return { state: 'ok', level: 'green', text: 'ходових товарів без наявності немає', set: [] };
  const { data } = await db.from('product_stock').select('sku, stock_status').in('sku', hot).limit(hot.length);
  const out = (data ?? []).filter(r => r.stock_status === 'out_of_stock').map(r => r.sku as string).sort();
  return out.length
    ? { state: 'some', level: 'yellow', text: `${out.length} ходових товарів немає в наявності`, set: out, labels: await productLabels(db, out, sold) }
    : { state: 'ok', level: 'green', text: 'усі ходові товари в наявності', set: [] };
}

async function productLabels(db: Db, skus: string[], sold?: Map<string, number>): Promise<Record<string, string>> {
  if (!skus.length) return {};
  const { data } = await db.from('products').select('sku, name').in('sku', skus).limit(skus.length);
  const out: Record<string, string> = {};
  for (const r of data ?? []) {
    const name = String(r.name ?? '');
    out[r.sku as string] = `${r.sku} ${name.length > 45 ? name.slice(0, 44) + '…' : name}${sold?.get(r.sku as string) ? ` (${sold.get(r.sku as string)} шт за 60 дн)` : ''}`;
  }
  return out;
}

/** Роздрібна ціна нижча за закупівельну — кожен продаж у мінус. */
async function belowCost(db: Db): Promise<Reading> {
  const rows = await fetchAllRows<{ sku: string; price_retail: number | null; price_cost: number | null; stock_status: string }>((a, b) =>
    db.from('product_stock').select('sku, price_retail, price_cost, stock_status')
      .gt('price_retail', 0).gt('price_cost', 0).order('id').range(a, b));
  const bad = rows.filter(r => r.stock_status !== 'out_of_stock' && Number(r.price_retail) < Number(r.price_cost)).map(r => r.sku).sort();
  return bad.length
    ? { state: 'some', level: 'red', text: `${bad.length} товарів продаються дешевше закупівлі`, set: bad, labels: await productLabels(db, bad) }
    : { state: 'ok', level: 'green', text: 'роздрібні ціни вищі за закупівельні', set: [] };
}

// ── Доступність сайту (щогодини) ────────────────────────────────────────────

const PROBE_PATHS = ['/', '/shop', '/shop/germetyky'];

async function siteUp(): Promise<Reading> {
  const failed: string[] = [];
  for (const p of PROBE_PATHS) {
    let ok = false, why = '';
    // Друга спроба — щоб одиничний холодний старт не будив власника
    for (let attempt = 0; attempt < 2 && !ok; attempt++) {
      const started = Date.now();
      try {
        const res = await fetch(SITE_URL + p, { cache: 'no-store', signal: AbortSignal.timeout(15_000), headers: { 'User-Agent': 'fixline-metric-watch' } });
        const ms = Date.now() - started;
        ok = res.status === 200 && ms < 8_000;
        why = res.status !== 200 ? `HTTP ${res.status}` : `${(ms / 1000).toFixed(1)} с`;
      } catch (e) {
        why = e instanceof Error ? e.name === 'TimeoutError' ? 'не відповів за 15 с' : e.message : String(e);
      }
    }
    if (!ok) failed.push(`${p} — ${why}`);
  }
  return failed.length
    ? { state: 'down', level: 'red', text: `сторінки не відкриваються: ${failed.join('; ')}`, set: failed.map(f => f.split(' — ')[0]) }
    : { state: 'up', level: 'green', text: 'сайт відкривається', set: [] };
}

// ── Перелік ─────────────────────────────────────────────────────────────────

export const DAILY: Check[] = [
  { key: 'cwv_phone', title: 'Швидкість сайту на телефонах (Google, реальні відвідувачі)', run: cwvCheck('PHONE') },
  { key: 'cwv_desktop', title: 'Швидкість сайту на компʼютерах (Google, реальні відвідувачі)', run: cwvCheck('DESKTOP') },
  { key: 'gsc_all', title: 'Кліки з Google — увесь сайт', run: gscTrend(() => true, 20) },
  { key: 'gsc_shop', title: 'Кліки з Google — товари й категорії', run: gscTrend(isShopPage, 10) },
  { key: 'gsc_fresh', title: 'Дані Search Console', run: gscFreshness },
  { key: 'mc_products', title: 'Merchant Center — товари', run: () => merchantProducts() },
  { key: 'mc_feeds', title: 'Merchant Center — фіди', run: () => merchantFeeds() },
  { key: 'ads', title: 'Google Ads', run: adsRunning },
  { key: 'orders', title: 'Замовлення', run: ordersTrend },
  { key: 'channels', title: 'Маркетплейси', run: silentChannels },
  { key: 'rozetka_rating', title: 'Рейтинг продавця Rozetka', run: () => rozetkaRating() },
  { key: 'bestsellers_oos', title: 'Ходові товари без наявності', run: bestsellersOut },
  { key: 'below_cost', title: 'Ціна нижча за закупівлю', run: belowCost },
];

export const HOURLY: Check[] = [
  { key: 'site_up', title: 'Сайт', run: () => siteUp() },
];

// ── Запуск ──────────────────────────────────────────────────────────────────

type Saved = Record<string, Previous & { text?: string; at?: string; labels?: Record<string, string> }>;
const SETTINGS_KEY: Record<'daily' | 'hourly', string> = { daily: 'metric_watch_daily', hourly: 'metric_watch_hourly' };
const EMOJI: Record<WatchLevel, string> = { red: '🔴', yellow: '🟡', green: '🟢', info: '⚪' };
const SET_SHOWN = 8;

export async function isWatchEnabled(): Promise<boolean> {
  const { data } = await createServiceClient().from('app_settings').select('value').eq('key', 'metric_watch').maybeSingle();
  return (data?.value ?? '').trim().toLowerCase() !== 'off';
}

export type WatchResult = {
  scope: 'daily' | 'hourly';
  readings: { key: string; title: string; reading: Reading | null; error?: string }[];
  message: string | null;
  sent: boolean;
};

/**
 * dryRun — порахувати й показати повідомлення, нічого не зберігаючи й не надсилаючи
 * (локальна перевірка проти прода); previous — підставний минулий стан для неї.
 */
export async function runMetricWatch(scope: 'daily' | 'hourly', opts: { dryRun?: boolean; previous?: Saved } = {}): Promise<WatchResult> {
  const db = createServiceClient();
  const checks = scope === 'daily' ? DAILY : HOURLY;
  const { data: row } = await db.from('app_settings').select('value').eq('key', SETTINGS_KEY[scope]).maybeSingle();
  let saved: Saved = {};
  try { saved = row?.value ? JSON.parse(row.value) as Saved : {}; } catch { saved = {}; }
  if (opts.dryRun && opts.previous) saved = opts.previous;
  const firstRun = !row?.value && !(opts.dryRun && opts.previous);

  const readings = await Promise.all(checks.map(async c => {
    try { return { key: c.key, title: c.title, reading: await c.run(db) }; }
    catch (e) { return { key: c.key, title: c.title, reading: null, error: e instanceof Error ? e.message : String(e) }; }
  }));

  const lines: string[] = [];
  const now = new Date().toISOString();
  const next: Saved = { ...saved };
  for (const r of readings) {
    // Збій перевірки не змінює стан: інакше кожен таймаут API давав би пару
    // повідомлень «зламалось/полагодилось». Збої видно в логах і відповіді крону.
    if (!r.reading) continue;
    const prev = saved[r.key];
    const cur = r.reading;
    next[r.key] = { state: cur.state, set: cur.set, text: cur.text, at: now, labels: cur.labels };
    const list = (items: string[], mark: string, labels = cur.labels) => `\n${items.slice(0, SET_SHOWN).map(x => `   ${mark} ${escTg(labels?.[x] ?? x)}`).join('\n')}${items.length > SET_SHOWN ? `\n   … і ще ${items.length - SET_SHOWN}` : ''}`;
    if (firstRun || !prev) {
      lines.push(`${EMOJI[cur.level]} <b>${escTg(r.title)}</b>${firstRun ? '' : ' (новий показник)'}: ${escTg(cur.text)}${cur.set?.length ? list(cur.set, '•') : ''}`);
      continue;
    }
    const ch = diffReading(prev, cur);
    if (!ch) continue;
    let line = `${EMOJI[cur.level]} <b>${escTg(r.title)}</b>: ${escTg(cur.text)}`;
    if (ch.stateChanged && prev.text) line += `\n   було: ${escTg(prev.text)}`;
    if (ch.added.length) line += `\n   нові:${list(ch.added, '➕')}`;
    if (ch.removed.length) line += `\n   більше не:${list(ch.removed, '✅', prev.labels)}`;
    lines.push(line);
  }

  const head = firstRun
    ? `📊 <b>Сторож показників увімкнено</b> — поточний стан. Далі пишу лише про зміни.`
    : `📊 <b>Зміни показників</b> · ${escTg(kyivHuman(new Date()))}`;
  const message = lines.length ? `${head}\n\n${lines.join('\n\n')}` : null;

  let sent = false;
  if (!opts.dryRun) {
    if (message) {
      const chatId = process.env.TELEGRAM_ADMIN_CHAT_ID;
      const r = chatId ? await sendTelegramResult(chatId, message, { disablePreview: true }) : { messageId: null, error: 'TELEGRAM_ADMIN_CHAT_ID не заданий' };
      sent = r.messageId != null;
      // Не надіслали — стан не зберігаємо, щоб зміна не загубилась і пішла наступного разу
      if (!sent) { alertAdmin('Сторож показників не надіслав повідомлення', r.error ?? 'без причини'); return { scope, readings, message, sent }; }
    }
    await db.from('app_settings').upsert({ key: SETTINGS_KEY[scope], value: JSON.stringify(next) }, { onConflict: 'key' });
  }
  return { scope, readings, message, sent };
}
