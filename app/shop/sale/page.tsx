import type { Metadata } from 'next';
import Link from 'next/link';
import Footer from '../../components/Footer';
import ShopLoader from '../ShopLoader';
import '../shop.css';

const BASE = 'https://fixline.com.ua';

export const metadata: Metadata = {
  title: 'Акційні товари — будівельна хімія зі знижкою | FIXLINE',
  description: 'Акції на герметики, монтажні піни, клеї, ґрунтовки та інші будівельні матеріали. Купити зі знижкою від 1 одиниці з доставкою по всій Україні.',
  keywords: ['акційні товари', 'будівельна хімія знижки', 'герметики акція', 'розпродаж будматеріали', 'акционные товары', 'строительная химия скидки', 'распродажа', 'купити зі знижкою'],
  robots: { index: true, follow: true, googleBot: { index: true, follow: true } },
  alternates: {
    canonical: `${BASE}/shop/sale`,
    languages: { 'uk': `${BASE}/shop/sale`, 'ru': `${BASE}/ru/shop/sale`, 'x-default': `${BASE}/shop/sale` },
  },
  openGraph: {
    title: 'Акційні товари | Магазин FIXLINE',
    description: 'Будівельна хімія зі знижками — від 1 одиниці з доставкою по Україні.',
    url: `${BASE}/shop/sale`,
    siteName: 'FIXLINE',
    locale: 'uk_UA',
    type: 'website',
  },
};

export default function ShopSalePage() {
  const breadcrumbLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Головна', item: BASE },
      { '@type': 'ListItem', position: 2, name: 'Магазин', item: `${BASE}/shop` },
      { '@type': 'ListItem', position: 3, name: 'Акції', item: `${BASE}/shop/sale` },
    ],
  };

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbLd) }} />
      <div style={{ background: 'var(--bg-soft)', minHeight: '100vh' }}>
        <div style={{ margin: '0 auto', padding: '24px 16px 64px' }} className="mobile-pad">
          <nav aria-label="Breadcrumb" style={{ marginBottom: '24px', fontSize: '13px', color: '#94A3B8', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Link href="/" style={{ color: '#94A3B8', textDecoration: 'none' }}>Головна</Link>
            <span>/</span>
            <Link href="/shop" style={{ color: '#94A3B8', textDecoration: 'none' }}>Магазин</Link>
            <span>/</span>
            <span style={{ color: '#475569' }}>Акції</span>
          </nav>
          <h1 style={{ fontSize: '24px', fontWeight: 800, color: 'var(--text-primary)', margin: '0 0 8px' }}>
            🔥 Акційні товари
          </h1>
          <p style={{ fontSize: '14px', color: 'var(--text-secondary)', margin: '0 0 24px' }}>
            Будівельна хімія зі знижкою — від 1 одиниці, доставка по всій Україні.
          </p>
          <ShopLoader initialSaleOnly={true} />
        </div>
      </div>
      <Footer />
    </>
  );
}
