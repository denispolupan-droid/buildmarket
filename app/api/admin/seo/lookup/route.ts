import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { requireStaff } from '../../../../../lib/auth-guard';
import { computeProductGaps, hasAnyGap, type SeoStateRow } from '../../../../../lib/seo/product-gaps';

export const runtime = 'nodejs';

const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

/**
 * Довідка по конкретних SKU для панелі дожиму: назва, слаг і чи заповнена
 * картка. Раніше форма шукала товар у масиві всіх 773 товарів, який сторінка
 * тягнула наперед; тепер вкладка «Запити» не вантажить каталог узагалі.
 *
 * GET /api/admin/seo/lookup?skus=1001-002,1001-003
 */
export async function GET(req: NextRequest) {
  const auth = await requireStaff('admin');
  if (!auth.ok) return auth.response;

  const skus = (req.nextUrl.searchParams.get('skus') ?? '')
    .split(/[,;\s]+/).map(s => s.trim()).filter(Boolean).slice(0, 50);
  if (!skus.length) return NextResponse.json({ found: [], unknown: [] });

  const { data, error } = await db.from('product_seo_state').select('*').in('sku', skus);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const rows = (data ?? []) as SeoStateRow[];
  // Пробіли рахуємо тим самим кодом, що й черга, але без характеристик: тут
  // важливо лише «картка вже повна → дожим її перезапише».
  const gaps = computeProductGaps({ products: rows, chars: [], dict: [], categoryChars: [] });
  const filledBySku = new Map(gaps.map(g => [g.sku, !hasAnyGap(g)]));

  const found = rows.map(r => ({
    sku: r.sku,
    slug: r.slug,
    name: r.name,
    brand: r.brand,
    filled: filledBySku.get(r.sku) ?? false,
  }));
  const foundSet = new Set(found.map(f => f.sku));

  return NextResponse.json({ found, unknown: skus.filter(s => !foundSet.has(s)) });
}
