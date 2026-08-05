'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * Tracks scroll direction to drive a "collapsing sticky header" effect: true
 * while scrolling down past `threshold` (the sticky search bar hugs the site
 * header), false near the top or while scrolling up (the bar returns to its
 * normal position).
 *
 * Requires a sustained `toggleDistance` px of scroll in one direction before
 * flipping state, with the accumulator reset on every direction reversal —
 * without this, a little jitter (trackpad or momentum-scroll deceleration
 * rarely moves in a perfectly straight line) flips the state on nearly every
 * frame, which reads as the bar "jumping" even though the CSS transition
 * itself is smooth.
 */
/**
 * Вікно, протягом якого хук ігнорує зміни scrollY, лише пересинхронізовуючись.
 *
 * Потрібно при переході між категоріями: скрол-анкоринг браузера програмно
 * зсуває scrollY (список підмінюється, висота контенту змінюється), хук читав
 * це як «користувач крутнув угору» і анімовано повертав пошуковий бар — бар
 * смикався на КОЖЕН клік по категорії. Виклич suppressStickyCompact() перед
 * router.push, і програмні зсуви перестануть впливати на стан бара.
 */
let suppressUntil = 0;
export function suppressStickyCompact(ms = 1500) {
  suppressUntil = Date.now() + ms;
}

// Стан переживає перемонтування: при переході між категоріями ShopClient
// монтується заново, і useState(false) різко розгортав бар одним кадром —
// клац на кожен клік. Модульна змінна безпечна: бар на сторінці один.
let lastCompact = false;

export function useStickyCompact(threshold = 80, toggleDistance = 24) {
  const [compact, setCompactState] = useState(() => lastCompact);
  const lastY = useRef(0);
  const accum = useRef(0);
  const setCompact = (v: boolean) => { lastCompact = v; setCompactState(v); };

  useEffect(() => {
    lastY.current = window.scrollY;
    let ticking = false;
    function onScroll() {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        const y = window.scrollY;
        const delta = y - lastY.current;
        lastY.current = y;

        if (Date.now() < suppressUntil) {
          // Програмний зсув (навігація/анкоринг): пересинхронізуємось і мовчимо.
          accum.current = 0;
          ticking = false;
          return;
        }

        if (y < threshold) {
          accum.current = 0;
          setCompact(false);
          ticking = false;
          return;
        }

        if ((delta > 0 && accum.current < 0) || (delta < 0 && accum.current > 0)) {
          accum.current = 0;
        }
        accum.current += delta;

        if (accum.current > toggleDistance) setCompact(true);
        else if (accum.current < -toggleDistance) setCompact(false);

        ticking = false;
      });
    }
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, [threshold, toggleDistance]);

  return compact;
}
