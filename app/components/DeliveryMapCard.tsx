'use client';

import { useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';

export default function DeliveryMapCard() {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  const [mountKey, setMountKey] = useState(0);
  const pathname = usePathname();
  const lang: 'uk' | 'ru' = pathname.startsWith('/ru') ? 'ru' : 'uk';

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          // Remount the <img> with a fresh key so the SVG's intro animation
          // always restarts on arrival — even on a revisit via client-side
          // navigation, where the previous <img> node (and its finished
          // animation state) would otherwise still be sitting in the DOM.
          setVisible(true);
          setMountKey(k => k + 1);
        } else {
          setVisible(false);
        }
      },
      // Matches the outer <Reveal> wrapper's threshold/rootMargin exactly, so the card's fade-in
      // and the map's own draw-in animation start together as one motion instead of the card
      // settling first and the map content popping in separately a beat later.
      { threshold: 0.12, rootMargin: '0px 0px -60px 0px' }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={ref} className="delivery-map-card" style={{
      position: 'relative', overflow: 'hidden',
      borderTop: '3px solid #0891B2', borderRadius: '2px 2px 18px 18px',
      height: '440px', background: '#0C1930',
      isolation: 'isolate', willChange: 'opacity',
    }}>
      {/* Map — remounted (fresh key) every time it enters view, so the intro animation replays */}
      {visible && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          key={mountKey}
          src="/images/ukraine-map-animated.svg"
          alt={lang === 'ru' ? 'Карта доставки по Украине' : 'Карта доставки по Україні'}
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }}
        />
      )}

      {/* Duotone tint — matches the warehouse photo's palette: a color-blend wash for the same rich
          navy hue, plus a touch of screen to lift the brightness closer to the photo card */}
      <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', background: '#1E4D8C', mixBlendMode: 'color', opacity: 0.45 }} />
      <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', background: '#8FC3F0', mixBlendMode: 'screen', opacity: 0.16 }} />

      {/* Translucent scrim — mirrors the warehouse card's gradient, just flipped to shade the top */}
      <div style={{
        position: 'absolute', inset: 0, pointerEvents: 'none',
        background: 'linear-gradient(to bottom, rgba(8,15,30,0.92) 0%, rgba(8,15,30,0.15) 65%)',
      }} />

      <div style={{ position: 'relative', padding: '24px 28px' }}>
        <h2 style={{ fontSize: '22px', fontWeight: 800, color: '#fff', marginBottom: '4px' }}>
          {lang === 'ru' ? 'Доставляем по всей Украине' : 'Доставляємо по всій Україні'}
        </h2>
        <p style={{ fontSize: '13px', color: 'rgba(255,255,255,0.65)' }}>
          {lang === 'ru' ? 'Новая Почта · 28 000+ отделений по стране' : 'Нова Пошта · 28 000+ відділень по країні'}
        </p>
      </div>
    </div>
  );
}
