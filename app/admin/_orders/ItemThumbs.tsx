'use client';

import type { CSSProperties } from 'react';
import { Package } from 'lucide-react';
import type { OrderItem } from './types';
import { itemTitle } from './helpers';

export function ItemThumbs({ items, thumbs, size, max, pad, className, style }: {
  items: OrderItem[]; thumbs: Record<string, string>; size: number; max: number;
  pad?: boolean; className?: string; style?: CSSProperties;
}) {
  const positions = items.length;
  const shown = items.slice(0, max);
  return (
    <div className={className} style={{ display: 'flex', gap: '6px', flexShrink: 0, ...style }}>
      {shown.map((item, idx) => {
        const img = item.sku ? thumbs[item.sku] : undefined;
        const isLast = idx === shown.length - 1;
        return (
          <div key={`${item.sku}-${idx}`} title={itemTitle(item)}
            style={{
              width: `${size}px`, height: `${size}px`, flexShrink: 0, position: 'relative',
              borderRadius: `${Math.round(size / 5)}px`,
              border: '1px solid var(--border-light)', background: img ? `var(--surface) url("${img}") center/cover no-repeat` : 'var(--bg-soft)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
            {!img && <Package size={Math.round(size * 0.36)} color="var(--border)" />}
            {isLast && positions > max && (
              <span title={`Позицій у замовленні: ${positions}`}
                style={{
                  position: 'absolute', right: '-5px', bottom: '-5px', minWidth: '15px', height: '15px',
                  padding: '0 3px', borderRadius: '8px', boxSizing: 'border-box',
                  background: 'var(--brand-blue)', color: 'var(--surface)', border: '1.5px solid var(--bg-card)',
                  fontSize: '9.5px', fontWeight: 800, lineHeight: '12px', textAlign: 'center',
                }}>
                {positions}
              </span>
            )}
          </div>
        );
      })}
      {pad && shown.length < max && Array.from({ length: max - shown.length }).map((_, i) => (
        <div key={`pad-${i}`} style={{ width: `${size}px`, flexShrink: 0 }} />
      ))}
    </div>
  );
}
