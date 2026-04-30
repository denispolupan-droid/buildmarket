'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Heart } from 'lucide-react';
import { useWishlist } from '../../../lib/wishlist';
import { getSupabaseBrowser } from '../../../lib/supabase-browser';
import WishlistCard from './WishlistCard';
import Footer from '../../components/Footer';
import type { ProductFull } from '../../../lib/supabase';

export default function GuestWishlistPage() {
  const { skus, loaded, cleanSkus } = useWishlist();
  const [products, setProducts] = useState<ProductFull[]>([]);
  const [fetching, setFetching] = useState(false);

  useEffect(() => {
    if (!loaded) return;
    if (skus.size === 0) { setProducts([]); return; }

    setFetching(true);
    const supabase = getSupabaseBrowser();
    supabase
      .from('products')
      .select('*, stock:product_stock(*), characteristics:product_characteristics(*)')
      .in('sku', [...skus])
      .eq('is_active', true)
      .then(({ data }: { data: ProductFull[] | null }) => {
        const found = (data ?? []) as ProductFull[];
        setProducts(found);
        cleanSkus(found.map(p => p.sku));
        setFetching(false);
      });
  }, [skus, loaded]);

  const visible = products.filter(p => skus.has(p.sku));

  return (
    <>
      <div style={{ background: 'var(--bg-soft)', minHeight: '100vh' }}>
        <div className="mobile-pad" style={{ maxWidth: '960px', margin: '0 auto', padding: '40px 32px 64px' }}>

          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '32px' }}>
            <div style={{
              width: '44px', height: '44px', borderRadius: '12px',
              background: 'var(--bg-card)', display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <Heart size={20} color="#EF4444" fill="#EF4444" />
            </div>
            <div>
              <h1 style={{ fontSize: '22px', fontWeight: 800, color: 'var(--text-primary)', margin: 0 }}>Обране</h1>
              <p style={{ fontSize: '13px', color: '#64748B', margin: 0 }}>{visible.length} товарів</p>
            </div>
          </div>

          {!loaded || fetching ? (
            <div style={{ textAlign: 'center', padding: '48px', color: 'var(--text-muted)' }}>Завантаження...</div>
          ) : visible.length === 0 ? (
            <div style={{
              background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '14px',
              padding: '64px', textAlign: 'center',
            }}>
              <Heart size={40} color="#CBD5E1" strokeWidth={1} style={{ marginBottom: '12px' }} />
              <p style={{ fontSize: '15px', color: '#64748B', marginBottom: '16px' }}>Список обраного порожній</p>
              <Link href="/shop" style={{
                display: 'inline-flex', alignItems: 'center', gap: '6px',
                height: '40px', padding: '0 20px', borderRadius: '8px',
                background: '#1E3A5F', color: '#fff', fontSize: '14px', fontWeight: 600,
              }}>
                Перейти до магазину
              </Link>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {visible.map(p => <WishlistCard key={p.sku} product={p} retail={true} />)}
            </div>
          )}

          <div style={{
            marginTop: '32px', padding: '20px 24px', borderRadius: '12px',
            background: 'var(--bg-card)', border: '1px solid var(--border)',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '16px',
            flexWrap: 'wrap',
          }}>
            <div>
              <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '2px' }}>
                Зареєструйтесь, щоб зберегти обране
              </div>
              <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                Після реєстрації список збережеться у вашому акаунті
              </div>
            </div>
            <div style={{ display: 'flex', gap: '8px', flexShrink: 0 }}>
              <Link href="/login" style={{
                height: '38px', padding: '0 20px', borderRadius: '8px',
                border: '1px solid var(--border)', background: 'var(--bg-card)',
                color: 'var(--text-primary)', fontSize: '13px', fontWeight: 600,
                display: 'inline-flex', alignItems: 'center',
              }}>
                Увійти
              </Link>
              <Link href="/register" style={{
                height: '38px', padding: '0 20px', borderRadius: '8px',
                background: '#1E3A5F', color: '#fff', fontSize: '13px', fontWeight: 600,
                display: 'inline-flex', alignItems: 'center',
              }}>
                Реєстрація
              </Link>
            </div>
          </div>

        </div>
      </div>
      <Footer />
    </>
  );
}
