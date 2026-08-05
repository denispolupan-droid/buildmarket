import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Footer from '../../components/Footer';
import ShopLoader from '../ShopLoader';
import AllProductsLinks from '../AllProductsLinks';
import HideOnCategorySwitch from '../../components/HideOnCategorySwitch';
import CategoryHeader from '../../components/CategoryHeader';
import CategoryAbout from '../../components/CategoryAbout';
import { getCategoriesCached, getProductsCached } from '../../../lib/supabase';
import { getCategoryMeta } from '../../../lib/category-descriptions';
import { categoryMeta, listingStats, productDisplayName, retailPrice, categoryFamilySlugs, duplicateOfParent, categoriesWithProducts } from '../../../lib/seo/meta';
import '../shop.css';

const BASE = 'https://fixline.com.ua';

export const revalidate = 3600;

/**
 * Без generateStaticParams маршрут із динамічним сегментом лишається `ƒ` —
 * SSR на кожен запит попри revalidate вище. Саме тому листинги віддавалися
 * з `no-store` і TTFB ~600 мс, тоді як сусідній [brand] (у якого ця функція є)
 * кешувався. Порожні категорії свідомо не пререндеримо: вони й так noindex,
 * а білд уже одного разу падав на пре-рендері сотень сторінок (див. next.config).
 * Набір той самий, що йде в sitemap, — розійтися вони не можуть.
 */
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

  // Товари прив'язані до підкатегорій — для батьківської категорії беремо всю родину
  const family = new Set(categoryFamilySlugs(categories, category));
  const products = (await getProductsCached()).filter(p => p.category_slug && family.has(p.category_slug));

  // Категорія без жодного активного товару — порожній листинг. Індексувати нема чого:
  // це тонка сторінка, яка тільки псує загальну оцінку розділу. follow лишаємо —
  // хай краулер іде далі по меню. Щойно товар з'явиться, індексація повернеться сама.
  if (products.length === 0) {
    return { ...categoryMeta(cat, listingStats(products), 'uk', { curatedDescription: getCategoryMeta(category)?.description ?? null }),
      robots: { index: false, follow: true } };
  }

  return categoryMeta(cat, listingStats(products), 'uk', {
    curatedDescription: getCategoryMeta(category)?.description ?? null,
    canonicalSlug: duplicateOfParent(categories, await getProductsCached(), category) ?? undefined,
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
        url: `${BASE}/product/${p.slug ?? p.sku}`,
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
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbLd).replace(/</g, '\\u003c') }} />
      {itemListLd && <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(itemListLd).replace(/</g, '\\u003c') }} />}
      {faqLd && <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqLd).replace(/</g, '\\u003c') }} />}
      <div style={{ background: 'var(--bg-soft)', minHeight: '100vh' }}>
        <CategoryHeader
          lang="uk"
          name={cat.name}
          parent={parentCat ? { name: parentCat.name, slug: parentCat.slug } : null}
          description={meta?.description ?? null}
          count={allCategoryProducts.length}
        />
        <div style={{ margin: '0 auto', padding: '16px 16px 64px' }} className="mobile-pad">
          <ShopLoader initialCategory={category} hideCategoryInfo />
          <HideOnCategorySwitch><AllProductsLinks products={allCategoryProducts} lang="uk" /></HideOnCategorySwitch>
          {meta && <CategoryAbout lang="uk" name={cat.name} meta={meta} />}
        </div>
      </div>
      <Footer />
    </>
  );
}
