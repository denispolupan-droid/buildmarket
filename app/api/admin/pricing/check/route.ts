import { NextRequest, NextResponse } from 'next/server';
import { checkProductPrices } from '../../../../../lib/price-checker';
import { requireStaff } from '../../../../../lib/auth-guard';
import { createServiceClient, asJson } from '../../../../../lib/supabase-service';
import { withApi } from '../../../../../lib/api-handler';

const db = createServiceClient();

async function checkAdmin() {
  return (await requireStaff('admin')).ok;
}

async function _POST(req: NextRequest) {
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
      results:      asJson(result.results),
      checked_at:   result.checked_at,
    },
    { onConflict: 'sku' },
  );

  return NextResponse.json(result);
}

export const POST = withApi('admin/pricing/check', _POST);

// GET — list all stored checks (for initial page load)
async function _GET() {
  if (!await checkAdmin()) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { data } = await db
    .from('market_price_checks')
    .select('*')
    .order('delta_pct', { ascending: false, nullsFirst: false });

  return NextResponse.json(data ?? []);
}

export const GET = withApi('admin/pricing/check', _GET);
