import CatalogClient from './CatalogClient';
import { getProductsCached, getCategoriesCached } from '../../lib/supabase';

type Props = {
  initialSearch?: string;
  initialCategory?: string;
  initialSaleOnly?: boolean;
};

// Server Component — дані отримуються на сервері, без client-side waterfall
export default async function CatalogLoader({ initialSearch, initialCategory, initialSaleOnly }: Props) {
  const [products, categories] = await Promise.all([
    getProductsCached(),
    getCategoriesCached(),
  ]);

  return (
    <CatalogClient
      products={products}
      categories={categories}
      initialSearch={initialSearch ?? ''}
      initialCategory={initialCategory ?? ''}
      initialSaleOnly={initialSaleOnly}
    />
  );
}
