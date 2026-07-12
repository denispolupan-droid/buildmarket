'use client';

import { useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { BRANDS } from '../../lib/brands';

function FadeLogo({ src, alt }: { src: string; alt: string }) {
  const [loaded, setLoaded] = useState(false);
  return (
    <Image
      src={src}
      alt={alt}
      width={120}
      height={54}
      style={{
        objectFit: 'contain', maxWidth: '120px', maxHeight: '54px',
        opacity: loaded ? 1 : 0, transition: 'opacity 300ms ease',
      }}
      onLoad={() => setLoaded(true)}
    />
  );
}

type Props = { logos?: Record<string, string> };

export default function BrandsCarousel({ logos = {} }: Props) {
  const doubled = [...BRANDS, ...BRANDS];
  const pathname = usePathname();
  const lang: 'uk' | 'ru' = pathname.startsWith('/ru') ? 'ru' : 'uk';
  const prefix = lang === 'ru' ? '/ru' : '';

  return (
    <section style={{ background: 'var(--bg-card)', padding: '28px 0', borderTop: '1px solid var(--border)', borderBottom: '1px solid var(--border)', overflow: 'hidden' }}>
      <div style={{ marginBottom: '18px', textAlign: 'center' }}>
        <p style={{ margin: 0, fontSize: '12px', fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-secondary)' }}>
          {lang === 'ru' ? 'Работаем с лучшими брендами' : 'Працюємо з найкращими брендами'}
        </p>
      </div>

      {/* Auto-scrolling track */}
      <div
        className="brands-marquee"
        style={{ display: 'flex', width: 'max-content', alignItems: 'center' }}
      >
        {doubled.map((brand, idx) => {
          // Admin-uploaded logo (app/admin/products → "Логотипи брендів") takes priority
          // over the built-in fallback file, so replacing a logo never needs a code change.
          const logoSrc = logos[brand.name.toUpperCase()] ?? brand.logo;
          return (
            <Link
              key={idx}
              href={`${prefix}${brand.href}`}
              className="brand-card"
              style={{ flexShrink: 0 }}
            >
              {logoSrc ? (
                <FadeLogo src={logoSrc} alt={brand.name} />
              ) : (
                <span style={{
                  color: brand.color,
                  padding: '0 10px',
                  textAlign: 'center',
                  ...brand.style,
                }}>
                  {brand.name}
                </span>
              )}
            </Link>
          );
        })}
      </div>
    </section>
  );
}
