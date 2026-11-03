import { redirect } from 'next/navigation';
import { createSupabaseServer } from '../../../../lib/supabase-server';
import { getSmartTariff } from '../../../../lib/rozetka-smart';
import { getRozetkaDeliveryTariff } from '../../../../lib/rozetka-delivery-fee';
import RozetkaProductsClient from './RozetkaProductsClient';
import { fetchAllRows } from '../../../../lib/db-paginate';
import { createServiceClient } from '../../../../lib/supabase-service';
import { factorOf, totalFactor } from '../../../../lib/price-adjustments';
import { loadFactorMap } from '../../../../lib/price-adjustments-db';
import { requireStaffPage } from '../../../../lib/auth-guard';

export const metadata = { title: 'Товари Rozetka — Адмін' };

const db = createServiceClient();

export default async function RozetkaProductsPage() {
  await requireStaffPage('admin', 'manager');
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || user.app_metadata?.role !== 'admin') redirect('/');

  // Сторінками: ліміт PostgREST 1000 рядків (каталог ~800 SKU і росте)
  const [products, stock, { data: categories }, smartTariff, deliveryTariff, factorMap] = await Promise.all([
    fetchAllRows((f, t) => db.from('products')
      .select('sku, name, rozetka_name, brand, category_slug, color, volume, on_rozetka, rozetka_markup_pct, rozetka_smart')
      .eq('is_active', true)
      .order('category_slug', { nullsFirst: false })
      .order('name')
      .order('sku')
      .range(f, t)),
    fetchAllRows((f, t) => db.from('product_stock')
      .select('sku, price_retail, price_unit, price_cost')
      .order('id')
      .range(f, t)),
    db.from('categories')
      .select('slug, name, rozetka_commission_pct, rozetka_markup_pct, rozetka_category_id, rozetka_category_name'),
    getSmartTariff(),
    getRozetkaDeliveryTariff(),
    loadFactorMap(db, ['rozetka']),
  ]);

  // Акції й тимчасові зміни каналу (міграція 147): sku → множник, щоб ціна на екрані = ціна фіда
  const adjFactors: Record<string, number> = {};
  for (const p of products as { sku: string }[]) {
    const f = totalFactor(factorOf(factorMap, 'rozetka', p.sku));
    if (f !== 1) adjFactors[p.sku] = f;
  }

  return (
    <RozetkaProductsClient
      products={products}
      stock={stock}
      categories={categories ?? []}
      smartTariff={smartTariff}
      deliveryTariff={deliveryTariff}
      adjFactors={adjFactors}
    />
  );
}
