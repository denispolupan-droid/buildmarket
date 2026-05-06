'use client';

import { useEffect, useState } from 'react';
import { ArrowLeft } from 'lucide-react';

export default function BackButton({ breadcrumbId }: { breadcrumbId: string }) {
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
        top: '64px',
        left: '4px',
        zIndex: 100,
        display: 'flex',
        alignItems: 'center',
        gap: '4px',
        height: '32px',
        padding: '0 10px',
        background: 'transparent',
        border: 'none',
        fontSize: '14px',
        fontWeight: 700,
        color: '#475569',
        cursor: 'pointer',
        letterSpacing: '-0.2px',
        textShadow: '0 1px 3px rgba(255,255,255,0.8)',
        transition: 'color 0.15s',
      }}
      onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.color = '#0F172A'; }}
      onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.color = '#475569'; }}
    >
      <ArrowLeft size={15} strokeWidth={2.5} />
      Назад
    </button>
  );
}
