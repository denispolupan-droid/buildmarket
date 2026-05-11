import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const service = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

export async function GET(req: NextRequest) {
  const sku = req.nextUrl.searchParams.get('sku');
  if (!sku) return NextResponse.json({ error: 'sku required' }, { status: 400 });

  const { data, error } = await service
    .from('product_reviews')
    .select('id, author_name, rating, review_text, created_at')
    .eq('product_sku', sku)
    .eq('is_approved', true)
    .order('created_at', { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { sku, author_name, rating, review_text } = body;

  if (!sku || !author_name?.trim() || !rating) {
    return NextResponse.json({ error: 'Заповніть всі обов\'язкові поля' }, { status: 400 });
  }
  if (rating < 1 || rating > 5) {
    return NextResponse.json({ error: 'Оцінка від 1 до 5' }, { status: 400 });
  }
  if (author_name.trim().length > 80) {
    return NextResponse.json({ error: 'Ім\'я занадто довге' }, { status: 400 });
  }
  if (review_text && review_text.length > 2000) {
    return NextResponse.json({ error: 'Текст занадто довгий' }, { status: 400 });
  }

  const { error } = await service.from('product_reviews').insert({
    product_sku: sku,
    author_name: author_name.trim(),
    rating,
    review_text: review_text?.trim() || null,
    is_approved: false,
  });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
