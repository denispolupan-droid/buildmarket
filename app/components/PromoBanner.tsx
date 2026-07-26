'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { getSupabaseBrowser } from '../../lib/supabase-browser';
import { PROMO, type PromoConfig } from '../promo.config';

const WHOLESALE = ['dealer', 'contractor', 'shop_owner'];

export default function PromoBanner() {
  const pathname = usePathname();
  const isRu = pathname.startsWith('/ru');
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
  // Російська версія тексту акції (з фолбеком на укр, якщо поля не заповнені)
  const label  = isRu && topBar.labelRu  ? topBar.labelRu  : topBar.label;
  const text   = isRu && topBar.textRu   ? topBar.textRu   : topBar.text;
  const detail = isRu && topBar.detailRu ? topBar.detailRu : topBar.detail;
  const localHref = isRu && href.startsWith('/shop') ? `/ru${href}` : href;
  return (
    <Link href={localHref} style={{ display: 'block', background: topBar.bgColor, padding: '4px 24px', textAlign: 'center', borderTop: '1px solid rgba(255,255,255,0.08)', borderBottom: '1px solid rgba(255,255,255,0.08)', textDecoration: 'none', cursor: 'pointer' }}>
      <span style={{ fontSize: '12px', fontWeight: 700, color: '#E2E8F0' }}>
        {topBar.emoji}{' '}
        <span style={{ color: '#FCD34D', textDecoration: 'underline', textUnderlineOffset: '2px', fontWeight: 800 }}>
          {label}
        </span>
        {' '}
        <span style={{ color: '#FCD34D', fontWeight: 800 }}>{topBar.discount}</span>{' '}
        {text} {detail} {topBar.emoji}
      </span>
    </Link>
  );
}
