import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseAdmin } from '../../../../lib/supabase-server';
import { rateLimit, getClientIp } from '../../../../lib/rate-limit';
import { cartSkus, normalizeCartItems, type CatalogRow } from '../../../../lib/abandoned-cart-save';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(req: NextRequest) {
  if (!rateLimit(`cartsave:${getClientIp(req)}`, 30, 60 * 60 * 1000)) {
    return NextResponse.json({ ok: false }, { status: 429 });
  }

  const { email, items } = await req.json().catch(() => ({})) as { email?: unknown; items?: unknown };

  // Адреса має бути ДОПИСАНА, а не просто містити «@». Перевірка на includes('@')
  // ловила кожну паузу під час набору: «byx_osvita@», «zaiatsv0403@gmail» і
  // «zaiatsv0403@gmail.» осідали в базі окремими рядками, і нагадувач потім
  // довбився в них щопівгодини. Гірше — обрізок реальної адреси
  // (pencova.olga.iv@gmail.com) виглядає валідним і отримав три листи.
  const emailStr = String(email ?? '').trim();
  if (!EMAIL_RE.test(emailStr) || emailStr.length > 254) {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  // Позиції — лише з реального каталогу: назва/бренд/фасування з бази, невідомі
  // SKU відхиляємо, сума рахується тут, а не береться з тіла запиту. Ці рядки
  // йдуть у лист від нашого імені й назад у кошик, тож клієнтському тексту
  // в них не місце (див. lib/abandoned-cart-save).
  const skus = cartSkus(items);
  if (!skus.length) return NextResponse.json({ ok: false }, { status: 400 });

  const admin = createSupabaseAdmin();
  const { data: rows } = await admin
    .from('products')
    .select('sku, name, name_ru, brand, volume')
    .in('sku', skus)
    .limit(skus.length);
  const catalog = new Map<string, CatalogRow>((rows ?? []).map(r => [r.sku as string, r as CatalogRow]));

  const normalized = normalizeCartItems(items, catalog);
  if (!normalized.ok) return NextResponse.json({ ok: false }, { status: 400 });

  const { data: existing } = await admin
    .from('abandoned_carts')
    .select('id')
    .eq('email', emailStr)
    .is('recovered_at', null)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existing) {
    await admin
      .from('abandoned_carts')
      .update({ items: normalized.items, total_price: normalized.total, last_seen_at: new Date().toISOString() })
      .eq('id', existing.id);
  } else {
    await admin
      .from('abandoned_carts')
      .insert({ email: emailStr, items: normalized.items, total_price: normalized.total });
  }

  return NextResponse.json({ ok: true });
}
