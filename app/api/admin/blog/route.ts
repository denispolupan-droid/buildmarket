import { NextRequest, NextResponse } from 'next/server';
import { revalidateTag } from 'next/cache';
import { createClient } from '@supabase/supabase-js';
import { checkAdmin } from '../../../../lib/check-admin';
import { generateBlogPost, sanitizeArticleHtml } from '../../../../lib/blog-generator';

export const runtime = 'nodejs';
export const maxDuration = 300;

const serviceClient = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

function bustBlogCache() {
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore
  revalidateTag('blog', 'max');
}

export async function GET(req: NextRequest) {
  if (!await checkAdmin()) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const id = req.nextUrl.searchParams.get('id');
  if (id) {
    const { data, error } = await serviceClient.from('blog_posts').select('*').eq('id', Number(id)).single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data);
  }
  const { data, error } = await serviceClient
    .from('blog_posts')
    .select('id, slug, title, description, category, is_published, published_at, created_at, read_time')
    .order('created_at', { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}

// Генерація нової статті (чернетка) — єдине місце витрат API, тільки по кнопці
export async function POST(req: NextRequest) {
  if (!await checkAdmin()) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const { topic, focusQuery, mustLink } = await req.json() as {
    topic?: string;
    focusQuery?: string;
    mustLink?: { href: string; label: string };
  };
  if (!topic?.trim()) return NextResponse.json({ error: 'Вкажіть тему статті' }, { status: 400 });
  try {
    const post = await generateBlogPost(topic.trim(), {
      focusQuery: focusQuery?.trim() || undefined,
      mustLink: mustLink?.href?.startsWith('/') ? mustLink : undefined,
    });
    return NextResponse.json(post);
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  if (!await checkAdmin()) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const body = await req.json() as {
    id: number;
    is_published?: boolean;
    title?: string; title_ru?: string;
    description?: string; description_ru?: string;
    content_html?: string; content_html_ru?: string;
  };
  if (!body.id) return NextResponse.json({ error: 'id required' }, { status: 400 });

  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
  for (const k of ['title', 'title_ru', 'description', 'description_ru'] as const) {
    if (body[k] !== undefined) update[k] = body[k];
  }
  if (body.content_html !== undefined) update.content_html = sanitizeArticleHtml(body.content_html);
  if (body.content_html_ru !== undefined) update.content_html_ru = sanitizeArticleHtml(body.content_html_ru);
  if (body.is_published !== undefined) {
    update.is_published = body.is_published;
    if (body.is_published) {
      const { data: cur } = await serviceClient.from('blog_posts').select('published_at').eq('id', body.id).single();
      if (!cur?.published_at) update.published_at = new Date().toISOString();
    }
  }

  const { error } = await serviceClient.from('blog_posts').update(update).eq('id', body.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  bustBlogCache();
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  if (!await checkAdmin()) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const id = Number(req.nextUrl.searchParams.get('id'));
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });
  const { error } = await serviceClient.from('blog_posts').delete().eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  bustBlogCache();
  return NextResponse.json({ ok: true });
}
