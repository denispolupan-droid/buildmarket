import { redirect } from 'next/navigation';
import { createSupabaseServer } from '../../../../lib/supabase-server';
import { createClient } from '@supabase/supabase-js';
import { getSmartTariff } from '../../../../lib/rozetka-smart';
import { getRozetkaDeliveryTariff } from '../../../../lib/rozetka-delivery-fee';
import RozetkaProductsClient from './RozetkaProductsClient';
import { fetchAllRows } from '../../../../lib/db-paginate';

export const metadata = { title: 'Товари Rozetka — Адмін' };

const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

export default async function RozetkaProductsPage() {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || user.app_metadata?.role !== 'admin') redirect('/');

  // Сторінками: ліміт PostgREST 1000 рядків (каталог ~800 SKU і росте)
  const [products, stock, { data: categories }, smartTariff, deliveryTariff] = await Promise.all([
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
  ]);

  return (
    <RozetkaProductsClient
      products={products}
      stock={stock}
      categories={categories ?? []}
      smartTariff={smartTariff}
      deliveryTariff={deliveryTariff}
    />
  );
}
