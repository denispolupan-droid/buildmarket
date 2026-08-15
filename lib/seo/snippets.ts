import { getPages } from '../gsc';

/**
 * Втрати CTR: сторінки, які вже ранжуються, але їх не клікають.
 *
 * Розділ SEO уміє лише «дожимати позиції», хоча найдорожча проблема сайту
 * інша — сторінки на 5–8 позиції з нулем кліків. Це не про контент, це про
 * сніпет: title, description і те, що реально віддається в HTML.
 *
 * Мета читаємо з живої сторінки, а не з lib/seo/meta.ts: так у звіті видно
 * ФАКТ (разом із canonical і robots), а не те, що ми думаємо, що генеруємо.
 */

const ORIGIN = 'https://fixline.com.ua';

/**
 * Орієнтир CTR по позиціях — галузева крива, не наші дані: власну будувати
 * немає з чого, поки сайт майже не клікають. Потрібна лише щоб ранжувати
 * сторінки за розміром втрати, тому точність до відсотка тут не критична.
 */
const EXPECTED_CTR: Record<number, number> = {
  1: 0.28, 2: 0.15, 3: 0.11, 4: 0.08, 5: 0.06,
  6: 0.05, 7: 0.04, 8: 0.033, 9: 0.028, 10: 0.025,
  11: 0.02, 12: 0.018, 13: 0.016, 14: 0.014, 15: 0.013,
  16: 0.012, 17: 0.011, 18: 0.011, 19: 0.010, 20: 0.010,
};

export function expectedCtr(position: number): number {
  const p = Math.round(position);
  if (p < 1) return EXPECTED_CTR[1];
  if (p > 20) return 0.005;
  return EXPECTED_CTR[p] ?? 0.01;
}

/** Цільові довжини: видима частина title ≤65, description 150–160. */
export const TITLE_MAX = 65;
export const DESC_MAX = 160;
export const DESC_MIN = 70;

export type SnippetRow = {
  path: string;
  impressions: number;
  clicks: number;
  ctr: number;
  position: number;
  /** скільки кліків недоотримано проти орієнтиру для цієї позиції */
  lostClicks: number;
  title: string | null;
  description: string | null;
  canonical: string | null;
  robots: string | null;
  h1: string | null;
  /** сторінку не вдалося прочитати */
  fetchError: string | null;
};

const decode = (s: string) => s
  .replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/&apos;/g, "'")
  .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  .replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();

function pick(head: string, re: RegExp): string | null {
  const m = re.exec(head);
  return m ? decode(m[1]) : null;
}

/** Розбір <head>: працює на будь-якому типі сторінки, без дублювання логіки meta.ts. */
export function parseHead(html: string): Omit<SnippetRow, 'path' | 'impressions' | 'clicks' | 'ctr' | 'position' | 'lostClicks' | 'fetchError'> {
  const head = html.slice(0, 200_000);
  return {
    title: pick(head, /<title[^>]*>([\s\S]*?)<\/title>/i),
    description: pick(head, /<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)["']/i)
      ?? pick(head, /<meta[^>]+content=["']([^"']*)["'][^>]+name=["']description["']/i),
    canonical: pick(head, /<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']*)["']/i),
    robots: pick(head, /<meta[^>]+name=["']robots["'][^>]+content=["']([^"']*)["']/i),
    h1: pick(head, /<h1[^>]*>([\s\S]*?)<\/h1>/i)?.replace(/<[^>]+>/g, '') ?? null,
  };
}

async function fetchSnippet(path: string, timeoutMs = 10_000): Promise<Partial<SnippetRow>> {
  // Тільки власний домен: адреси приходять із нашої ж властивості GSC, але
  // ходити кудись іще цей код не повинен за жодних обставин.
  const url = `${ORIGIN}${path.startsWith('/') ? path : `/${path}`}`;
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: ac.signal, headers: { 'User-Agent': 'FIXLINE-SEO-Audit' } });
    if (!res.ok) return { fetchError: `HTTP ${res.status}` };
    return { ...parseHead(await res.text()), fetchError: null };
  } catch (err) {
    return { fetchError: err instanceof Error ? err.message : String(err) };
  } finally {
    clearTimeout(timer);
  }
}

/** Обмежений пул: 30 сторінок по одній — це півхвилини, всі разом — удар по своєму ж сайту. */
async function mapPool<T, R>(items: T[], size: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(size, items.length) }, async () => {
    while (i < items.length) {
      const idx = i++;
      out[idx] = await fn(items[idx]);
    }
  }));
  return out;
}

export async function ctrLosses(opts: {
  days?: number;
  limit?: number;
  /** розглядаємо лише сторінки з позицією не гіршою за це */
  maxPosition?: number;
  /** і не менше цієї кількості показів */
  minImpressions?: number;
}): Promise<SnippetRow[]> {
  const days = opts.days ?? 28;
  const limit = opts.limit ?? 30;
  const maxPosition = opts.maxPosition ?? 20;
  const minImpressions = opts.minImpressions ?? 10;

  const pages = await getPages({ days });

  const candidates = pages
    .map(p => {
      const path = p.page.replace(/^https?:\/\/[^/]+/i, '').replace(/[?#].*$/, '') || '/';
      const lost = p.impressions * Math.max(0, expectedCtr(p.position) - p.ctr);
      return { path, impressions: p.impressions, clicks: p.clicks, ctr: p.ctr, position: p.position, lostClicks: Math.round(lost * 10) / 10 };
    })
    .filter(p => p.position <= maxPosition && p.impressions >= minImpressions && p.lostClicks > 0)
    .sort((a, b) => b.lostClicks - a.lostClicks)
    .slice(0, limit);

  const heads = await mapPool(candidates, 5, c => fetchSnippet(c.path));

  return candidates.map((c, i) => ({
    ...c,
    title: null, description: null, canonical: null, robots: null, h1: null, fetchError: null,
    ...heads[i],
  }) as SnippetRow);
}

/** Однакові title/description на різних сторінках — прямий сигнал дублів для Google. */
export function findDuplicates(rows: SnippetRow[]): { field: 'title' | 'description'; value: string; paths: string[] }[] {
  const out: { field: 'title' | 'description'; value: string; paths: string[] }[] = [];
  for (const field of ['title', 'description'] as const) {
    const byValue = new Map<string, string[]>();
    for (const r of rows) {
      const v = r[field];
      if (!v) continue;
      if (!byValue.has(v)) byValue.set(v, []);
      byValue.get(v)!.push(r.path);
    }
    for (const [value, paths] of byValue) {
      if (paths.length > 1) out.push({ field, value, paths });
    }
  }
  return out;
}
