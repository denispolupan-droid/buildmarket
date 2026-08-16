'use client';

import { Plus } from 'lucide-react';

type Supplier = { id: number; name: string; email?: string | null };

export default function ProcurementClient({ suppliers }: { suppliers: Supplier[] }) {
  function openNew() {
    window.dispatchEvent(new CustomEvent('open-po-draft', { detail: { suppliers } }));
  }

  return (
    <button onClick={openNew} className="proc-btn primary">
      <Plus size={15} /> Нове замовлення
    </button>
  );
}
