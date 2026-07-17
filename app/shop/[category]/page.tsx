import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import Footer from '../../components/Footer';
import ShopLoader from '../ShopLoader';
import AllProductsLinks from '../AllProductsLinks';
import { getCategoriesCached, getProductsCached } from '../../../lib/supabase';
import { getCategoryMeta } from '../../../lib/category-descriptions';
import { categoryMeta, listingStats, productDisplayName, retailPrice, categoryFamilySlugs } from '../../../lib/seo/meta';
import '../shop.css';

const BASE = 'https://fixline.com.ua';

export const revalidate = 3600;

export async function generateMetadata(
  { params }: { params: Promise<{ category: string }> }
): Promise<Metadata> {
  const { category } = await params;
  const categories = await getCategoriesCached();
  const cat = categories.find(c => c.slug === category);

  if (!cat) return { robots: { index: false, follow: false } };

  // Товари прив'язані до підкатегорій — для батьківської категорії беремо всю родину
  const family = new Set(categoryFamilySlugs(categories, category));
  const products = (await getProductsCached()).filter(p => p.category_slug && family.has(p.category_slug));
  return categoryMeta(cat, listingStats(products), 'uk', {
    curatedDescription: getCategoryMeta(category)?.description ?? null,
  });
}

export default async function ShopCategoryPage({ params }: { params: Promise<{ category: string }> }) {
  const { category } = await params;
  const categories = await getCategoriesCached();
  const cat = categories.find(c => c.slug === category);

  if (!cat) notFound();

  const parentCat = cat.parent_slug ? categories.find(c => c.slug === cat.parent_slug) : null;

  const breadcrumbItems = [
    { '@type': 'ListItem', position: 1, name: 'Головна', item: BASE },
    { '@type': 'ListItem', position: 2, name: 'Магазин', item: `${BASE}/shop` },
    ...(parentCat ? [{ '@type': 'ListItem', position: 3, name: parentCat.name, item: `${BASE}/shop/${parentCat.slug}` }] : []),
    { '@type': 'ListItem', position: parentCat ? 4 : 3, name: cat.name, item: `${BASE}/shop/${category}` },
  ];
  const breadcrumbLd = { '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: breadcrumbItems };

  const family = new Set(categoryFamilySlugs(categories, cat.slug));
  const allCategoryProducts = (await getProductsCached()).filter(p => p.category_slug && family.has(p.category_slug));
  const itemListProducts = allCategoryProducts.slice(0, 10);
  const itemListLd = itemListProducts.length > 0 ? {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: cat.name,
    url: `${BASE}/shop/${category}`,
    numberOfItems: itemListProducts.length,
    itemListElement: itemListProducts.map((p, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      item: {
        '@type': 'Product',
        name: productDisplayName(p),
        url: `${BASE}/product/${p.sku}`,
        ...(p.image ? { image: `${BASE}${p.image.startsWith('/') ? '' : '/'}${p.image}` } : {}),
        brand: { '@type': 'Brand', name: p.brand },
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

  const meta = getCategoryMeta(cat.slug);
  const faqLd = meta?.faq?.length ? {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: meta.faq.map(({ q, a }) => ({
      '@type': 'Question',
      name: q,
      acceptedAnswer: { '@type': 'Answer', text: a },
    })),
  } : null;

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbLd) }} />
      {itemListLd && <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(itemListLd) }} />}
      {faqLd && <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqLd) }} />}
      <div style={{ background: 'var(--bg-soft)', minHeight: '100vh' }}>
        <div style={{ margin: '0 auto', padding: '12px 16px 64px' }} className="mobile-pad">
          <nav aria-label="Breadcrumb" style={{ marginBottom: '6px', fontSize: '12px', color: '#94A3B8', display: 'flex', alignItems: 'center', gap: '6px' }}>
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
            <span style={{ color: '#475569' }}>{cat.name}</span>
          </nav>
          <h1 style={{ fontSize: '18px', fontWeight: 800, color: 'var(--text-primary)', margin: '0 0 10px' }}>
            {cat.name}
          </h1>
          <ShopLoader initialCategory={category} />
          <AllProductsLinks products={allCategoryProducts} lang="uk" />
        </div>
      </div>
      <Footer />
    </>
  );
}
