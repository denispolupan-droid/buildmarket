'use client';

import { Trash2, ArrowLeftRight } from 'lucide-react';

const btn: React.CSSProperties = {
  height: 34, padding: '0 14px', borderRadius: 8, fontSize: 13, fontWeight: 600,
  border: '1.5px solid var(--border)', background: 'var(--bg-card)',
  cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6,
  color: 'var(--text-secondary)',
};

export default function StockDocButtons() {
  function open(docType: 'write_off' | 'transfer') {
    window.dispatchEvent(new CustomEvent('open-stockdoc-draft', { detail: { docType } }));
  }
  return (
    <div style={{ display: 'flex', gap: 8 }}>
      <button onClick={() => open('write_off')} style={{ ...btn, color: '#DC2626', borderColor: '#FECACA' }}>
        <Trash2 size={14} /> Нове списання
      </button>
      <button onClick={() => open('transfer')} style={{ ...btn, color: '#0369A1', borderColor: '#BAE6FD' }}>
        <ArrowLeftRight size={14} /> Переміщення
      </button>
    </div>
  );
}
