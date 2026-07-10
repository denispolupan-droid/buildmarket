'use client';

import { useState } from 'react';

export function Stars({ rating, size = 16, interactive = false, onRate }: {
  rating: number; size?: number; interactive?: boolean; onRate?: (r: number) => void;
}) {
  const [hover, setHover] = useState(0);
  return (
    <span style={{ display: 'inline-flex', gap: '2px' }}>
      {[1, 2, 3, 4, 5].map(i => (
        <span
          key={i}
          onClick={() => interactive && onRate?.(i)}
          onMouseEnter={() => interactive && setHover(i)}
          onMouseLeave={() => interactive && setHover(0)}
          style={{
            fontSize: `${size}px`, lineHeight: 1,
            cursor: interactive ? 'pointer' : 'default',
            color: (hover || rating) >= i ? '#F59E0B' : '#D1D5DB',
            transition: 'color 0.1s',
          }}
        >★</span>
      ))}
    </span>
  );
}

// Compact "★★★★★ 4.8 (12)" badge for product cards and the product page header.
// Renders nothing when there are no approved reviews yet — an empty star row
// reads as "rated zero", which is worse than no badge at all.
export function RatingBadge({ avg, count, size = 13 }: { avg: number; count: number; size?: number }) {
  if (!count) return null;
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
      <Stars rating={Math.round(avg)} size={size} />
      <span style={{ fontSize: `${size - 1}px`, fontWeight: 700, color: 'var(--text-primary)' }}>{avg.toFixed(1)}</span>
      <span style={{ fontSize: `${size - 2}px`, color: 'var(--text-muted)' }}>({count})</span>
    </span>
  );
}
