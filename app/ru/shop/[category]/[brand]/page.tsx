import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import Footer from '../../../../components/Footer';
import ShopLoader from '../../../../shop/ShopLoader';
import '../../../../shop/shop.css';
import { getCategoriesCached, getProductsCached } from '../../../../../lib/supabase';
import { getCategoryNameRu } from '../../../../../lib/ru';
import { categoryBrandMeta, listingStats, productDisplayName, retailPrice } from '../../../../../lib/seo/meta';
import AllProductsLinks from '../../../../shop/AllProductsLinks';

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
  const { cat, brandName, products } = resolved;

  const catNameRu = getCategoryNameRu(cat.slug, cat.name);
  const brandProducts = products.filter(
    p => p.category_slug === category && brandToSlug(p.brand?.trim() ?? '') === brandSlug
  );
  return categoryBrandMeta(cat, brandName, brandSlug, listingStats(brandProducts), 'ru', { nameRu: catNameRu });
}

export default async function ShopCategoryBrandRuPage(
  { params }: { params: Promise<{ category: string; brand: string }> }
) {
  const { category, brand: brandSlug } = await params;
  const resolved = await resolveParams(category, brandSlug);

  if (!resolved) notFound();
  const { cat, brandName, count, parentCat, products } = resolved;

  const catNameRu = getCategoryNameRu(cat.slug, cat.name);
  const parentCatNameRu = parentCat ? getCategoryNameRu(parentCat.slug, parentCat.name) : null;

  const breadcrumbLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Главная', item: `${BASE}/ru` },
      { '@type': 'ListItem', position: 2, name: 'Магазин', item: `${BASE}/ru/shop` },
      ...(parentCat ? [{ '@type': 'ListItem', position: 3, name: parentCatNameRu ?? parentCat.name, item: `${BASE}/ru/shop/${parentCat.slug}` }] : []),
      { '@type': 'ListItem', position: parentCat ? 4 : 3, name: catNameRu, item: `${BASE}/ru/shop/${category}` },
      { '@type': 'ListItem', position: parentCat ? 5 : 4, name: brandName, item: `${BASE}/ru/shop/${category}/${brandSlug}` },
    ],
  };

  const allPageProducts = products
    .filter(p => p.category_slug === category && brandToSlug(p.brand?.trim() ?? '') === brandSlug);
  const pageProducts = allPageProducts.slice(0, 10);

  const itemListLd = {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: `${brandName} ${catNameRu}`,
    url: `${BASE}/ru/shop/${category}/${brandSlug}`,
    numberOfItems: pageProducts.length,
    itemListElement: pageProducts.map((p, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      item: {
        '@type': 'Product',
        name: productDisplayName(p, 'ru'),
        url: `${BASE}/ru/product/${p.sku}`,
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
  };

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(itemListLd) }} />
      <div style={{ background: 'var(--bg-soft)', minHeight: '100vh' }}>
        <div style={{ margin: '0 auto', padding: '24px 16px 64px' }} className="mobile-pad">
          <nav aria-label="Breadcrumb" style={{ marginBottom: '24px', fontSize: '13px', color: '#94A3B8', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Link href="/ru" style={{ color: '#94A3B8', textDecoration: 'none' }}>Главная</Link>
            <span>/</span>
            <Link href="/ru/shop" style={{ color: '#94A3B8', textDecoration: 'none' }}>Магазин</Link>
            {parentCat && (
              <>
                <span>/</span>
                <Link href={`/ru/shop/${parentCat.slug}`} style={{ color: '#94A3B8', textDecoration: 'none' }}>{parentCatNameRu ?? parentCat.name}</Link>
              </>
            )}
            <span>/</span>
            <Link href={`/ru/shop/${category}`} style={{ color: '#94A3B8', textDecoration: 'none' }}>{catNameRu}</Link>
            <span>/</span>
            <span style={{ color: '#475569' }}>{brandName}</span>
          </nav>

          <h1 style={{ fontSize: '24px', fontWeight: 800, color: 'var(--text-primary)', margin: '0 0 8px' }}>
            {brandName} — {catNameRu.toLowerCase()}
          </h1>
          <p style={{ fontSize: '14px', color: 'var(--text-secondary)', margin: '0 0 24px', lineHeight: 1.6 }}>
            {count} товаров бренда {brandName} в категории «{catNameRu}». Выгодные цены, доставка Новой Почтой по всей Украине.
          </p>

          <ShopLoader initialCategory={category} initialBrand={brandName} />
          <AllProductsLinks products={allPageProducts} lang="ru" />
        </div>
      </div>
      <Footer />
    </>
  );
}
