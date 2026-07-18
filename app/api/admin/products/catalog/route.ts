import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServer } from '../../../../../lib/supabase-server';
import { createServiceClient } from '../../../../../lib/supabase';
import { escapeOrTerm } from '../../../../../lib/pg-filter';

const db = createServiceClient();

export async function GET(req: NextRequest) {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || user.app_metadata?.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const categorySlug = req.nextUrl.searchParams.get('category') ?? '';
  const q            = req.nextUrl.searchParams.get('q')?.trim() ?? '';

  // Categories — always returned (small dataset)
  const { data: categories } = await db
    .from('categories')
    .select('slug, name, parent_slug, sort_order')
    .order('sort_order');

  // Products — only when category selected or search query entered
  if (!categorySlug && q.length < 2) {
    return NextResponse.json({ categories: categories ?? [], products: [] });
  }

  let query = db
    .from('products')
    .select('sku, name, brand, category_slug, min_price')
    .eq('is_active', true)
    .order('brand')
    .order('name')
    .limit(300);

  if (q.length >= 2) {
    const term = escapeOrTerm(q);
    query = query.or(`sku.ilike.%${term}%,name.ilike.%${term}%,brand.ilike.%${term}%`);
  } else if (categorySlug) {
    query = query.eq('category_slug', categorySlug);
  }

  const { data: products } = await query;

  // Prices from product_stock
  const skus = (products ?? []).map(p => p.sku);
  const { data: stockRows } = skus.length
    ? await db.from('product_stock').select('sku, price_cost, price_unit').in('sku', skus)
    : { data: [] };

  const priceMap = new Map((stockRows ?? []).map(s => [s.sku, s]));
  const enriched = (products ?? []).map(p => ({
    ...p,
    price_cost: priceMap.get(p.sku)?.price_cost ?? null,
    price_unit: priceMap.get(p.sku)?.price_unit ?? null,
  }));

  return NextResponse.json({ categories: categories ?? [], products: enriched });
}
