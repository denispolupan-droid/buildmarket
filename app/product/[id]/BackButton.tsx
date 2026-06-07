'use client';

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';

export default function BackButton({ breadcrumbId }: { breadcrumbId: string }) {
  const pathname = usePathname();
  const lang = pathname.startsWith('/ru') ? 'ru' : 'uk';
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  useEffect(() => {
    const el = document.getElementById(breadcrumbId);
    if (!el) return;

    const observer = new IntersectionObserver(
      ([entry]) => setVisible(!entry.isIntersecting),
      { threshold: 0 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [breadcrumbId]);

  if (!visible) return null;

  return (
    <button
      onClick={() => window.history.back()}
      style={{
        position: 'fixed',
        top: '74px',
        left: '16px',
        zIndex: 100,
        display: 'flex',
        alignItems: 'center',
        gap: '6px',
        height: '36px',
        padding: '0 14px 0 10px',
        background: 'var(--bg-card, #fff)',
        border: '1px solid var(--border, #E2E8F0)',
        borderRadius: '20px',
        fontSize: '13px',
        fontWeight: 600,
        color: 'var(--text-secondary, #475569)',
        cursor: 'pointer',
        boxShadow: '0 2px 8px rgba(0,0,0,0.10)',
        transition: 'box-shadow 0.15s, color 0.15s, transform 0.15s',
      }}
      onMouseEnter={e => {
        const b = e.currentTarget as HTMLButtonElement;
        b.style.boxShadow = '0 4px 16px rgba(0,0,0,0.15)';
        b.style.color = 'var(--text-primary, #0F172A)';
        b.style.transform = 'translateY(-1px)';
      }}
      onMouseLeave={e => {
        const b = e.currentTarget as HTMLButtonElement;
        b.style.boxShadow = '0 2px 8px rgba(0,0,0,0.10)';
        b.style.color = 'var(--text-secondary, #475569)';
        b.style.transform = 'translateY(0)';
      }}
    >
      <ArrowLeft size={14} strokeWidth={2.5} />
      {lang === 'ru' ? 'Назад' : 'Назад'}
    </button>
  );
}
