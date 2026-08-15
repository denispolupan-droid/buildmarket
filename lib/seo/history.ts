import { createClient } from '@supabase/supabase-js';
import { queryAll } from '../gsc';

/**
 * Історія Search Console по днях (таблиця gsc_daily).
 *
 * Навіщо: сам API віддає лише агрегат за вікно, тому адмінка не могла ні
 * показати тренд, ні відповісти «що дав дожим». Маючи щоденний зріз, ефект
 * будь-якої дії рахується ретроспективно — 28 днів до дати проти 28 після, —
 * і для цього не потрібні окремі знімки «до/після» в момент дії.
 *
 * page_path зберігаємо зі збереженим мовним префіксом (/ru/...), а зливаємо
 * мови вже на читанні: позиція при злитті — середня, зважена на покази.
 */

const db = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

/** Шлях без домену й параметрів; мовний префікс лишається. */
export function toPath(pageOrUrl: string): string {
  const p = pageOrUrl.replace(/^https?:\/\/[^/]+/i, '').replace(/[?#].*$/, '').replace(/\/+$/, '');
  return p || '/';
}

/** Той самий ключ, що в журналі дій: без домену, параметрів і без /ru. */
export function toLangNeutralPath(pageOrUrl: string): string {
  const p = toPath(pageOrUrl).replace(/^\/ru(?=\/|$)/, '');
  return p || '/';
}

export type DailyRow = {
  date: string;
  page_path: string;
  clicks: number;
  impressions: number;
  position: number;
};

/**
 * Забирає зріз за останні `days` днів і перезаписує його в gsc_daily.
 * Перезапис, а не пропуск наявних: GSC добирає дані заднім числом кілька діб.
 */
export async function ingestGscDaily(days = 3): Promise<{ days: number; rows: number }> {
  const raw = await queryAll({ dimensions: ['date', 'page'], days });

  const rows: DailyRow[] = raw.map(r => ({
    date: r.keys[0],
    page_path: toPath(r.keys[1]),
    clicks: r.clicks,
    impressions: r.impressions,
    position: Math.round(r.position * 100) / 100,
  }));

  // Один URL може дати кілька рядків після нормалізації (напр. з параметрами) —
  // складаємо їх, інакше upsert зі спільним ключем впаде.
  const merged = new Map<string, DailyRow>();
  for (const r of rows) {
    const key = `${r.date}|${r.page_path}`;
    const cur = merged.get(key);
    if (!cur) { merged.set(key, { ...r }); continue; }
    const imp = cur.impressions + r.impressions;
    cur.position = imp ? (cur.position * cur.impressions + r.position * r.impressions) / imp : cur.position;
    cur.clicks += r.clicks;
    cur.impressions = imp;
  }

  const all = [...merged.values()];
  const client = db();
  for (let i = 0; i < all.length; i += 500) {
    const { error } = await client.from('gsc_daily').upsert(all.slice(i, i + 500), { onConflict: 'date,page_path' });
    if (error) throw new Error(`gsc_daily upsert: ${error.message}`);
  }
  return { days, rows: all.length };
}

export type WindowStats = { clicks: number; impressions: number; position: number | null; days: number };

const EMPTY: WindowStats = { clicks: 0, impressions: 0, position: null, days: 0 };

function aggregate(rows: DailyRow[]): WindowStats {
  if (!rows.length) return EMPTY;
  const clicks = rows.reduce((s, r) => s + r.clicks, 0);
  const impressions = rows.reduce((s, r) => s + r.impressions, 0);
  const position = impressions
    ? rows.reduce((s, r) => s + r.position * r.impressions, 0) / impressions
    : null;
  return { clicks, impressions, position, days: new Set(rows.map(r => r.date)).size };
}

export type PageEffect = {
  before: WindowStats;
  after: WindowStats;
  /** скільки днів даних після дії вже накопичилось (0 — рано робити висновок) */
  maturity: number;
};

/**
 * Ефект по сторінці навколо дати дії. Мови зливаються: дожим править укр і рос
 * версію одночасно, тому рахувати їх окремо — це ділити один і той самий ефект.
 */
export async function pageEffects(
  entries: { path: string; at: string }[],
  window = 28,
): Promise<Map<string, PageEffect>> {
  if (!entries.length) return new Map();

  const paths = [...new Set(entries.map(e => toLangNeutralPath(e.path)))];
  const client = db();

  // Тягнемо історію одразу для обох мовних варіантів кожного шляху
  const wanted = paths.flatMap(p => (p === '/' ? ['/', '/ru'] : [p, `/ru${p}`]));
  const { data, error } = await client
    .from('gsc_daily')
    .select('date, page_path, clicks, impressions, position')
    .in('page_path', wanted);
  if (error) throw new Error(`gsc_daily read: ${error.message}`);

  const byPath = new Map<string, DailyRow[]>();
  for (const r of (data ?? []) as DailyRow[]) {
    const key = toLangNeutralPath(r.page_path);
    if (!byPath.has(key)) byPath.set(key, []);
    byPath.get(key)!.push(r);
  }

  const day = 24 * 60 * 60 * 1000;
  const out = new Map<string, PageEffect>();
  for (const e of entries) {
    const key = toLangNeutralPath(e.path);
    const rows = byPath.get(key) ?? [];
    const at = new Date(e.at).getTime();
    const before = rows.filter(r => {
      const t = new Date(r.date).getTime();
      return t < at && t >= at - window * day;
    });
    const after = rows.filter(r => {
      const t = new Date(r.date).getTime();
      return t >= at && t < at + window * day;
    });
    out.set(`${key}|${e.at}`, {
      before: aggregate(before),
      after: aggregate(after),
      maturity: aggregate(after).days,
    });
  }
  return out;
}
