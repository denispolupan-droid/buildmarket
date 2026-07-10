'use client';

import Image from 'next/image';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

const BRANDS = [
  { name: 'Ceresit',  logo: '/brands/ceresit.webp',  href: '/shop/brand/ceresit',  color: '#E31E25', style: {} },
  { name: 'Knauf',    logo: null,                     href: '/shop/brand/knauf',    color: '#0066CC',
    style: { fontWeight: 900, fontSize: '22px', letterSpacing: '-0.5px', fontFamily: 'Arial Black, sans-serif' } },
  { name: 'Lacrysil', logo: '/brands/Lacrysil.png',  href: '/shop/brand/lacrysil', color: '#1E7B3E', style: {} },
  { name: 'POLIFARB', logo: null,                     href: '/shop/brand/polifarb', color: '#D10000',
    style: { fontWeight: 900, fontSize: '17px', letterSpacing: '0.04em' } },
  { name: 'ESKARO',   logo: null,                     href: '/shop/brand/eskaro',   color: '#004EA2',
    style: { fontWeight: 900, fontSize: '20px', letterSpacing: '0.06em' } },
  { name: 'Pattex',   logo: '/brands/pattex.webp',   href: '/shop/brand/pattex',   color: '#E20025', style: {} },
  { name: 'AURA',     logo: null,                     href: '/shop/brand/aura',     color: '#0072CE',
    style: { fontWeight: 900, fontSize: '26px', letterSpacing: '-1px', fontStyle: 'italic' } },
  { name: 'Ataman',   logo: '/brands/ataman.jpg',     href: '/shop/brand/ataman',   color: '#8B1A1A', style: {} },
  { name: 'Bitugum',  logo: '/brands/bitugum.webp',   href: '/shop/brand/bitugum',  color: '#1A1A1A', style: {} },
] as const;

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
                <Image
                  src={logoSrc}
                  alt={brand.name}
                  width={120}
                  height={54}
                  style={{ objectFit: 'contain', maxWidth: '120px', maxHeight: '54px' }}
                />
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
