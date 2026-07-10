import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { rateLimit, getClientIp } from '../../../../lib/rate-limit';

const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } },
);

export async function POST(req: NextRequest) {
  const ip = getClientIp(req);
  if (!rateLimit(`promo:${ip}`, 20, 5 * 60 * 1000))
    return NextResponse.json({ error: 'Занадто багато спроб. Спробуйте пізніше.' }, { status: 429 });

  const body = await req.json();
  const code = String(body.code ?? '').trim().toUpperCase();
  const cartTotal = Number(body.cartTotal);
  if (!code || !cartTotal || cartTotal <= 0)
    return NextResponse.json({ error: 'Невірні дані' }, { status: 400 });

  const { data: promo } = await db
    .from('promo_codes')
    .select('*')
    .eq('code', code)
    .eq('is_active', true)
    .maybeSingle();

  if (!promo)
    return NextResponse.json({ error: 'Промокод не знайдено або неактивний' }, { status: 404 });

  const now = new Date();
  if (promo.valid_from && new Date(promo.valid_from) > now)
    return NextResponse.json({ error: 'Промокод ще не діє' }, { status: 400 });
  if (promo.valid_until && new Date(promo.valid_until) < now)
    return NextResponse.json({ error: 'Термін дії промокоду закінчився' }, { status: 400 });
  if (promo.max_uses !== null && promo.uses_count >= promo.max_uses)
    return NextResponse.json({ error: 'Промокод вичерпано' }, { status: 400 });
  if (promo.min_order_amount && cartTotal < promo.min_order_amount)
    return NextResponse.json({
      error: `Мінімальна сума замовлення для цього промокоду — ${promo.min_order_amount} ₴`,
    }, { status: 400 });

  let discountAmount = promo.discount_type === 'percent'
    ? Math.round(cartTotal * promo.discount_value / 100 * 100) / 100
    : Math.min(Number(promo.discount_value), cartTotal);

  // Cap percent discounts if max_discount_amount is set
  if (promo.max_discount_amount && discountAmount > promo.max_discount_amount)
    discountAmount = promo.max_discount_amount;

  return NextResponse.json({
    code:          promo.code,
    discountType:  promo.discount_type,
    discountValue: promo.discount_value,
    discountAmount,
    finalTotal:    Math.max(0, cartTotal - discountAmount),
  });
}
