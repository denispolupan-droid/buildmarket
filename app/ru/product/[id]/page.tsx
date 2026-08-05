import type { Metadata } from 'next';
import { publicProduct } from '../../../../lib/public-product';
import Link from 'next/link';
import { notFound, permanentRedirect } from 'next/navigation';

import { getProductBySkuCached, getProductBySlugCached, getRelatedProductsCached, getCategoriesCached, getReviewStatsCached, getProductsLightCached, getProductFaqCached } from '../../../../lib/supabase';
import { getCategoryNameRu } from '../../../../lib/ru';
import { createSupabaseServer } from '../../../../lib/supabase-server';
import { isWholesale } from '../../../../lib/user-role';
import { getCategoryMeta } from '../../../../lib/category-descriptions';
import { productMeta, productDisplayName, productH1, findVariants, productPath } from '../../../../lib/seo/meta';
import ProductTabs from '../../../product/[id]/ProductTabs';
import ProductOrderPanel from '../../../product/[id]/ProductOrderPanel';
import ProductGallery from '../../../product/[id]/ProductGallery';
import ProductImage from '../../../components/ProductImage';
import RelatedCarousel from '../../../product/[id]/RelatedCarousel';
import BackButton from '../../../product/[id]/BackButton';
import CoverageCalculator from '../../../product/[id]/CoverageCalculator';
import CalculatorLink from '../../../product/[id]/CalculatorLink';
import DeliveryInfo from '../../../product/[id]/DeliveryInfo';
import ProductFaq, { faqText } from '../../../product/[id]/ProductFaq';
import ArticleLink from '../../../product/[id]/ArticleLink';
import { Tag, BadgeCheck, Box, Truck } from 'lucide-react';
import Footer from '../../../components/Footer';
import ProductReviews from '../../../product/[id]/ProductReviews';
import { RatingBadge } from '../../../components/StarRating';
import { tFilterValue } from '../../../../lib/translations-ru';
import { createClient } from '@supabase/supabase-js';
import '../../../product/[id]/product.css';

const service = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

const BASE = 'https://fixline.com.ua';

export const dynamic = 'force-dynamic';

// URL товару — ЧПУ-слаг; старі SKU-адреси 308-редіректяться на слаг
async function resolveProduct(id: string) {
  return (await getProductBySlugCached(id)) ?? (await getProductBySkuCached(id));
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const product = await resolveProduct(id);
  if (!product) return { title: 'Товар не найден', robots: { index: false } };
  // 308 со старого SKU-URL на слаг до начала стриминга страницы
  if (product.slug && id !== product.slug) permanentRedirect(`/ru/product/${product.slug}`);
  return productMeta(product, 'ru');
}

function brandToSlug(brand: string): string {
  return brand.trim().toLowerCase().replace(/\s+/g, '-');
}

function volLabel(v: string) {
  return /кг|г$/.test(v) ? 'Вес' : 'Объём';
}

function isInStock(stockStatus: string | undefined, stockQty: number, minOrder: number) {
  if (stockStatus === 'in_stock')     return true;
  if (stockStatus === 'out_of_stock') return false;
  return stockQty >= minOrder;
}

function stockLabel(stockStatus: string | undefined, stockQty: number, minOrder: number) {
  return isInStock(stockStatus, stockQty, minOrder) ? 'В наличии' : 'Нет в наличии';
}

function stockDot(stockStatus: string | undefined, stockQty: number, minOrder: number) {
  return isInStock(stockStatus, stockQty, minOrder) ? 'stock-dot' : 'stock-dot out';
}

export default async function RuProductPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ from?: string }> }) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);

  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  // Wholesale prices only when wholesale account AND coming from /ru/catalog (not /ru/shop
  // or direct) — matches the uk product page; previously this only checked ?from=shop,
  // so anyone landing here any other way (search engines, /ru/catalog itself) silently
  // got wholesale pricing regardless of their actual account type.
  const isRetail = !isWholesale(user) || sp.from !== 'catalog';

  const product = await resolveProduct(id);
  if (!product) notFound();
  if (product.slug && id !== product.slug) {
    permanentRedirect(`/ru/product/${product.slug}${sp.from ? `?from=${sp.from}` : ''}`);
  }
  const sku = product.sku;

  const [related, categoryProducts, faq, categories, reviewsData, reviewStats] = await Promise.all([
    product.category_slug ? getRelatedProductsCached(product.category_slug, product.sku, 5) : Promise.resolve([]),
    // Лише для findVariants (список фасовок) — легка вибірка тієї ж категорії.
    product.category_slug ? getProductsLightCached({ category: product.category_slug }) : Promise.resolve([]),
    getProductFaqCached(sku),
    getCategoriesCached(),
    service.from('product_reviews')
      .select('rating')
      .eq('product_sku', sku)
      .eq('is_approved', true),
    getReviewStatsCached(),
  ]);

  const approvedReviews = reviewsData.data ?? [];
  const reviewCount = approvedReviews.length;
  const reviewAvg = reviewCount
    ? Math.round((approvedReviews.reduce((s: number, r: { rating: number }) => s + r.rating, 0) / reviewCount) * 10) / 10
    : 0;

  const pricePromo = isRetail ? (product.stock?.price_promo ?? null) : null;
  const priceUnit = isRetail
    ? (pricePromo ?? product.stock?.price_retail ?? 0)
    : (product.stock?.price_unit ?? 0);
  const priceOld = isRetail
    ? (pricePromo ? (product.stock?.price_retail ?? null) : (product.stock?.price_retail_old ?? null))
    : (product.stock?.price_old ?? null);
  const stockQty    = product.stock?.stock_qty    ?? 0;
  const stockStatus = product.stock?.stock_status;
  const minOrder    = isRetail ? 1 : product.min_order;
  const inStock     = isInStock(stockStatus, stockQty, minOrder);
  const pricePack   = isRetail ? priceUnit : priceUnit * product.pack_qty;

  const variants = findVariants(categoryProducts, product);

  const productCat   = categories.find((c) => c.slug === product.category_slug);
  const categoryName = productCat
    ? getCategoryNameRu(productCat.slug, productCat.name)
    : 'Каталог';
  const parentCat    = productCat?.parent_slug ? categories.find(c => c.slug === productCat.parent_slug) : null;
  const parentNameRu = parentCat ? getCategoryNameRu(parentCat.slug, parentCat.name) : null;

  const nameRu = (product as { name_ru?: string | null }).name_ru ?? product.name;

  const breadcrumbItems: { '@type': string; position: number; name: string; item: string }[] = [
    { '@type': 'ListItem', position: 1, name: 'Главная', item: `${BASE}/ru` },
  ];
  if (parentCat) {
    breadcrumbItems.push({ '@type': 'ListItem', position: 2, name: getCategoryNameRu(parentCat.slug, parentCat.name), item: `${BASE}/ru/shop/${parentCat.slug}` });
  }
  if (productCat) {
    breadcrumbItems.push({ '@type': 'ListItem', position: breadcrumbItems.length + 1, name: categoryName, item: `${BASE}/ru/shop/${productCat.slug}` });
  }
  breadcrumbItems.push({ '@type': 'ListItem', position: breadcrumbItems.length + 1, name: productDisplayName(product, 'ru'), item: `${BASE}${productPath(product, 'ru')}` });

  const breadcrumbLd = { '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: breadcrumbItems };

  const productFullName = productDisplayName(product, 'ru');
  const rawImage = (product as { image?: string }).image;
  const productImage = rawImage
    ? (rawImage.startsWith('http') ? rawImage : `${BASE}${rawImage.startsWith('/') ? '' : '/'}${rawImage}`)
    : `${BASE}/product/${product.sku}/opengraph-image`;

  const descriptionRu = (product as { description_ru?: string | null }).description_ru ?? product.description ?? undefined;

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: productFullName,
    sku: product.sku,
    brand: { '@type': 'Brand', name: product.brand },
    description: descriptionRu,
    image: productImage,
    url: `${BASE}${productPath(product, 'ru')}`,
    // Без ціни offers не публікуємо — price: 0 читається як «безкоштовно».
    // Див. коментар в українській версії сторінки.
    ...(priceUnit && priceUnit > 0 ? {
      offers: {
        '@type': 'Offer',
        priceCurrency: 'UAH',
        price: priceUnit,
        availability: inStock ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock',
        seller: { '@type': 'Organization', name: 'FIXLINE', url: BASE },
      },
    } : {}),
    ...(product.characteristics.length > 0 ? {
      additionalProperty: product.characteristics.map((c) => ({
        '@type': 'PropertyValue',
        name: c.label,
        value: c.value,
      })),
    } : {}),
    ...(reviewCount >= 1 ? {
      aggregateRating: {
        '@type': 'AggregateRating',
        ratingValue: reviewAvg,
        reviewCount,
        bestRating: 5,
        worstRating: 1,
      },
    } : {}),
  };

  const descriptionFullRu = (product as { description_full_ru?: string | null }).description_full_ru ?? null;

  const faqLd = faq.length ? {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faq.map(f => {
      const { q, a } = faqText(f, 'ru');
      return { '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: a } };
    }),
  } : null;

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbLd).replace(/</g, '\\u003c') }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, '\\u003c') }} />
      {faqLd && <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqLd).replace(/</g, '\\u003c') }} />}
      <BackButton breadcrumbId="product-breadcrumb" />
      <div style={{ background: 'var(--bg-page)', minHeight: '100vh' }}>
      <div className="page-container" style={{paddingTop: '8px', paddingBottom: '48px'}}>

        <div className="breadcrumb" id="product-breadcrumb">
          <Link href="/ru">Главная</Link>
          <span>›</span>
          <Link href={isRetail ? '/ru/shop' : '/ru/catalog'}>{isRetail ? 'Магазин' : 'Каталог'}</Link>
          {parentCat && (<><span>›</span><Link href={isRetail ? `/ru/shop/${parentCat.slug}` : `/ru/catalog?category=${parentCat.slug}`}>{parentNameRu}</Link></>)}
          {productCat && (<><span>›</span><Link href={isRetail ? `/ru/shop/${productCat.slug}` : `/ru/catalog?category=${productCat.slug}`}>{categoryName}</Link></>)}
          <span>›</span>
          <span>{nameRu}</span>
        </div>

        <div className="product-layout">

          <ProductGallery product={publicProduct(product, !isRetail)} priceOld={priceOld} priceUnit={priceUnit} />

          <div className="product-info">
            <div className="product-info__brand">{product.brand}</div>
            <h1 className="product-info__title">{productH1(product, 'ru')}</h1>

            {reviewCount > 0 && (
              <a href="#reviews" style={{ display: 'inline-block', textDecoration: 'none', marginBottom: '4px' }}>
                <RatingBadge avg={reviewAvg} count={reviewCount} />
              </a>
            )}

            <div className="product-info__badges">
              {product.volume && <span className="badge">{volLabel(product.volume)}: {product.volume}</span>}
              {(() => { const c = product.color ?? product.characteristics.find(ch => /^Колір/i.test(ch.label))?.value ?? null; return c ? <span className="badge">Цвет: {tFilterValue(c, 'ru')}</span> : null; })()}
            </div>

            {variants.length > 0 && (
              <div className="product-info__badges" style={{ alignItems: 'center' }}>
                <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>Другие фасовки:</span>
                {variants.map(v => (
                  <Link key={v.sku} href={sp.from ? `${productPath(v, 'ru')}?from=${sp.from}` : productPath(v, 'ru')} className="badge" style={{ textDecoration: 'none', color: 'var(--brand-main)' }}>
                    {v.volume}
                  </Link>
                ))}
              </div>
            )}

            <div className="product-info__stock-row">
              <div className="product-info__stock">
                <span className={stockDot(stockStatus, stockQty, product.min_order)}></span>
                {stockLabel(stockStatus, stockQty, product.min_order)}
              </div>
              <div className="product-info__sku">Артикул: {product.sku}</div>
            </div>

            <hr className="product-info__divider" />

            {priceUnit > 0 ? (
              <>
                <div className="product-info__price-unit">{priceUnit} грн / шт</div>
                <div className="product-info__price-row-sub">
                  {priceOld && <span className="product-info__price-old">{priceOld} грн</span>}
                  {!isRetail && (
                    <span className="product-info__price-pack">
                      {pricePack.toLocaleString('uk-UA')} грн / уп ({product.pack_qty} шт)
                    </span>
                  )}
                </div>
              </>
            ) : (
              <div className="product-info__price-unit" style={{fontSize:'20px',color:'var(--text-muted)'}}>Цена по запросу</div>
            )}

            <hr className="product-info__divider" />

            <ProductOrderPanel
              priceUnit={priceUnit}
              minOrder={minOrder}
              isRetailPage={isRetail}
              inStock={inStock}
              sku={product.sku}
              name={nameRu}
              brand={product.brand}
              volume={product.volume}
              nl1={product.nl1}
              nl2={product.nl2}
              bc={product.bc}
              ac={product.ac}
              imgType={product.img_type}
            />

            <CoverageCalculator
              characteristics={product.characteristics}
              volume={product.volume}
              priceUnit={priceUnit}
            />

            <CalculatorLink categorySlug={product.category_slug} locale="ru" />
          </div>
        </div>

        {/* Compact meta strip — moved out of the above-the-fold hero card (it's
            the least purchase-critical info) so the hero stays short enough
            for the Описание/Характеристики tabs below to land in view without
            scrolling on most products. */}
        <div className="product-meta-strip">
          <span><Tag size={14} strokeWidth={1.8} /><span className="product-meta-strip__label">Категория:</span> <Link href={productCat ? `/ru/shop/${productCat.slug}` : '/ru/shop'} style={{color:'var(--brand-main)'}}>{categoryName}</Link></span>
          <span><BadgeCheck size={14} strokeWidth={1.8} /><span className="product-meta-strip__label">Бренд:</span> <Link href={`/ru/shop/brand/${brandToSlug(product.brand)}`} style={{color:'var(--brand-main)'}}>{product.brand}</Link></span>
          <span><Box size={14} strokeWidth={1.8} /><span className="product-meta-strip__label">Упаковка:</span> {product.pack_qty} шт</span>
          <span><Truck size={14} strokeWidth={1.8} /><span className="product-meta-strip__label">Доставка:</span> Новая Почта</span>
        </div>

        <ProductTabs
          description={descriptionRu ?? null}
          descriptionFull={descriptionFullRu}
          characteristics={product.characteristics}
        />

        <ProductFaq faq={faq} lang="ru" />

        <DeliveryInfo lang="ru" />

        {/* Статья по теме */}
        {(() => { const blogSlug = product.category_slug ? getCategoryMeta(product.category_slug)?.blogSlug : null; return blogSlug ? (
          <ArticleLink blogSlug={blogSlug} lang="ru" />
        ) : null; })()}

        {related.length > 0 && <RelatedCarousel products={related.map(p => publicProduct(p, !isRetail))} retail={isRetail} reviewStats={reviewStats} />}

        <div id="reviews" style={{ borderTop: '1px solid var(--border)', paddingTop: '32px', marginTop: '32px' }}>
          <ProductReviews sku={product.sku} productName={`${product.brand} ${nameRu}`} />
        </div>

      </div>
      </div>
      <Footer />
    </>
  );
}
