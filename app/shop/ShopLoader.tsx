import ShopClient from './ShopClient';
import { getProductsCached, getCategoriesCached, getReviewStatsCached } from '../../lib/supabase';
import { getShowcaseSkusCached } from '../../lib/showcase-server';

type Props = {
  initialSaleOnly?: boolean;
  initialCategory?: string;
  initialBrand?: string;
  initialSearch?: string;
};

// Server Component — дані отримуються на сервері, без client-side waterfall
export default async function ShopLoader({ initialSaleOnly, initialCategory, initialBrand, initialSearch }: Props) {
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
    />
  );
}
