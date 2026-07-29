import { redirect } from 'next/navigation';
import { createSupabaseServer } from '../../../lib/supabase-server';
import { createClient } from '@supabase/supabase-js';
import PricesClient from './PricesClient';
import { fetchProductsInCatalogOrder } from '../../api/admin/prices/_catalog-order';
import { getSmartTariff } from '../../../lib/rozetka-smart';

const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

export const metadata = { title: 'Ціни — Адмін' };

const PRODUCT_SELECT = 'sku, name, brand, volume, category_slug, is_active, prom_markup_pct, rozetka_markup_pct, rozetka_smart, image, sort_order';

export default async function PricesPage() {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || !['admin', 'manager'].includes(user.app_metadata?.role ?? '')) redirect('/');

  const [{ data: stock }, { data: categories }, { data: activePromos }, smartTariff, { data: promPlanRow }] = await Promise.all([
    db.from('product_stock')
      .select('sku, price_cost, price_unit, price_retail, price_drop, price_promo, price_wholesale, price_locked, stock_status, stock_qty, updated_at'),
    db.from('categories')
      .select('slug, name, parent_slug, prom_commission_pct, prom_commission_pct_econom, prom_markup_pct, rozetka_commission_pct, rozetka_markup_pct, description, sort_order'),
    db.from('price_change_log')
      .select('snapshot, revert_at')
      .eq('is_promo', true)
      .is('reverted_at', null)
      .neq('status', 'cancelled'),
    getSmartTariff(),
    db.from('app_settings').select('value').eq('key', 'prom_plan').maybeSingle(),
  ]);
  const promPlan = ((promPlanRow?.value as string | undefined) ?? 'single') as 'single' | 'econom';

  // Same parent-aware ordering the storefront's category menu uses, so the price
  // table (and the pricelist generated from it) group categories the same way.
  const catSortOrder = new Map((categories ?? []).map(c => [c.slug, c.sort_order ?? 999]));
  const sortedCats = [...(categories ?? [])].sort((a, b) => {
    const aTop = a.parent_slug ? (catSortOrder.get(a.parent_slug) ?? 999) : (a.sort_order ?? 999);
    const bTop = b.parent_slug ? (catSortOrder.get(b.parent_slug) ?? 999) : (b.sort_order ?? 999);
    if (aTop !== bTop) return aTop - bTop;
    return (a.sort_order ?? 999) - (b.sort_order ?? 999);
  });

  type AdminProdRow = {
    sku: string; name: string; brand: string; volume: string | null; category_slug: string | null;
    is_active: boolean; prom_markup_pct: number | null; rozetka_markup_pct: number | null;
    rozetka_smart: boolean | null; image: string | null; sort_order: number | null;
  };

  // Active products first, in the exact order the storefront shows them (per-category
  // query, matching lib/supabase.ts getProducts()) — this is what the generated
  // pricelist actually uses. Inactive ones are appended after (order doesn't matter,
  // they never appear in a generated pricelist) purely so the admin table can still
  // show/edit them via the "Неактивні" filter.
  const [activeProducts, { data: inactiveProducts }] = await Promise.all([
    fetchProductsInCatalogOrder<AdminProdRow>(db, PRODUCT_SELECT, sortedCats.map(c => c.slug)),
    db.from('products').select(PRODUCT_SELECT).eq('is_active', false),
  ]);
  const products = [...activeProducts, ...(inactiveProducts ?? [])];

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
      categories={sortedCats}
      promoMap={promoMap}
      smartTariff={smartTariff}
      promPlan={promPlan}
    />
  );
}
