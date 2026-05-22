import type { Metadata } from 'next';
import Link from 'next/link';
import Footer from '../components/Footer';
import ShopLoader from './ShopLoader';
import './shop.css';

const BASE = 'https://fixline.com.ua';

export async function generateMetadata(
  { searchParams }: { searchParams: Promise<{ sale?: string; brand?: string }> }
): Promise<Metadata> {
  const { sale, brand } = await searchParams;

  if (sale === '1') {
    return {
      title: 'Акційні товари — будівельна хімія зі знижкою | FIXLINE',
      description: 'Акції на герметики, монтажні піни, клеї та ґрунтовки. Купити зі знижкою від 1 одиниці з доставкою по Україні.',
      alternates: { canonical: `${BASE}/shop?sale=1`, languages: { 'uk': `${BASE}/shop?sale=1`, 'x-default': `${BASE}/shop?sale=1` } },
      openGraph: { title: 'Акційні товари | FIXLINE', url: `${BASE}/shop?sale=1`, locale: 'uk_UA', type: 'website' },
    };
  }

  if (brand) {
    return {
      title: `${brand} купити в Україні — офіційний постачальник | FIXLINE`,
      description: `Купити ${brand} в роздріб та оптом. Широкий асортимент, доставка по всій Україні. Від 1 одиниці.`,
      alternates: { canonical: `${BASE}/shop?brand=${encodeURIComponent(brand)}`, languages: { 'uk': `${BASE}/shop?brand=${encodeURIComponent(brand)}`, 'x-default': `${BASE}/shop?brand=${encodeURIComponent(brand)}` } },
      openGraph: { title: `${brand} | Магазин FIXLINE`, url: `${BASE}/shop?brand=${encodeURIComponent(brand)}`, locale: 'uk_UA', type: 'website' },
    };
  }

  return {
    title: 'Магазин — будівельна хімія в роздріб | FIXLINE',
    description: 'Купити будівельну хімію в роздріб: герметики, монтажні піни, клеї, ґрунтовки. Доставка по всій Україні. Купить строительную химию в розницу: герметики, монтажная пена, клеи.',
    keywords: ['магазин будівельної хімії', 'магазин строительной химии', 'герметики купити', 'герметики купить', 'монтажна піна', 'монтажная пена', 'клей будівельний', 'клей строительный', 'ґрунтовка', 'грунтовка'],
    robots: { index: true, follow: true, googleBot: { index: true, follow: true } },
    alternates: { canonical: `${BASE}/shop`, languages: { 'uk': `${BASE}/shop`, 'x-default': `${BASE}/shop` } },
    openGraph: {
      title: 'Магазин будівельної хімії | FIXLINE',
      description: 'Герметики, монтажні піни, клеї, ґрунтовки. Від 1 одиниці з доставкою по Україні.',
      url: `${BASE}/shop`, siteName: 'FIXLINE', locale: 'uk_UA', type: 'website',
    },
  };
}

export default async function ShopPage({ searchParams }: { searchParams: Promise<{ sale?: string; brand?: string }> }) {
  const { sale, brand } = await searchParams;

  const breadcrumbLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Головна', item: `${BASE}` },
      { '@type': 'ListItem', position: 2, name: 'Магазин', item: `${BASE}/shop` },
      ...(brand ? [{ '@type': 'ListItem', position: 3, name: brand, item: `${BASE}/shop?brand=${encodeURIComponent(brand)}` }] : []),
      ...(sale === '1' ? [{ '@type': 'ListItem', position: 3, name: 'Акції', item: `${BASE}/shop?sale=1` }] : []),
    ],
  };

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbLd) }} />
      <div style={{ background: 'var(--bg-soft)', minHeight: '100vh' }}>
        <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '32px 32px 64px 8px' }} className="mobile-pad">
          <nav aria-label="Breadcrumb" style={{ marginBottom: '24px', fontSize: '13px', color: '#94A3B8', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Link href="/" style={{ color: '#94A3B8', textDecoration: 'none' }}>Головна</Link>
            <span>/</span>
            <Link href="/shop" style={{ color: brand || sale ? '#94A3B8' : '#475569', textDecoration: 'none' }}>Магазин</Link>
            {brand && <><span>/</span><span style={{ color: '#475569' }}>{brand}</span></>}
            {sale === '1' && <><span>/</span><span style={{ color: '#475569' }}>Акції</span></>}
          </nav>
          <h1 style={{ fontSize: '24px', fontWeight: 800, color: 'var(--text-primary)', margin: '0 0 24px' }}>
            {brand ? `${brand} — каталог товарів` : sale === '1' ? 'Акційні товари' : 'Магазин будівельної хімії'}
          </h1>
          <ShopLoader initialSaleOnly={sale === '1'} initialBrand={brand} />
        </div>
      </div>
      <Footer />
    </>
  );
}
