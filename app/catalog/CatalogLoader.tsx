import CatalogClient from './CatalogClient';
import { getProductsB2BCached, getCategoriesCached, getReviewStatsCached } from '../../lib/supabase';
import { getShowcaseSkusCached } from '../../lib/showcase-server';

type Props = {
  initialSearch?: string;
  initialCategory?: string;
  initialSaleOnly?: boolean;
};

// Server Component — дані отримуються на сервері, без client-side waterfall
export default async function CatalogLoader({ initialSearch, initialCategory, initialSaleOnly }: Props) {
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
    />
  );
}
