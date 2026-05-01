'use client';

import { useState, useEffect } from 'react';
import ShopClient from './ShopClient';
import type { ProductFull, Category } from '../../lib/supabase';

type Props = {
  initialSaleOnly?: boolean;
  initialCategory?: string;
  initialBrand?: string;
};

export default function ShopLoader({ initialSaleOnly, initialCategory, initialBrand }: Props) {
  const [data, setData] = useState<{ products: ProductFull[]; categories: Category[] } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/products')
      .then(res => res.json())
      .then(setData)
      .catch(e => setError(e.message));
  }, []);

  if (error) {
    return (
      <div style={{ padding: '48px', textAlign: 'center', color: '#EF4444' }}>
        Помилка завантаження: {error}
      </div>
    );
  }

  if (!data) {
    return (
      <div className="shop-layout">
        <aside className="shop-sidebar">
          <div className="skeleton" style={{ height: '24px', marginBottom: '16px', width: '120px' }} />
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="skeleton" style={{ height: '40px', marginBottom: '4px' }} />
          ))}
        </aside>
        <div style={{ flex: 1 }}>
          <div className="skeleton" style={{ height: '48px', marginBottom: '24px' }} />
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '20px' }}>
            {Array.from({ length: 12 }).map((_, i) => (
              <div key={i} style={{ background: '#fff', borderRadius: '12px', overflow: 'hidden', border: '1px solid #E2E8F0' }}>
                <div className="skeleton" style={{ aspectRatio: '1', borderRadius: 0 }} />
                <div style={{ padding: '16px' }}>
                  <div className="skeleton" style={{ height: '14px', marginBottom: '8px', width: '40%' }} />
                  <div className="skeleton" style={{ height: '18px', marginBottom: '12px' }} />
                  <div className="skeleton" style={{ height: '24px', width: '50%' }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <ShopClient
      products={data.products}
      categories={data.categories}
      initialSaleOnly={initialSaleOnly}
      initialCategory={initialCategory}
      initialBrand={initialBrand}
    />
  );
}
