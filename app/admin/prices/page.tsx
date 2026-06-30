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

  const [{ data: products }, { data: stock }, { data: categories }, { data: activePromos }] = await Promise.all([
    db.from('products')
      .select('sku, name, brand, volume, category_slug, is_active, prom_markup_pct, image')
      .order('category_slug', { nullsFirst: false })
      .order('brand')
      .order('name'),
    db.from('product_stock')
      .select('sku, price_cost, price_unit, price_retail, price_drop, price_promo, price_wholesale, price_locked, stock_status, stock_qty, updated_at'),
    db.from('categories')
      .select('slug, name, parent_slug, prom_commission_pct, prom_markup_pct, rozetka_commission_pct, rozetka_markup_pct, description')
      .order('sort_order'),
    db.from('price_change_log')
      .select('snapshot, revert_at')
      .eq('is_promo', true)
      .is('reverted_at', null)
      .neq('status', 'cancelled'),
  ]);

  // sku → revert_at (null = indefinite). Latest/longest revert_at wins; null (indefinite) always wins.
  const promoMap: Record<string, string | null> = {};
  for (const entry of activePromos ?? []) {
    for (const row of (entry.snapshot as { sku: string }[] ?? [])) {
      const cur = promoMap[row.sku];
      if (cur === undefined) {
        promoMap[row.sku] = entry.revert_at ?? null;
      } else if (cur !== null) {
        if (entry.revert_at == null) promoMap[row.sku] = null;
        else if (entry.revert_at > cur) promoMap[row.sku] = entry.revert_at;
      }
    }
  }

  return (
    <PricesClient
      products={products ?? []}
      stock={stock ?? []}
      categories={categories ?? []}
      promoMap={promoMap}
    />
  );
}
