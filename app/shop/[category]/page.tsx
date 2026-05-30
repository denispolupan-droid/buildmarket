import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import Footer from '../../components/Footer';
import ShopLoader from '../ShopLoader';
import { getCategoriesCached, getProductsCached } from '../../../lib/supabase';
import { getCategoryMeta } from '../../../lib/category-descriptions';
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

  const meta = getCategoryMeta(category);
  const fallbackDesc = `Купити ${cat.name.toLowerCase()} в роздріб від 1 одиниці. Широкий асортимент, низькі ціни, швидка доставка по всій Україні. Купить ${cat.name.toLowerCase()} с доставкой по Украине.`;
  const description = meta?.description ?? fallbackDesc;

  return {
    title: `${cat.name} купити — ціни, доставка по Україні | FIXLINE`,
    description,
    keywords: [cat.name, 'купити', 'купить', 'будівельна хімія', 'строительная химия', 'Україна', 'Украина'],
    robots: { index: true, follow: true, googleBot: { index: true, follow: true } },
    alternates: {
      canonical: `${BASE}/shop/${category}`,
      languages: { 'uk': `${BASE}/shop/${category}`, 'ru': `${BASE}/shop/${category}`, 'x-default': `${BASE}/shop/${category}` },
    },
    openGraph: {
      title: `${cat.name} | Магазин FIXLINE`,
      description: `${cat.name} — купити від 1 шт з доставкою по Україні.`,
      url: `${BASE}/shop/${category}`,
      siteName: 'FIXLINE',
      locale: 'uk_UA',
      type: 'website',
    },
  };
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

  const itemListProducts = await getProductsCached({ category: cat.slug, limit: 10 });
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
        name: p.name,
        url: `${BASE}/product/${p.sku}`,
        ...(p.image ? { image: `${BASE}${p.image.startsWith('/') ? '' : '/'}${p.image}` } : {}),
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
            <span style={{ color: '#475569' }}>{cat.name}</span>
          </nav>
          <h1 style={{ fontSize: '24px', fontWeight: 800, color: 'var(--text-primary)', margin: '0 0 24px' }}>
            {cat.name}
          </h1>
          <ShopLoader initialCategory={category} />
          {meta && (
            <div style={{ marginTop: '32px', padding: '16px 20px', borderRadius: '10px', border: '1px solid var(--border)', background: 'var(--bg-card)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px', marginBottom: '8px' }}>
                <p style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary)', margin: 0 }}>
                  Про категорію «{cat.name}»
                </p>
                {meta.blogSlug && (
                  <Link href={`/blog/${meta.blogSlug}`} style={{ fontSize: '12px', color: '#4880B8', fontWeight: 600, whiteSpace: 'nowrap', textDecoration: 'none' }}>
                    Читати статтю →
                  </Link>
                )}
              </div>
              <p style={{ fontSize: '14px', color: 'var(--text-secondary)', lineHeight: 1.7, margin: 0 }}>
                {meta.description}
              </p>
              {meta.seoText && (
                <p style={{ fontSize: '13px', color: 'var(--text-muted)', lineHeight: 1.7, margin: '8px 0 0' }}>
                  {meta.seoText}
                </p>
              )}
              {meta.faq && meta.faq.length > 0 && (
                <div style={{ marginTop: '16px', borderTop: '1px solid var(--border)', paddingTop: '16px' }}>
                  <p style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-muted)', margin: '0 0 12px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    Часті запитання
                  </p>
                  {meta.faq.map((item, i) => (
                    <div key={i} style={{ marginBottom: i < meta.faq!.length - 1 ? '12px' : 0 }}>
                      <p style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)', margin: '0 0 4px' }}>
                        {item.q}
                      </p>
                      <p style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.65, margin: 0 }}>
                        {item.a}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
      <Footer />
    </>
  );
}
