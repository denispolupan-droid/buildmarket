'use client';

import { Plus } from 'lucide-react';

type Supplier = { id: number; name: string; email?: string | null };

export default function ProcurementClient({ suppliers }: { suppliers: Supplier[] }) {
  function openNew() {
    window.dispatchEvent(new CustomEvent('open-po-draft', { detail: { suppliers } }));
  }

  return (
    <button onClick={openNew}
      style={{ display: 'flex', alignItems: 'center', gap: '7px', height: '38px', padding: '0 18px', borderRadius: '8px', border: 'none', background: '#1E3A5F', color: '#fff', fontSize: '13px', fontWeight: 700, cursor: 'pointer' }}>
      <Plus size={15} /> Нове замовлення
    </button>
  );
}
