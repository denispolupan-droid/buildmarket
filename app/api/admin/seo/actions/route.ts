import { NextRequest, NextResponse } from 'next/server';
import { requireStaff } from '../../../../../lib/auth-guard';
import { recentSeoActions, type SeoActionKind, type SeoActionRow } from '../../../../../lib/seo-actions';
import { pageEffects, toLangNeutralPath } from '../../../../../lib/seo/history';

export const runtime = 'nodejs';
export const maxDuration = 60;

type PageSummary = {
  page_path: string;
  last_at: string;
  total: number;
  kinds: SeoActionKind[];
  /** останній цільовий запит, під який дожимали */
  query: string | null;
  /** скільки товарів у блоці статті за останньою дією */
  products: number | null;
};

/**
 * GET                    — зведення по сторінках (позначки «що робили» в таблицях)
 * GET ?view=log&limit=N  — журнал дій із заміряним ефектом до/після за gsc_daily
 */
export async function GET(req: NextRequest) {
  const auth = await requireStaff('admin');
  if (!auth.ok) return auth.response;

  if (req.nextUrl.searchParams.get('view') === 'log') return logView(req);

  const rows = await recentSeoActions(800);
  const byPage = new Map<string, PageSummary>();

  // rows уже відсортовані від найновіших — перша зустріч і є остання дія
  for (const r of rows) {
    const cur = byPage.get(r.page_path);
    if (!cur) {
      byPage.set(r.page_path, {
        page_path: r.page_path,
        last_at: r.created_at,
        total: 1,
        kinds: [r.action],
        query: r.query,
        products: r.action === 'article_products' ? Number(r.meta?.count ?? 0) : null,
      });
      continue;
    }
    cur.total++;
    if (!cur.kinds.includes(r.action)) cur.kinds.push(r.action);
    if (!cur.query && r.query) cur.query = r.query;
    if (cur.products == null && r.action === 'article_products') {
      cur.products = Number(r.meta?.count ?? 0);
    }
  }

  return NextResponse.json([...byPage.values()]);
}

/**
 * Журнал із відповіддю на головне питання розділу — чи спрацювало.
 * Ефект рахуємо ретроспективно з історії gsc_daily: 28 днів до дати дії проти
 * 28 після. Тому окремі знімки «до/після» в момент дії не потрібні, і навіть
 * старі записи журналу отримують замір, щойно історія добрана.
 */
async function logView(req: NextRequest) {
  const limit = Math.min(Number(req.nextUrl.searchParams.get('limit') ?? 200), 800);
  const rows: SeoActionRow[] = await recentSeoActions(limit);

  const effects = await pageEffects(rows.map(r => ({ path: r.page_path, at: r.created_at })));

  const out = rows.map(r => {
    const key = `${toLangNeutralPath(r.page_path)}|${r.created_at}`;
    const eff = effects.get(key);
    return {
      page_path: r.page_path,
      action: r.action,
      query: r.query,
      created_at: r.created_at,
      created_by: r.created_by ?? null,
      cost_usd: r.cost_usd ?? null,
      meta: r.meta,
      effect: eff ?? null,
    };
  });

  const measured = out.filter(r => r.effect && r.effect.maturity >= 7);
  const improved = measured.filter(r => {
    const b = r.effect!.before.position;
    const a = r.effect!.after.position;
    return b != null && a != null && a < b - 0.5;
  }).length;

  return NextResponse.json({
    rows: out,
    summary: {
      total: out.length,
      measured: measured.length,
      improved,
      clicksBefore: measured.reduce((s, r) => s + r.effect!.before.clicks, 0),
      clicksAfter: measured.reduce((s, r) => s + r.effect!.after.clicks, 0),
      cost: out.reduce((s, r) => s + Number(r.cost_usd ?? 0), 0),
    },
  });
}
