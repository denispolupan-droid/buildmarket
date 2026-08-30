'use client';

import { useEffect, useLayoutEffect, useRef, type RefObject } from 'react';

// Зміна фільтра різко вкорочує список товарів; коли документ стає коротшим за
// поточну прокрутку, браузер «прижимає» вʼюпорт до низу — користувач опинявся
// у підвалі. Для категорій це обходили підйомом сторінки із затримкою, але для
// коротких відфільтрованих списків клемп спрацьовує раніше за анімацію.
//
// Тут: (1) поки триває підйом, колонка товарів тримає ПОПЕРЕДНЮ висоту
// (min-height), тож документу немає куди вкорочуватись; (2) підйом — той самий
// ease-out, що й у сайдбара/категорій, лише ВГОРУ і лише коли початок товарів
// уже над вʼюпортом; (3) після анімації висота відпускається — користувач уже
// вгорі, і зміна висоти нічого не зсуває.
function easeOutQuad(t: number) { return t * (2 - t); }

function smoothScrollTo(el: HTMLElement, targetTop: number, duration: number) {
  const startTop = el.scrollTop;
  const distance = targetTop - startTop;
  if (Math.abs(distance) < 3) return;
  const startTime = performance.now();
  const step = (now: number) => {
    const progress = Math.min((now - startTime) / duration, 1);
    el.scrollTop = startTop + distance * easeOutQuad(progress);
    if (progress < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

export function useLiftOnFilterChange(
  mainRef: RefObject<HTMLElement | null>,
  /** серіалізований стан фільтрів — зміна = тригер */
  signature: string,
  opts: { beforeLift?: () => void; duration?: number } = {},
) {
  const prevHeight = useRef(0);
  const mounted = useRef(false);
  const release = useRef<ReturnType<typeof setTimeout> | null>(null);
  const duration = opts.duration ?? 550;

  // Висота колонки на момент останнього кадру — саме її тримаємо під час підйому
  useEffect(() => {
    if (mainRef.current) prevHeight.current = mainRef.current.offsetHeight;
  });

  useLayoutEffect(() => {
    if (!mounted.current) { mounted.current = true; return; }
    const main = mainRef.current;
    const doc = document.scrollingElement as HTMLElement | null;
    if (!main || !doc) return;

    // Спершу — утримати висоту (до першого читання layout, інакше клемп уже станеться)
    if (prevHeight.current > 0) main.style.minHeight = `${prevHeight.current}px`;
    if (release.current) clearTimeout(release.current);

    const mainTop = main.getBoundingClientRect().top + doc.scrollTop;
    const needLift = doc.scrollTop > mainTop - 8;
    if (needLift) {
      opts.beforeLift?.();
      if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) doc.scrollTop = 0;
      else smoothScrollTo(doc, 0, duration);
    }
    release.current = setTimeout(() => { main.style.minHeight = ''; }, needLift ? duration + 100 : 0);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- тригер лише сигнатура фільтрів
  }, [signature]);
}
