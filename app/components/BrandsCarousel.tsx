'use client';

import { useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { BRANDS, type BrandTile } from '../../lib/brands';

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

type Props = { logos?: Record<string, string>; brands?: BrandTile[] };

const AUTO_SCROLL_SPEED = 0.6; // px/frame, ~36px/s at 60fps
const BUTTON_RESUME_DELAY = 900; // ms — lets the button's smooth-scroll animation finish first

export default function BrandsCarousel({ logos = {}, brands = BRANDS }: Props) {
  const doubled = [...brands, ...brands];
  const pathname = usePathname();
  const lang: 'uk' | 'ru' = pathname.startsWith('/ru') ? 'ru' : 'uk';
  const prefix = lang === 'ru' ? '/ru' : '';

  const trackRef = useRef<HTMLDivElement>(null);
  const pausedRef = useRef(false);
  // scrollLeft only ever reports whole pixels, so accumulating fractional
  // per-frame speed directly on it rounds away to nothing — keep the real
  // (fractional) position here instead and write the rounded value out.
  const posRef = useRef(0);
  const resumeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const track = trackRef.current;
    if (!track) return;
    let raf: number;
    const step = () => {
      if (!pausedRef.current) {
        const half = track.scrollWidth / 2;
        posRef.current += AUTO_SCROLL_SPEED;
        if (posRef.current >= half) posRef.current -= half;
        track.scrollLeft = posRef.current;
      }
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, []);

  function resumeNow() {
    if (resumeTimerRef.current) clearTimeout(resumeTimerRef.current);
    const track = trackRef.current;
    if (track) posRef.current = track.scrollLeft; // continue from wherever the user left it
    pausedRef.current = false;
  }
  function pause() {
    pausedRef.current = true;
    if (resumeTimerRef.current) clearTimeout(resumeTimerRef.current);
  }
  function scheduleResume() {
    if (resumeTimerRef.current) clearTimeout(resumeTimerRef.current);
    resumeTimerRef.current = setTimeout(resumeNow, BUTTON_RESUME_DELAY);
  }

  function scroll(dir: 1 | -1) {
    const track = trackRef.current;
    if (!track) return;
    pause();
    track.scrollBy({ left: dir * 3 * 170, behavior: 'smooth' });
    scheduleResume();
  }

  return (
    <section style={{ background: 'var(--bg-card)', padding: '28px 0', borderTop: '1px solid var(--border)', borderBottom: '1px solid var(--border)' }}>
      <div style={{ marginBottom: '18px', textAlign: 'center' }}>
        <p style={{ margin: 0, fontSize: '12px', fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-secondary)' }}>
          {lang === 'ru' ? 'Работаем с лучшими брендами' : 'Працюємо з найкращими брендами'}
        </p>
      </div>

      <div className="page-container" style={{ position: 'relative' }}>
        <button
          onClick={() => scroll(-1)}
          aria-label={lang === 'ru' ? 'Прокрутить влево' : 'Прокрутити вліво'}
          className="blog-carousel-arrow"
          style={{
            position: 'absolute', left: '4px', top: '50%', transform: 'translateY(-50%)',
            zIndex: 2, width: '36px', height: '36px', borderRadius: '50%',
            border: '1px solid var(--border)', background: 'var(--bg-card)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'pointer', boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
          }}
        >
          <ChevronLeft size={16} color="var(--text-secondary)" />
        </button>
        <button
          onClick={() => scroll(1)}
          aria-label={lang === 'ru' ? 'Прокрутить вправо' : 'Прокрутити вправо'}
          className="blog-carousel-arrow"
          style={{
            position: 'absolute', right: '4px', top: '50%', transform: 'translateY(-50%)',
            zIndex: 2, width: '36px', height: '36px', borderRadius: '50%',
            border: '1px solid var(--border)', background: 'var(--bg-card)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'pointer', boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
          }}
        >
          <ChevronRight size={16} color="var(--text-secondary)" />
        </button>

        <div
          ref={trackRef}
          className="brands-marquee"
          onMouseEnter={pause}
          onMouseLeave={resumeNow}
          onTouchStart={pause}
          onTouchEnd={scheduleResume}
          style={{ display: 'flex', overflowX: 'auto', alignItems: 'center', padding: '0 48px' }}
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
      </div>
    </section>
  );
}
