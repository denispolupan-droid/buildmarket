import { NextRequest, NextResponse } from 'next/server';
import { revalidateTag } from 'next/cache';
import { createClient } from '@supabase/supabase-js';
import { requireStaff } from '../../../../../lib/auth-guard';
import { buildCovers } from '../../../../../lib/blog-cover';

export const runtime = 'nodejs';
export const maxDuration = 60;

const serviceClient = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

/**
 * POST { id } — перемалювати обкладинку статті.
 * Заголовок у картинку вшитий, тож після зміни назви (напр. при дожимі під
 * запит) стара обкладинка розходиться зі статтею.
 */
export async function POST(req: NextRequest) {
  const auth = await requireStaff('admin');
  if (!auth.ok) return auth.response;

  const { id } = await req.json() as { id?: number };
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

  const { data: post, error } = await serviceClient
    .from('blog_posts')
    .select('id, slug, title, title_ru, category, category_ru')
    .eq('id', id)
    .single();
  if (error || !post) return NextResponse.json({ error: error?.message ?? 'Статтю не знайдено' }, { status: 404 });

  const covers = await buildCovers(post);
  if (!covers.image) {
    return NextResponse.json({ error: 'Не вдалося намалювати обкладинку' }, { status: 500 });
  }

  const { error: upErr } = await serviceClient
    .from('blog_posts')
    .update({ ...covers, updated_at: new Date().toISOString() })
    .eq('id', id);
  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 });

  revalidateTag('blog', 'max');
  return NextResponse.json({ ok: true, ...covers });
}
