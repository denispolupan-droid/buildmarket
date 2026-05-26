import { createClient } from '@supabase/supabase-js';
import PricingClient from './PricingClient';

const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

export default async function PricingPage() {
  // Load all active products with their current prices
  const { data: products } = await db
    .from('products')
    .select('sku, name, brand, volume, is_active')
    .eq('is_active', true)
    .order('brand')
    .order('name');

  const skus = (products ?? []).map(p => p.sku);

  const { data: stocks } = await db
    .from('product_stock')
    .select('sku, price_unit, price_retail')
    .in('sku', skus);

  const { data: checks } = await db
    .from('market_price_checks')
    .select('*')
    .order('delta_pct', { ascending: false, nullsFirst: false });

  const stockMap: Record<string, { unit: number | null; retail: number | null }> = {};
  for (const s of stocks ?? []) {
    stockMap[s.sku] = {
      unit:   s.price_unit   ? Number(s.price_unit)   : null,
      retail: s.price_retail ? Number(s.price_retail) : null,
    };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const checkMap: Record<string, any> = {};
  for (const c of checks ?? []) {
    checkMap[c.sku] = c;
  }

  const rows = (products ?? []).map(p => ({
    sku:              p.sku,
    name:             p.name,
    brand:            p.brand,
    volume:           p.volume,
    our_price:        stockMap[p.sku]?.unit   ?? null,
    our_price_retail: stockMap[p.sku]?.retail ?? null,
    check:            checkMap[p.sku] ?? null,
  }));

  return <PricingClient rows={rows} />;
}
