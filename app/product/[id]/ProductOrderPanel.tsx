'use client';

import { useState } from 'react';
import { Plus, Check, Bell, Heart } from 'lucide-react';
import { useCart } from '../../../lib/cart';
import { useWishlist } from '../../../lib/wishlist';

type Props = {
  priceUnit: number;
  minOrder: number;
  inStock: boolean;
  sku: string;
  name: string;
  brand: string;
  volume: string | null;
  nl1: string | null;
  nl2: string | null;
  bc: string;
  ac: string;
  imgType: 'tube' | 'canister';
};

export default function ProductOrderPanel({ priceUnit, minOrder, inStock, sku, name, brand, volume, nl1, nl2, bc, ac, imgType }: Props) {
  const [qty, setQty]           = useState(minOrder);
  const [added, setAdded]       = useState(false);
  const [notified, setNotified] = useState(false);
  const { addItem } = useCart();
  const { isLiked, toggle: toggleWish } = useWishlist();
  const liked = isLiked(sku);

  function dec() { setQty(q => Math.max(minOrder, q - 1)); }
  function inc() { setQty(q => q + 1); }
  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const val = parseInt(e.target.value, 10);
    if (!isNaN(val) && val >= minOrder) setQty(val);
  }

  function handleAddToCart() {
    addItem({ sku, name, brand, volume, price: priceUnit, min_order: minOrder, nl1: nl1 ?? '', nl2: nl2 ?? undefined, bc, ac, img_type: imgType }, qty);
    setAdded(true);
    setTimeout(() => setAdded(false), 1500);
  }

  function handleNotify() {
    setNotified(true);
    // TODO: save notification request to DB
  }

  const subtotal = (priceUnit * qty).toLocaleString('uk-UA');

  return (
    <div>
      {inStock ? (
        <>
          <div style={{ fontSize: '13px', color: '#64748B', marginBottom: '8px' }}>Кількість:</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>

            <div className="qty-stepper">
              <button className="qty-stepper__btn" onClick={dec}>−</button>
              <input className="qty-stepper__val" type="number" value={qty} min={minOrder} onChange={handleChange} />
              <button className="qty-stepper__btn" onClick={inc}>+</button>
            </div>

            {priceUnit > 0 && (
              <span style={{ whiteSpace: 'nowrap', minWidth: '160px', display: 'flex', flexDirection: 'column', gap: '1px' }}>
                <span style={{ fontSize: '11px', fontWeight: 600, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.6px' }}>Сума</span>
                <span style={{ fontSize: '20px', fontWeight: 700, color: '#0F172A', lineHeight: 1 }}>
                  {subtotal} <span style={{ fontSize: '13px', fontWeight: 500, color: '#64748B' }}>грн</span>
                </span>
              </span>
            )}

            <button
              onClick={handleAddToCart}
              className={!added ? 'btn-primary' : undefined}
              style={{
                height: '44px', padding: '0 28px', border: 'none', borderRadius: '10px',
                background: added ? '#16A34A' : '#4880B8', color: '#fff',
                fontSize: '14px', fontWeight: 700, cursor: 'pointer',
                whiteSpace: 'nowrap', flexShrink: 0, marginLeft: '32px',
                display: 'flex', alignItems: 'center', gap: '6px',
                transition: 'background 0.2s',
              }}
            >
              {added ? <><Check size={15} strokeWidth={2.5} /> Додано</> : <><Plus size={15} strokeWidth={2.5} /> В кошик</>}
            </button>

            <button
              onClick={() => toggleWish(sku)}
              aria-label={liked ? 'Прибрати з обраного' : 'Додати в обране'}
              style={{
                width: '44px', height: '44px', borderRadius: '50%', flexShrink: 0,
                border: `1px solid ${liked ? '#FECACA' : 'var(--border)'}`,
                background: liked ? '#FEF2F2' : 'var(--bg-card)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: liked ? '#EF4444' : 'var(--text-muted)', cursor: 'pointer',
              }}
            >
              <Heart size={18} fill={liked ? '#EF4444' : 'none'} strokeWidth={2} />
            </button>
          </div>
          <div style={{ fontSize: '12px', color: '#94A3B8', marginTop: '6px' }}>
            Мін. замовлення: {minOrder} шт
          </div>
        </>
      ) : (
        <div>
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: '6px',
            padding: '6px 14px', borderRadius: '8px',
            background: '#FEE2E2', color: '#DC2626',
            fontSize: '13px', fontWeight: 600,
          }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#DC2626', flexShrink: 0 }} />
            Немає в наявності
          </div>

          <div style={{ marginTop: '16px' }}>
          {notified ? (
            <div style={{
              display: 'flex', alignItems: 'center', gap: '8px',
              padding: '12px 16px', borderRadius: '10px',
              background: '#DCFCE7', color: '#15803D', fontSize: '14px', fontWeight: 600,
            }}>
              <Check size={16} strokeWidth={2.5} />
              Ми повідомимо вас про появу товару
            </div>
          ) : (
            <button
              onClick={handleNotify}
              style={{
                display: 'flex', alignItems: 'center', gap: '8px',
                height: '44px', padding: '0 24px', borderRadius: '10px',
                background: '#1E3A5F', color: '#fff', border: 'none',
                fontSize: '14px', fontWeight: 700, cursor: 'pointer',
              }}
            >
              <Bell size={15} strokeWidth={2} />
              Повідомити про появу
            </button>
          )}
          </div>
        </div>
      )}
    </div>
  );
}
