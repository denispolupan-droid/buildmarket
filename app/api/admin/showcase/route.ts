import { NextRequest, NextResponse } from 'next/server';
import { revalidateTag } from 'next/cache';
import { requireStaff } from '../../../../lib/auth-guard';
import { createServiceClient } from '../../../../lib/supabase';
import {
  isShowcaseSurface, normalizeShowcaseSkus, isShowcaseVisible,
  SHOWCASE_LIMIT, SHOWCASE_SURFACES, type ShowcaseSurface,
} from '../../../../lib/showcase';

// Вітрина головної: набір і порядок товарів для роздрібу й опту.

type Item = {
  sku: string;
  name: string;
  brand: string | null;
  volume: string | null;
  image: string | null;
  price: number | null;
  stockStatus: string | null;
  isActive: boolean;
  /** Показується покупцю? Ні — лишається в адмінці з поміткою, чому. */
  visible: boolean;
  /** Понад ліміт показу: у списку є, на вітрині — ні. */
  overLimit: boolean;
};

async function loadSurface(surface: ShowcaseSurface): Promise<Item[]> {
  const db = createServiceClient();
  const { data: rows } = await db.from('showcase_items')
    .select('sku, position').eq('surface', surface).order('position');
  const skus = (rows ?? []).map(r => r.sku as string);
  if (!skus.length) return [];

  const { data: prods } = await db.from('products')
    .select('sku, name, brand, volume, image, is_active, product_stock(stock_status, price_retail)')
    .in('sku', skus);

  // product_stock — звʼязок «один до одного», PostgREST віддає ОБʼЄКТ, а не масив.
  // Через [0] тут завжди виходив би undefined, і кожна позиція вважалась би
  // недоступною.
  type Stock = { stock_status: string | null; price_retail: number | null };
  type Row = {
    sku: string; name: string; brand: string | null; volume: string | null;
    image: string | null; is_active: boolean | null;
    product_stock: Stock | Stock[] | null;
  };
  const bySku = new Map((prods ?? []).map(p => [(p as Row).sku, p as Row]));
  const oneStock = (v: Row['product_stock']): Stock | null =>
    Array.isArray(v) ? (v[0] ?? null) : (v ?? null);

  return skus.map((sku, i) => {
    const p = bySku.get(sku);
    const stock = oneStock(p?.product_stock ?? null);
    return {
      sku,
      name: p?.name ?? '— товар не знайдено —',
      brand: p?.brand ?? null,
      volume: p?.volume ?? null,
      image: p?.image ?? null,
      price: stock?.price_retail ?? null,
      stockStatus: stock?.stock_status ?? null,
      isActive: p?.is_active !== false,
      visible: !!p && isShowcaseVisible({ is_active: p.is_active, stock }),
      overLimit: i >= SHOWCASE_LIMIT,
    };
  });
}

export async function GET() {
  const gate = await requireStaff('admin', 'manager');
  if (!gate.ok) return gate.response;

  const [shop, catalog] = await Promise.all(SHOWCASE_SURFACES.map(loadSurface));
  return NextResponse.json({ shop, catalog, limit: SHOWCASE_LIMIT });
}

export async function PUT(req: NextRequest) {
  const gate = await requireStaff('admin');
  if (!gate.ok) return gate.response;

  const { surface, skus } = await req.json() as { surface?: unknown; skus?: unknown };
  if (!isShowcaseSurface(surface)) {
    return NextResponse.json({ error: 'surface має бути shop або catalog' }, { status: 400 });
  }
  const clean = normalizeShowcaseSkus(skus);

  const db = createServiceClient();

  // Приймаємо лише наявні товари: неіснуючий SKU однаково відсіється зовнішнім
  // ключем, але мовчазна відмова — гірше за зрозумілу помилку.
  if (clean.length) {
    const { data: found } = await db.from('products').select('sku').in('sku', clean);
    const ok = new Set((found ?? []).map(r => r.sku as string));
    const missing = clean.filter(s => !ok.has(s));
    if (missing.length) {
      return NextResponse.json({ error: `Немає таких товарів: ${missing.join(', ')}` }, { status: 400 });
    }
  }

  // Перезаписуємо набір цілком: порядок — це і є весь стан вітрини, і зшивати
  // його з двох операцій означало б лишити вітрину напівпорожньою при збої.
  const { error: delErr } = await db.from('showcase_items').delete().eq('surface', surface);
  if (delErr) return NextResponse.json({ error: delErr.message }, { status: 500 });

  if (clean.length) {
    const { error } = await db.from('showcase_items')
      .insert(clean.map((sku, i) => ({ surface, sku, position: i })));
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }

  revalidateTag('showcase', 'max');
  return NextResponse.json({ ok: true, count: clean.length, items: await loadSurface(surface) });
}
