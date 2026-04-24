import type { Metadata } from 'next';
import { getProducts, getCategories } from '../../lib/supabase';
import Footer from '../components/Footer';
import ShopClient from './ShopClient';
import './shop.css';

export const metadata: Metadata = {
  title: 'Магазин — будівельна хімія в роздріб | FIXLINE',
  description: 'Купити будівельну хімію в роздріб: герметики, монтажні піни, клеї, ґрунтовки. Доставка по всій Україні. Від 1 одиниці.',
  alternates: { canonical: 'https://fixline.com.ua/shop' },
};

export default async function ShopPage({ searchParams }: { searchParams: Promise<{ sale?: string }> }) {
  const { sale } = await searchParams;
  const [products, categories] = await Promise.all([
    getProducts(),
    getCategories(),
  ]);

  return (
    <>
      <div style={{ background: 'var(--bg-soft)', minHeight: '100vh' }}>
        <div style={{ maxWidth: '1280px', margin: '0 auto', padding: '32px 32px 64px' }} className="mobile-pad">
          <ShopClient products={products} categories={categories} initialSaleOnly={sale === '1'} />
        </div>
      </div>
      <Footer />
    </>
  );
}
