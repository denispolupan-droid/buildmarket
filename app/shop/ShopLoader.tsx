import ShopClient from './ShopClient';
import { getProductsCached, getCategoriesCached } from '../../lib/supabase';

type Props = {
  initialSaleOnly?: boolean;
  initialCategory?: string;
  initialBrand?: string;
};

// Server Component — дані отримуються на сервері, без client-side waterfall
export default async function ShopLoader({ initialSaleOnly, initialCategory, initialBrand }: Props) {
  const [products, categories] = await Promise.all([
    getProductsCached(),
    getCategoriesCached(),
  ]);

  return (
    <ShopClient
      products={products}
      categories={categories}
      initialSaleOnly={initialSaleOnly}
      initialCategory={initialCategory}
      initialBrand={initialBrand}
    />
  );
}
