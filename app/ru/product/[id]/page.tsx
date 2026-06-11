import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { getProductBySkuCached, getRelatedProductsCached, getCategoriesCached } from '../../../../lib/supabase';
import { getCategoryNameRu } from '../../../../lib/ru';
import { getCategoryMeta } from '../../../../lib/category-descriptions';
import ProductTabs from '../../../product/[id]/ProductTabs';
import ProductOrderPanel from '../../../product/[id]/ProductOrderPanel';
import ProductGallery from '../../../product/[id]/ProductGallery';
import ProductImage from '../../../components/ProductImage';
import RelatedCarousel from '../../../product/[id]/RelatedCarousel';
import BackButton from '../../../product/[id]/BackButton';
import CoverageCalculator from '../../../product/[id]/CoverageCalculator';
import Footer from '../../../components/Footer';
import ProductReviews from '../../../product/[id]/ProductReviews';
import { tFilterValue } from '../../../../lib/translations-ru';
import { createClient } from '@supabase/supabase-js';
import '../../../product/[id]/product.css';

const service = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

const BASE = 'https://fixline.com.ua';

export const revalidate = 60;

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id: sku } = await params;
  const product = await getProductBySkuCached(sku);
  if (!product) return { title: 'Товар не найден', robots: { index: false } };

  const price = product.stock?.price_unit;
  const priceStr = price ? ` — ${price} грн` : '';
  const metaNameRu = (product as { name_ru?: string | null }).name_ru ?? product.name;
  const volume = product.volume && !metaNameRu.includes(product.volume) ? ` ${product.volume}` : '';
  const title = `${product.brand} ${metaNameRu}${volume}${priceStr} купить оптом`;

  const rawDesc = (product as { description_ru?: string | null }).description_ru
    ?? product.description
    ?? `Купить ${product.brand} ${metaNameRu}${volume} оптом. Артикул ${product.sku}. Оптовые цены для дилеров и подрядчиков на FIXLINE.`;
  const description = rawDesc.length <= 155 ? rawDesc : rawDesc.slice(0, rawDesc.lastIndexOf(' ', 155)) + '…';

  return {
    title,
    description,
    keywords: [
      ...((product as { keywords_ru?: string | null }).keywords_ru?.split(',').map((k: string) => k.trim()).filter(Boolean)
        ?? (product as { keywords?: string }).keywords?.split(',').map((k: string) => k.trim()).filter(Boolean)
        ?? []),
      product.brand, metaNameRu, 'купить', 'оптом', 'строительная химия', product.sku,
    ],
    openGraph: {
      title,
      description,
      url: `${BASE}/ru/product/${sku}`,
      siteName: 'FIXLINE',
      locale: 'ru_RU',
      type: 'website',
      images: [{ url: `${BASE}/product/${sku}/opengraph-image`, width: 1200, height: 630, alt: title }],
    },
    alternates: {
      canonical: `${BASE}/ru/product/${sku}`,
      languages: {
        'uk': `${BASE}/product/${sku}`,
        'ru': `${BASE}/ru/product/${sku}`,
        'x-default': `${BASE}/product/${sku}`,
      },
    },
  };
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
  const [{ id: sku }, sp] = await Promise.all([params, searchParams]);
  const isRetail = sp.from === 'shop';

  const product = await getProductBySkuCached(sku);
  if (!product) notFound();

  const [related, categories, reviewsData] = await Promise.all([
    product.category_slug ? getRelatedProductsCached(product.category_slug, product.sku, 5) : Promise.resolve([]),
    getCategoriesCached(),
    service.from('product_reviews')
      .select('rating')
      .eq('product_sku', sku)
      .eq('is_approved', true),
  ]);

  const approvedReviews = reviewsData.data ?? [];
  const reviewCount = approvedReviews.length;
  const reviewAvg = reviewCount
    ? Math.round((approvedReviews.reduce((s: number, r: { rating: number }) => s + r.rating, 0) / reviewCount) * 10) / 10
    : 0;

  const priceUnit = isRetail
    ? (product.stock?.price_retail ?? 0)
    : (product.stock?.price_unit ?? 0);
  const priceOld = isRetail
    ? (product.stock?.price_retail_old ?? null)
    : (product.stock?.price_old ?? null);
  const stockQty    = product.stock?.stock_qty    ?? 0;
  const stockStatus = product.stock?.stock_status;
  const minOrder    = isRetail ? 1 : product.min_order;
  const inStock     = isInStock(stockStatus, stockQty, minOrder);
  const pricePack   = isRetail ? priceUnit : priceUnit * product.pack_qty;

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
  breadcrumbItems.push({ '@type': 'ListItem', position: breadcrumbItems.length + 1, name: `${product.brand} ${nameRu}`, item: `${BASE}/ru/product/${product.sku}` });

  const breadcrumbLd = { '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: breadcrumbItems };

  const productFullName = `${product.brand} ${nameRu}${product.volume ? ' ' + product.volume : ''}`;
  const productImage = (product as { image?: string }).image || `${BASE}/product/${product.sku}/opengraph-image`;

  const descriptionRu = (product as { description_ru?: string | null }).description_ru ?? product.description ?? undefined;

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: productFullName,
    sku: product.sku,
    brand: { '@type': 'Brand', name: product.brand },
    description: descriptionRu,
    image: productImage,
    url: `${BASE}/ru/product/${product.sku}`,
    offers: {
      '@type': 'Offer',
      priceCurrency: 'UAH',
      price: priceUnit,
      availability: inStock ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock',
      seller: { '@type': 'Organization', name: 'FIXLINE', url: BASE },
    },
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

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
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

          <ProductGallery product={product} priceOld={priceOld} priceUnit={priceUnit} />

          <div className="product-info">
            <div className="product-info__brand">{product.brand}</div>
            <h1 className="product-info__title">{nameRu}</h1>

            <div className="product-info__badges">
              {product.volume && <span className="badge">{volLabel(product.volume)}: {product.volume}</span>}
              {(() => { const c = product.color ?? product.characteristics.find(ch => /^Колір/i.test(ch.label))?.value ?? null; return c ? <span className="badge">Цвет: {tFilterValue(c, 'ru')}</span> : null; })()}
            </div>

            <div className="product-info__stock">
              <span className={stockDot(stockStatus, stockQty, product.min_order)}></span>
              {stockLabel(stockStatus, stockQty, product.min_order)}
            </div>
            <div className="product-info__sku">Артикул: {product.sku}</div>

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

            <hr className="product-info__divider" />
            <div className="product-info__meta">
              <div className="product-info__meta-row">
                <span className="product-info__meta-label">Категория:</span>
                <span className="product-info__meta-value">
                  <Link href={productCat ? `/ru/shop/${productCat.slug}` : '/ru/shop'} style={{color:'var(--brand-main)'}}>{categoryName}</Link>
                </span>
              </div>
              <div className="product-info__meta-row">
                <span className="product-info__meta-label">Бренд:</span>
                <span className="product-info__meta-value">{product.brand}</span>
              </div>
              <div className="product-info__meta-row">
                <span className="product-info__meta-label">Упаковка:</span>
                <span className="product-info__meta-value">{product.pack_qty} шт</span>
              </div>
              <div className="product-info__meta-row">
                <span className="product-info__meta-label">Доставка:</span>
                <span className="product-info__meta-value">Новая Почта</span>
              </div>
            </div>
          </div>
        </div>

        <ProductTabs
          description={descriptionRu ?? null}
          descriptionFull={descriptionFullRu}
          characteristics={product.characteristics}
        />

        {/* Статья по теме */}
        {(() => { const blogSlug = product.category_slug ? getCategoryMeta(product.category_slug)?.blogSlug : null; return blogSlug ? (
          <div style={{ margin: '24px 0', padding: '16px 20px', borderRadius: '10px', border: '1px solid var(--border)', background: 'var(--bg-card)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
            <span style={{ fontSize: '14px', color: 'var(--text-secondary)' }}>Полезная статья по теме</span>
            <Link href={`/ru/blog/${blogSlug}`} style={{ fontSize: '13px', fontWeight: 700, color: 'var(--brand-main)', whiteSpace: 'nowrap', textDecoration: 'none' }}>
              Читать статью →
            </Link>
          </div>
        ) : null; })()}

        {related.length > 0 && <RelatedCarousel products={related} retail={isRetail} />}

        <div style={{ borderTop: '1px solid var(--border)', paddingTop: '32px', marginTop: '32px' }}>
          <ProductReviews sku={product.sku} productName={`${product.brand} ${nameRu}`} />
        </div>

      </div>
      </div>
      <Footer />
    </>
  );
}
