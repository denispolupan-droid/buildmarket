import CatalogClient from './CatalogClient';
import { getProductsCached, getCategoriesCached, getReviewStatsCached } from '../../lib/supabase';

type Props = {
  initialSearch?: string;
  initialCategory?: string;
  initialSaleOnly?: boolean;
};

// Server Component — дані отримуються на сервері, без client-side waterfall
export default async function CatalogLoader({ initialSearch, initialCategory, initialSaleOnly }: Props) {
  const [products, categories, reviewStats] = await Promise.all([
    getProductsCached(),
    getCategoriesCached(),
    getReviewStatsCached(),
  ]);

  return (
    <CatalogClient
      products={products}
      categories={categories}
      reviewStats={reviewStats}
      initialSearch={initialSearch ?? ''}
      initialCategory={initialCategory ?? ''}
      initialSaleOnly={initialSaleOnly}
    />
  );
}
