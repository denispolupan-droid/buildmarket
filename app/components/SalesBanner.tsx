'use client';

import { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import Link from 'next/link';
import { PROMO, type PromoConfig } from '../promo.config';

type Props = { mode: 'shop' | 'catalog' };

const PADDING = { compact: '6px 10px', medium: '8px 12px', large: '12px 16px' };
const FONT    = { compact: '12px',      medium: '13px',      large: '14px'      };

export default function SalesBanner({ mode }: Props) {
  const [visible, setVisible] = useState(false);
  const [cfg, setCfg]         = useState<PromoConfig>(PROMO as unknown as PromoConfig);

  useEffect(() => {
    fetch('/api/promo').then(r => r.json()).then(data => {
      if (data?.banner) setCfg(data as PromoConfig);
    }).catch(() => {});
  }, []);

  const { banner, topBar } = cfg;

  useEffect(() => {
    if (!banner.active) { setVisible(false); return; }
    if (!localStorage.getItem(banner.dismissKey)) setVisible(true);
  }, [banner.active, banner.dismissKey]);

  if (!visible) return null;

  const href = mode === 'catalog'
    ? `/catalog?category=${banner.categorySlug}&sale=1`
    : `/shop?category=${banner.categorySlug}&sale=1`;
  const size = banner.size ?? 'medium';

  return (
    <div style={{
      margin: '8px 0 2px', borderRadius: '10px',
      background: banner.bgColor, border: `1px solid ${banner.borderColor}`,
      padding: PADDING[size], display: 'flex', alignItems: 'center', gap: '10px',
    }}>
      <span style={{ fontSize: size === 'large' ? '22px' : '18px', flexShrink: 0, lineHeight: 1 }}>
        {banner.emoji}
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          <span style={{
            background: banner.borderColor, color: banner.textColor,
            fontSize: '10px', fontWeight: 700, padding: '1px 7px',
            borderRadius: '20px', textTransform: 'uppercase',
          }}>
            {banner.tag}
          </span>
          <span style={{ fontSize: FONT[size], fontWeight: 700, color: banner.textColor }}>
            {topBar.discount} {topBar.text}
          </span>
        </div>
        <p style={{ margin: '1px 0 0', fontSize: '11px', color: banner.textColor, opacity: 0.75, lineHeight: 1.3 }}>
          {banner.subtitle}
        </p>
      </div>
      <Link href={href} style={{
        flexShrink: 0, background: banner.ctaBgColor, color: '#fff',
        fontSize: '11.5px', fontWeight: 700, padding: '5px 11px',
        borderRadius: '7px', textDecoration: 'none', whiteSpace: 'nowrap',
      }}>
        {banner.ctaText} →
      </Link>
      <button onClick={() => { localStorage.setItem(banner.dismissKey, '1'); setVisible(false); }}
        style={{ flexShrink: 0, background: 'none', border: 'none', cursor: 'pointer', color: banner.ctaBgColor, padding: '2px', display: 'flex', alignItems: 'center', opacity: 0.7 }}>
        <X size={13} strokeWidth={2.5} />
      </button>
    </div>
  );
}
