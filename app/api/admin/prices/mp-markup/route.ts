import { NextRequest, NextResponse } from 'next/server';
import { requireStaff } from '../../../../../lib/auth-guard';
import { createServiceClient } from '../../../../../lib/supabase';
import { applyMpMarkups, normalizeMpItems } from '../../../../../lib/mp-reprice';

// Переоцінка маркетплейсів з розділу «Ціни»: пише товарні націнки
// products.rozetka_markup_pct / prom_markup_pct пакетом. Самі ціни фіди
// рахують від цих націнок (lib/marketplace-pricing), тож тут більше нічого
// не змінюється; журнал і відкат — /api/admin/prices/log.
//
// PATCH { items: [{ sku, rozetka_markup_pct?: number|null, prom_markup_pct?: number|null }] }
export async function PATCH(req: NextRequest) {
  const auth = await requireStaff('admin', 'manager');
  if (!auth.ok) return auth.response;

  const body = await req.json().catch(() => null);
  const { items, errors } = normalizeMpItems(body?.items);
  if (errors.length) return NextResponse.json({ error: 'Некоректні дані: ' + errors.slice(0, 5).join('; ') }, { status: 400 });
  if (!items.length) return NextResponse.json({ error: 'Порожній пакет' }, { status: 400 });

  const db = createServiceClient();
  const errs = await applyMpMarkups(db, items);
  if (errs.length) return NextResponse.json({ error: errs.slice(0, 5).join('; '), updated: items.length - errs.length }, { status: 500 });

  // Кеш сайту (тег products) не чіпаємо: націнки МП у вітрину не потрапляють.
  // Фід Rozetka живе на CDN до 5 хв, Prom читає без кешу.
  return NextResponse.json({ ok: true, updated: items.length });
}
