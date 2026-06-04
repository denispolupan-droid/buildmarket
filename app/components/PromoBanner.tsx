'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { getSupabaseBrowser } from '../../lib/supabase-browser';
import { PROMO, type PromoConfig } from '../promo.config';

const WHOLESALE = ['dealer', 'contractor', 'shop_owner'];

export default function PromoBanner() {
  const [href, setHref] = useState(`/shop?category=${PROMO.banner.categorySlug}&sale=1`);
  const [cfg, setCfg]   = useState<PromoConfig>(PROMO as unknown as PromoConfig);

  useEffect(() => {
    const init = async () => {
      const [promoRes, { data }] = await Promise.all([
        fetch('/api/promo').then(r => r.json()).catch(() => null),
        getSupabaseBrowser().auth.getUser(),
      ]);
      if (promoRes) setCfg(promoRes as PromoConfig);
      const slug = promoRes?.banner?.categorySlug ?? PROMO.banner.categorySlug;
      const type = (data.user?.user_metadata as Record<string, string> | undefined)?.account_type;
      setHref(WHOLESALE.includes(type ?? '')
        ? `/catalog?category=${slug}&sale=1`
        : `/shop?category=${slug}&sale=1`);
    };
    init();
  }, []);

  if (!cfg.topBar.visible) return null;

  const { topBar } = cfg;
  return (
    <div style={{ background: topBar.bgColor, padding: '4px 24px', textAlign: 'center', borderTop: '1px solid rgba(255,255,255,0.08)', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
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
