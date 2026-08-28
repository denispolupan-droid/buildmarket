import { NextResponse, type NextRequest } from 'next/server';
import { requireStaff } from '../../../../../../lib/auth-guard';
import { getCategoryContentRows, rowToMeta } from '../../../../../../lib/category-content';
import { buildGenContext, generateCategoryContent } from '../../../../../../lib/category-content-gen';
import { CostSink } from '../../../../../../lib/ai-cost';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/**
 * «Згенерувати за стандартом» — повертає контент у редактор, НЕ зберігає:
 * власник вичитує і тисне «Зберегти» сам. Один виклик = одна мова; для ru
 * українська версія (якщо є) іде моделі джерелом фактів.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const auth = await requireStaff('admin');
  if (!auth.ok) return auth.response;
  const { slug } = await params;
  const body = await req.json().catch(() => ({})) as { lang?: string; hint?: string; useCurrent?: boolean };
  const lang = body.lang === 'ru' ? 'ru' : 'uk';

  try {
    const [ctx, rows] = await Promise.all([buildGenContext(slug), getCategoryContentRows(slug)]);
    const cost = new CostSink();
    const t0 = Date.now();
    const result = await generateCategoryContent(ctx, lang, {
      current: body.useCurrent && rows[lang] ? rowToMeta(rows[lang]!) : null,
      basisUk: lang === 'ru' && rows.uk ? rowToMeta(rows.uk) : null,
      hint: body.hint,
      cost,
    });
    return NextResponse.json({ ...result, costUsd: cost.usd, seconds: Math.round((Date.now() - t0) / 1000), context: { products: ctx.products.length, queries: ctx.queries.length, posts: ctx.posts.length } });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
