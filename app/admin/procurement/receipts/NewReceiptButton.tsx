'use client';

import { Plus } from 'lucide-react';

export default function NewReceiptButton() {
  return (
    <button
      onClick={() => window.dispatchEvent(new CustomEvent('open-receipt-draft'))}
      className="proc-btn primary"
    >
      <Plus size={15} /> Новий прихід
    </button>
  );
}
