'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { Heart } from 'lucide-react';
import { useWishlist } from '../../../lib/wishlist';
import WishlistCard from './WishlistCard';
import type { ProductFull } from '../../../lib/supabase';
import type { UserRole } from '../../../lib/user-role';

export default function WishlistList({ products, role }: { products: ProductFull[]; role: UserRole }) {
  const { skus, cleanSkus } = useWishlist();

  // Sync client context with server-verified products — removes stale/deleted SKUs
  useEffect(() => {
    cleanSkus(products.map(p => p.sku));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const visible = products.filter(p => skus.has(p.sku));
  const isRetail = role === 'retail';

  if (visible.length === 0) {
    return (
      <div style={{
        background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '14px',
        padding: '64px', textAlign: 'center',
      }}>
        <Heart size={40} color="#CBD5E1" strokeWidth={1} style={{ marginBottom: '12px' }} />
        <p style={{ fontSize: '15px', color: '#64748B', marginBottom: '16px' }}>Список обраного порожній</p>
        <Link href={isRetail ? '/shop' : '/catalog'} style={{
          display: 'inline-flex', alignItems: 'center', gap: '6px',
          height: '40px', padding: '0 20px', borderRadius: '8px',
          background: '#1E3A5F', color: '#fff', fontSize: '14px', fontWeight: 600,
        }}>
          {isRetail ? 'Перейти до магазину' : 'Перейти до каталогу'}
        </Link>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
      {visible.map(p => <WishlistCard key={p.sku} product={p} retail={isRetail} />)}
    </div>
  );
}
