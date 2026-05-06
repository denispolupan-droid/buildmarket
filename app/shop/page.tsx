import type { Metadata } from 'next';
import Link from 'next/link';
import Footer from '../components/Footer';
import ShopLoader from './ShopLoader';
import { getCategoriesCached } from '../../lib/supabase';
import { getCategoryMeta } from '../../lib/category-descriptions';
import './shop.css';

const BASE = 'https://fixline.com.ua';

export async function generateMetadata(
  { searchParams }: { searchParams: Promise<{ category?: string; sale?: string; brand?: string }> }
): Promise<Metadata> {
  const { category, sale, brand } = await searchParams;
  const categories = await getCategoriesCached();
  const cat = category ? categories.find(c => c.slug === category) : null;

  const canonicalParams = category ? `?category=${category}` : sale === '1' ? '?sale=1' : '';

  if (sale === '1') {
    return {
      title: 'Акційні товари — будівельна хімія зі знижкою | FIXLINE',
      description: 'Акції на герметики, монтажні піни, клеї та ґрунтовки. Купити зі знижкою від 1 одиниці з доставкою по Україні.',
      alternates: { canonical: `${BASE}/shop?sale=1` },
      openGraph: { title: 'Акційні товари | FIXLINE', url: `${BASE}/shop?sale=1`, locale: 'uk_UA', type: 'website' },
    };
  }

  if (brand) {
    return {
      title: `${brand} купити в Україні — офіційний постачальник | FIXLINE`,
      description: `Купити ${brand} в роздріб та оптом. Широкий асортимент, доставка по всій Україні. Від 1 одиниці.`,
      alternates: { canonical: `${BASE}/shop?brand=${encodeURIComponent(brand)}` },
      openGraph: { title: `${brand} | Магазин FIXLINE`, url: `${BASE}/shop?brand=${encodeURIComponent(brand)}`, locale: 'uk_UA', type: 'website' },
    };
  }

  if (cat) {
    return {
      title: `${cat.name} купити — ціни, доставка по Україні | FIXLINE`,
      description: `Купити ${cat.name.toLowerCase()} в роздріб від 1 одиниці. Широкий асортимент, низькі ціни, швидка доставка Новою Поштою по всій Україні.`,
      alternates: { canonical: `${BASE}/shop?category=${category}` },
      openGraph: {
        title: `${cat.name} | Магазин FIXLINE`,
        description: `${cat.name} — купити від 1 шт з доставкою по Україні.`,
        url: `${BASE}/shop?category=${category}`,
        siteName: 'FIXLINE', locale: 'uk_UA', type: 'website',
      },
    };
  }

  return {
    title: 'Магазин — будівельна хімія в роздріб | FIXLINE',
    description: 'Купити будівельну хімію в роздріб: герметики, монтажні піни, клеї, ґрунтовки. Доставка по всій Україні. Від 1 одиниці.',
    keywords: ['магазин будівельної хімії', 'герметики купити', 'монтажна піна', 'клей будівельний', 'ґрунтовка'],
    alternates: { canonical: `${BASE}/shop` },
    openGraph: {
      title: 'Магазин будівельної хімії | FIXLINE',
      description: 'Герметики, монтажні піни, клеї, ґрунтовки. Від 1 одиниці з доставкою по Україні.',
      url: `${BASE}/shop`, siteName: 'FIXLINE', locale: 'uk_UA', type: 'website',
    },
  };
}

export default async function ShopPage({ searchParams }: { searchParams: Promise<{ category?: string; sale?: string; brand?: string }> }) {
  const { category, sale, brand } = await searchParams;
  const categories = await getCategoriesCached();
  const cat = category ? categories.find(c => c.slug === category) : null;

  const breadcrumbItems = [
    { '@type': 'ListItem', position: 1, name: 'Головна', item: `${BASE}` },
    { '@type': 'ListItem', position: 2, name: 'Магазин', item: `${BASE}/shop` },
    ...(cat ? [{ '@type': 'ListItem', position: 3, name: cat.name, item: `${BASE}/shop?category=${category}` }] : []),
    ...(brand ? [{ '@type': 'ListItem', position: 3, name: brand, item: `${BASE}/shop?brand=${encodeURIComponent(brand)}` }] : []),
  ];
  const breadcrumbLd = { '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: breadcrumbItems };

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbLd) }} />
      <div style={{ background: 'var(--bg-soft)', minHeight: '100vh' }}>
        <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '32px 32px 64px 8px' }} className="mobile-pad">
          <nav aria-label="Breadcrumb" style={{ marginBottom: '24px', fontSize: '13px', color: '#94A3B8', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Link href="/" style={{ color: '#94A3B8', textDecoration: 'none' }}>Головна</Link>
            <span>/</span>
            <Link href="/shop" style={{ color: cat || brand || sale ? '#94A3B8' : '#475569', textDecoration: 'none' }}>Магазин</Link>
            {cat && <><span>/</span><span style={{ color: '#475569' }}>{cat.name}</span></>}
            {brand && <><span>/</span><span style={{ color: '#475569' }}>{brand}</span></>}
            {sale === '1' && <><span>/</span><span style={{ color: '#475569' }}>Акції</span></>}
          </nav>
          <ShopLoader initialCategory={category} initialSaleOnly={sale === '1'} initialBrand={brand} />
          {cat && (() => {
            const meta = getCategoryMeta(cat.slug);
            return meta ? (
              <details style={{ marginTop: '32px' }}>
                <summary style={{
                  fontSize: '13px', fontWeight: 600, color: 'var(--text-muted)',
                  cursor: 'pointer', userSelect: 'none', listStyle: 'none',
                  display: 'flex', alignItems: 'center', gap: '6px',
                  padding: '10px 0',
                }}>
                  <span>Про категорію «{cat.name}»</span>
                  <span style={{ fontSize: '11px' }}>▼</span>
                </summary>
                <div style={{ padding: '12px 0 0', borderTop: '1px solid var(--border)' }}>
                  <p style={{ fontSize: '14px', color: 'var(--text-secondary)', lineHeight: 1.7, margin: 0 }}>
                    {meta.description}
                  </p>
                  {meta.seoText && (
                    <p style={{ fontSize: '13px', color: 'var(--text-muted)', lineHeight: 1.7, margin: '8px 0 0' }}>
                      {meta.seoText}
                    </p>
                  )}
                </div>
              </details>
            ) : null;
          })()}
        </div>
      </div>
      <Footer />
    </>
  );
}
