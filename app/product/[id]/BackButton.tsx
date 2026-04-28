'use client';

import { useRouter } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';

export default function BackButton() {
  const router = useRouter();

  return (
    <button
      onClick={() => router.back()}
      style={{
        position: 'fixed',
        top: '76px',
        left: '20px',
        zIndex: 100,
        display: 'flex',
        alignItems: 'center',
        gap: '6px',
        height: '34px',
        padding: '0 12px',
        background: 'rgba(255,255,255,0.85)',
        backdropFilter: 'blur(8px)',
        border: '1px solid var(--border)',
        borderRadius: '8px',
        fontSize: '13px',
        fontWeight: 600,
        color: 'var(--text-secondary)',
        cursor: 'pointer',
        boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
        transition: 'background 0.15s, color 0.15s',
      }}
      onMouseEnter={e => {
        (e.currentTarget as HTMLButtonElement).style.background = '#fff';
        (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-primary)';
      }}
      onMouseLeave={e => {
        (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.85)';
        (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-secondary)';
      }}
    >
      <ArrowLeft size={14} strokeWidth={2.5} />
      Назад
    </button>
  );
}
