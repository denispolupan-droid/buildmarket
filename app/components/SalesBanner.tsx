'use client';

import { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import Link from 'next/link';
import { PROMO, type PromoConfig } from '../promo.config';

type Props = { mode: 'shop' | 'catalog'; activeSlugs?: Set<string> | null };

const PADDING = { compact: '6px 10px', medium: '8px 12px', large: '12px 16px' };
const FONT    = { compact: '12px',      medium: '13px',      large: '14px'      };

export default function SalesBanner({ mode, activeSlugs }: Props) {
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
  if (activeSlugs && !activeSlugs.has(cfg.banner.categorySlug)) return null;

  const href = mode === 'catalog'
    ? `/catalog?category=${banner.categorySlug}&sale=1`
    : `/shop?category=${banner.categorySlug}&sale=1`;
  const size    = banner.size ?? 'medium';
  const hasImg  = !!banner.bgImage;
  const txtColor = hasImg ? '#fff' : banner.textColor;

  return (
    <div style={{
      margin: '8px 0 2px', borderRadius: '10px', overflow: 'hidden',
      position: 'relative',
      ...(hasImg
        ? { backgroundImage: `url(${banner.bgImage})`, backgroundSize: 'cover', backgroundPosition: 'center' }
        : { background: banner.bgColor, border: `1px solid ${banner.borderColor}` }),
    }}>
      {/* Overlay затемнення для читабельності */}
      {hasImg && (
        <div style={{ position: 'absolute', inset: 0, background: `rgba(0,0,0,${(banner.bgOverlay ?? 40) / 100})`, borderRadius: '10px' }} />
      )}

      <button onClick={() => { localStorage.setItem(banner.dismissKey, '1'); setVisible(false); }}
        aria-label="Закрити"
        style={{
          position: 'absolute', top: '10px', right: '10px', zIndex: 2,
          width: '26px', height: '26px', borderRadius: '50%',
          background: hasImg ? 'rgba(255,255,255,0.18)' : 'rgba(0,0,0,0.06)',
          border: 'none', cursor: 'pointer', color: txtColor,
          display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: 0.75,
        }}>
        <X size={13} strokeWidth={2.5} />
      </button>

      <div style={{ position: 'relative', zIndex: 1, padding: PADDING[size], paddingRight: '36px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', marginBottom: '4px' }}>
          <span style={{ fontSize: size === 'large' ? '22px' : '18px', lineHeight: 1, flexShrink: 0 }}>
            {banner.emoji}
          </span>
          <span style={{
            background: hasImg ? 'rgba(255,255,255,0.2)' : banner.borderColor,
            color: txtColor,
            fontSize: '10px', fontWeight: 700, padding: '2px 8px',
            borderRadius: '20px', textTransform: 'uppercase', letterSpacing: '0.02em', flexShrink: 0,
          }}>
            {banner.tag}
          </span>
          <span style={{ fontSize: FONT[size], fontWeight: 700, color: txtColor }}>
            {topBar.discount} {topBar.text}
          </span>
        </div>

        <p style={{ margin: '0 0 10px', fontSize: '12px', color: txtColor, opacity: 0.8, lineHeight: 1.4 }}>
          {banner.subtitle}
        </p>

        <Link href={href} className="promo-banner-cta" style={{
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
          height: '40px', padding: '0 18px', borderRadius: '9px',
          background: hasImg ? 'rgba(255,255,255,0.2)' : banner.ctaBgColor,
          border: hasImg ? '1px solid rgba(255,255,255,0.4)' : 'none',
          color: '#fff', fontSize: '14px', fontWeight: 700,
          textDecoration: 'none', whiteSpace: 'nowrap',
        }}>
          {banner.ctaText} →
        </Link>
      </div>
    </div>
  );
}
