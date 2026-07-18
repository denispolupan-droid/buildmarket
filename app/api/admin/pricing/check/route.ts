import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServer } from '../../../../../lib/supabase-server';
import { createClient } from '@supabase/supabase-js';
import { checkProductPrices } from '../../../../../lib/price-checker';

const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

async function checkAdmin() {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  return !!(user && user.app_metadata?.role === 'admin');
}

export async function POST(req: NextRequest) {
  if (!await checkAdmin()) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { sku } = await req.json() as { sku: string };
  if (!sku) return NextResponse.json({ error: 'sku required' }, { status: 400 });

  // Load product + current price
  const { data: product } = await db
    .from('products')
    .select('sku, name, brand, volume')
    .eq('sku', sku)
    .eq('is_active', true)
    .single();

  if (!product) return NextResponse.json({ error: 'Product not found' }, { status: 404 });

  const { data: stock } = await db
    .from('product_stock')
    .select('price_unit, price_retail')
    .eq('sku', sku)
    .single();

  // Compare retail price against market (competitors show retail prices)
  const retailPrice = stock?.price_retail ? Number(stock.price_retail) : null;
  const unitPrice   = stock?.price_unit   ? Number(stock.price_unit)   : null;

  const result = await checkProductPrices({
    sku:    product.sku,
    name:   product.name,
    volume: product.volume ?? null,
    price:  retailPrice ?? unitPrice,   // delta/status based on retail
  });

  // Upsert into market_price_checks
  await db.from('market_price_checks').upsert(
    {
      sku:          result.sku,
      product_name: product.name,
      our_price:    result.our_price,
      rozetka_min:  result.rozetka_min,
      prom_min:     result.prom_min,
      market_min:   result.market_min,
      market_avg:   result.market_avg,
      match_count:  result.match_count,
      delta_pct:    result.delta_pct,
      status:       result.status,
      results:      result.results,
      checked_at:   result.checked_at,
    },
    { onConflict: 'sku' },
  );

  return NextResponse.json(result);
}

// GET — list all stored checks (for initial page load)
export async function GET() {
  if (!await checkAdmin()) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { data } = await db
    .from('market_price_checks')
    .select('*')
    .order('delta_pct', { ascending: false, nullsFirst: false });

  return NextResponse.json(data ?? []);
}
