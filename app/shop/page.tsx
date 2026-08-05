import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import Footer from '../components/Footer';
import ShopLoader from './ShopLoader';
import './shop.css';

function brandToSlug(brand: string): string {
  return brand.trim().toLowerCase().replace(/\s+/g, '-');
}

const BASE = 'https://fixline.com.ua';

export async function generateMetadata(
  { searchParams }: { searchParams: Promise<{ sale?: string; brand?: string }> }
): Promise<Metadata> {
  const { sale, brand } = await searchParams;

  if (sale === '1') {
    return {
      title: 'Акційні товари — будівельна хімія зі знижкою',
      description: 'Акції на герметики, монтажні піни, клеї та ґрунтовки. Купити зі знижкою від 1 одиниці з доставкою по Україні.',
      alternates: { canonical: `${BASE}/shop/sale`, languages: { 'uk': `${BASE}/shop/sale`, 'ru': `${BASE}/ru/shop/sale`, 'x-default': `${BASE}/shop/sale` } },
      openGraph: { title: 'Акційні товари | FIXLINE', url: `${BASE}/shop/sale`, locale: 'uk_UA', type: 'website', images: [{ url: `${BASE}/shop/sale/opengraph-image`, width: 1200, height: 630, alt: 'Акційні товари FIXLINE' }] },
    };
  }

  if (brand) {
    return { robots: { index: false, follow: false }, alternates: { canonical: null } };
  }

  return {
    title: 'Магазин — будівельна хімія в роздріб',
    description: 'Купити будівельну хімію в роздріб: герметики, монтажні піни, клеї, ґрунтовки. Широкий вибір від перевірених виробників. Доставка Новою Поштою по всій Україні.',
    keywords: ['магазин будівельної хімії', 'магазин строительной химии', 'герметики купити', 'герметики купить', 'монтажна піна', 'монтажная пена', 'клей будівельний', 'клей строительный', 'ґрунтовка', 'грунтовка'],
    robots: { index: true, follow: true, googleBot: { index: true, follow: true } },
    alternates: { canonical: `${BASE}/shop`, languages: { 'uk': `${BASE}/shop`, 'ru': `${BASE}/ru/shop`, 'x-default': `${BASE}/shop` } },
    openGraph: {
      title: 'Магазин будівельної хімії | FIXLINE',
      description: 'Герметики, монтажні піни, клеї, ґрунтовки. Від 1 одиниці з доставкою по Україні.',
      url: `${BASE}/shop`, siteName: 'FIXLINE', locale: 'uk_UA', type: 'website',
      images: [{ url: `${BASE}/opengraph-image`, width: 1200, height: 630, alt: 'FIXLINE — будівельна хімія' }],
    },
  };
}

export default async function ShopPage({ searchParams }: { searchParams: Promise<{ sale?: string; brand?: string; category?: string }> }) {
  const { sale, brand, category } = await searchParams;

  if (brand) redirect(`/shop/brand/${brandToSlug(brand)}`);
  if (sale === '1') redirect(`/shop/sale${category ? `?category=${encodeURIComponent(category)}` : ''}`);

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
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbLd).replace(/</g, '\\u003c') }} />
      <div style={{ background: 'var(--bg-soft)', minHeight: '100vh' }}>
        {/* Заголовок, хлібні крихти і блок «Про категорію» рендерить сам
            ShopClient від обраної категорії — і на сервері, і при перемиканні */}
        <div style={{ margin: '0 auto', padding: '12px 16px 64px' }} className="mobile-pad">
          <ShopLoader initialSaleOnly={sale === '1'} initialCategory={category} initialBrand={brand} />
        </div>
      </div>
      <Footer />
    </>
  );
}
