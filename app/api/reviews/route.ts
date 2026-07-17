import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { rateLimit, getClientIp } from '../../../lib/rate-limit';

const service = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

export async function GET(req: NextRequest) {
  const sku = req.nextUrl.searchParams.get('sku');
  if (!sku) return NextResponse.json({ error: 'sku required' }, { status: 400 });

  const { data, error } = await service
    .from('product_reviews')
    .select('id, author_name, rating, review_text, created_at, is_verified')
    .eq('product_sku', sku)
    .eq('is_approved', true)
    .order('created_at', { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}

export async function POST(req: NextRequest) {
  // Rate limit: 5 reviews per IP per hour
  const ip = getClientIp(req);
  if (!rateLimit(`reviews:${ip}`, 5, 60 * 60 * 1000)) {
    return NextResponse.json({ error: 'Занадто багато запитів. Спробуйте пізніше.' }, { status: 429 });
  }

  const body = await req.json();
  const { sku, author_name, rating, review_text, review_token } = body;

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

  // Токен з листа після доставки → відгук позначається як підтверджена покупка
  let orderId: string | null = null;
  let isVerified = false;
  if (review_token) {
    const { data: order } = await service
      .from('orders')
      .select('id, items')
      .eq('review_token', review_token)
      .single();
    if (!order) {
      return NextResponse.json({ error: 'Посилання недійсне' }, { status: 400 });
    }
    const items = (order.items ?? []) as { sku: string }[];
    if (!items.some(i => i.sku === sku)) {
      return NextResponse.json({ error: 'Товар не з цього замовлення' }, { status: 400 });
    }
    const { data: dup } = await service
      .from('product_reviews')
      .select('id')
      .eq('order_id', order.id)
      .eq('product_sku', sku)
      .maybeSingle();
    if (dup) {
      return NextResponse.json({ error: 'Відгук на цей товар уже залишено' }, { status: 400 });
    }
    orderId = order.id;
    isVerified = true;
  }

  const { error } = await service.from('product_reviews').insert({
    product_sku: sku,
    author_name: author_name.trim(),
    rating,
    review_text: review_text?.trim() || null,
    is_approved: false,
    is_verified: isVerified,
    order_id: orderId,
  });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
