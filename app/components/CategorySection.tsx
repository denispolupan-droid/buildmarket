'use client';

import { useState } from 'react';
import CategoryPreview from './CategoryPreview';
import { getCatIcon, getCatColor } from './CategoryCarousel';
import type { Category, ProductFull } from '../../lib/supabase';
import type { UserRole } from '../../lib/user-role';

type Props = {
  categories: Category[];
  products: ProductFull[];
  role: UserRole;
};

export default function CategorySection({ categories, products, role }: Props) {
  const parentCats = categories.filter(c => !c.parent_slug);
  const [selectedSlug, setSelectedSlug] = useState(parentCats[0]?.slug ?? '');

  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: '220px 1fr',
      gap: '0',
      maxWidth: '1100px',
      margin: '0 auto',
      border: '1px solid var(--border)',
      borderRadius: '18px',
      overflow: 'hidden',
      boxShadow: '0 2px 12px rgba(0,0,0,0.05)',
      height: '620px',
    }}>
      {/* Ліва панель — вертикальний список категорій */}
      <div style={{
        overflowY: 'auto',
        scrollbarWidth: 'none',
        background: 'var(--bg-soft)',
        borderRight: '1px solid var(--border)',
        height: '100%',
      }}>
        {parentCats.map((cat, i) => {
          const Icon = getCatIcon(cat.slug, i);
          const color = getCatColor(cat.slug, i);
          const isActive = cat.slug === selectedSlug;
          return (
            <div
              key={cat.slug}
              onClick={() => setSelectedSlug(cat.slug)}
              style={{
                display: 'flex', alignItems: 'center', gap: '10px',
                padding: '12px 16px', cursor: 'pointer',
                background: isActive ? 'var(--bg-card)' : 'transparent',
                borderLeft: isActive ? '3px solid #4880B8' : '3px solid transparent',
                borderBottom: '1px solid var(--border-light)',
                transition: 'background 0.15s',
              }}
            >
              <div style={{
                width: '34px', height: '34px', borderRadius: '8px', flexShrink: 0,
                background: isActive ? color : 'rgba(0,0,0,0.06)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                transition: 'background 0.15s',
              }}>
                <Icon size={16} color={isActive ? '#fff' : '#64748B'} strokeWidth={1.75} />
              </div>
              <span style={{
                fontSize: '13px', fontWeight: isActive ? 700 : 500,
                color: isActive ? 'var(--text-primary)' : 'var(--text-secondary)',
                lineHeight: 1.3,
              }}>
                {cat.name}
              </span>
            </div>
          );
        })}
      </div>

      {/* Права панель — опис і товари */}
      <CategoryPreview
        categories={categories}
        products={products}
        selectedSlug={selectedSlug}
        role={role}
      />
    </div>
  );
}
