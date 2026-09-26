import { NextResponse } from 'next/server';
import { getProductsCached, getCategoriesCached } from '../../../../lib/supabase';
import { categoryFamilySlugs } from '../../../../lib/seo/meta';

/**
 * Характеристики товарів піддерева категорії — для клієнтського перемикання
 * в магазині (lib/use-category-chars). Сторінка категорії везе характеристики
 * лише відкритої гілки (lib/shop-chars), решту клієнт бере звідси одним
 * запитом. `all` — весь каталог (клік «Всі товари» з категорії).
 *
 * Публічні дані, без авторизації; /api/ закритий у robots.
 */
export const revalidate = 300;

export async function GET(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const [products, categories] = await Promise.all([getProductsCached(), getCategoriesCached()]);
  const family = slug === 'all' ? null : new Set(categoryFamilySlugs(categories, slug));
  const rows = products
    .filter(p => p.characteristics.length > 0 && (!family || family.has(p.category_slug ?? '')))
    .map(p => ({ sku: p.sku, characteristics: p.characteristics }));
  return NextResponse.json(rows, {
    headers: { 'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=3600' },
  });
}
