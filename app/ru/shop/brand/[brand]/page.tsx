import type { Metadata } from 'next';
import { notFound, permanentRedirect } from 'next/navigation';
import Link from 'next/link';
import Footer from '../../../../components/Footer';
import ShopLoader from '../../../../shop/ShopLoader';
import '../../../../shop/shop.css';
import { getBrandsCached, getProductsCached } from '../../../../../lib/supabase';
import { brandMeta, listingStats, productDisplayName, retailPrice } from '../../../../../lib/seo/meta';
import { brandSlug, legacyBrandSlug } from '../../../../../lib/seo/slug';
import AllProductsLinks from '../../../../shop/AllProductsLinks';

const BASE = 'https://fixline.com.ua';

export const revalidate = 3600;

// ISR у динамічного сегмента вмикається лише за наявності generateStaticParams
// (див. /shop/[category]): без неї маршрут лишався ƒ і віддавався з no-store
// попри revalidate — 0,9 с TTFB і ~2 МБ на кожен запит. Параметри — бренди з
// 5+ товарами, як у sitemap; решта рендериться on-demand і теж кешується.
export async function generateStaticParams() {
  const products = await getProductsCached();
  const counts = new Map<string, number>();
  for (const p of products) {
    const b = p.brand?.trim();
    if (b) counts.set(b, (counts.get(b) ?? 0) + 1);
  }
  return [...counts].filter(([, n]) => n >= 5).map(([b]) => ({ brand: brandSlug(b) }));
}

function findBrandBySlug(slug: string, brands: string[]): string | undefined {
  return brands.find(b => brandSlug(b) === slug);
}

// Стара кирилична адреса (/shop/brand/сталь) — 308 на транслітерований слаг:
// 12 таких URL лежали в sitemap і в індексі, хоч і віддавали 404. Викликається
// і з generateMetadata (до старту стрімінгу, щоб редірект був справжнім 308),
// і зі сторінки.
function legacyBrandRedirect(slug: string, brands: string[]): void {
  let decoded = slug;
  try { decoded = decodeURIComponent(slug); } catch { /* сирий не-UTF8 — лишаємо як є */ }
  const brand = brands.find(b => legacyBrandSlug(b) === decoded.toLowerCase());
  if (brand) permanentRedirect(`/ru/shop/brand/${brandSlug(brand)}`);
}

export async function generateMetadata(
  { params }: { params: Promise<{ brand: string }> }
): Promise<Metadata> {
  const { brand: slug } = await params;
  const brands = await getBrandsCached();
  const brand = findBrandBySlug(slug, brands);

  if (!brand) {
    legacyBrandRedirect(slug, brands);
    return { robots: { index: false, follow: false }, alternates: { canonical: null } };
  }

  const allProducts = await getProductsCached();
  const brandProducts = allProducts.filter(
    p => p.brand.trim().toLowerCase() === brand.trim().toLowerCase()
  );

  if (brandProducts.length < 5) return { robots: { index: false, follow: true } };

  return brandMeta(brand, slug, listingStats(brandProducts), 'ru');
}

export default async function ShopBrandRuPage({ params }: { params: Promise<{ brand: string }> }) {
  const { brand: slug } = await params;
  const [brands, allProducts] = await Promise.all([
    getBrandsCached(),
    getProductsCached(),
  ]);
  const brand = findBrandBySlug(slug, brands);

  if (!brand) {
    legacyBrandRedirect(slug, brands);
    notFound();
  }

  const allBrandProducts = allProducts
    .filter(p => p.brand.trim().toLowerCase() === brand.trim().toLowerCase());
  const brandProducts = allBrandProducts.slice(0, 10);

  const breadcrumbLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Главная', item: `${BASE}/ru` },
      { '@type': 'ListItem', position: 2, name: 'Магазин', item: `${BASE}/ru/shop` },
      { '@type': 'ListItem', position: 3, name: brand, item: `${BASE}/ru/shop/brand/${slug}` },
    ],
  };

  const itemListLd = brandProducts.length > 0 ? {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: `${brand} — каталог товаров`,
    url: `${BASE}/ru/shop/brand/${slug}`,
    numberOfItems: allBrandProducts.length,
    itemListElement: brandProducts.map((p, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      item: {
        '@type': 'Product',
        name: productDisplayName(p, 'ru'),
        url: `${BASE}/ru/product/${p.slug ?? p.sku}`,
        brand: { '@type': 'Brand', name: p.brand },
        ...(p.image ? { image: `${BASE}${p.image.startsWith('/') ? '' : '/'}${p.image}` } : {}),
        ...(p.stock && retailPrice(p) ? {
          offers: {
            '@type': 'Offer',
            price: retailPrice(p),
            priceCurrency: 'UAH',
            availability: p.stock.stock_status === 'in_stock'
              ? 'https://schema.org/InStock'
              : 'https://schema.org/OutOfStock',
          },
        } : {}),
      },
    })),
  } : null;

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbLd).replace(/</g, '\\u003c') }} />
      {itemListLd && <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(itemListLd).replace(/</g, '\\u003c') }} />}
      <div style={{ background: 'var(--bg-soft)', minHeight: '100vh' }}>
        <div style={{ margin: '0 auto', padding: '24px 16px 64px' }} className="mobile-pad">
          <nav aria-label="Breadcrumb" style={{ marginBottom: '24px', fontSize: '13px', color: '#94A3B8', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Link href="/ru" style={{ color: '#94A3B8', textDecoration: 'none' }}>Главная</Link>
            <span>/</span>
            <Link href="/ru/shop" style={{ color: '#94A3B8', textDecoration: 'none' }}>Магазин</Link>
            <span>/</span>
            <span style={{ color: '#475569' }}>{brand}</span>
          </nav>
          <h1 style={{ fontSize: '24px', fontWeight: 800, color: 'var(--text-primary)', margin: '0 0 8px' }}>
            {brand} — купить на Украине
          </h1>
          <p style={{ fontSize: '14px', color: 'var(--text-secondary)', margin: '0 0 24px', lineHeight: 1.6 }}>
            Широкий ассортимент продукции {brand} по выгодным ценам. Оптовые и розничные условия, быстрая доставка Новой Почтой или в точки выдачи ROZETKA по всей Украине.
          </p>
          <ShopLoader initialBrand={brand} />
          <AllProductsLinks products={allBrandProducts} lang="ru" />
        </div>
      </div>
      <Footer />
    </>
  );
}
