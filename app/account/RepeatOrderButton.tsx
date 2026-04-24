'use client';

import { useState } from 'react';
import { RotateCcw, Check } from 'lucide-react';
import { useCart } from '../../lib/cart';

type Item = { sku: string; name: string; brand: string; qty: number; price: number };

export default function RepeatOrderButton({ items }: { items: Item[] }) {
  const [done, setDone] = useState(false);
  const { addItem } = useCart();

  function handleRepeat() {
    items.forEach(item => {
      addItem({
        sku: item.sku, name: item.name, brand: item.brand,
        volume: null, price: item.price, min_order: 1,
        nl1: '', nl2: undefined, bc: '#E8EEF5', ac: '#1E3A5F', img_type: 'tube',
      }, item.qty);
    });
    setDone(true);
    setTimeout(() => setDone(false), 2000);
  }

  return (
    <button
      onClick={handleRepeat}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: '6px',
        fontSize: '12px', fontWeight: 700,
        padding: '6px 14px', borderRadius: '8px',
        background: done ? '#DCFCE7' : '#F1F5F9',
        color: done ? '#15803D' : '#475569',
        border: `1.5px solid ${done ? '#BBF7D0' : '#E2E8F0'}`,
        cursor: 'pointer', whiteSpace: 'nowrap',
        transition: 'all 0.2s',
      }}
    >
      {done ? <><Check size={12} strokeWidth={2.5} /> Додано до кошика</> : <><RotateCcw size={12} strokeWidth={2} /> Повторити</>}
    </button>
  );
}
