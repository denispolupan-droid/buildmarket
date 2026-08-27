import type { Metadata } from 'next';
import Link from 'next/link';
import Footer from '../../../components/Footer';
import ShopLoader from '../../../shop/ShopLoader';
import '../../../shop/shop.css';

const BASE = 'https://fixline.com.ua';

export const metadata: Metadata = {
  title: 'Акционные товары — строительная химия со скидкой',
  description: 'Акции на герметики, монтажные пены, клеи, грунтовки и другие строительные материалы. Купить со скидкой от 1 единицы с доставкой по всей Украине.',
  keywords: ['акционные товары', 'строительная химия скидки', 'герметики акция', 'распродажа', 'купить со скидкой'],
  robots: { index: true, follow: true, googleBot: { index: true, follow: true } },
  alternates: {
    canonical: `${BASE}/ru/shop/sale`,
    languages: { 'uk': `${BASE}/shop/sale`, 'ru': `${BASE}/ru/shop/sale`, 'x-default': `${BASE}/shop/sale` },
  },
  openGraph: {
    title: 'Акционные товары | Магазин FIXLINE',
    description: 'Строительная химия со скидками — от 1 единицы с доставкой по Украине.',
    url: `${BASE}/ru/shop/sale`,
    siteName: 'FIXLINE',
    locale: 'ru_RU',
    type: 'website',
  },
};

export default function ShopSaleRuPage() {
  const breadcrumbLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Главная', item: `${BASE}/ru` },
      { '@type': 'ListItem', position: 2, name: 'Магазин', item: `${BASE}/ru/shop` },
      { '@type': 'ListItem', position: 3, name: 'Акции', item: `${BASE}/ru/shop/sale` },
    ],
  };

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbLd).replace(/</g, '\\u003c') }} />
      <div style={{ background: 'var(--bg-soft)', minHeight: '100vh' }}>
        <div style={{ margin: '0 auto', padding: '24px 16px 64px' }} className="mobile-pad">
          <nav aria-label="Breadcrumb" style={{ marginBottom: '24px', fontSize: '13px', color: '#94A3B8', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Link href="/ru" style={{ color: '#94A3B8', textDecoration: 'none' }}>Главная</Link>
            <span>/</span>
            <Link href="/ru/shop" style={{ color: '#94A3B8', textDecoration: 'none' }}>Магазин</Link>
            <span>/</span>
            <span style={{ color: '#475569' }}>Акции</span>
          </nav>
          <h1 style={{ fontSize: '24px', fontWeight: 800, color: 'var(--text-primary)', margin: '0 0 8px' }}>
            🔥 Акционные товары
          </h1>
          <p style={{ fontSize: '14px', color: 'var(--text-secondary)', margin: '0 0 24px' }}>
            Строительная химия со скидкой — от 1 единицы, доставка по всей Украине.
          </p>
          <ShopLoader lang="ru" initialSaleOnly={true} />
        </div>
      </div>
      <Footer />
    </>
  );
}
