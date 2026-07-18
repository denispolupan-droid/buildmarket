import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { requireCustomer } from '../../../../lib/auth-guard';
import { escapeOrTerm } from '../../../../lib/pg-filter';

const serviceClient = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

export async function GET(req: NextRequest) {
  // price_drop — це дроп-ціна для партнерів; віддаємо лише dropship-акаунтам,
  // інакше будь-який зареєстрований роздрібний покупець бачив би опт по всіх SKU.
  const auth = await requireCustomer('dropship');
  if (!auth.ok) return NextResponse.json({ results: [] }, { status: auth.response.status });

  const q = new URL(req.url).searchParams.get('q')?.trim() ?? '';
  if (q.length < 2) return NextResponse.json({ results: [] });

  const term = escapeOrTerm(q);

  const { data: products } = await serviceClient
    .from('products')
    .select('sku, name, brand')
    .or(`name.ilike.%${term}%,brand.ilike.%${term}%,sku.ilike.%${term}%`)
    .eq('is_active', true)
    .limit(12);

  if (!products?.length) return NextResponse.json({ results: [] });

  const skus = products.map(p => p.sku);
  const { data: stock } = await serviceClient
    .from('product_stock')
    .select('sku, price_drop, stock_status')
    .in('sku', skus)
    .eq('stock_status', 'in_stock');

  const stockMap = new Map((stock ?? []).map(s => [s.sku, s]));

  const results = products
    .filter(p => stockMap.has(p.sku))
    .map(p => {
      const s = stockMap.get(p.sku)!;
      return { sku: p.sku, name: p.name, brand: p.brand, price_drop: s.price_drop ?? 0 };
    });

  return NextResponse.json({ results });
}
