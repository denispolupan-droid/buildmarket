import { NextRequest, NextResponse } from 'next/server';
import { requireStaff } from '../../../../../lib/auth-guard';
import { getQueries } from '../../../../../lib/gsc';
import { toLangNeutralPath } from '../../../../../lib/seo/history';

export const runtime = 'nodejs';
export const maxDuration = 60;

/**
 * Канібалізація за фактом видачі: один запит — кілька наших сторінок.
 *
 * Перевірка в /api/admin/blog/boost шукає дублі перебором слів у тілі статей.
 * Це здогад; GSC знає напевно — якщо за одним запитом Google показує два наші
 * URL, вони вже ділять між собою сигнали. Мовні версії (/x і /ru/x) — не
 * канібалізація, вони склеюються за hreflang, тому зводимо їх в один шлях.
 */

/** Пороги проти шуму: випадковий показ другої сторінки — ще не конкуренція. */
const MIN_TOTAL_IMPRESSIONS = 5;
const MIN_PAGE_IMPRESSIONS = 2;

export async function GET(req: NextRequest) {
  const auth = await requireStaff('admin');
  if (!auth.ok) return auth.response;

  const days = Math.min(Math.max(Number(req.nextUrl.searchParams.get('days') ?? 28), 1), 480);

  try {
    const rows = await getQueries({ days });

    type Agg = { impressions: number; clicks: number; position: number };
    const byQuery = new Map<string, Map<string, Agg>>();

    for (const r of rows) {
      const path = toLangNeutralPath(r.page);
      if (!byQuery.has(r.query)) byQuery.set(r.query, new Map());
      const pages = byQuery.get(r.query)!;
      const cur = pages.get(path);
      if (!cur) {
        pages.set(path, { impressions: r.impressions, clicks: r.clicks, position: r.position });
        continue;
      }
      // позиція при злитті мов — середня, зважена на покази
      const imp = cur.impressions + r.impressions;
      cur.position = imp ? (cur.position * cur.impressions + r.position * r.impressions) / imp : cur.position;
      cur.impressions = imp;
      cur.clicks += r.clicks;
    }

    const conflicts = [...byQuery.entries()]
      .map(([query, pages]) => {
        const list = [...pages.entries()]
          .filter(([, a]) => a.impressions >= MIN_PAGE_IMPRESSIONS)
          .map(([path, a]) => ({ path, ...a, position: Math.round(a.position * 10) / 10 }))
          .sort((a, b) => b.impressions - a.impressions);
        const impressions = list.reduce((s, p) => s + p.impressions, 0);
        return { query, impressions, pages: list };
      })
      .filter(c => c.pages.length >= 2 && c.impressions >= MIN_TOTAL_IMPRESSIONS)
      .sort((a, b) => b.impressions - a.impressions);

    return NextResponse.json({ days, conflicts });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
