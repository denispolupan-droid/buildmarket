'use client';

import { usePathname } from 'next/navigation';
import { useEffect, useRef, Suspense } from 'react';

function Inner({ children, className, style }: {
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
}) {
  const pathname = usePathname();
  const ref      = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.classList.remove('page-transition-enter');
    void el.offsetWidth;
    el.classList.add('page-transition-enter');
  }, [pathname]);

  return (
    <div ref={ref} className={`page-transition-enter${className ? ` ${className}` : ''}`} style={style}>
      {children}
    </div>
  );
}

export default function PageTransition({ children, className, style }: {
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <Suspense fallback={<div style={style} className={className}>{children}</div>}>
      <Inner className={className} style={style}>{children}</Inner>
    </Suspense>
  );
}
