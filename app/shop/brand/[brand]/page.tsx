import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import Footer from '../../../components/Footer';
import ShopLoader from '../../ShopLoader';
import { getBrandsCached, getProductsCached } from '../../../../lib/supabase';
import '../../shop.css';

const BASE = 'https://fixline.com.ua';

export const revalidate = 3600;

function brandToSlug(brand: string): string {
  return brand.trim().toLowerCase().replace(/\s+/g, '-');
}

function findBrandBySlug(slug: string, brands: string[]): string | undefined {
  return brands.find(b => brandToSlug(b) === slug);
}

export async function generateMetadata(
  { params }: { params: Promise<{ brand: string }> }
): Promise<Metadata> {
  const { brand: slug } = await params;
  const brands = await getBrandsCached();
  const brand = findBrandBySlug(slug, brands);

  if (!brand) return { robots: { index: false, follow: false } };

  const allProducts = await getProductsCached();
  const brandProductCount = allProducts.filter(
    p => p.brand.trim().toLowerCase() === brand.trim().toLowerCase()
  ).length;

  if (brandProductCount < 5) return { robots: { index: false, follow: true } };

  return {
    title: `${brand} купити в Україні — вигідні ціни`,
    description: `Купити ${brand} в роздріб та оптом. Широкий асортимент, вигідні ціни, доставка по всій Україні. Купить ${brand} с доставкой по Украине.`,
    keywords: [brand, 'купити', 'купить', 'будівельна хімія', 'Україна', 'оптом'],
    robots: { index: true, follow: true, googleBot: { index: true, follow: true } },
    alternates: {
      canonical: `${BASE}/shop/brand/${slug}`,
      languages: { 'uk': `${BASE}/shop/brand/${slug}`, 'ru': `${BASE}/ru/shop/brand/${slug}`, 'x-default': `${BASE}/shop/brand/${slug}` },
    },
    openGraph: {
      title: `${brand} | Магазин FIXLINE`,
      description: `${brand} — купити від 1 шт з доставкою по Україні. Широкий асортимент, доставка по всій Україні.`,
      url: `${BASE}/shop/brand/${slug}`,
      siteName: 'FIXLINE',
      locale: 'uk_UA',
      type: 'website',
    },
  };
}

export default async function ShopBrandPage({ params }: { params: Promise<{ brand: string }> }) {
  const { brand: slug } = await params;
  const [brands, allProducts] = await Promise.all([
    getBrandsCached(),
    getProductsCached(),
  ]);
  const brand = findBrandBySlug(slug, brands);

  if (!brand) notFound();

  const brandProducts = allProducts
    .filter(p => p.brand.trim().toLowerCase() === brand.trim().toLowerCase())
    .slice(0, 10);

  const breadcrumbLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Головна', item: BASE },
      { '@type': 'ListItem', position: 2, name: 'Магазин', item: `${BASE}/shop` },
      { '@type': 'ListItem', position: 3, name: brand, item: `${BASE}/shop/brand/${slug}` },
    ],
  };

  const itemListLd = brandProducts.length > 0 ? {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: `${brand} — каталог товарів`,
    url: `${BASE}/shop/brand/${slug}`,
    numberOfItems: brandProducts.length,
    itemListElement: brandProducts.map((p, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      item: {
        '@type': 'Product',
        name: p.name,
        url: `${BASE}/product/${p.sku}`,
        brand: { '@type': 'Brand', name: p.brand },
        ...(p.image ? { image: `${BASE}${p.image.startsWith('/') ? '' : '/'}${p.image}` } : {}),
        ...(p.stock ? {
          offers: {
            '@type': 'Offer',
            price: p.stock.price_unit,
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
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbLd) }} />
      {itemListLd && <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(itemListLd) }} />}
      <div style={{ background: 'var(--bg-soft)', minHeight: '100vh' }}>
        <div style={{ margin: '0 auto', padding: '24px 16px 64px' }} className="mobile-pad">
          <nav aria-label="Breadcrumb" style={{ marginBottom: '24px', fontSize: '13px', color: '#94A3B8', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Link href="/" style={{ color: '#94A3B8', textDecoration: 'none' }}>Головна</Link>
            <span>/</span>
            <Link href="/shop" style={{ color: '#94A3B8', textDecoration: 'none' }}>Магазин</Link>
            <span>/</span>
            <span style={{ color: '#475569' }}>{brand}</span>
          </nav>
          <h1 style={{ fontSize: '24px', fontWeight: 800, color: 'var(--text-primary)', margin: '0 0 8px' }}>
            {brand} — купити в Україні
          </h1>
          <p style={{ fontSize: '14px', color: 'var(--text-secondary)', margin: '0 0 24px', lineHeight: 1.6 }}>
            Широкий асортимент продукції {brand} за вигідними цінами. Оптові та роздрібні умови, швидка доставка Новою Поштою по всій Україні.
          </p>
          <ShopLoader initialBrand={brand} />
        </div>
      </div>
      <Footer />
    </>
  );
}
