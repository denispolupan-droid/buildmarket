import { NextRequest, NextResponse } from 'next/server';
import { revalidateTag } from 'next/cache';
import { createClient } from '@supabase/supabase-js';
import { requireStaff } from '../../../../../lib/auth-guard';
import { boostBlogPost } from '../../../../../lib/blog-generator';
import { logSeoAction } from '../../../../../lib/seo-actions';

export const runtime = 'nodejs';
export const maxDuration = 300;

const serviceClient = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

// Слова запиту, за якими шукаємо наявну статтю. Короткі («як», «для», «на»)
// відкидаємо — вони дають випадкові збіги.
const STOP = new Set(['для', 'как', 'як', 'что', 'що', 'чем', 'чим', 'the', 'and', 'или', 'або']);
function keyWords(query: string): string[] {
  return query.toLowerCase().split(/[^\p{L}\p{N}]+/u)
    .filter(w => w.length >= 4 && !STOP.has(w))
    .slice(0, 5);
}

/**
 * GET ?query=… — чи вже є стаття під цей запит.
 * Потрібно ДО генерації нової: дві сторінки під один запит канібалізують одна одну,
 * тому наявну статтю треба дожимати, а не дублювати.
 */
export async function GET(req: NextRequest) {
  const auth = await requireStaff('admin');
  if (!auth.ok) return auth.response;

  const query = req.nextUrl.searchParams.get('query')?.trim() ?? '';
  if (!query) return NextResponse.json({ error: 'query required' }, { status: 400 });

  const words = keyWords(query);
  if (!words.length) return NextResponse.json([]);

  const { data, error } = await serviceClient
    .from('blog_posts')
    .select('id, slug, title, title_ru, is_published, content_html, content_html_ru, updated_at')
    .order('updated_at', { ascending: false })
    .limit(200);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Скільки ключових слів запиту трапляється в заголовку/тілі — груба, але
  // достатня релевантність: нам треба лише зрозуміти «стаття вже є / немає».
  const scored = (data ?? []).map(p => {
    const hay = `${p.title} ${p.title_ru ?? ''} ${p.content_html} ${p.content_html_ru ?? ''}`.toLowerCase();
    const hits = words.filter(w => hay.includes(w)).length;
    return {
      id: p.id, slug: p.slug, title: p.title, is_published: p.is_published,
      hits, of: words.length,
      len: p.content_html.length,
      len_ru: (p.content_html_ru ?? '').length,
      // чи є в тексті сама фраза запиту (найчастіша причина слабкої позиції)
      has_phrase: hay.includes(query.toLowerCase()),
      product_links: (p.content_html.match(/\/product\//g) ?? []).length,
    };
  })
    .filter(p => p.hits >= Math.max(2, Math.ceil(words.length * 0.6)))
    .sort((a, b) => b.hits - a.hits || b.len - a.len)
    .slice(0, 3);

  return NextResponse.json(scored);
}

/** POST { postId, focusQuery, skus? } — дожати наявну статтю під запит. */
export async function POST(req: NextRequest) {
  const auth = await requireStaff('admin');
  if (!auth.ok) return auth.response;

  const { postId, focusQuery, skus } = await req.json() as {
    postId?: number; focusQuery?: string; skus?: string[];
  };
  if (!postId) return NextResponse.json({ error: 'postId required' }, { status: 400 });
  if (!focusQuery?.trim()) return NextResponse.json({ error: 'Вкажіть пошуковий запит' }, { status: 400 });

  try {
    const res = await boostBlogPost(postId, {
      focusQuery: focusQuery.trim(),
      skus: (skus ?? []).filter(s => typeof s === 'string' && s.length > 0),
    });
    revalidateTag('blog', 'max');
    await logSeoAction({
      page: `/blog/${res.slug}`,
      action: 'article_boost',
      query: focusQuery,
      meta: { lenBefore: res.lenBefore, lenAfter: res.lenAfter, faq: res.faqCount, skus: res.linkedSkus },
      by: auth.user.email ?? null,
    });
    return NextResponse.json(res);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
