'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import CategoryPreview from './CategoryPreview';
import { getCatIcon, getCatColor } from './CategoryCarousel';
import { getSupabaseBrowser } from '../../lib/supabase-browser';
import { getCategoryNameRu } from '../../lib/ru';
import type { Category, ProductFull, ReviewStats } from '../../lib/supabase';
import type { UserRole } from '../../lib/user-role';

const WHOLESALE_TYPES = ['dealer', 'contractor', 'shop_owner'];
const DROPSHIP_TYPES = ['dropship'];

type Props = {
  categories: Category[];
  products: ProductFull[];
  reviewStats?: ReviewStats;
};

export default function CategorySection({ categories, products, reviewStats }: Props) {
  const pathname = usePathname();
  const lang: 'uk' | 'ru' = pathname.startsWith('/ru') ? 'ru' : 'uk';
  const prefix = lang === 'ru' ? '/ru' : '';
  const [role, setRole] = useState<UserRole>('guest');

  useEffect(() => {
    getSupabaseBrowser().auth.getUser().then(({ data }: { data: { user: { user_metadata?: { account_type?: string } } | null } }) => {
      const type = data.user?.user_metadata?.account_type;
      if (DROPSHIP_TYPES.includes(type ?? '')) setRole('dropship');
      else if (WHOLESALE_TYPES.includes(type ?? '')) setRole('wholesale');
      else if (data.user) setRole('retail');
    });
  }, []);
  const parentCats = categories.filter(c => !c.parent_slug);
  const [selectedSlug, setSelectedSlug] = useState(parentCats[0]?.slug ?? '');

  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: '1fr 1fr 2.3fr',
      gap: '0',
      background: 'var(--bg-card)',
      border: '1px solid var(--border)',
      borderTop: '3px solid #4880B8',
      borderRadius: '2px 2px 14px 14px',
      overflow: 'hidden',
      boxShadow: '0 2px 12px rgba(0,0,0,0.07)',
      height: '520px',
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
            <Link
              key={cat.slug}
              href={`${prefix}/shop/${cat.slug}`}
              onClick={e => { e.preventDefault(); setSelectedSlug(cat.slug); }}
              style={{
                display: 'flex', alignItems: 'center', gap: '10px',
                padding: '12px 16px', cursor: 'pointer', textDecoration: 'none',
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
                {lang === 'ru' ? getCategoryNameRu(cat.slug, cat.name) : cat.name}
              </span>
            </Link>
          );
        })}
      </div>

      {/* Права панель — опис і товари */}
      <CategoryPreview
        categories={categories}
        products={products}
        selectedSlug={selectedSlug}
        role={role}
        reviewStats={reviewStats}
      />
    </div>
  );
}
