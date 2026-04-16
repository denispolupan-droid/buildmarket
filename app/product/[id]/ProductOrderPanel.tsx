'use client';

import { useState } from 'react';
import { Plus } from 'lucide-react';

type Props = {
  priceUnit: number;
  minOrder: number;
};

export default function ProductOrderPanel({ priceUnit, minOrder }: Props) {
  const [qty, setQty] = useState(minOrder);
  const [liked, setLiked] = useState(false);

  function dec() { setQty(q => Math.max(minOrder, q - 1)); }
  function inc() { setQty(q => q + 1); }
  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const val = parseInt(e.target.value, 10);
    if (!isNaN(val) && val >= minOrder) setQty(val);
  }

  const subtotal = (priceUnit * qty).toLocaleString('uk-UA');

  return (
    <div>
      {/* Single row: label | stepper | sum | button | fav */}
      <div style={{ fontSize: '13px', color: '#64748B', marginBottom: '8px' }}>Кількість:</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>

        {/* Stepper */}
        <div className="qty-stepper">
          <button className="qty-stepper__btn" onClick={dec}>−</button>
          <input
            className="qty-stepper__val"
            type="number"
            value={qty}
            min={minOrder}
            onChange={handleChange}
          />
          <button className="qty-stepper__btn" onClick={inc}>+</button>
        </div>

        {/* Sum — fixed min-width so button never shifts */}
        {priceUnit > 0 && (
          <span style={{ whiteSpace: 'nowrap', minWidth: '160px', display: 'flex', flexDirection: 'column', gap: '1px' }}>
            <span style={{ fontSize: '11px', fontWeight: 600, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.6px' }}>Сума</span>
            <span style={{ fontSize: '20px', fontWeight: 700, color: '#0F172A', lineHeight: 1 }}>{subtotal} <span style={{ fontSize: '13px', fontWeight: 500, color: '#64748B' }}>грн</span></span>
          </span>
        )}

        {/* В кошик */}
        <button style={{
          height: '44px', padding: '0 28px', border: 'none',
          borderRadius: '10px', background: '#2563EB', color: '#fff',
          fontSize: '14px', fontWeight: 700, cursor: 'pointer',
          whiteSpace: 'nowrap', flexShrink: 0, marginLeft: '32px',
          display: 'flex', alignItems: 'center', gap: '6px',
        }}>
          <Plus size={15} strokeWidth={2.5} /> В кошик
        </button>

        {/* Favourite */}
        <button
          onClick={() => setLiked(l => !l)}
          style={{
            width: '44px', height: '44px', borderRadius: '50%', flexShrink: 0,
            border: `1px solid ${liked ? '#FECACA' : '#E2E8F0'}`,
            background: liked ? '#FEF2F2' : '#fff',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: liked ? '#EF4444' : '#94A3B8', fontSize: '18px', cursor: 'pointer',
          }}
        >
          {liked ? '♥' : '♡'}
        </button>

      </div>

      {/* Min order note */}
      <div style={{ fontSize: '12px', color: '#94A3B8', marginTop: '6px' }}>
        Мін. замовлення: {minOrder} шт
      </div>
    </div>
  );
}
