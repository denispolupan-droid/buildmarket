import { NextRequest, NextResponse } from 'next/server';
import { requireStaff } from '../../../../../lib/auth-guard';
import { dateWindow, getPages, getQueries, type GscPageRow, type GscQueryRow } from '../../../../../lib/gsc';

export const runtime = 'nodejs';
export const maxDuration = 60;

// Дані Search Console для розділу SEO (читання, безкоштовно).
//   ?view=queries — запити (за замовчуванням), ?view=pages — зріз по сторінках
//   ?days=7|28|90, ?min/&max — діапазон позицій, ?compare=1 — плюс попередній період
//
// Повний звіт обходиться посторінково (див. lib/gsc.ts): раніше бралися лише
// перші 500 рядків, а Google сортує їх за кліками — тобто відрізало саме ті
// запити з показами й нулем кліків, заради яких розділ і існує.

type Prev = { clicks: number; impressions: number; position: number } | null;

const norm = (page: string) => page.replace(/^https?:\/\/[^/]+/i, '').replace(/[?#].*$/, '') || '/';

const queryKey = (query: string, path: string) => JSON.stringify([query, path]);

export async function GET(req: NextRequest) {
  const auth = await requireStaff('admin');
  if (!auth.ok) return auth.response;

  const sp = req.nextUrl.searchParams;
  const view = sp.get('view') === 'pages' ? 'pages' : 'queries';
  const days = Math.min(Math.max(Number(sp.get('days') ?? 28), 1), 480);
  const limit = Math.min(Number(sp.get('limit') ?? 200), 5000);
  const compare = sp.get('compare') === '1';

  try {
    if (view === 'pages') {
      const [cur, prev] = await Promise.all([
        getPages({ days }),
        compare ? getPages({ days, shiftPeriods: 1 }) : Promise.resolve([] as GscPageRow[]),
      ]);
      const prevBy = new Map(prev.map(p => [norm(p.page), p]));
      const rows = cur.slice(0, limit).map(p => ({
        ...p,
        path: norm(p.page),
        prev: toPrev(prevBy.get(norm(p.page))),
      }));
      return NextResponse.json({ window: dateWindow(days), total: cur.length, rows });
    }

    const minPosition = Number(sp.get('min') ?? 0);
    const maxPosition = Number(sp.get('max') ?? 1000);
    const [cur, prev] = await Promise.all([
      getQueries({ days, minPosition, maxPosition }),
      compare ? getQueries({ days, shiftPeriods: 1 }) : Promise.resolve([] as GscQueryRow[]),
    ]);
    const prevBy = new Map(prev.map(r => [queryKey(r.query, norm(r.page)), r]));
    const rows = cur.slice(0, limit).map(r => ({
      ...r,
      path: norm(r.page),
      prev: toPrev(prevBy.get(queryKey(r.query, norm(r.page)))),
    }));
    return NextResponse.json({ window: dateWindow(days), total: cur.length, rows });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}

function toPrev(row?: { clicks: number; impressions: number; position: number }): Prev {
  return row ? { clicks: row.clicks, impressions: row.impressions, position: row.position } : null;
}
