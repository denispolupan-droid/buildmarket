'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { NP_BRANCHES, RZ_POINTS } from '../../lib/site';

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

  const branches = NP_BRANCHES.toLocaleString(lang === 'ru' ? 'ru-RU' : 'uk-UA');
  const subtitle = lang === 'ru'
    ? `Новая Почта · ${branches}+ отделений · ${RZ_POINTS} точек ROZETKA`
    : `Нова Пошта · ${branches}+ відділень · ${RZ_POINTS} точок ROZETKA`;

  return (
    <div ref={ref} className="delivery-map-card" style={{ isolation: 'isolate', willChange: 'opacity' }}>
      <div className="delivery-map-card__visual" style={{
        position: 'relative', overflow: 'hidden',
        // Той самий фірмовий градієнт, що в hero головної та на /opt і /blog —
        // щоб картка не жила у «своєму» синьому
        background: 'radial-gradient(560px 300px at 85% -10%, rgba(94,234,212,0.14), transparent 60%), linear-gradient(160deg, #0F172A 0%, #1E3A5F 60%, #123B54 100%)',
        borderRadius: '20px', height: '360px',
      }}>
      {/* Map — remounted (fresh key) every time it enters view, so the intro animation replays */}
      {visible && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          key={mountKey}
          src={lang === 'ru' ? '/images/ukraine-map-animated-ru.svg' : '/images/ukraine-map-animated.svg'}
          alt={lang === 'ru' ? 'Карта доставки по Украине' : 'Карта доставки по Україні'}
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', filter: 'brightness(1.4)' }}
        />
      )}

      {/* Легкий screen-шар зближує тон мапи з градієнтом підкладки */}
      <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', background: '#7DB8E8', mixBlendMode: 'screen', opacity: 0.24 }} />

      {/* Translucent scrim — m'якше, ніж було: тільки під заголовком зверху */}
      <div style={{
        position: 'absolute', inset: 0, pointerEvents: 'none',
        background: 'linear-gradient(to bottom, rgba(8,15,30,0.7) 0%, rgba(8,15,30,0.04) 55%)',
      }} />
      {/* Рядок з цифрами перевізників живе внизу картинки — там єдине місце без
          міст. Під заголовком він накладався на підписи «Житомир» і «Київ», і
          два шари дрібного тексту читалися як брак. Знизу потрібен власний
          затемнювач: верхній до низу картки вже майже прозорий. */}
      <div style={{
        position: 'absolute', inset: 0, pointerEvents: 'none',
        background: 'linear-gradient(to top, rgba(8,15,30,0.85) 0%, rgba(8,15,30,0) 45%)',
      }} />

        <div style={{ position: 'relative', height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', padding: '24px 28px' }}>
          <h2 style={{ fontSize: '22px', fontWeight: 800, color: '#fff', margin: 0 }}>
            {lang === 'ru' ? 'Доставляем по всей Украине' : 'Доставляємо по всій Україні'}
          </h2>
          <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' }}>
            <p style={{ margin: 0, fontSize: '13px', color: 'rgba(255,255,255,0.75)' }}>
              {subtitle}
            </p>
            {/* Картка була глухим кутом: найпомітніший блок секції нікуди не вів.
                Кого зачепила мапа — той хоче умови й строки. */}
            <Link href={lang === 'ru' ? '/ru/delivery' : '/delivery'} style={{
              fontSize: '14px', fontWeight: 700, color: '#93C5FD',
              textDecoration: 'none', whiteSpace: 'nowrap', marginLeft: 'auto',
            }}>
              {lang === 'ru' ? 'Условия доставки →' : 'Умови доставки →'}
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
