import ShopClient from './ShopClient';
import { getProductsCached, getCategoriesCached, getReviewStatsCached } from '../../lib/supabase';
import { getShowcaseSkusCached } from '../../lib/showcase-server';
import { resolveCategoryMeta } from '../../lib/category-content';
import { stripCharsOutside } from '../../lib/shop-chars';
import { categoryFamilySlugs } from '../../lib/seo/meta';

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

  // Сторінка категорії везе характеристики лише своєї гілки (−0,7 МБ даних);
  // решту клієнт довантажує при перемиканні (lib/use-category-chars). На /shop,
  // /shop/sale і бренд-сторінках фасети будуються по всьому списку — там повний набір.
  const charsScope = initialCategory && !initialBrand && !initialSaleOnly ? initialCategory : null;
  const shipped = charsScope
    ? stripCharsOutside(products, new Set(categoryFamilySlugs(categories, charsScope)))
    : products;

  return (
    <ShopClient
      products={shipped}
      charsScope={charsScope}
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
