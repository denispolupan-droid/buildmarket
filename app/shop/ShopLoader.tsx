import ShopClient from './ShopClient';
import { getProductsCached, getCategoriesCached, getReviewStatsCached } from '../../lib/supabase';
import { getShowcaseSkusCached } from '../../lib/showcase-server';
import { resolveCategoryMeta } from '../../lib/category-content';
import { branchRoot } from '../../lib/shop-products';
import { subtreeSlugs } from '../../lib/facets';

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
  const [products, categories, reviewStats, showcaseSkus] = await Promise.all([
    getProductsCached(),
    getCategoriesCached(),
    getReviewStatsCached(),
    getShowcaseSkusCached('shop'),
  ]);
  // Опис/FAQ/гайд стартової категорії — на сервері, щоб потрапити в HTML (SEO);
  // ціни в гайді — живі, з того ж каталогу, що й цінники (lib/seo/guide-prices)
  const initialMeta = initialCategory ? await resolveCategoryMeta(initialCategory, lang, products, categories) : null;

  // Сторінка категорії везе лише товари гілки від кореня (див. lib/shop-products):
  // решту клієнт довантажує при перемиканні (lib/use-shop-products). На /shop,
  // /shop/sale і бренд-сторінках список і фасети — по всьому каталогу, там повний набір.
  const scope = initialCategory && !initialBrand && !initialSaleOnly ? branchRoot(categories, initialCategory) : null;
  const branch = scope ? new Set(subtreeSlugs(categories, scope)) : null;
  const shipped = branch ? products.filter(p => branch.has(p.category_slug ?? '')) : products;

  return (
    <ShopClient
      products={shipped}
      scope={scope}
      catalogOrder={scope ? products.map(p => p.sku) : null}
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
