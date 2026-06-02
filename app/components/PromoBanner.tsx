'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { getSupabaseBrowser } from '../../lib/supabase-browser';
import { PROMO } from '../promo.config';

const WHOLESALE_TYPES = ['dealer', 'contractor', 'shop_owner'];
const { topBar } = PROMO;

export default function PromoBanner() {
  const [href, setHref] = useState(`/shop?category=${PROMO.banner.categorySlug}&sale=1`);

  useEffect(() => {
    getSupabaseBrowser().auth.getUser().then(({ data }: { data: { user: { user_metadata?: { account_type?: string } } | null } }) => {
      const type = data.user?.user_metadata?.account_type;
      if (WHOLESALE_TYPES.includes(type ?? '')) {
        setHref(`/catalog?category=${PROMO.banner.categorySlug}&sale=1`);
      }
    });
  }, []);

  return (
    <div style={{ background: '#243F63', padding: '4px 24px', textAlign: 'center', borderTop: '1px solid rgba(255,255,255,0.08)', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
      <span style={{ fontSize: '12px', fontWeight: 700, color: '#E2E8F0' }}>
        {topBar.emoji}{' '}
        <Link href={href} style={{ color: '#FCD34D', textDecoration: 'underline', textUnderlineOffset: '2px', fontWeight: 800 }}>
          {topBar.label}
        </Link>
        {' '}—{' '}
        <span style={{ color: '#FCD34D', fontWeight: 800 }}>−{topBar.discount}</span>{' '}
        {topBar.text} {topBar.detail} {topBar.emoji}
      </span>
    </div>
  );
}
