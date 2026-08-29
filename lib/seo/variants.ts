import type { Product, ProductStockPublic } from '../../types';
import { productPath, retailPrice, volumeValue } from './meta';

/**
 * Лінійки фасовок (міграція 108). Один продукт у 2–6 фасовках — це для Google
 * 2–6 майже однакових сторінок, і він показує їх за одним запитом упереміш,
 * ділячи сигнали (28.08: 101 лінійка зі 156). Рішення — «головна» фасовка:
 *
 *  - усі сторінки лінійки несуть ProductGroup-розмітку (головна — з повним
 *    переліком фасовок і цін, фасовки — isVariantOf на головну), фід Merchant
 *    отримує item_group_id, sitemap — лише головні;
 *  - де one фасовка вже домінує у видачі, фасовки віддають canonical на головну
 *    (variant_canonical, фаза 2, поступово — див. scripts/seo-variant-lines.mts).
 *
 * Головна вибирається один раз за даними Search Console і фіксується в БД:
 * canonical, що скаче між фасовками, гірший за його відсутність.
 */

const BASE = 'https://fixline.com.ua';
type Lang = 'uk' | 'ru';

export type LineMember = Pick<Product, 'sku' | 'slug' | 'name' | 'name_ru' | 'brand' | 'volume'> & { stock?: ProductStockPublic | null };
type Lined = Pick<Product, 'sku' | 'variant_main_sku' | 'variant_canonical'>;

export const isLineMain = (p: Lined) => !!p.variant_main_sku && p.variant_main_sku === p.sku;
export const isLineVariant = (p: Lined) => !!p.variant_main_sku && p.variant_main_sku !== p.sku;
/** Фасовка, що вже віддає canonical на головну — така сторінка не для sitemap. */
export const isNonCanonicalVariant = (p: Lined) => isLineVariant(p) && p.variant_canonical;

export const groupId = (main: { slug?: string | null; sku: string }, lang: Lang) => `${BASE}${productPath(main, lang)}#line`;

/** ProductGroup для головної сторінки лінійки: усі фасовки з цінами — Google бачить лінійку як одну сутність. */
export function productGroupLd(main: LineMember & { image?: string | null }, members: LineMember[], lang: Lang, description?: string | null) {
  const sorted = [...members].sort((a, b) => volumeValue(a.volume) - volumeValue(b.volume));
  const name = lang === 'ru' ? (main.name_ru ?? main.name) : main.name;
  return {
    '@context': 'https://schema.org',
    '@type': 'ProductGroup',
    '@id': groupId(main, lang),
    name: `${main.brand} ${name.replace(/,?\s*\d[\d.,]*\s*(л|мл|кг|г)\.?\s*$/i, '')}`.trim(),
    brand: { '@type': 'Brand', name: main.brand },
    url: `${BASE}${productPath(main, lang)}`,
    productGroupID: main.sku,
    ...(description ? { description } : {}),
    variesBy: 'https://schema.org/size',
    hasVariant: sorted.map(v => {
      const price = v.stock ? retailPrice({ stock: v.stock }) : null;
      return {
        '@type': 'Product',
        sku: v.sku,
        name: `${v.brand} ${lang === 'ru' ? (v.name_ru ?? v.name) : v.name}`,
        ...(v.volume ? { size: v.volume } : {}),
        url: `${BASE}${productPath(v, lang)}`,
        ...(price && price > 0 ? {
          offers: {
            '@type': 'Offer', priceCurrency: 'UAH', price,
            availability: v.stock?.stock_status === 'in_stock' ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock',
            url: `${BASE}${productPath(v, lang)}`,
          },
        } : {}),
      };
    }),
  };
}
