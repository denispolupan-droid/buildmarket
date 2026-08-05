'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';

type Props = {
  children: React.ReactNode;
  delay?: number;
  y?: number;
  duration?: number;
  className?: string;
  style?: React.CSSProperties;
};

// SEO-обережний reveal: у серверному HTML (і для клієнтів без JS) контент
// ВИДИМИЙ — прихований контент Google девальвує, а під Reveal тепер живуть
// SEO-тексти категорій і FAQ. Ховаємо лише після гідрації (useLayoutEffect,
// до першого кадру) і лише елементи НИЖЧЕ в'юпорта — користувач цього не
// бачить, а анімація з'являється тільки при докрутці до блока.
export default function Reveal({ children, delay = 0, y = 10, duration = 1300, className, style }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [hidden, setHidden] = useState(false);
  const [animating, setAnimating] = useState(false);
  // will-change stays on only while the transition is actually running — promoting the element
  // to its own compositor layer up front (instead of mid-animation) avoids a first-frame hitch,
  // and dropping it once settled avoids leaving many permanently-promoted layers on the page,
  // which is its own source of jank when there are lots of Reveal instances.
  const [settled, setSettled] = useState(false);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    // Елементи, що вже в кадрі при завантаженні, не ховаємо взагалі —
    // інакше видимий контент блимнув би. Анімуються лише ті, до яких ще крутити.
    if (el.getBoundingClientRect().top <= window.innerHeight - 60) return;
    // transition тут вимкнений (animating=false), тож приховування не «згасає» кадром
    setHidden(true);
  }, []);

  useEffect(() => {
    if (!hidden) return;
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          // Вмикаємо transition тим самим комітом, що й показ — анімується
          // лише розкриття, не приховування
          setAnimating(true);
          setHidden(false);
          observer.disconnect();
        }
      },
      { threshold: 0.12, rootMargin: '0px 0px -60px 0px' }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [hidden]);

  return (
    <div
      ref={ref}
      className={className}
      onTransitionEnd={() => setSettled(true)}
      style={{
        ...style,
        opacity: hidden ? 0 : 1,
        transform: hidden ? `translateY(${y}px)` : 'translateY(0)',
        transition: animating
          ? `opacity ${duration}ms cubic-bezier(0.22,1,0.36,1) ${delay}ms, transform ${duration}ms cubic-bezier(0.22,1,0.36,1) ${delay}ms`
          : 'none',
        willChange: animating && !settled ? 'opacity, transform' : 'auto',
      }}
    >
      {children}
    </div>
  );
}
