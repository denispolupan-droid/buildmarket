'use client';

import { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import Link from 'next/link';
import { PROMO } from '../promo.config';

type Props = { mode: 'shop' | 'catalog' };

export default function SalesBanner({ mode }: Props) {
  const [visible, setVisible] = useState(false);
  const { banner } = PROMO;
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
      margin: '10px 0 4px',
      borderRadius: '12px',
      background: 'linear-gradient(135deg, #F97316 0%, #FBBF24 100%)',
      padding: '11px 14px',
      display: 'flex', alignItems: 'center', gap: '12px',
      position: 'relative', overflow: 'hidden',
    }}>
      {/* Декоративное солнце */}
      <div style={{
        position: 'absolute', right: '-20px', top: '-20px',
        width: '90px', height: '90px', borderRadius: '50%',
        background: 'rgba(255,255,255,0.1)', pointerEvents: 'none',
      }} />
      <div style={{
        position: 'absolute', right: '20px', top: '-30px',
        width: '60px', height: '60px', borderRadius: '50%',
        background: 'rgba(255,255,255,0.07)', pointerEvents: 'none',
      }} />

      {/* Иконка */}
      <span style={{ fontSize: '22px', flexShrink: 0, lineHeight: 1 }}>☀️</span>

      {/* Текст */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          <span style={{
            background: 'rgba(255,255,255,0.25)', color: '#fff',
            fontSize: '10px', fontWeight: 700, letterSpacing: '0.5px',
            padding: '2px 7px', borderRadius: '20px', textTransform: 'uppercase',
          }}>
            {banner.tag}
          </span>
          <span style={{ fontSize: '14px', fontWeight: 800, color: '#fff', lineHeight: 1.2 }}>
            {banner.title}
          </span>
        </div>
        <p style={{ margin: '2px 0 0', fontSize: '11.5px', color: 'rgba(255,255,255,0.85)', lineHeight: 1.3 }}>
          {banner.subtitle}
        </p>
      </div>

      {/* CTA */}
      <Link
        href={href}
        style={{
          flexShrink: 0,
          background: 'rgba(255,255,255,0.2)',
          border: '1px solid rgba(255,255,255,0.4)',
          color: '#fff', fontSize: '12px', fontWeight: 700,
          padding: '6px 12px', borderRadius: '8px', textDecoration: 'none',
          whiteSpace: 'nowrap', backdropFilter: 'blur(4px)',
        }}
      >
        {banner.ctaText} →
      </Link>

      {/* Закрыть */}
      <button
        onClick={dismiss}
        style={{
          flexShrink: 0, background: 'rgba(255,255,255,0.15)',
          border: 'none', borderRadius: '6px', cursor: 'pointer',
          color: 'rgba(255,255,255,0.8)', padding: '4px', display: 'flex',
          alignItems: 'center', justifyContent: 'center',
        }}
        title="Закрити"
      >
        <X size={14} strokeWidth={2.5} />
      </button>
    </div>
  );
}
