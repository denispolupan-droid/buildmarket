import { NextResponse } from 'next/server';
import { getProductsCached, getCategoriesCached } from '../../../../lib/supabase';
import { subtreeSlugs } from '../../../../lib/facets';

/**
 * Товари піддерева категорії — для клієнтського перемикання в магазині
 * (lib/use-shop-products). Сторінка категорії везе лише свою гілку
 * (lib/shop-products), решту клієнт бере звідси одним запитом. `all` — весь
 * каталог (клік «Всі категорії» з категорії).
 *
 * Ті самі публічні поля, що й у HTML сторінки (getProductsCached — роздрібні
 * ціни, без опту й собівартості). Без авторизації; /api/ закритий у robots.
 */
export const revalidate = 300;

export async function GET(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const [products, categories] = await Promise.all([getProductsCached(), getCategoriesCached()]);
  const family = slug === 'all' ? null : new Set(subtreeSlugs(categories, slug));
  const rows = family ? products.filter(p => family.has(p.category_slug ?? '')) : products;
  return NextResponse.json(rows, {
    headers: { 'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=3600' },
  });
}
