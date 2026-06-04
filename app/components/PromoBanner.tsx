'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { getSupabaseBrowser } from '../../lib/supabase-browser';
import { PROMO } from '../promo.config';

const WHOLESALE_TYPES = ['dealer', 'contractor', 'shop_owner'];

export default function PromoBanner() {
  const [href, setHref]     = useState(`/shop?category=${PROMO.banner.categorySlug}&sale=1`);
  const [topBar, setTopBar] = useState(PROMO.topBar);

  useEffect(() => {
    const init = async () => {
      const [promoRes, { data: authData }] = await Promise.all([
        fetch('/api/promo').then(r => r.json()).catch(() => null),
        getSupabaseBrowser().auth.getUser(),
      ]);

      const cfg = promoRes ?? PROMO;
      if (cfg?.topBar) setTopBar(cfg.topBar);

      const slug = cfg?.banner?.categorySlug ?? PROMO.banner.categorySlug;
      const type = (authData.user?.user_metadata as Record<string, string> | undefined)?.account_type;
      const isWholesale = WHOLESALE_TYPES.includes(type ?? '');
      setHref(isWholesale ? `/catalog?category=${slug}&sale=1` : `/shop?category=${slug}&sale=1`);
    };
    init();
  }, []);

  return (
    <div style={{ background: '#243F63', padding: '4px 24px', textAlign: 'center', borderTop: '1px solid rgba(255,255,255,0.08)', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
      <span style={{ fontSize: '12px', fontWeight: 700, color: '#E2E8F0' }}>
        {topBar.emoji}{' '}
        <Link href={href} style={{ color: '#FCD34D', textDecoration: 'underline', textUnderlineOffset: '2px', fontWeight: 800 }}>
          {topBar.label}
        </Link>
        {' '}
        <span style={{ color: '#FCD34D', fontWeight: 800 }}>{topBar.discount}</span>{' '}
        {topBar.text} {topBar.detail} {topBar.emoji}
      </span>
    </div>
  );
}
