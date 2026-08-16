'use client';

import { Trash2, ArrowLeftRight } from 'lucide-react';

export default function StockDocButtons() {
  function open(docType: 'write_off' | 'transfer') {
    window.dispatchEvent(new CustomEvent('open-stockdoc-draft', { detail: { docType } }));
  }
  return (
    <>
      <button onClick={() => open('transfer')} className="proc-btn">
        <ArrowLeftRight size={14} /> Переміщення
      </button>
      {/* Списання — червоне: єдина дія на екрані, що зменшує залишок безповоротно */}
      <button onClick={() => open('write_off')} className="proc-btn danger">
        <Trash2 size={14} /> Списання
      </button>
    </>
  );
}
