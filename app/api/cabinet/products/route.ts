import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { requireCustomer } from '../../../../lib/auth-guard';
import { escapeOrTerm } from '../../../../lib/pg-filter';
import { loadDropshipCatalog } from '../../../../lib/dropship-order-create';
import { dropshipOrderable, dropshipItemName } from '../../../../lib/dropship-order';

const serviceClient = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

const RESULTS = 12;

export async function GET(req: NextRequest) {
  // price_drop — це дроп-ціна для партнерів; віддаємо лише dropship-акаунтам,
  // інакше будь-який зареєстрований роздрібний покупець бачив би опт по всіх SKU.
  const auth = await requireCustomer('dropship');
  if (!auth.ok) return NextResponse.json({ results: [] }, { status: auth.response.status });

  const q = new URL(req.url).searchParams.get('q')?.trim() ?? '';
  if (q.length < 2) return NextResponse.json({ results: [] });

  const term = escapeOrTerm(q);

  // Беремо з запасом і фільтруємо за наявністю ПІСЛЯ: раніше брали 12 і вже
  // з них викидали відсутні — пошук міг повернути 2 товари або порожньо.
  const { data: products } = await serviceClient
    .from('products')
    .select('sku')
    .or(`name.ilike.%${term}%,brand.ilike.%${term}%,sku.ilike.%${term}%`)
    .eq('is_active', true)
    .order('sort_order')
    .limit(80);

  if (!products?.length) return NextResponse.json({ results: [] });

  const catalog = await loadDropshipCatalog(serviceClient, products.map(p => p.sku as string));
  const results = products
    .map(p => catalog.get(p.sku as string))
    .filter(dropshipOrderable)
    .slice(0, RESULTS)
    .map(p => ({ sku: p.sku, name: dropshipItemName(p), brand: p.brand, price_drop: Number(p.price_drop) }));

  return NextResponse.json({ results });
}
