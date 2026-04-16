'use client';

import { useState, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ChevronLeft, ChevronRight, Package, Pipette, SprayCan, Blend, Paintbrush, Wrench, FlaskConical, Layers } from 'lucide-react';
import type { Category } from '../../lib/supabase';

type CardData = {
  key: string;
  name: string;
  description: string;
  Icon: React.ComponentType<{ size?: number; color?: string; strokeWidth?: number }>;
  color: string;
  href: string;
};

export const CAT_COLORS = ['#1E3A5F', '#0891B2', '#7C3AED', '#D97706', '#059669', '#DC2626', '#0EA5E9'];
export const CAT_ICONS  = [Package, Pipette, SprayCan, Blend, Paintbrush, FlaskConical, Layers, Wrench];

export function catDescription(name: string): string {
  const n = name.toLowerCase();
  if (n.includes('silicone') || n.includes('герметик'))  return 'Силіконові, акрилові та поліуретанові';
  if (n.includes('foam')    || n.includes('піна'))        return 'Професійні та стандартні піни';
  if (n.includes('adhesive')|| n.includes('клей'))        return 'Монтажні та конструкційні клеї';
  if (n.includes('acrylic'))                              return 'Акрилові герметики та шпаклівки';
  return 'Оптові ціни, широкий вибір';
}

type Props = {
  categories: Category[];
  selectedSlug?: string;
  onSelect?: (slug: string) => void;
};

const VISIBLE = 5;
const GAP     = 14;

export default function CategoryCarousel({ categories, selectedSlug, onSelect }: Props) {
  const router = useRouter();

  const cards: CardData[] = [
    {
      key: '__all__',
      name: 'Всі категорії',
      description: 'Переглянути повний каталог',
      Icon: Package,
      color: '#1E3A5F',
      href: '/catalog',
    },
    ...categories.map((cat, i) => ({
      key: cat.slug,
      name: cat.name,
      description: catDescription(cat.name),
      Icon: CAT_ICONS[(i + 1) % CAT_ICONS.length],
      color: CAT_COLORS[(i + 1) % CAT_COLORS.length],
      href: `/catalog?category=${cat.slug}`,
    })),
  ];

  const maxIndex = Math.max(0, cards.length - VISIBLE);
  const [cur, setCur] = useState(0);
  const [offset, setOffset] = useState(0);
  const wrapRef = useRef<HTMLDivElement>(null);

  function moveTo(idx: number) {
    const next = Math.max(0, Math.min(maxIndex, idx));
    if (wrapRef.current) {
      const w    = wrapRef.current.offsetWidth;
      const step = (w - (VISIBLE - 1) * GAP) / VISIBLE + GAP;
      setOffset(next * step);
    }
    setCur(next);
  }

  function handleCardClick(key: string, href: string) {
    if (key === '__all__') {
      router.push(href);
    } else {
      onSelect?.(key);
    }
  }

  return (
    <div style={{ position: 'relative', padding: '0 52px' }}>
      <style>{`
        .cc-card {
          flex: 0 0 calc((100% - ${(VISIBLE - 1) * GAP}px) / ${VISIBLE});
          display: flex; flex-direction: column; align-items: center;
          background: #fff; border: 1px solid #E2E8F0; border-radius: 12px;
          padding: 26px 12px 20px; text-decoration: none;
          transition: box-shadow 0.2s, border-color 0.2s; cursor: pointer;
          outline: none;
        }
        .cc-card:hover { box-shadow: 0 4px 16px rgba(0,0,0,0.07); border-color: #CBD5E1; }
        .cc-card.cc-active { border-color: #2563EB; box-shadow: 0 0 0 2px rgba(37,99,235,0.1); }
      `}</style>

      {/* Left arrow */}
      <button onClick={() => moveTo(cur - 1)} disabled={cur === 0} style={{
        position: 'absolute', left: 0, top: '45%', transform: 'translateY(-50%)',
        width: '40px', height: '40px', borderRadius: '50%',
        background: '#fff', border: '1px solid #E2E8F0',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: cur === 0 ? '#CBD5E1' : '#475569',
        boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
        cursor: cur === 0 ? 'default' : 'pointer',
      }}>
        <ChevronLeft size={18} strokeWidth={2} />
      </button>

      {/* Track */}
      <div ref={wrapRef} style={{ overflow: 'hidden' }}>
        <div style={{
          display: 'flex', gap: `${GAP}px`,
          transform: `translateX(-${offset}px)`,
          transition: 'transform 0.38s cubic-bezier(0.25, 0.46, 0.45, 0.94)',
        }}>
          {cards.map(({ key, name, description, Icon, color, href }) => {
            const isActive = key === selectedSlug;
            const cls = `cc-card${isActive ? ' cc-active' : ''}`;

            if (onSelect) {
              return (
                <div key={key} className={cls} onClick={() => handleCardClick(key, href)} role="button" tabIndex={0}>
                  <CardInner Icon={Icon} color={color} name={name} description={description} />
                </div>
              );
            }
            return (
              <Link key={key} href={href} className={cls}>
                <CardInner Icon={Icon} color={color} name={name} description={description} />
              </Link>
            );
          })}
        </div>
      </div>

      {/* Right arrow */}
      <button onClick={() => moveTo(cur + 1)} disabled={cur >= maxIndex} style={{
        position: 'absolute', right: 0, top: '45%', transform: 'translateY(-50%)',
        width: '40px', height: '40px', borderRadius: '50%',
        background: '#fff', border: '1px solid #E2E8F0',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: cur >= maxIndex ? '#CBD5E1' : '#475569',
        boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
        cursor: cur >= maxIndex ? 'default' : 'pointer',
      }}>
        <ChevronRight size={18} strokeWidth={2} />
      </button>

      {/* Dots */}
      {maxIndex > 0 && (
        <div style={{ display: 'flex', justifyContent: 'center', gap: '6px', marginTop: '14px' }}>
          {Array.from({ length: maxIndex + 1 }).map((_, i) => (
            <button key={i} onClick={() => moveTo(i)} style={{
              width: i === cur ? '24px' : '8px', height: '8px', borderRadius: '4px',
              background: i === cur ? '#2563EB' : '#CBD5E1',
              border: 'none', padding: 0, cursor: 'pointer', transition: 'all 0.3s ease',
            }} />
          ))}
        </div>
      )}
    </div>
  );
}

function CardInner({ Icon, color, name }: {
  Icon: React.ComponentType<{ size?: number; color?: string; strokeWidth?: number }>;
  color: string; name: string; description: string;
}) {
  return (
    <>
      <div style={{
        width: '72px', height: '72px', borderRadius: '16px', background: color,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        marginBottom: '16px', flexShrink: 0,
      }}>
        <Icon size={34} color="#fff" strokeWidth={1.6} />
      </div>
      <div style={{ fontSize: '14px', fontWeight: 700, color: '#0F172A', textAlign: 'center', lineHeight: 1.3, marginBottom: 'auto' }}>
        {name}
      </div>
      <span style={{ fontSize: '13px', color: '#2563EB', fontWeight: 600, marginTop: '16px' }}>Переглянути →</span>
    </>
  );
}
