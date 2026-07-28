import { NextResponse } from 'next/server';
import { requireStaff } from '../../../../../lib/auth-guard';
import { recentSeoActions, type SeoActionKind } from '../../../../../lib/seo-actions';

export const runtime = 'nodejs';

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

/** GET — що вже робили з кожною сторінкою (для позначок у таблиці запитів). */
export async function GET() {
  const auth = await requireStaff('admin');
  if (!auth.ok) return auth.response;

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
