/**
 * Чисті правила «сторожа показників» (lib/metric-watch): пороги й класифікація
 * без БД і мережі — щоб покрити тестами і не тягнути сюди Supabase.
 */

export type WatchLevel = 'red' | 'yellow' | 'green' | 'info';

/**
 * Показник у момент перевірки. Повідомлення йде, коли змінився `state` (а для
 * наборів — склад `set`), а не щодня: Telegram має лишатися каналом, який читають.
 */
export type Reading = {
  state: string;
  level: WatchLevel;
  text: string;
  /** Набір (SKU тощо) — повідомляємо, що додалось і що зникло. */
  set?: string[];
  /** Підписи для елементів набору в повідомленні (SKU → назва); на порівняння не впливають. */
  labels?: Record<string, string>;
};

// ── Core Web Vitals (CrUX, p75 реальних відвідувачів) ───────────────────────
// Пороги Google: https://web.dev/articles/vitals — good ≤, poor >.
export const CWV_THRESHOLDS = {
  largest_contentful_paint: { good: 2500, poor: 4000, label: 'LCP', unit: 'мс' },
  interaction_to_next_paint: { good: 200, poor: 500, label: 'INP', unit: 'мс' },
  cumulative_layout_shift: { good: 0.1, poor: 0.25, label: 'CLS', unit: '' },
} as const;

export type CwvCategory = 'good' | 'needs_improvement' | 'poor';
const CWV_RANK: Record<CwvCategory, number> = { good: 0, needs_improvement: 1, poor: 2 };
export const CWV_HUMAN: Record<CwvCategory, string> = { good: 'добре', needs_improvement: 'потребує покращення', poor: 'погано' };

export function cwvCategory(metric: keyof typeof CWV_THRESHOLDS, p75: number): CwvCategory {
  const t = CWV_THRESHOLDS[metric];
  return p75 <= t.good ? 'good' : p75 <= t.poor ? 'needs_improvement' : 'poor';
}

/** Загальна оцінка — за найгіршою з трьох метрик, як у звіті Search Console. */
export function cwvOverall(p75: Partial<Record<keyof typeof CWV_THRESHOLDS, number>>): { overall: CwvCategory; parts: string[] } | null {
  const parts: string[] = [];
  let overall: CwvCategory | null = null;
  for (const k of Object.keys(CWV_THRESHOLDS) as (keyof typeof CWV_THRESHOLDS)[]) {
    const v = p75[k];
    if (v == null || !Number.isFinite(v)) continue;
    const c = cwvCategory(k, v);
    if (!overall || CWV_RANK[c] > CWV_RANK[overall]) overall = c;
    const t = CWV_THRESHOLDS[k];
    parts.push(`${t.label} ${k === 'cumulative_layout_shift' ? v.toFixed(2) : Math.round(v)}${t.unit ? ' ' + t.unit : ''} (${CWV_HUMAN[c]})`);
  }
  return overall ? { overall, parts } : null;
}

// ── Тренд: поточний тиждень проти середнього тижня за попередні 4 ───────────

/**
 * База — середній тиждень за 4 попередні, а не один попередній тиждень: так
 * один слабкий чи сильний тиждень не смикає стан туди-сюди щодня.
 * minBase — нижче цього обсягу відсотки нічого не значать, стан «мало даних».
 */
export function trendState(current: number, prev4Weeks: number, opts: { dropPct: number; growPct: number; minBase: number }): {
  state: 'low_data' | 'drop' | 'growth' | 'stable'; changePct: number; base: number;
} {
  const base = prev4Weeks / 4;
  if (base < opts.minBase && current < opts.minBase) return { state: 'low_data', changePct: 0, base };
  const changePct = base > 0 ? Math.round((current / base - 1) * 100) : 100;
  if (changePct <= -opts.dropPct) return { state: 'drop', changePct, base };
  if (changePct >= opts.growPct) return { state: 'growth', changePct, base };
  return { state: 'stable', changePct, base };
}

// ── Зміни ───────────────────────────────────────────────────────────────────

export type Previous = { state: string; set?: string[] };

export type Change = { added: string[]; removed: string[]; stateChanged: boolean };

/** Що змінилось відносно минулої перевірки; null — нічого (повідомлення не потрібне). */
export function diffReading(prev: Previous | undefined, cur: Reading): Change | null {
  if (!prev) return null; // перша перевірка — це база, про неї окреме повідомлення
  const before = new Set(prev.set ?? []);
  const after = new Set(cur.set ?? []);
  const added = [...after].filter(x => !before.has(x));
  const removed = [...before].filter(x => !after.has(x));
  const stateChanged = prev.state !== cur.state;
  if (!stateChanged && !added.length && !removed.length) return null;
  return { added, removed, stateChanged };
}
