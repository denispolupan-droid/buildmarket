'use client';

import { Printer } from 'lucide-react';

export default function PrintButton() {
  return (
    <button
      onClick={() => window.print()}
      title="Друк / Зберегти PDF"
      style={{
        display: 'flex', alignItems: 'center', gap: '6px',
        height: '34px', padding: '0 14px', borderRadius: '8px',
        border: '1.5px solid var(--border)', background: 'var(--bg-soft)',
        color: 'var(--text-secondary)', fontSize: '12px', fontWeight: 600,
        cursor: 'pointer',
      }}
    >
      <Printer size={14} /> Друк
    </button>
  );
}
