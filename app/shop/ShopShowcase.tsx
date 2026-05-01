'use client';

import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { ChevronRight, Heart, Plus, Check } from 'lucide-react';
import ProductImage from '../components/ProductImage';
import { useCart } from '../../lib/cart';
import { useWishlist } from '../../lib/wishlist';
import type { ProductFull, Category } from '../../lib/supabase';

type Props = {
  initialCategory?: string;
};

export default function ShopShowcase({ initialCategory }: Props) {
  const [showcase, setShowcase] = useState<{ products: ProductFull[]; categories: Category[] } | null>(null);
  const [categoryProducts, setCategoryProducts] = useState<ProductFull[] | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(initialCategory ?? null);
  const [loading, setLoading] = useState(false);
  const { addItem, items } = useCart();
  const { toggle, isLiked } = useWishlist();

  useEffect(() => {
    fetch('/api/shop-showcase')
      .then(res => res.json())
      .then(setShowcase);
  }, []);

  useEffect(() => {
    if (selectedCategory) {
      setLoading(true);
      fetch(`/api/products?category=${selectedCategory}`)
        .then(res => res.json())
        .then(data => {
          setCategoryProducts(data.products.filter((p: ProductFull) => p.category_slug === selectedCategory));
          setLoading(false);
        });
    } else {
      setCategoryProducts(null);
    }
  }, [selectedCategory]);

  const parentCats = useMemo(() =>
    showcase?.categories.filter(c => !c.parent_slug) ?? [],
    [showcase]
  );

  const childrenOf = useMemo(() => {
    const map: Record<string, Category[]> = {};
    showcase?.categories.forEach(c => {
      if (c.parent_slug) (map[c.parent_slug] ??= []).push(c);
    });
    return map;
  }, [showcase]);

  const getProductForCategory = (slug: string) => {
    const children = childrenOf[slug] ?? [];
    const slugs = [slug, ...children.map(c => c.slug)];
    return showcase?.products.find(p => slugs.includes(p.category_slug ?? ''));
  };

  if (!showcase) {
    return (
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '24px' }}>
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} style={{ background: '#F8FAFC', borderRadius: '16px', padding: '24px' }}>
            <div style={{ height: '20px', background: '#E2E8F0', borderRadius: '6px', marginBottom: '16px', width: '60%' }} />
            <div style={{ aspectRatio: '1', background: '#F1F5F9', borderRadius: '12px', marginBottom: '16px' }} />
            <div style={{ height: '16px', background: '#E2E8F0', borderRadius: '4px', marginBottom: '8px' }} />
            <div style={{ height: '24px', background: '#E2E8F0', borderRadius: '6px', width: '40%' }} />
          </div>
        ))}
      </div>
    );
  }

  if (selectedCategory && categoryProducts) {
    const cat = showcase.categories.find(c => c.slug === selectedCategory);
    return (
      <div>
        <button
          onClick={() => setSelectedCategory(null)}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: '8px',
            marginBottom: '24px', padding: '8px 16px', borderRadius: '8px',
            background: '#F1F5F9', border: 'none', cursor: 'pointer',
            fontSize: '14px', fontWeight: 600, color: '#475569',
          }}
        >
          ← Назад до категорій
        </button>

        <h2 style={{ fontSize: '24px', fontWeight: 800, marginBottom: '24px', color: '#0F172A' }}>
          {cat?.name ?? 'Категорія'}
        </h2>

        {loading ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '20px' }}>
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} style={{ background: '#F8FAFC', borderRadius: '12px', overflow: 'hidden' }}>
                <div style={{ aspectRatio: '1', background: '#F1F5F9' }} />
                <div style={{ padding: '16px' }}>
                  <div style={{ height: '14px', background: '#E2E8F0', borderRadius: '4px', marginBottom: '8px', width: '40%' }} />
                  <div style={{ height: '18px', background: '#E2E8F0', borderRadius: '4px' }} />
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '20px' }}>
            {categoryProducts.map(p => {
              const price = p.stock?.price_retail ?? 0;
              const inStock = (p.stock?.stock_qty ?? 0) >= 1;
              const inCart = items.some(i => i.sku === p.sku);
              return (
                <div key={p.sku} style={{ background: '#fff', borderRadius: '12px', border: '1px solid #E2E8F0', overflow: 'hidden' }}>
                  <Link href={`/product/${p.sku}?from=shop`} style={{ display: 'block', aspectRatio: '1', background: '#F8FAFC', padding: '16px' }}>
                    <ProductImage brand={p.brand} nl1={p.nl1 ?? ''} nl2={p.nl2 ?? undefined} volume={p.volume ?? ''} bc={p.bc} ac={p.ac} type={p.img_type} imageUrl={p.image ?? undefined} />
                  </Link>
                  <div style={{ padding: '16px' }}>
                    <div style={{ fontSize: '12px', color: '#94A3B8', marginBottom: '4px' }}>{p.brand}</div>
                    <Link href={`/product/${p.sku}?from=shop`} style={{ fontSize: '14px', fontWeight: 600, color: '#0F172A', textDecoration: 'none', display: 'block', marginBottom: '8px', lineHeight: 1.3 }}>
                      {p.name}
                    </Link>
                    <div style={{ fontSize: '18px', fontWeight: 700, color: '#0F172A', marginBottom: '12px' }}>
                      {price > 0 ? `${price} грн` : 'За запитом'}
                    </div>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <button
                        onClick={() => toggle(p.sku)}
                        style={{
                          width: '40px', height: '40px', borderRadius: '8px',
                          border: '1px solid #E2E8F0', background: isLiked(p.sku) ? '#FEF2F2' : '#fff',
                          color: isLiked(p.sku) ? '#EF4444' : '#94A3B8', cursor: 'pointer',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                        }}
                      >
                        <Heart size={16} fill={isLiked(p.sku) ? '#EF4444' : 'none'} />
                      </button>
                      <button
                        onClick={() => addItem({
                          sku: p.sku, name: p.name, brand: p.brand, volume: p.volume,
                          price, min_order: 1, nl1: p.nl1 ?? '', bc: p.bc, ac: p.ac, img_type: p.img_type,
                        }, 1)}
                        disabled={!inStock}
                        style={{
                          flex: 1, height: '40px', borderRadius: '8px', border: 'none',
                          background: inCart ? '#16A34A' : inStock ? '#1E3A5F' : '#E2E8F0',
                          color: inStock ? '#fff' : '#94A3B8', cursor: inStock ? 'pointer' : 'default',
                          fontSize: '13px', fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
                        }}
                      >
                        {inCart ? <><Check size={14} /> Додано</> : <><Plus size={14} /> В кошик</>}
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  return (
    <div>
      <h1 style={{ fontSize: '24px', fontWeight: 800, marginBottom: '8px', color: '#0F172A' }}>
        Магазин
      </h1>
      <p style={{ fontSize: '14px', color: '#64748B', marginBottom: '32px' }}>
        Оберіть категорію для перегляду товарів
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '24px' }}>
        {parentCats.map(cat => {
          const product = getProductForCategory(cat.slug);
          const childCount = (childrenOf[cat.slug] ?? []).length;

          return (
            <div
              key={cat.slug}
              onClick={() => setSelectedCategory(cat.slug)}
              style={{
                background: '#fff', borderRadius: '16px', border: '1px solid #E2E8F0',
                padding: '24px', cursor: 'pointer', transition: 'all 0.15s',
              }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = '#4880B8'; e.currentTarget.style.boxShadow = '0 4px 20px rgba(0,0,0,0.08)'; }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = '#E2E8F0'; e.currentTarget.style.boxShadow = 'none'; }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                <h3 style={{ fontSize: '16px', fontWeight: 700, color: '#0F172A', margin: 0 }}>
                  {cat.name}
                </h3>
                <ChevronRight size={18} color="#94A3B8" />
              </div>

              {product ? (
                <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
                  <div style={{ width: '80px', height: '80px', background: '#F8FAFC', borderRadius: '10px', padding: '8px', flexShrink: 0 }}>
                    <ProductImage brand={product.brand} nl1={product.nl1 ?? ''} nl2={product.nl2 ?? undefined} volume={product.volume ?? ''} bc={product.bc} ac={product.ac} type={product.img_type} imageUrl={product.image ?? undefined} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: '12px', color: '#94A3B8', marginBottom: '2px' }}>{product.brand}</div>
                    <div style={{ fontSize: '13px', fontWeight: 600, color: '#374151', marginBottom: '4px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {product.name}
                    </div>
                    <div style={{ fontSize: '15px', fontWeight: 700, color: '#1E3A5F' }}>
                      {(product.stock?.price_retail ?? 0) > 0 ? `від ${product.stock?.price_retail} грн` : 'За запитом'}
                    </div>
                  </div>
                </div>
              ) : (
                <div style={{ height: '80px', background: '#F8FAFC', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94A3B8', fontSize: '13px' }}>
                  Товари скоро з'являться
                </div>
              )}

              {childCount > 0 && (
                <div style={{ marginTop: '12px', fontSize: '12px', color: '#64748B' }}>
                  {childCount} підкатегорій
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
