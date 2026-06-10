import { redirect } from 'next/navigation';
import { createSupabaseServer } from '../../../lib/supabase-server';
import { createClient } from '@supabase/supabase-js';
import PricesClient from './PricesClient';

const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

export const metadata = { title: 'Ціни — Адмін' };

export default async function PricesPage() {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || !['admin', 'manager'].includes(user.user_metadata?.role ?? '')) redirect('/');

  const [{ data: products }, { data: stock }, { data: categories }] = await Promise.all([
    db.from('products')
      .select('sku, name, brand, volume, category_slug, is_active, prom_markup_pct')
      .order('category_slug', { nullsFirst: false })
      .order('brand')
      .order('name'),
    db.from('product_stock')
      .select('sku, price_cost, price_unit, price_retail, price_drop, price_promo, price_wholesale, price_locked, stock_status, stock_qty, updated_at'),
    db.from('categories')
      .select('slug, name, parent_slug, prom_commission_pct, prom_markup_pct')
      .order('sort_order'),
  ]);

  return (
    <PricesClient
      products={products ?? []}
      stock={stock ?? []}
      categories={categories ?? []}
    />
  );
}
