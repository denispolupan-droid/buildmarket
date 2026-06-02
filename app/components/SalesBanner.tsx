'use client';

import { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import Link from 'next/link';
import { PROMO } from '../promo.config';

type Props = { mode: 'shop' | 'catalog' };

export default function SalesBanner({ mode }: Props) {
  const [visible, setVisible] = useState(false);
  const { banner, topBar } = PROMO;
  const href = mode === 'catalog'
    ? `/catalog?category=${banner.categorySlug}&sale=1`
    : `/shop?category=${banner.categorySlug}&sale=1`;

  useEffect(() => {
    if (!banner.active) return;
    if (!localStorage.getItem(banner.dismissKey)) setVisible(true);
  }, []);

  if (!visible) return null;

  const dismiss = () => {
    localStorage.setItem(banner.dismissKey, '1');
    setVisible(false);
  };

  return (
    <div style={{
      margin: '8px 0 2px',
      borderRadius: '10px',
      background: '#FFFBEB',
      border: '1px solid #FDE68A',
      padding: '8px 12px',
      display: 'flex', alignItems: 'center', gap: '10px',
    }}>
      <span style={{ fontSize: '18px', flexShrink: 0, lineHeight: 1 }}>☀️</span>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          <span style={{
            background: '#FDE68A', color: '#92400E',
            fontSize: '10px', fontWeight: 700, letterSpacing: '0.4px',
            padding: '1px 7px', borderRadius: '20px', textTransform: 'uppercase',
          }}>
            {banner.tag}
          </span>
          <span style={{ fontSize: '13px', fontWeight: 700, color: '#78350F' }}>
            {topBar.discount} {topBar.text}
          </span>
        </div>
        <p style={{ margin: '1px 0 0', fontSize: '11px', color: '#A16207', lineHeight: 1.3 }}>
          {banner.subtitle}
        </p>
      </div>

      <Link
        href={href}
        style={{
          flexShrink: 0,
          background: '#F59E0B', color: '#fff',
          fontSize: '11.5px', fontWeight: 700,
          padding: '5px 11px', borderRadius: '7px', textDecoration: 'none',
          whiteSpace: 'nowrap',
        }}
      >
        {banner.ctaText} →
      </Link>

      <button
        onClick={dismiss}
        style={{
          flexShrink: 0, background: 'none', border: 'none',
          cursor: 'pointer', color: '#D97706', padding: '2px',
          display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: 0.7,
        }}
        title="Закрити"
      >
        <X size={13} strokeWidth={2.5} />
      </button>
    </div>
  );
}
