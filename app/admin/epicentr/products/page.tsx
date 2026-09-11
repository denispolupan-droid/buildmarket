import { requireStaffPage } from '../../../../lib/auth-guard';
import { createServiceClient } from '../../../../lib/supabase';
import { fetchAllRows } from '../../../../lib/db-paginate';
import { EPICENTR_COMMISSION_FALLBACK_KEY, EPICENTR_COMMISSION_DEFAULT_PCT } from '../../../../lib/epicentr-commission';
import EpicentrProductsClient, { type EpiCategory, type EpiProduct, type EpiStock } from './EpicentrProductsClient';

export const metadata = { title: 'Товари Епіцентр — Адмін' };

export default async function EpicentrProductsPage() {
  await requireStaffPage('admin');
  const db = createServiceClient();

  const [products, stock, categories, fbRow] = await Promise.all([
    fetchAllRows<EpiProduct>((f, t) => db.from('products')
      .select('sku, name, brand, category_slug, volume, on_epicentr, epicentr_markup_pct')
      .eq('is_active', true)
      .order('category_slug', { nullsFirst: false }).order('name').range(f, t)),
    fetchAllRows<EpiStock>((f, t) => db.from('product_stock')
      .select('sku, price_cost, price_retail, stock_status').range(f, t)),
    fetchAllRows<EpiCategory>((f, t) => db.from('categories')
      .select('slug, name, epicentr_commission_pct, epicentr_markup_pct, epicentr_category_code')
      .order('sort_order').range(f, t)),
    db.from('app_settings').select('value').eq('key', EPICENTR_COMMISSION_FALLBACK_KEY).maybeSingle(),
  ]);

  const fallbackPct = Number.parseFloat(fbRow.data?.value ?? '') || EPICENTR_COMMISSION_DEFAULT_PCT;

  return (
    <EpicentrProductsClient
      products={products}
      stock={stock}
      categories={categories}
      fallbackPct={fallbackPct}
    />
  );
}
