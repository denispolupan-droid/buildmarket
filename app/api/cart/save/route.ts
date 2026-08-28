import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseAdmin } from '../../../../lib/supabase-server';
import { rateLimit, getClientIp } from '../../../../lib/rate-limit';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(req: NextRequest) {
  if (!rateLimit(`cartsave:${getClientIp(req)}`, 30, 60 * 60 * 1000)) {
    return NextResponse.json({ ok: false }, { status: 429 });
  }

  const { email, items, totalPrice } = await req.json();

  // Адреса має бути ДОПИСАНА, а не просто містити «@». Перевірка на includes('@')
  // ловила кожну паузу під час набору: «byx_osvita@», «zaiatsv0403@gmail» і
  // «zaiatsv0403@gmail.» осідали в базі окремими рядками, і нагадувач потім
  // довбився в них щопівгодини. Гірше — обрізок реальної адреси
  // (pencova.olga.iv@gmail.com) виглядає валідним і отримав три листи.
  if (!EMAIL_RE.test(String(email ?? '').trim()) || !Array.isArray(items) || items.length === 0) {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  const admin = createSupabaseAdmin();

  const { data: existing } = await admin
    .from('abandoned_carts')
    .select('id')
    .eq('email', email)
    .is('recovered_at', null)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existing) {
    await admin
      .from('abandoned_carts')
      .update({ items, total_price: totalPrice, last_seen_at: new Date().toISOString() })
      .eq('id', existing.id);
  } else {
    await admin
      .from('abandoned_carts')
      .insert({ email, items, total_price: totalPrice });
  }

  return NextResponse.json({ ok: true });
}
