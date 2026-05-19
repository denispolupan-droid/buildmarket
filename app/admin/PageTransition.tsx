'use client';

import { usePathname } from 'next/navigation';
import { useEffect, useRef, Suspense } from 'react';

function Inner({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const ref      = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.classList.remove('admin-page-enter');
    void el.offsetWidth; // force reflow → перезапуск анімації
    el.classList.add('admin-page-enter');
  }, [pathname]);

  return (
    <div ref={ref} className="admin-page-enter" style={{ flex: 1, minWidth: 0, overflow: 'auto' }}>
      {children}
    </div>
  );
}

export default function PageTransition({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={<div style={{ flex: 1 }}>{children}</div>}>
      <Inner>{children}</Inner>
    </Suspense>
  );
}
