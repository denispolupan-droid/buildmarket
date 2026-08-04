import ShopClient from './ShopClient';
import { getProductsCached, getCategoriesCached, getReviewStatsCached } from '../../lib/supabase';

type Props = {
  initialSaleOnly?: boolean;
  initialCategory?: string;
  initialBrand?: string;
  /** Сторінка категорії рендерить опис і FAQ сама — прапорець гасить дубль у листингу. */
  hideCategoryInfo?: boolean;
};

// Server Component — дані отримуються на сервері, без client-side waterfall
export default async function ShopLoader({ initialSaleOnly, initialCategory, initialBrand, hideCategoryInfo }: Props) {
  const [products, categories, reviewStats] = await Promise.all([
    getProductsCached(),
    getCategoriesCached(),
    getReviewStatsCached(),
  ]);

  return (
    <ShopClient
      products={products}
      categories={categories}
      reviewStats={reviewStats}
      initialSaleOnly={initialSaleOnly}
      initialCategory={initialCategory}
      initialBrand={initialBrand}
      hideCategoryInfo={hideCategoryInfo}
    />
  );
}
