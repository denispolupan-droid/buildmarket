'use client';

import { Pencil } from 'lucide-react';

type Props = {
  poId:         string;
  supplierId:   number;
  supplierName: string;
  expectedDate: string;
  notes:        string;
  lines: { sku: string; name: string; brand: string; qty: number; cost_price: number; matched: boolean }[];
};

export default function EditDraftButton({ poId, supplierId, supplierName, expectedDate, notes, lines }: Props) {
  function handleEdit() {
    // Отримуємо список постачальників з DOM (вже завантажені в PoDraftManager)
    // або передаємо мінімальний набір
    window.dispatchEvent(new CustomEvent('open-po-draft', {
      detail: {
        suppliers: [{ id: supplierId, name: supplierName }],
        prefill: {
          dbId:         poId,
          supplierId,
          expectedDate,
          notes,
          lines: lines.map(l => ({
            sku:        l.sku,
            name:       `${l.brand} ${l.name}`.trim() || l.sku,
            qty:        l.qty,
            cost_price: l.cost_price,
            matched:    l.matched,
          })),
        },
      },
    }));
  }

  return (
    <button
      onClick={handleEdit}
      style={{
        display: 'flex', alignItems: 'center', gap: '6px',
        height: '34px', padding: '0 14px', borderRadius: '8px',
        border: '1.5px solid #1E3A5F', background: '#EFF4FF',
        color: '#1E3A5F', fontSize: '13px', fontWeight: 700, cursor: 'pointer',
      }}
    >
      <Pencil size={13} /> Редагувати чернетку
    </button>
  );
}
