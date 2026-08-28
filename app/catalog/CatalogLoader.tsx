import CatalogClient from './CatalogClient';
import { getProductsB2BCached, getCategoriesCached, getReviewStatsCached } from '../../lib/supabase';
import { getShowcaseSkusCached } from '../../lib/showcase-server';
import { resolveCategoryMeta } from '../../lib/category-content';

type Props = {
  initialSearch?: string;
  initialCategory?: string;
  initialSaleOnly?: boolean;
  /** Мова сторінки — /ru/catalog передає 'ru' */
  lang?: 'uk' | 'ru';
};

// Server Component — дані отримуються на сервері, без client-side waterfall
export default async function CatalogLoader({ initialSearch, initialCategory, initialSaleOnly, lang = 'uk' }: Props) {
  const [products, categories, reviewStats, showcaseSkus] = await Promise.all([
    getProductsB2BCached(),
    getCategoriesCached(),
    getReviewStatsCached(),
    getShowcaseSkusCached('catalog'),
  ]);
  // Ціни в гайді — роздрібні (promo ?? retail), як у магазині: гайд один на всіх
  const initialMeta = initialCategory ? await resolveCategoryMeta(initialCategory, lang, products, categories) : null;

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
