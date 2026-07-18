import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServer } from '../../../../../lib/supabase-server';
import { createServiceClient } from '../../../../../lib/supabase';

export async function POST(req: NextRequest) {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || user.app_metadata?.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { skus } = await req.json() as { skus: string[] };
  if (!skus?.length) return NextResponse.json({ products: [] });

  const db = createServiceClient();

  // Step 1: пошук за нашим артикулом (прямий збіг)
  const { data: directProducts } = await db
    .from('products').select('sku, name, brand').in('sku', skus);

  const foundOurSkus = new Set((directProducts ?? []).map(p => p.sku));

  // Step 2: для артикулів що не знайдено — шукаємо через supplier_sku_map
  const supplierSkus = skus.filter(s => !foundOurSkus.has(s));
  let mappedProducts: { our_sku: string; supplier_sku: string }[] = [];

  if (supplierSkus.length > 0) {
    const { data: maps } = await db
      .from('supplier_sku_map')
      .select('our_sku, supplier_sku')
      .in('supplier_sku', supplierSkus);
    mappedProducts = maps ?? [];
  }

  // Збираємо всі наші артикули
  const allOurSkus = [
    ...(directProducts ?? []).map(p => p.sku),
    ...mappedProducts.map(m => m.our_sku),
  ];

  const { data: allProducts } = allOurSkus.length
    ? await db.from('products').select('sku, name, brand').in('sku', allOurSkus)
    : { data: [] };

  const { data: stockRows } = allOurSkus.length
    ? await db.from('product_stock')
        .select('sku, price_cost, price_unit, price_retail, price_wholesale, price_drop')
        .in('sku', allOurSkus)
    : { data: [] };

  const priceMap   = new Map((stockRows ?? []).map(s => [s.sku, s]));
  const productMap = new Map((allProducts ?? []).map(p => [p.sku, p]));
  // supplier_sku → our_sku
  const supplierToOur = new Map(mappedProducts.map(m => [m.supplier_sku, m.our_sku]));

  const result = skus.map(inputSku => {
    // Визначаємо наш SKU
    const ourSku = foundOurSkus.has(inputSku)
      ? inputSku
      : (supplierToOur.get(inputSku) ?? inputSku);

    const product = productMap.get(ourSku);
    const stock   = priceMap.get(ourSku);

    return {
      input_sku:       inputSku,
      sku:             ourSku,
      name:            product?.name          ?? null,
      brand:           product?.brand         ?? null,
      price_cost:      stock?.price_cost      ?? null,
      price_unit:      stock?.price_unit      ?? null,
      price_retail:    stock?.price_retail    ?? null,
      price_wholesale: stock?.price_wholesale ?? null,
      price_drop:      stock?.price_drop      ?? null,
      matched:         !!product,
      via_supplier:    supplierToOur.has(inputSku),
    };
  });

  return NextResponse.json({ products: result });
}
