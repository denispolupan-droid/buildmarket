import { NextRequest, NextResponse } from 'next/server';
import { requireStaff } from '../../../../../lib/auth-guard';
import { getPages } from '../../../../../lib/gsc';
import sitemap from '../../../../sitemap';

export const runtime = 'nodejs';
export const maxDuration = 60;

/**
 * Звірка sitemap проти фактичних показів.
 *
 * Сторінка, яку ми самі подаємо в sitemap, але яка за 90 днів не отримала
 * жодного показу, — з високою ймовірністю не в індексі (або в індексі, але
 * нікому не показується). Це не заміна URL Inspection API, але не потребує
 * квоти й ловить головний клас проблем: цілі гілки каталогу, яких Google не
 * бачить.
 *
 * Зворотний бік теж корисний: сторінка з показами, якої НЕМАЄ в sitemap, —
 * або забутий тип сторінок, або параметричний URL, що заповз в індекс.
 */

const norm = (u: string) => u.replace(/^https?:\/\/[^/]+/i, '').replace(/[?#].*$/, '').replace(/\/+$/, '') || '/';

export async function GET(req: NextRequest) {
  const auth = await requireStaff('admin');
  if (!auth.ok) return auth.response;

  const days = Math.min(Math.max(Number(req.nextUrl.searchParams.get('days') ?? 90), 7), 480);

  try {
    const [routes, pages] = await Promise.all([getSitemapPaths(), getPages({ days })]);

    const seen = new Map<string, number>();
    for (const p of pages) {
      const path = norm(p.page);
      seen.set(path, (seen.get(path) ?? 0) + p.impressions);
    }

    const silent = routes.filter(r => !seen.has(r));
    const extra = [...seen.entries()]
      .filter(([path]) => !routes.includes(path))
      .map(([path, impressions]) => ({ path, impressions }))
      .sort((a, b) => b.impressions - a.impressions);

    return NextResponse.json({
      days,
      sitemapCount: routes.length,
      withImpressions: routes.length - silent.length,
      silent: silent.slice(0, 500),
      silentTotal: silent.length,
      extra: extra.slice(0, 200),
      extraTotal: extra.length,
    });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}

async function getSitemapPaths(): Promise<string[]> {
  const entries = await sitemap();
  return [...new Set(entries.map(e => norm(String(e.url))))];
}
