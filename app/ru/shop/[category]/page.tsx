import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import Footer from '../../../components/Footer';
import ShopLoader from '../../../shop/ShopLoader';
import { getCategoriesCached, getProductsCached } from '../../../../lib/supabase';
import { getCategoryNameRu, getCategoryDescriptionRu } from '../../../../lib/ru';
import '../../../shop/shop.css';

const BASE = 'https://fixline.com.ua';

export const revalidate = 3600;

export async function generateMetadata(
  { params }: { params: Promise<{ category: string }> }
): Promise<Metadata> {
  const { category } = await params;
  const categories = await getCategoriesCached();
  const cat = categories.find(c => c.slug === category);

  if (!cat) return { robots: { index: false, follow: false } };

  const nameRu = getCategoryNameRu(cat.slug, cat.name);
  const description = getCategoryDescriptionRu(cat.slug, nameRu);

  return {
    title: `${nameRu} купить — цены, доставка по Украине | FIXLINE`,
    description,
    keywords: [nameRu, 'купить', 'оптом', 'строительная химия', 'Украина'],
    robots: { index: true, follow: true, googleBot: { index: true, follow: true } },
    alternates: {
      canonical: `${BASE}/ru/shop/${category}`,
      languages: {
        'uk': `${BASE}/shop/${category}`,
        'ru': `${BASE}/ru/shop/${category}`,
        'x-default': `${BASE}/shop/${category}`,
      },
    },
    openGraph: {
      title: `${nameRu} | FIXLINE`,
      description: `${nameRu} — купить оптом с доставкой по Украине.`,
      url: `${BASE}/ru/shop/${category}`,
      siteName: 'FIXLINE',
      locale: 'ru_RU',
      type: 'website',
    },
  };
}

export default async function RuShopCategoryPage({ params }: { params: Promise<{ category: string }> }) {
  const { category } = await params;
  const categories = await getCategoriesCached();
  const cat = categories.find(c => c.slug === category);

  if (!cat) notFound();

  const nameRu = getCategoryNameRu(cat.slug, cat.name);
  const parentCat = cat.parent_slug ? categories.find(c => c.slug === cat.parent_slug) : null;
  const parentNameRu = parentCat ? getCategoryNameRu(parentCat.slug, parentCat.name) : null;

  const breadcrumbItems = [
    { '@type': 'ListItem', position: 1, name: 'Главная', item: `${BASE}/ru` },
    { '@type': 'ListItem', position: 2, name: 'Магазин', item: `${BASE}/ru/shop` },
    ...(parentCat ? [{ '@type': 'ListItem', position: 3, name: parentNameRu ?? parentCat.name, item: `${BASE}/ru/shop/${parentCat.slug}` }] : []),
    { '@type': 'ListItem', position: parentCat ? 4 : 3, name: nameRu, item: `${BASE}/ru/shop/${category}` },
  ];
  const breadcrumbLd = { '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: breadcrumbItems };

  const itemListProducts = await getProductsCached({ category: cat.slug, limit: 10 });
  const itemListLd = itemListProducts.length > 0 ? {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: nameRu,
    url: `${BASE}/ru/shop/${category}`,
    numberOfItems: itemListProducts.length,
    itemListElement: itemListProducts.map((p, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      item: {
        '@type': 'Product',
        name: p.name,
        url: `${BASE}/ru/product/${p.sku}`,
        brand: { '@type': 'Brand', name: p.brand },
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
        <div style={{ margin: '0 auto', padding: '12px 16px 64px' }} className="mobile-pad">
          <nav aria-label="Breadcrumb" style={{ marginBottom: '6px', fontSize: '12px', color: '#94A3B8', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Link href="/ru" style={{ color: '#94A3B8', textDecoration: 'none' }}>Главная</Link>
            <span>/</span>
            <Link href="/ru/shop" style={{ color: '#94A3B8', textDecoration: 'none' }}>Магазин</Link>
            {parentCat && (
              <>
                <span>/</span>
                <Link href={`/ru/shop/${parentCat.slug}`} style={{ color: '#94A3B8', textDecoration: 'none' }}>{parentNameRu}</Link>
              </>
            )}
            <span>/</span>
            <span style={{ color: '#475569' }}>{nameRu}</span>
          </nav>
          <h1 style={{ fontSize: '18px', fontWeight: 800, color: 'var(--text-primary)', margin: '0 0 10px' }}>
            {nameRu}
          </h1>
          <ShopLoader initialCategory={category} />
        </div>
        <Footer />
      </div>
    </>
  );
}
