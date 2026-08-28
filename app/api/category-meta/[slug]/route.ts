import { NextResponse, type NextRequest } from 'next/server';
import { getProductsCached, getCategoriesCached } from '../../../../lib/supabase';
import { resolveCategoryMeta } from '../../../../lib/category-content';

/**
 * Опис, FAQ і гайд категорії для клієнтського перемикання в магазині та
 * опт-каталозі.
 *
 * Навіщо окремий роут. ShopClient — клієнтський компонент, і поки він
 * імпортував lib/category-descriptions(-ru) напряму, обидва словники (≈780 КБ
 * джерела, 757 КБ у чанку) їхали в браузер кожному відвідувачу магазину —
 * заради тексту однієї категорії. Тепер сторінка віддає мету відкритої
 * категорії з сервера (SEO — як раніше, текст у HTML), а при перемиканні
 * категорії без перезавантаження клієнт бере її звідси.
 *
 * Ціни в описі/гайді/FAQ — живі (lib/seo/guide-prices), тому й тут мета
 * проходить через resolveCategoryMeta, а не віддається зі словника як є.
 *
 * Публічний контент, без авторизації; /api/ закритий у robots — і правильно,
 * це JSON для власного фронтенду, а не сторінка.
 */
export const revalidate = 60;

export async function GET(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const lang = req.nextUrl.searchParams.get('lang') === 'ru' ? 'ru' : 'uk';
  // Ціни підставляються з каталогу — тому кеш хвилина, як у листингу, а не година
  const [products, categories] = await Promise.all([getProductsCached(), getCategoriesCached()]);
  const meta = await resolveCategoryMeta(slug, lang, products, categories);
  return NextResponse.json({ meta }, {
    headers: { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=3600' },
  });
}
