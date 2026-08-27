import { NextResponse, type NextRequest } from 'next/server';
import { getCategoryMeta } from '../../../../lib/category-descriptions';
import { getCategoryMetaRu } from '../../../../lib/category-descriptions-ru';

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
 * Публічний контент, без авторизації; /api/ закритий у robots — і правильно,
 * це JSON для власного фронтенду, а не сторінка.
 */
export const revalidate = 3600;

export async function GET(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const lang = req.nextUrl.searchParams.get('lang') === 'ru' ? 'ru' : 'uk';
  const meta = (lang === 'ru' ? getCategoryMetaRu(slug) : getCategoryMeta(slug)) ?? null;
  return NextResponse.json({ meta }, {
    headers: { 'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400' },
  });
}
