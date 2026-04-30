import type { Metadata } from 'next';
import { getProductsCached, getCategoriesCached } from '../../lib/supabase';
import Footer from '../components/Footer';
import ShopClient from './ShopClient';
import './shop.css';

export const revalidate = 60;

export const metadata: Metadata = {
  title: 'Магазин — будівельна хімія в роздріб | FIXLINE',
  description: 'Купити будівельну хімію в роздріб: герметики, монтажні піни, клеї, ґрунтовки. Доставка по всій Україні. Від 1 одиниці.',
  keywords: ['магазин будівельної хімії', 'герметики купити', 'монтажна піна', 'клей будівельний', 'ґрунтовка'],
  alternates: { canonical: 'https://fixline.com.ua/shop' },
  openGraph: {
    title: 'Магазин будівельної хімії | FIXLINE',
    description: 'Герметики, монтажні піни, клеї, ґрунтовки. Від 1 одиниці з доставкою по Україні.',
    url: 'https://fixline.com.ua/shop',
    siteName: 'FIXLINE',
    locale: 'uk_UA',
    type: 'website',
  },
};

export default async function ShopPage({ searchParams }: { searchParams: Promise<{ sale?: string; category?: string; brand?: string }> }) {
  const { sale, category, brand } = await searchParams;
  const [products, categories] = await Promise.all([
    getProductsCached(),
    getCategoriesCached(),
  ]);

  const breadcrumbLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Головна', item: 'https://fixline.com.ua' },
      { '@type': 'ListItem', position: 2, name: 'Магазин', item: 'https://fixline.com.ua/shop' },
    ],
  };

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbLd) }} />
      <div style={{ background: '#fff', minHeight: '100vh' }}>
        <div style={{ maxWidth: '1280px', margin: '0 auto', padding: '32px 32px 64px' }} className="mobile-pad">
          <nav aria-label="Breadcrumb" style={{ marginBottom: '16px', fontSize: '13px', color: '#94A3B8', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <a href="/" style={{ color: '#94A3B8', textDecoration: 'none' }}>Головна</a>
            <span>/</span>
            <span style={{ color: '#475569' }}>Магазин</span>
          </nav>
          <ShopClient products={products} categories={categories} initialSaleOnly={sale === '1'} initialCategory={category} initialBrand={brand} />
        </div>
      </div>
      <Footer />
    </>
  );
}
