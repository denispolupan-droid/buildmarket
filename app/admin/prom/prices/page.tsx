import { redirect } from 'next/navigation';
import { createSupabaseServer } from '../../../../lib/supabase-server';
import { createClient } from '@supabase/supabase-js';
import PromPricesClient from './PromPricesClient';
import { fetchAllRows } from '../../../../lib/db-paginate';

const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

export const metadata = { title: 'Ціни Prom.ua — Адмін' };

export default async function PromPricesPage() {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || user.app_metadata?.role !== 'admin') redirect('/');

  // Сторінками: ліміт PostgREST 1000 рядків (каталог ~800 SKU і росте)
  const [products, stock, { data: categories }, { data: planRow }] = await Promise.all([
    fetchAllRows((f, t) => db.from('products')
      .select('sku, name, brand, category_slug, volume, prom_markup_pct, on_prom, prom_portal_url')
      .eq('is_active', true)
      .order('category_slug', { nullsFirst: false })
      .order('name')
      .order('sku')
      .range(f, t)),
    fetchAllRows((f, t) => db.from('product_stock')
      .select('sku, price_cost, price_retail, price_unit, price_wholesale')
      .order('id')
      .range(f, t)),
    db.from('categories')
      .select('slug, name, prom_commission_pct, prom_commission_pct_econom, prom_markup_pct, prom_section_url'),
    db.from('app_settings').select('value').eq('key', 'prom_plan').maybeSingle(),
  ]);

  const plan = (planRow?.value ?? 'single') as 'single' | 'econom';

  return (
    <PromPricesClient
      products={products}
      stock={stock}
      categories={categories ?? []}
      plan={plan}
    />
  );
}
