'use client';

import { Plus } from 'lucide-react';

export default function NewReceiptButton() {
  return (
    <button
      onClick={() => window.dispatchEvent(new CustomEvent('open-receipt-draft'))}
      style={{
        display: 'flex', alignItems: 'center', gap: '6px',
        height: '34px', padding: '0 18px', borderRadius: '8px',
        border: 'none', background: '#1E3A5F', color: '#fff',
        fontSize: '13px', fontWeight: 700, cursor: 'pointer',
      }}
    >
      <Plus size={15} /> Новий прихід
    </button>
  );
}
