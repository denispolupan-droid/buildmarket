import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import Footer from '../../../components/Footer';
import ShopLoader from '../../ShopLoader';
import { getCategoriesCached, getProductsCached } from '../../../../lib/supabase';
import '../../shop.css';

const BASE = 'https://fixline.com.ua';

export const revalidate = 3600;

function brandToSlug(brand: string): string {
  return brand.trim().toLowerCase().replace(/\s+/g, '-');
}

async function resolveParams(categorySlug: string, brandSlug: string) {
  const [categories, products] = await Promise.all([
    getCategoriesCached(),
    getProductsCached(),
  ]);

  const cat = categories.find(c => c.slug === categorySlug);
  if (!cat) return null;

  const brandName = products.find(
    p => p.category_slug === categorySlug && brandToSlug(p.brand?.trim() ?? '') === brandSlug
  )?.brand?.trim();
  if (!brandName) return null;

  const count = products.filter(
    p => p.category_slug === categorySlug && brandToSlug(p.brand?.trim() ?? '') === brandSlug
  ).length;

  if (count < 5) return null;

  const parentCat = cat.parent_slug ? categories.find(c => c.slug === cat.parent_slug) ?? null : null;

  return { cat, brandName, count, parentCat, products };
}

export async function generateStaticParams() {
  const products = await getProductsCached();

  const counts = new Map<string, number>();
  for (const p of products) {
    const b = p.brand?.trim();
    if (!b || !p.category_slug) continue;
    const key = `${p.category_slug}::${b}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  const params: { category: string; brand: string }[] = [];
  for (const [key, count] of counts) {
    if (count < 5) continue;
    const sep = key.indexOf('::');
    const category = key.slice(0, sep);
    const brandName = key.slice(sep + 2);
    params.push({ category, brand: brandToSlug(brandName) });
  }
  return params;
}

export async function generateMetadata(
  { params }: { params: Promise<{ category: string; brand: string }> }
): Promise<Metadata> {
  const { category, brand: brandSlug } = await params;
  const resolved = await resolveParams(category, brandSlug);

  if (!resolved) return { robots: { index: false, follow: false } };
  const { cat, brandName, count } = resolved;

  return {
    title: `${brandName} ${cat.name.toLowerCase()} купити — ціни`,
    description: `${brandName} ${cat.name.toLowerCase()} — ${count} товарів в наявності. Вигідні ціни, доставка Новою Поштою по всій Україні. Купити ${brandName} ${cat.name.toLowerCase()} від 1 шт.`,
    keywords: [brandName, cat.name, 'купити', 'ціни', 'Україна'],
    robots: { index: true, follow: true, googleBot: { index: true, follow: true } },
    alternates: {
      canonical: `${BASE}/shop/${category}/${brandSlug}`,
      languages: { 'uk': `${BASE}/shop/${category}/${brandSlug}`, 'ru': `${BASE}/ru/shop/${category}/${brandSlug}`, 'x-default': `${BASE}/shop/${category}/${brandSlug}` },
    },
    openGraph: {
      title: `${brandName} ${cat.name} | FIXLINE`,
      description: `${brandName} ${cat.name.toLowerCase()} — купити від 1 шт з доставкою по Україні.`,
      url: `${BASE}/shop/${category}/${brandSlug}`,
      siteName: 'FIXLINE',
      locale: 'uk_UA',
      type: 'website',
    },
  };
}

export default async function ShopCategoryBrandPage(
  { params }: { params: Promise<{ category: string; brand: string }> }
) {
  const { category, brand: brandSlug } = await params;
  const resolved = await resolveParams(category, brandSlug);

  if (!resolved) notFound();
  const { cat, brandName, count, parentCat, products } = resolved;

  const breadcrumbLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Головна', item: BASE },
      { '@type': 'ListItem', position: 2, name: 'Магазин', item: `${BASE}/shop` },
      ...(parentCat ? [{ '@type': 'ListItem', position: 3, name: parentCat.name, item: `${BASE}/shop/${parentCat.slug}` }] : []),
      { '@type': 'ListItem', position: parentCat ? 4 : 3, name: cat.name, item: `${BASE}/shop/${category}` },
      { '@type': 'ListItem', position: parentCat ? 5 : 4, name: brandName, item: `${BASE}/shop/${category}/${brandSlug}` },
    ],
  };

  const pageProducts = products
    .filter(p => p.category_slug === category && brandToSlug(p.brand?.trim() ?? '') === brandSlug)
    .slice(0, 10);

  const itemListLd = {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: `${brandName} ${cat.name}`,
    url: `${BASE}/shop/${category}/${brandSlug}`,
    numberOfItems: pageProducts.length,
    itemListElement: pageProducts.map((p, i) => ({
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
  };

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(itemListLd) }} />
      <div style={{ background: 'var(--bg-soft)', minHeight: '100vh' }}>
        <div style={{ margin: '0 auto', padding: '24px 16px 64px' }} className="mobile-pad">
          <nav aria-label="Breadcrumb" style={{ marginBottom: '24px', fontSize: '13px', color: '#94A3B8', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Link href="/" style={{ color: '#94A3B8', textDecoration: 'none' }}>Головна</Link>
            <span>/</span>
            <Link href="/shop" style={{ color: '#94A3B8', textDecoration: 'none' }}>Магазин</Link>
            {parentCat && (
              <>
                <span>/</span>
                <Link href={`/shop/${parentCat.slug}`} style={{ color: '#94A3B8', textDecoration: 'none' }}>{parentCat.name}</Link>
              </>
            )}
            <span>/</span>
            <Link href={`/shop/${category}`} style={{ color: '#94A3B8', textDecoration: 'none' }}>{cat.name}</Link>
            <span>/</span>
            <span style={{ color: '#475569' }}>{brandName}</span>
          </nav>

          <h1 style={{ fontSize: '24px', fontWeight: 800, color: 'var(--text-primary)', margin: '0 0 8px' }}>
            {brandName} — {cat.name.toLowerCase()}
          </h1>
          <p style={{ fontSize: '14px', color: 'var(--text-secondary)', margin: '0 0 24px', lineHeight: 1.6 }}>
            {count} товарів бренду {brandName} в категорії «{cat.name}». Вигідні ціни, доставка Новою Поштою по всій Україні.
          </p>

          <ShopLoader initialCategory={category} initialBrand={brandName} />
        </div>
      </div>
      <Footer />
    </>
  );
}
