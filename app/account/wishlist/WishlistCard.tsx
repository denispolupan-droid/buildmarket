'use client';

import Link from 'next/link';
import { useState, useRef } from 'react';
import { ShoppingCart, Trash2, Check } from 'lucide-react';
import ProductImage from '../../components/ProductImage';
import { useCart } from '../../../lib/cart';
import { useWishlist } from '../../../lib/wishlist';
import type { ProductFull } from '../../../lib/supabase';

export default function WishlistCard({ product, retail = false }: { product: ProductFull; retail?: boolean }) {
  const minOrder = retail ? 1 : product.min_order;
  const [added, setAdded] = useState(false);
  const [qty, setQty] = useState(minOrder);
  const [inputVal, setInputVal] = useState(String(minOrder));
  const [tooltip, setTooltip] = useState(false);
  const { addItem } = useCart();
  const { toggle } = useWishlist();
  const nameRef = useRef<HTMLAnchorElement>(null);

  const price   = retail ? (product.stock?.price_retail ?? 0) : (product.stock?.price_unit ?? 0);
  const inStock = (product.stock?.stock_qty ?? 0) >= minOrder;
  const productHref = `/product/${product.sku}${retail ? '?from=shop' : ''}`;

  function handleAddToCart() {
    addItem({
      sku: product.sku, name: product.name, brand: product.brand,
      volume: product.volume, price, min_order: minOrder,
      nl1: product.nl1 ?? '', nl2: product.nl2 ?? undefined,
      bc: product.bc, ac: product.ac, img_type: product.img_type, imageUrl: product.image ?? undefined,
    }, qty);
    setAdded(true);
    setTimeout(() => toggle(product.sku), 800);
  }

  function commitInput() {
    const v = parseInt(inputVal, 10);
    const valid = !isNaN(v) && v >= minOrder ? v : minOrder;
    setQty(valid);
    setInputVal(String(valid));
  }

  return (
    <div className="wishlist-card" style={{
      background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '12px',
      padding: '16px 20px', display: 'flex', alignItems: 'center', gap: '16px',
    }}>

      {/* Image */}
      <Link href={productHref} className="wishlist-card__img" style={{
        width: '96px', height: '96px', flexShrink: 0,
        background: 'var(--bg-soft)', borderRadius: '8px', overflow: 'hidden',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <ProductImage
          brand={product.brand} nl1={product.nl1 ?? ''} nl2={product.nl2 ?? undefined}
          volume={product.volume ?? ''} bc={product.bc} ac={product.ac} type={product.img_type}
          imageUrl={product.image ?? undefined}
        />
      </Link>

      {/* Info wrapper: display:contents on desktop → flex-col on mobile */}
      <div className="wishlist-card-info">

        {/* Name + meta */}
        <div className="wishlist-card__meta" style={{ flex: 1, minWidth: 0, position: 'relative' }}>
          <div style={{ fontSize: '11px', color: '#94A3B8', marginBottom: '2px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {product.brand} · {product.sku}
          </div>
          <Link
            ref={nameRef}
            href={productHref}
            onMouseEnter={() => { const el = nameRef.current; if (el && el.scrollHeight > el.clientHeight) setTooltip(true); }}
            onMouseLeave={() => setTooltip(false)}
            style={{
              fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)',
              lineHeight: 1.3, textDecoration: 'none',
              display: '-webkit-box', WebkitLineClamp: 3,
              WebkitBoxOrient: 'vertical', overflow: 'hidden',
            }}
          >
            {product.name}
          </Link>
          {tooltip && (
            <div style={{
              position: 'absolute', top: '18px', left: 0, right: 0,
              background: 'var(--bg-card)', border: '1px solid var(--border)',
              borderRadius: '0 8px 8px 8px', padding: '6px 8px',
              fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)',
              lineHeight: 1.3, boxShadow: '0 4px 16px rgba(0,0,0,0.10)',
              zIndex: 50, pointerEvents: 'none',
            }}>
              {product.name}
            </div>
          )}
        </div>

        {/* Pack qty */}
        <div className="wishlist-card__pack" style={{ fontSize: '12px', color: '#64748B', flexShrink: 0, minWidth: '70px', textAlign: 'center' }}>
          <div style={{ fontSize: '10px', color: '#94A3B8', marginBottom: '2px' }}>в упаковці</div>
          <span style={{ fontWeight: 700, color: '#0F172A' }}>{product.pack_qty}</span> шт
        </div>

        {/* Stock */}
        <div className="wishlist-card__stock" style={{ fontSize: '12px', fontWeight: 600, color: inStock ? '#15803D' : '#DC2626', flexShrink: 0, minWidth: '90px' }}>
          ● {inStock ? 'в наявності' : 'немає'}
        </div>

        {/* Price */}
        <div className="wishlist-card__price" style={{ fontSize: '16px', fontWeight: 800, color: 'var(--text-primary)', flexShrink: 0, minWidth: '90px', textAlign: 'right' }}>
          {price > 0 ? `${price} грн` : <span style={{ fontSize: '13px', color: '#94A3B8' }}>За запитом</span>}
        </div>

      </div>{/* end wishlist-card-info */}

      {/* Actions: qty + cart + remove */}
      <div className="wishlist-card__actions" style={{ display: 'contents' }}>
        <input
          type="number"
          value={inputVal}
          min={minOrder}
          disabled={!inStock}
          onChange={e => setInputVal(e.target.value)}
          onBlur={commitInput}
          style={{
            width: '52px', height: '38px', borderRadius: '8px',
            border: '1px solid var(--border)', background: 'var(--bg-card)',
            textAlign: 'center', fontSize: '13px', fontWeight: 700,
            color: 'var(--text-primary)', outline: 'none', flexShrink: 0,
          }}
        />
        <button
          className="wc-btn-cart"
          onClick={handleAddToCart}
          disabled={!inStock}
          style={{
            display: 'flex', alignItems: 'center', gap: '6px',
            height: '38px', padding: '0 16px', borderRadius: '10px', border: 'none',
            background: added ? '#16A34A' : inStock ? '#4880B8' : '#E2E8F0',
            color: inStock ? '#fff' : '#94A3B8',
            fontSize: '13px', fontWeight: 700, flexShrink: 0,
            cursor: inStock ? 'pointer' : 'default', transition: 'background 0.2s',
            whiteSpace: 'nowrap',
          }}
        >
          {added ? <><Check size={14} strokeWidth={2.5} /> Додано</> : <><ShoppingCart size={14} strokeWidth={2} /> В кошик</>}
        </button>
        <button
          onClick={() => toggle(product.sku)}
          title="Видалити з обраного"
          style={{
            width: '38px', height: '38px', borderRadius: '10px', flexShrink: 0,
            background: '#FEF2F2', border: '1px solid #FECACA',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: '#EF4444', cursor: 'pointer',
          }}
        >
          <Trash2 size={14} strokeWidth={2} />
        </button>
      </div>

    </div>
  );
}
