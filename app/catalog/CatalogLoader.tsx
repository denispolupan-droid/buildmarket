'use client';

import { useState, useEffect } from 'react';
import CatalogClient from './CatalogClient';
import type { ProductFull, Category } from '../../lib/supabase';

type Props = {
  initialSearch?: string;
  initialCategory?: string;
  initialSaleOnly?: boolean;
};

export default function CatalogLoader({ initialSearch, initialCategory, initialSaleOnly }: Props) {
  const [data, setData] = useState<{ products: ProductFull[]; categories: Category[] } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/catalog')
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
      <div style={{ background: '#F8FAFC', minHeight: '100vh', padding: '32px' }}>
        <div style={{ maxWidth: '1400px', margin: '0 auto' }}>
          <div style={{ height: '32px', background: '#E2E8F0', borderRadius: '8px', marginBottom: '24px', width: '200px' }} />
          <div style={{ display: 'flex', gap: '16px', marginBottom: '24px' }}>
            <div style={{ height: '40px', background: '#E2E8F0', borderRadius: '8px', width: '200px' }} />
            <div style={{ height: '40px', background: '#E2E8F0', borderRadius: '8px', width: '150px' }} />
          </div>
          <div style={{ background: '#fff', borderRadius: '12px', overflow: 'hidden' }}>
            {Array.from({ length: 10 }).map((_, i) => (
              <div key={i} style={{
                display: 'flex', gap: '16px', padding: '16px 20px',
                borderBottom: '1px solid #E2E8F0', alignItems: 'center'
              }}>
                <div style={{ width: '60px', height: '60px', background: '#F1F5F9', borderRadius: '8px', flexShrink: 0 }} />
                <div style={{ flex: 1 }}>
                  <div style={{ height: '14px', background: '#F1F5F9', borderRadius: '4px', marginBottom: '8px', width: '30%' }} />
                  <div style={{ height: '18px', background: '#F1F5F9', borderRadius: '4px', width: '60%' }} />
                </div>
                <div style={{ height: '20px', background: '#F1F5F9', borderRadius: '4px', width: '80px' }} />
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <CatalogClient
      products={data.products}
      categories={data.categories}
      initialSearch={initialSearch ?? ''}
      initialCategory={initialCategory ?? ''}
      initialSaleOnly={initialSaleOnly}
    />
  );
}
