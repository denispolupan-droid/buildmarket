import { NextResponse, type NextRequest } from 'next/server';
import { revalidateTag, revalidatePath } from 'next/cache';
import { requireStaff } from '../../../../../lib/auth-guard';
import { saveCategoryContent, CATEGORY_CONTENT_TAG, type CategoryContentInput } from '../../../../../lib/category-content';
import { buildGenContext, validateContent } from '../../../../../lib/category-content-gen';
import { logSeoAction } from '../../../../../lib/seo-actions';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Збереження контенту категорії з редактора /admin/seo/categories/<slug>.
 * Після запису скидається кеш контенту (тег) і сторінки категорії обома
 * мовами — інакше ISR показував би старий текст до години. Попередження
 * стандарту (validateContent) повертаються, але не блокують: рішення, що
 * саме довести до норми, — за власником.
 */
export async function PUT(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const auth = await requireStaff('admin');
  if (!auth.ok) return auth.response;
  const { slug } = await params;
  const body = await req.json().catch(() => null) as { lang?: string; content?: CategoryContentInput; source?: 'manual' | 'ai'; query?: string } | null;
  const lang = body?.lang === 'ru' ? 'ru' : body?.lang === 'uk' ? 'uk' : null;
  if (!lang || !body?.content || typeof body.content.description !== 'string') {
    return NextResponse.json({ error: 'lang і content обов’язкові' }, { status: 400 });
  }
  const content = body.content;
  if (!content.description.trim()) return NextResponse.json({ error: 'description порожній' }, { status: 400 });

  const ctx = await buildGenContext(slug);
  const warnings = validateContent(content, ctx, lang);
  await saveCategoryContent(slug, lang, content, { source: body.source === 'ai' ? 'ai' : 'manual', user: auth.user.email ?? null });

  revalidateTag(CATEGORY_CONTENT_TAG, 'max');
  revalidatePath(`/shop/${slug}`);
  revalidatePath(`/ru/shop/${slug}`);
  await logSeoAction({
    page: `/shop/${slug}`,
    action: 'category_content',
    query: body.query ?? null,
    meta: { lang, source: body.source ?? 'manual', words: JSON.stringify(content).split(/\s+/).length, warnings: warnings.length },
    by: auth.user.email ?? null,
  });
  return NextResponse.json({ ok: true, warnings });
}
