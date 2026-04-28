import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { getProductBySku, getProducts, getCategories } from '../../../lib/supabase';
import ProductTabs from './ProductTabs';
import ProductOrderPanel from './ProductOrderPanel';
import ProductGallery from './ProductGallery';
import ProductImage from '../../components/ProductImage';
import RelatedCarousel from './RelatedCarousel';
import BackButton from './BackButton';
import Footer from '../../components/Footer';
import './product.css';

const BASE = 'https://fixline.com.ua';

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id: sku } = await params;
  const product = await getProductBySku(sku);
  if (!product) return {};

  const price = product.stock?.price_unit;
  const priceStr = price ? ` — ${price} грн` : '';
  const volume = product.volume ? ` ${product.volume}` : '';
  const title = `${product.brand} ${product.name}${volume}${priceStr} | FIXLINE`;
  const rawDesc = product.description ?? `Купити ${product.brand} ${product.name}${volume} оптом. Артикул ${product.sku}. Оптові ціни для дилерів та підрядників на FIXLINE.`;
  const description = rawDesc.length <= 155 ? rawDesc : rawDesc.slice(0, rawDesc.lastIndexOf(' ', 155)) + '…';

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      url: `${BASE}/product/${sku}`,
      siteName: 'FIXLINE',
      locale: 'uk_UA',
      type: 'website',
    },
    alternates: { canonical: `${BASE}/product/${sku}` },
  };
}

function stockLabel(stockQty: number, minOrder: number) {
  return stockQty >= minOrder ? 'В наявності' : 'Немає в наявності';
}

function stockDot(stockQty: number, minOrder: number) {
  return stockQty >= minOrder ? 'stock-dot' : 'stock-dot out';
}

export default async function ProductPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ from?: string }> }) {
  const [{ id: sku }, sp] = await Promise.all([params, searchParams]);
  const isRetail = sp.from === 'shop';

  const [product, allInCategory, categories] = await Promise.all([
    getProductBySku(sku),
    getProducts({ category: undefined }),
    getCategories(),
  ]);

  if (!product) notFound();

  const priceUnit = isRetail
    ? (product.stock?.price_retail ?? 0)
    : (product.stock?.price_unit ?? 0);
  const priceOld  = isRetail
    ? (product.stock?.price_retail_old ?? null)
    : (product.stock?.price_old ?? null);
  const stockQty  = product.stock?.stock_qty  ?? 0;
  const minOrder  = isRetail ? 1 : product.min_order;
  const pricePack = isRetail ? priceUnit : priceUnit * product.pack_qty;

  const related = allInCategory
    .filter((p) => p.sku !== product.sku && p.category_slug === product.category_slug)
    .slice(0, 5);

  const productCat   = categories.find((c) => c.slug === product.category_slug);
  const categoryName = productCat?.name ?? 'Каталог';
  const parentCat    = productCat?.parent_slug ? categories.find(c => c.slug === productCat.parent_slug) : null;

  const breadcrumbLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Головна', item: BASE },
      { '@type': 'ListItem', position: 2, name: categoryName, item: `${BASE}/catalog` },
      { '@type': 'ListItem', position: 3, name: `${product.brand} ${product.name}`, item: `${BASE}/product/${product.sku}` },
    ],
  };

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: `${product.brand} ${product.name}${product.volume ? ' ' + product.volume : ''}`,
    sku: product.sku,
    brand: { '@type': 'Brand', name: product.brand },
    description: product.description ?? undefined,
    url: `${BASE}/product/${product.sku}`,
    offers: {
      '@type': 'Offer',
      priceCurrency: 'UAH',
      price: priceUnit,
      availability: stockQty >= product.min_order
        ? 'https://schema.org/InStock'
        : 'https://schema.org/OutOfStock',
      seller: { '@type': 'Organization', name: 'FIXLINE' },
    },
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
          {parentCat && (<><span>›</span><Link href={`${isRetail ? '/shop' : '/catalog'}?category=${parentCat.slug}`}>{parentCat.name}</Link></>)}
          {productCat && (<><span>›</span><Link href={`${isRetail ? '/shop' : '/catalog'}?category=${productCat.slug}`}>{categoryName}</Link></>)}
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

            <div className="product-info__badges">
              {product.volume       && <span className="badge">{product.volume}</span>}
              {product.product_type && <span className="badge">{product.product_type}</span>}
              {product.color        && <span className="badge">{product.color}</span>}
            </div>

            <div className="product-info__stock">
              <span className={stockDot(stockQty, product.min_order)}></span>
              {stockLabel(stockQty, product.min_order)}
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
              inStock={stockQty >= minOrder}
              sku={product.sku}
              name={product.name}
              brand={product.brand}
              volume={product.volume}
              nl1={product.nl1}
              nl2={product.nl2}
              bc={product.bc}
              ac={product.ac}
              imgType={product.img_type}
            />

            <hr className="product-info__divider" />
            <div className="product-info__meta">
              <div className="product-info__meta-row">
                <span className="product-info__meta-label">Категорія:</span>
                <span className="product-info__meta-value">
                  <Link href="/catalog" style={{color:'var(--brand-main)'}}>{categoryName}</Link>
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
                <span className="product-info__meta-value">Нова Пошта</span>
              </div>
            </div>
          </div>
        </div>

        <ProductTabs
          description={product.description}
          characteristics={product.characteristics}
        />

        {/* Схожі товари */}
        {related.length > 0 && <RelatedCarousel products={related} retail={isRetail} />}

      </div>
      </div>

      <Footer />
    </>
  );
}
