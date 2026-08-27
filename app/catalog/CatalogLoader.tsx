import CatalogClient from './CatalogClient';
import { getProductsB2BCached, getCategoriesCached, getReviewStatsCached } from '../../lib/supabase';
import { getShowcaseSkusCached } from '../../lib/showcase-server';
import { getCategoryMeta } from '../../lib/category-descriptions';
import { getCategoryMetaRu } from '../../lib/category-descriptions-ru';

type Props = {
  initialSearch?: string;
  initialCategory?: string;
  initialSaleOnly?: boolean;
  /** Мова сторінки — /ru/catalog передає 'ru' */
  lang?: 'uk' | 'ru';
};

// Server Component — дані отримуються на сервері, без client-side waterfall
export default async function CatalogLoader({ initialSearch, initialCategory, initialSaleOnly, lang = 'uk' }: Props) {
  const initialMeta = initialCategory
    ? ((lang === 'ru' ? getCategoryMetaRu(initialCategory) : getCategoryMeta(initialCategory)) ?? null)
    : null;
  const [products, categories, reviewStats, showcaseSkus] = await Promise.all([
    getProductsB2BCached(),
    getCategoriesCached(),
    getReviewStatsCached(),
    getShowcaseSkusCached('catalog'),
  ]);

  return (
    <CatalogClient
      products={products}
      categories={categories}
      reviewStats={reviewStats}
      showcaseSkus={showcaseSkus}
      initialSearch={initialSearch ?? ''}
      initialCategory={initialCategory ?? ''}
      initialSaleOnly={initialSaleOnly}
      initialMeta={initialMeta}
    />
  );
}
