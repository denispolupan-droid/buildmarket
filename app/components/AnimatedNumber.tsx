'use client';

import { useEffect, useState } from 'react';

type Props = {
  value: number;
  suffix?: string;
  duration?: number;
};

export default function AnimatedNumber({ value, suffix = '', duration = 1300 }: Props) {
  const [display, setDisplay] = useState(0);

  // No "already started" ref guard here on purpose — React's dev-mode StrictMode runs this
  // effect, its cleanup, and then the effect again on mount. A guard that only lets the
  // animation start once would see the cleanup cancel the first run's frame and then skip
  // starting a new one on the second run, leaving the counter stuck at 0 forever. Letting
  // the effect restart cleanly each time it runs is what actually works.
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setDisplay(value);
      return;
    }

    const start = performance.now();
    let raf: number;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 4);
      setDisplay(Math.round(eased * value));
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, duration]);

  return <>{display}{suffix}</>;
}
