/**
 * Публічний індекс для підказок пошуку на головній. Віддає лише публічні
 * колонки (ті самі, що бачить /shop) одним кешованим JSON — жодних запитів
 * до БД на кожне натискання: збіг і ранжування виконуються на клієнті
 * (lib/search-rank.ts).
 */
import { NextResponse } from 'next/server';
import { unstable_cache } from 'next/cache';
import { getSupabase } from '../../../lib/supabase';
import { fetchAllRows } from '../../../lib/db-paginate';

export const dynamic = 'force-static';
export const revalidate = 300;

const getIndex = unstable_cache(
  async () => {
    // Без стелі: limit(2000) мовчки обрізав би індекс на 2000 SKU так само, як
    // 1000 рядків PostgREST обрізали адмін-екрани (аудит 31.10, §3).
    const products = await fetchAllRows((f, t) => getSupabase()
      .from('products')
      .select(`
        sku, slug, name, name_ru, brand, volume, image,
        nl1, nl2, bc, ac, img_type,
        stock:product_stock(price_retail, price_promo, stock_status, stock_qty)
      `)
      .eq('is_active', true)
      .order('id')
      .range(f, t));
    return { products };
  },
  ['search-index'],
  { revalidate: 300, tags: ['products'] },
);

export async function GET() {
  return NextResponse.json(await getIndex());
}
