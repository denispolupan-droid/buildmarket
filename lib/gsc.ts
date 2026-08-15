import crypto from 'node:crypto';

// Google Search Console API через сервісний акаунт (GSC_SERVICE_ACCOUNT_KEY —
// JSON ключа). Без залежностей: JWT RS256 підписуємо вбудованим crypto.

const SITE = 'sc-domain:fixline.com.ua';
const SCOPE = 'https://www.googleapis.com/auth/webmasters.readonly';

/**
 * GSC добирає дані із затримкою: за останні 2–3 доби рядків ще немає. Якщо
 * рахувати вікно від «сьогодні», то «28 днів» насправді дають 25 днів даних, і
 * порівняння з попереднім періодом зсувається. Тому всі вікна відлічуємо від
 * дати, за яку статистика вже фінальна.
 */
const LAG_DAYS = 3;

/** Максимум рядків на один запит до API (жорсткий ліміт Google). */
const PAGE = 25_000;

/** Запобіжник від нескінченного обходу, якщо сайт колись сильно виросте. */
const MAX_ROWS = 200_000;

type ServiceAccountKey = { client_email: string; private_key: string };

let cachedToken: { token: string; expiresAt: number } | null = null;

function b64url(input: Buffer | string): string {
  return Buffer.from(input).toString('base64url');
}

async function getAccessToken(): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) return cachedToken.token;

  const raw = process.env.GSC_SERVICE_ACCOUNT_KEY;
  if (!raw) throw new Error('GSC_SERVICE_ACCOUNT_KEY не налаштований');
  const key = JSON.parse(raw) as ServiceAccountKey;

  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claims = b64url(JSON.stringify({
    iss: key.client_email,
    scope: SCOPE,
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
  }));
  const signature = crypto.createSign('RSA-SHA256')
    .update(`${header}.${claims}`)
    .sign(key.private_key)
    .toString('base64url');
  const jwt = `${header}.${claims}.${signature}`;

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=${encodeURIComponent('urn:ietf:params:oauth:grant-type:jwt-bearer')}&assertion=${jwt}`,
  });
  if (!res.ok) throw new Error(`GSC auth failed: ${res.status} ${await res.text()}`);
  const data = await res.json() as { access_token: string; expires_in: number };
  cachedToken = { token: data.access_token, expiresAt: Date.now() + data.expires_in * 1000 };
  return data.access_token;
}

export type GscRawRow = {
  keys: string[];
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
};

export type GscQueryRow = {
  query: string;
  page: string;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
};

export type GscPageRow = {
  page: string;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
};

/** Вікно дат [start, end] у форматі YYYY-MM-DD, з поправкою на затримку GSC. */
export function dateWindow(days: number, shiftPeriods = 0): { startDate: string; endDate: string } {
  const day = 24 * 60 * 60 * 1000;
  const endMs = Date.now() - (LAG_DAYS + shiftPeriods * days) * day;
  const startMs = endMs - (days - 1) * day;
  const fmt = (ms: number) => new Date(ms).toISOString().slice(0, 10);
  return { startDate: fmt(startMs), endDate: fmt(endMs) };
}

// Відповіді GSC кешуємо в памʼяті інстансу: розділ SEO смикає ті самі зрізи з
// кількох вкладок, а повний обхід 1000+ рядків — це секунди й квота API.
const RESPONSE_TTL_MS = 10 * 60 * 1000;
const responseCache = new Map<string, { at: number; rows: GscRawRow[] }>();

/**
 * Повний обхід звіту: Google віддає максимум 25 000 рядків за запит і сортує їх
 * за спаданням кліків, тому обрізання «перших N» першими викидає саме те, що нас
 * цікавить — запити з показами й нулем кліків. Ходимо startRow'ом до кінця.
 */
export async function queryAll(opts: {
  dimensions: ('query' | 'page' | 'date' | 'country' | 'device')[];
  days?: number;
  /** 0 — поточний період, 1 — попередній такий самий (для порівняння) */
  shiftPeriods?: number;
  /** явне вікно замість days/shiftPeriods */
  window?: { startDate: string; endDate: string };
}): Promise<GscRawRow[]> {
  const win = opts.window ?? dateWindow(opts.days ?? 28, opts.shiftPeriods ?? 0);
  const cacheKey = JSON.stringify([opts.dimensions, win]);

  const hit = responseCache.get(cacheKey);
  if (hit && Date.now() - hit.at < RESPONSE_TTL_MS) return hit.rows;

  const token = await getAccessToken();
  const url = `https://searchconsole.googleapis.com/webmasters/v3/sites/${encodeURIComponent(SITE)}/searchAnalytics/query`;

  const out: GscRawRow[] = [];
  for (let startRow = 0; startRow < MAX_ROWS; startRow += PAGE) {
    const res = await fetch(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        startDate: win.startDate,
        endDate: win.endDate,
        dimensions: opts.dimensions,
        type: 'web',
        rowLimit: PAGE,
        startRow,
      }),
    });
    if (!res.ok) throw new Error(`GSC query failed: ${res.status} ${await res.text()}`);
    const data = await res.json() as { rows?: GscRawRow[] };
    const rows = data.rows ?? [];
    out.push(...rows);
    if (rows.length < PAGE) break;
  }

  responseCache.set(cacheKey, { at: Date.now(), rows: out });
  return out;
}

/** Запити за N днів; за замовчуванням — увесь звіт, за спаданням показів. */
export async function getQueries(opts?: {
  days?: number;
  minPosition?: number;
  maxPosition?: number;
  limit?: number;
  shiftPeriods?: number;
}): Promise<GscQueryRow[]> {
  const raw = await queryAll({
    dimensions: ['query', 'page'],
    days: opts?.days ?? 28,
    shiftPeriods: opts?.shiftPeriods ?? 0,
  });

  const minP = opts?.minPosition ?? 0;
  const maxP = opts?.maxPosition ?? 1000;
  const rows = raw
    .map(r => ({
      query: r.keys[0],
      page: r.keys[1],
      clicks: r.clicks,
      impressions: r.impressions,
      ctr: r.ctr,
      position: r.position,
    }))
    .filter(r => r.position >= minP && r.position <= maxP)
    .sort((a, b) => b.impressions - a.impressions);

  return opts?.limit ? rows.slice(0, opts.limit) : rows;
}

/** Зріз по сторінках: сума показів/кліків і середня позиція кожного URL. */
export async function getPages(opts?: {
  days?: number;
  shiftPeriods?: number;
  limit?: number;
}): Promise<GscPageRow[]> {
  const raw = await queryAll({
    dimensions: ['page'],
    days: opts?.days ?? 28,
    shiftPeriods: opts?.shiftPeriods ?? 0,
  });
  const rows = raw
    .map(r => ({
      page: r.keys[0],
      clicks: r.clicks,
      impressions: r.impressions,
      ctr: r.ctr,
      position: r.position,
    }))
    .sort((a, b) => b.impressions - a.impressions);
  return opts?.limit ? rows.slice(0, opts.limit) : rows;
}

/** Показники однієї сторінки за вікно — потрібні для заміру ефекту дожиму. */
export async function getPageStats(
  pagePath: string,
  opts?: { days?: number; shiftPeriods?: number },
): Promise<GscPageRow | null> {
  const pages = await getPages({ days: opts?.days ?? 28, shiftPeriods: opts?.shiftPeriods ?? 0 });
  const want = pagePath.replace(/\/+$/, '');
  return pages.find(p => p.page.replace(/^https?:\/\/[^/]+/i, '').replace(/\/+$/, '') === want) ?? null;
}
