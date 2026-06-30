import { redirect } from 'next/navigation';
import { createSupabaseServer } from '../../../../lib/supabase-server';
import { createClient } from '@supabase/supabase-js';
import PromPricesClient from '../prices/PromPricesClient';

const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

export const metadata = { title: 'Товари Prom.ua — Адмін' };

export default async function PromProductsPage() {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || user.user_metadata?.role !== 'admin') redirect('/');

  const [{ data: products }, { data: stock }, { data: categories }, { data: planRow }] = await Promise.all([
    db.from('products')
      .select('sku, name, brand, category_slug, volume, prom_markup_pct, on_prom, prom_portal_url')
      .eq('is_active', true)
      .order('category_slug', { nullsFirst: false })
      .order('name'),
    db.from('product_stock')
      .select('sku, price_cost, price_retail, price_unit, price_wholesale'),
    db.from('categories')
      .select('slug, name, prom_commission_pct, prom_markup_pct, prom_section_url'),
    db.from('app_settings').select('value').eq('key', 'prom_plan').maybeSingle(),
  ]);

  const plan = (planRow?.value ?? 'single') as 'single' | 'econom';

  return (
    <PromPricesClient
      products={products ?? []}
      stock={stock ?? []}
      categories={categories ?? []}
      plan={plan}
    />
  );
}
