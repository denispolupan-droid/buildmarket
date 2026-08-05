import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Footer from '../../../components/Footer';
import ShopLoader from '../../../shop/ShopLoader';
import AllProductsLinks from '../../../shop/AllProductsLinks';
import HideOnCategorySwitch from '../../../components/HideOnCategorySwitch';
import CategoryHeader from '../../../components/CategoryHeader';
import CategoryAbout from '../../../components/CategoryAbout';
import { getCategoriesCached, getProductsCached } from '../../../../lib/supabase';
import { getCategoryNameRu, getCategoryDescriptionRu } from '../../../../lib/ru';
import { getCategoryMetaRu } from '../../../../lib/category-descriptions-ru';
import { categoryMeta, listingStats, productDisplayName, retailPrice, categoryFamilySlugs, duplicateOfParent, categoriesWithProducts } from '../../../../lib/seo/meta';
import '../../../shop/shop.css';

const BASE = 'https://fixline.com.ua';

export const revalidate = 3600;

/** Пререндер листингів — див. коментар в українській версії сторінки. */
export async function generateStaticParams() {
  const [categories, products] = await Promise.all([getCategoriesCached(), getProductsCached()]);
  return [...categoriesWithProducts(categories, products)].map(category => ({ category }));
}

export async function generateMetadata(
  { params }: { params: Promise<{ category: string }> }
): Promise<Metadata> {
  const { category } = await params;
  const categories = await getCategoriesCached();
  const cat = categories.find(c => c.slug === category);

  if (!cat) return { robots: { index: false, follow: false }, alternates: { canonical: null } };

  const nameRu = getCategoryNameRu(cat.slug, cat.name);
  const family = new Set(categoryFamilySlugs(categories, category));
  const products = (await getProductsCached()).filter(p => p.category_slug && family.has(p.category_slug));

  // Порожню категорію не індексуємо — див. коментар в українській версії сторінки.
  const meta = categoryMeta(cat, listingStats(products), 'ru', {
    nameRu,
    curatedDescription: getCategoryDescriptionRu(cat.slug, nameRu) ?? null,
    canonicalSlug: duplicateOfParent(categories, await getProductsCached(), category) ?? undefined,
  });
  if (products.length === 0) return { ...meta, robots: { index: false, follow: true } };
  return meta;
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

  const meta = getCategoryMetaRu(cat.slug);

  const family = new Set(categoryFamilySlugs(categories, cat.slug));
  const allCategoryProducts = (await getProductsCached()).filter(p => p.category_slug && family.has(p.category_slug));
  const itemListProducts = allCategoryProducts.slice(0, 10);
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
        name: productDisplayName(p, 'ru'),
        url: `${BASE}/ru/product/${p.slug ?? p.sku}`,
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
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbLd).replace(/</g, '\\u003c') }} />
      {itemListLd && <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(itemListLd).replace(/</g, '\\u003c') }} />}
      {faqLd && <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqLd).replace(/</g, '\\u003c') }} />}
      <div style={{ background: 'var(--bg-soft)', minHeight: '100vh' }}>
        <CategoryHeader
          lang="ru"
          name={nameRu}
          parent={parentCat ? { name: parentNameRu ?? parentCat.name, slug: parentCat.slug } : null}
          description={meta?.description ?? null}
          count={allCategoryProducts.length}
        />
        <div style={{ margin: '0 auto', padding: '16px 16px 64px' }} className="mobile-pad">
          <ShopLoader initialCategory={category} hideCategoryInfo />
          <HideOnCategorySwitch><AllProductsLinks products={allCategoryProducts} lang="ru" /></HideOnCategorySwitch>
          {meta && <CategoryAbout lang="ru" name={nameRu} meta={meta} />}
        </div>
        <Footer />
      </div>
    </>
  );
}
