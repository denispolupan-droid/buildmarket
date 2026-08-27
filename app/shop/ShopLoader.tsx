import ShopClient from './ShopClient';
import { getProductsCached, getCategoriesCached, getReviewStatsCached } from '../../lib/supabase';
import { getShowcaseSkusCached } from '../../lib/showcase-server';
import { getCategoryMeta } from '../../lib/category-descriptions';
import { getCategoryMetaRu } from '../../lib/category-descriptions-ru';

type Props = {
  initialSaleOnly?: boolean;
  initialCategory?: string;
  initialBrand?: string;
  initialSearch?: string;
  /** Мова сторінки — /ru-маршрути передають 'ru'; ShopLoader серверний і pathname не читає (ISR) */
  lang?: 'uk' | 'ru';
};

// Server Component — дані отримуються на сервері, без client-side waterfall
export default async function ShopLoader({ initialSaleOnly, initialCategory, initialBrand, initialSearch, lang = 'uk' }: Props) {
  // Опис/FAQ/гайд стартової категорії — на сервері, щоб потрапити в HTML (SEO)
  const initialMeta = initialCategory
    ? ((lang === 'ru' ? getCategoryMetaRu(initialCategory) : getCategoryMeta(initialCategory)) ?? null)
    : null;
  const [products, categories, reviewStats, showcaseSkus] = await Promise.all([
    getProductsCached(),
    getCategoriesCached(),
    getReviewStatsCached(),
    getShowcaseSkusCached('shop'),
  ]);

  return (
    <ShopClient
      products={products}
      categories={categories}
      reviewStats={reviewStats}
      showcaseSkus={showcaseSkus}
      initialSaleOnly={initialSaleOnly}
      initialCategory={initialCategory}
      initialBrand={initialBrand}
      initialSearch={initialSearch}
      initialMeta={initialMeta}
    />
  );
}
