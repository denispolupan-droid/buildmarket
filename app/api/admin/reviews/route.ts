import { NextRequest, NextResponse } from 'next/server';
import { revalidateTag } from 'next/cache';
import { createSupabaseServer } from '../../../../lib/supabase-server';
import { createClient } from '@supabase/supabase-js';

const service = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

async function checkAdmin() {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  return user && user.user_metadata?.role === 'admin';
}

export async function GET(req: NextRequest) {
  if (!await checkAdmin()) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const status = req.nextUrl.searchParams.get('status'); // 'pending' | 'approved' | 'all'

  let query = service
    .from('product_reviews')
    .select('id, product_sku, author_name, rating, review_text, is_approved, created_at')
    .order('created_at', { ascending: false });

  if (status === 'pending') query = query.eq('is_approved', false);
  if (status === 'approved') query = query.eq('is_approved', true);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}

export async function PATCH(req: NextRequest) {
  if (!await checkAdmin()) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { id, is_approved } = await req.json();
  if (!id || is_approved === undefined) {
    return NextResponse.json({ error: 'id and is_approved required' }, { status: 400 });
  }

  const { error } = await service
    .from('product_reviews')
    .update({ is_approved })
    .eq('id', id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  revalidateTag('review-stats', 'max');
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  if (!await checkAdmin()) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const id = req.nextUrl.searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

  const { error } = await service.from('product_reviews').delete().eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  revalidateTag('review-stats', 'max');
  return NextResponse.json({ ok: true });
}
