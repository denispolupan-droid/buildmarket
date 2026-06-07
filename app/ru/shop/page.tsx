import type { Metadata } from 'next';
import Link from 'next/link';
import Footer from '../../components/Footer';
import ShopLoader from '../../shop/ShopLoader';
import '../../shop/shop.css';

const BASE = 'https://fixline.com.ua';

export const revalidate = 3600;

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: 'Магазин — строительная химия в розницу | FIXLINE',
    description: 'Купить строительную химию в розницу: герметики, монтажная пена, клеи, грунтовки. Доставка по всей Украине от 1 единицы.',
    keywords: ['строительная химия', 'купить', 'герметики купить', 'монтажная пена', 'клей строительный', 'грунтовка', 'доставка по Украине'],
    robots: { index: true, follow: true },
    alternates: {
      canonical: `${BASE}/ru/shop`,
      languages: {
        'uk': `${BASE}/shop`,
        'ru': `${BASE}/ru/shop`,
        'x-default': `${BASE}/shop`,
      },
    },
    openGraph: {
      title: 'Магазин строительной химии | FIXLINE',
      description: 'Герметики, монтажная пена, клеи, грунтовки. От 1 единицы с доставкой по Украине.',
      url: `${BASE}/ru/shop`,
      siteName: 'FIXLINE',
      locale: 'ru_RU',
      type: 'website',
    },
  };
}

export default function RuShopPage() {
  const breadcrumbLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Главная', item: `${BASE}/ru` },
      { '@type': 'ListItem', position: 2, name: 'Магазин', item: `${BASE}/ru/shop` },
    ],
  };

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbLd) }} />
      <div style={{ background: 'var(--bg-soft)', minHeight: '100vh' }}>
        <div style={{ margin: '0 auto', padding: '12px 16px 64px' }} className="mobile-pad">
          <nav aria-label="Breadcrumb" style={{ marginBottom: '6px', fontSize: '12px', color: '#94A3B8', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Link href="/ru" style={{ color: '#94A3B8', textDecoration: 'none' }}>Главная</Link>
            <span>/</span>
            <span style={{ color: '#475569' }}>Магазин</span>
          </nav>
          <h1 style={{ fontSize: '18px', fontWeight: 800, color: 'var(--text-primary)', margin: '0 0 10px' }}>
            Строительная химия
          </h1>
          <ShopLoader />
        </div>
        <Footer />
      </div>
    </>
  );
}
