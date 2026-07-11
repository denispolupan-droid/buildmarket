import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { getProductBySkuCached, getRelatedProductsCached, getCategoriesCached, getReviewStatsCached } from '../../../lib/supabase';
import { getCategoryMeta } from '../../../lib/category-descriptions';
import ProductTabs from './ProductTabs';
import ProductOrderPanel from './ProductOrderPanel';
import ProductGallery from './ProductGallery';
import ProductImage from '../../components/ProductImage';
import RelatedCarousel from './RelatedCarousel';
import BackButton from './BackButton';
import CoverageCalculator from './CoverageCalculator';
import Footer from '../../components/Footer';
import ProductReviews from './ProductReviews';
import { RatingBadge } from '../../components/StarRating';
import { createClient } from '@supabase/supabase-js';
import { createSupabaseServer } from '../../../lib/supabase-server';
import './product.css';

const service = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

const WHOLESALE_TYPES = ['dealer', 'wholesale', 'contractor', 'shop_owner'];

const BASE = 'https://fixline.com.ua';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id: sku } = await params;
  const product = await getProductBySkuCached(sku);
  if (!product) return { title: 'Товар не знайдено', robots: { index: false } };

  const price = product.stock?.price_unit;
  const priceStr = price ? ` — ${price} грн` : '';
  const volume = product.volume && !product.name.includes(product.volume) ? ` ${product.volume}` : '';
  const title = `${product.brand} ${product.name}${volume}${priceStr}`;
  const rawDesc = product.description
    ?? `Купити ${product.brand} ${product.name}${volume} оптом. Артикул ${product.sku}. Оптові ціни для дилерів та підрядників на FIXLINE. Купить ${product.brand} ${product.name}${volume} оптом в Украине.`;
  const description = rawDesc.length <= 155 ? rawDesc : rawDesc.slice(0, rawDesc.lastIndexOf(' ', 155)) + '…';

  return {
    title,
    description,
    keywords: [
      ...((product as any).keywords?.split(',').map((k: string) => k.trim()).filter(Boolean) ?? []),
      product.brand, product.name, 'купити', 'оптом', 'будівельна хімія', product.sku,
    ],
    openGraph: {
      title,
      description,
      url: `${BASE}/product/${sku}`,
      siteName: 'FIXLINE',
      locale: 'uk_UA',
      type: 'website',
      images: [{ url: `${BASE}/product/${sku}/opengraph-image`, width: 1200, height: 630, alt: title }],
    },
    alternates: {
      canonical: `${BASE}/product/${sku}`,
      languages: {
        'uk': `${BASE}/product/${sku}`,
        'ru': `${BASE}/ru/product/${sku}`,
        'x-default': `${BASE}/product/${sku}`,
      },
    },
  };
}

function brandToSlug(brand: string): string {
  return brand.trim().toLowerCase().replace(/\s+/g, '-');
}

function volLabel(v: string) {
  return /кг|г$/.test(v) ? 'Вага' : "Об'єм";
}

function isInStock(stockStatus: string | undefined, stockQty: number, minOrder: number) {
  // stock_status = 'in_stock' — товар є (навіть якщо qty=0 через qty_is_flag постачальника)
  if (stockStatus === 'in_stock')     return true;
  if (stockStatus === 'out_of_stock') return false;
  return stockQty >= minOrder;
}

function stockLabel(stockStatus: string | undefined, stockQty: number, minOrder: number) {
  return isInStock(stockStatus, stockQty, minOrder) ? 'В наявності' : 'Немає в наявності';
}

function stockDot(stockStatus: string | undefined, stockQty: number, minOrder: number) {
  return isInStock(stockStatus, stockQty, minOrder) ? 'stock-dot' : 'stock-dot out';
}

export default async function ProductPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ from?: string }> }) {
  const [{ id: sku }, sp] = await Promise.all([params, searchParams]);

  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  const accountType = user?.user_metadata?.account_type as string | undefined;
  const isWholesaleUser = WHOLESALE_TYPES.includes(accountType ?? '');
  // Wholesale prices only when wholesale account AND coming from /catalog (not /shop or direct)
  const isRetail = !isWholesaleUser || sp.from !== 'catalog';

  const product = await getProductBySkuCached(sku);
  if (!product) notFound();

  const [related, categories, reviewsData, reviewStats] = await Promise.all([
    product.category_slug ? getRelatedProductsCached(product.category_slug, product.sku, 5) : Promise.resolve([]),
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
  const priceOld  = isRetail
    ? (pricePromo ? (product.stock?.price_retail ?? null) : (product.stock?.price_retail_old ?? null))
    : (product.stock?.price_old ?? null);
  const stockQty    = product.stock?.stock_qty    ?? 0;
  const stockStatus = product.stock?.stock_status;
  const minOrder    = 1;
  const inStock     = isInStock(stockStatus, stockQty, minOrder);
  const pricePack = isRetail ? priceUnit : priceUnit * product.pack_qty;

  const productCat   = categories.find((c) => c.slug === product.category_slug);
  const categoryName = productCat?.name ?? 'Каталог';
  const parentCat    = productCat?.parent_slug ? categories.find(c => c.slug === productCat.parent_slug) : null;

  const breadcrumbItems: { '@type': string; position: number; name: string; item: string }[] = [
    { '@type': 'ListItem', position: 1, name: 'Головна', item: BASE },
  ];
  if (parentCat) {
    breadcrumbItems.push({ '@type': 'ListItem', position: 2, name: parentCat.name, item: `${BASE}/shop/${parentCat.slug}` });
  }
  if (productCat) {
    breadcrumbItems.push({ '@type': 'ListItem', position: breadcrumbItems.length + 1, name: productCat.name, item: `${BASE}/shop/${productCat.slug}` });
  }
  breadcrumbItems.push({ '@type': 'ListItem', position: breadcrumbItems.length + 1, name: `${product.brand} ${product.name}`, item: `${BASE}/product/${product.sku}` });

  const breadcrumbLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: breadcrumbItems,
  };

  const productFullName = `${product.brand} ${product.name}${product.volume ? ' ' + product.volume : ''}`;
  const productImage = (product as { image?: string }).image
    || `${BASE}/product/${product.sku}/opengraph-image`;
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: productFullName,
    alternateName: productFullName,
    sku: product.sku,
    brand: { '@type': 'Brand', name: product.brand },
    description: product.description ?? undefined,
    image: productImage,
    url: `${BASE}/product/${product.sku}`,
    offers: {
      '@type': 'Offer',
      priceCurrency: 'UAH',
      price: priceUnit,
      availability: inStock
        ? 'https://schema.org/InStock'
        : 'https://schema.org/OutOfStock',
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

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <BackButton breadcrumbId="product-breadcrumb" />
      <div style={{ background: 'var(--bg-page)', minHeight: '100vh' }}>
      <div className="page-container" style={{paddingTop: '8px', paddingBottom: '48px'}}>

        <div className="breadcrumb" id="product-breadcrumb">
          <Link href="/">Головна</Link>
          <span>›</span>
          <Link href={isRetail ? '/shop' : '/catalog'}>{isRetail ? 'Магазин' : 'Каталог'}</Link>
          {parentCat && (<><span>›</span><Link href={isRetail ? `/shop/${parentCat.slug}` : `/catalog?category=${parentCat.slug}`}>{parentCat.name}</Link></>)}
          {productCat && (<><span>›</span><Link href={isRetail ? `/shop/${productCat.slug}` : `/catalog?category=${productCat.slug}`}>{categoryName}</Link></>)}
          <span>›</span>
          <span>{product.name}</span>
        </div>

        <div className="product-layout">

          {/* Галерея */}
          <ProductGallery product={product} priceOld={priceOld} priceUnit={priceUnit} />

          {/* Інформація */}
          <div className="product-info">
            <div className="product-info__brand">{product.brand}</div>
            <h1 className="product-info__title">{product.name}</h1>

            {reviewCount > 0 && (
              <a href="#reviews" style={{ display: 'inline-block', textDecoration: 'none', marginBottom: '4px' }}>
                <RatingBadge avg={reviewAvg} count={reviewCount} />
              </a>
            )}

            <div className="product-info__badges">
              {product.volume && <span className="badge">{volLabel(product.volume)}: {product.volume}</span>}
              {(() => { const c = product.color ?? product.characteristics.find(ch => /^Колір/i.test(ch.label))?.value ?? null; return c ? <span className="badge">Колір: {c}</span> : null; })()}
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
              <div className="product-info__price-unit" style={{fontSize:'20px',color:'var(--text-muted)'}}>Ціна за запитом</div>
            )}

            <hr className="product-info__divider" />

            <ProductOrderPanel
              priceUnit={priceUnit}
              minOrder={minOrder}
              isRetailPage={isRetail}
              inStock={inStock}
              sku={product.sku}
              name={product.name}
              name_ru={(product as { name_ru?: string | null }).name_ru ?? undefined}
              brand={product.brand}
              volume={product.volume}
              nl1={product.nl1}
              nl2={product.nl2}
              bc={product.bc}
              ac={product.ac}
              imgType={product.img_type}
              imageUrl={(product as { image?: string }).image ?? undefined}
              isPromo={isRetail && !!pricePromo}
            />

            <CoverageCalculator
              characteristics={product.characteristics}
              volume={product.volume}
              priceUnit={priceUnit}
            />
          </div>
        </div>

        {/* Compact meta strip — moved out of the above-the-fold hero card (it's
            the least purchase-critical info) so the hero stays short enough
            for the Опис/Характеристики tabs below to land in view without
            scrolling on most products. */}
        <div className="product-meta-strip">
          <span><span className="product-meta-strip__label">Категорія:</span> <Link href={productCat ? `/shop/${productCat.slug}` : '/shop'} style={{color:'var(--brand-main)'}}>{categoryName}</Link></span>
          <span><span className="product-meta-strip__label">Бренд:</span> <Link href={`/shop/brand/${brandToSlug(product.brand)}`} style={{color:'var(--brand-main)'}}>{product.brand}</Link></span>
          <span><span className="product-meta-strip__label">Упаковка:</span> {product.pack_qty} шт</span>
          <span><span className="product-meta-strip__label">Доставка:</span> Нова Пошта</span>
        </div>

        <ProductTabs
          description={product.description}
          descriptionFull={product.description_full ?? null}
          characteristics={product.characteristics}
        />

        {/* Стаття по темі */}
        {(() => { const blogSlug = product.category_slug ? getCategoryMeta(product.category_slug)?.blogSlug : null; return blogSlug ? (
          <div style={{ margin: '24px 0', padding: '16px 20px', borderRadius: '10px', border: '1px solid var(--border)', background: 'var(--bg-card)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
            <span style={{ fontSize: '14px', color: 'var(--text-secondary)' }}>Корисна стаття по темі</span>
            <Link href={`/blog/${blogSlug}`} style={{ fontSize: '13px', fontWeight: 700, color: 'var(--brand-main)', whiteSpace: 'nowrap', textDecoration: 'none' }}>
              Читати статтю →
            </Link>
          </div>
        ) : null; })()}

        {/* Схожі товари */}
        {related.length > 0 && <RelatedCarousel products={related} retail={isRetail} reviewStats={reviewStats} />}

        {/* Відгуки */}
        <div id="reviews" style={{ borderTop: '1px solid var(--border)', paddingTop: '32px', marginTop: '32px' }}>
          <ProductReviews sku={product.sku} productName={`${product.brand} ${product.name}`} />
        </div>

      </div>
      </div>

      <Footer />
    </>
  );
}
