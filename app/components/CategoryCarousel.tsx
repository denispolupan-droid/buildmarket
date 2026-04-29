'use client';

import { useState, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ChevronLeft, ChevronRight, Package, Pen, SprayCan, Paintbrush, Drill, FlaskConical, Layers, AlignJustify, Shield, Droplets, Hammer, Grid3x3, CloudRain } from 'lucide-react';
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
export const CAT_ICONS  = [Package, Pen, SprayCan, Paintbrush, FlaskConical, Layers, Drill, AlignJustify];

// Іконка за slug категорії
const SLUG_ICON: Record<string, React.ComponentType<{size?:number;color?:string;strokeWidth?:number}>> = {
  'germetyky':          Pen,
  'montazhna-pina':     SprayCan,
  'klei':               Droplets,
  'farby':              Paintbrush,
  'gruntivky':          Layers,
  'hidroizolyatsiya':   Shield,
  'kriplennya':         Drill,
  'instrumenty':        Hammer,
  'strichky':           AlignJustify,
  'plastyfikatory':     FlaskConical,
  'vologopoglinachi':   CloudRain,
  'zamazky-dlya-shviv': Grid3x3,
  'zakhyst-derevyny':   Package,
};

// Колір за slug
const SLUG_COLOR: Record<string, string> = {
  'germetyky':          '#0891B2',
  'montazhna-pina':     '#7C3AED',
  'klei':               '#D97706',
  'farby':              '#DC2626',
  'gruntivky':          '#059669',
  'hidroizolyatsiya':   '#0EA5E9',
  'kriplennya':         '#475569',
  'instrumenty':        '#1E3A5F',
  'strichky':           '#9333EA',
  'plastyfikatory':     '#0D9488',
  'vologopoglinachi':   '#2563EB',
  'zamazky-dlya-shviv': '#B45309',
  'zakhyst-derevyny':   '#65A30D',
};

export function getCatIcon(slug: string, fallbackIdx: number) {
  return SLUG_ICON[slug] ?? CAT_ICONS[fallbackIdx % CAT_ICONS.length];
}
export function getCatColor(slug: string, fallbackIdx: number) {
  return SLUG_COLOR[slug] ?? CAT_COLORS[fallbackIdx % CAT_COLORS.length];
}

export function catDescription(name: string): string {
  const n = name.toLowerCase();
  if (n.includes('герметик'))        return 'Силіконові, акрилові, поліуретанові, бітумні';
  if (n.includes('піна'))            return 'Під пістолет, побутова, вогнезахисна, піна-клей';
  if (n.includes('клей'))            return 'Рідкі цвяхи, монтажний, ПВА, суперклей';
  if (n.includes('фарб'))            return 'Водоемульсійні, алкідні, лаки, колоранти';
  if (n.includes('ґрунтовк'))        return 'Готові, концентрати, шпаклівки, антигрибок';
  if (n.includes('гідроізол'))       return 'Мастики, праймери, ізоляційні стрічки';
  if (n.includes('кріплен'))         return 'Дюбелі, анкери, шурупи, саморізи';
  if (n.includes('інструмент'))      return 'Пістолети, шпателі, кисті, шліфувальний';
  if (n.includes('стрічк'))          return 'Герметизуюча, малярна, для швів, звукоізоляційна';
  if (n.includes('пластифікат'))     return 'Для бетону, розчинів та підлог з підігрівом';
  if (n.includes('волого'))          return 'Поглиначі вологи для приміщень Ceresit';
  if (n.includes('замазк') || n.includes('шов')) return 'Цементні CE33/CE40, епоксидні затирки';
  if (n.includes('захист') || n.includes('дерев')) return 'Антисептики, морилки, захисні покриття';
  return 'Широкий вибір, оптові ціни';
}

type Props = {
  categories: Category[];
  selectedSlug?: string;
  onSelect?: (slug: string) => void;
  role?: string;
};

export const VISIBLE = 5;
const GAP     = 14;

export default function CategoryCarousel({ categories, selectedSlug, onSelect, role }: Props) {
  const router = useRouter();
  const isWholesale = role === 'wholesale';
  const base = isWholesale ? '/catalog' : '/shop';

  const cards: CardData[] = [
    {
      key: '__all__',
      name: 'Всі категорії',
      description: 'Переглянути повний каталог',
      Icon: Package,
      color: '#1E3A5F',
      href: base,
    },
    ...categories.map((cat, i) => ({
      key: cat.slug,
      name: cat.name,
      description: catDescription(cat.name),
      Icon: getCatIcon(cat.slug, i + 1),
      color: getCatColor(cat.slug, i + 1),
      href: `${base}?category=${cat.slug}`,
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
    <div style={{ position: 'relative', maxWidth: '860px', margin: '0 auto' }}>
      <style>{`
        .cc-card {
          flex: 0 0 calc((100% - ${(VISIBLE - 1) * GAP}px) / ${VISIBLE});
          display: flex; flex-direction: column; align-items: center;
          background: var(--bg-card); border: 1px solid var(--border); border-radius: 12px;
          padding: 16px 10px 14px; text-decoration: none;
          transition: box-shadow 0.2s, border-color 0.2s, transform 0.15s; cursor: pointer;
          outline: none;
        }
        .cc-card:hover { box-shadow: 0 6px 18px rgba(0,0,0,0.12); border-color: #4880B8; transform: translateY(-2px); }
        .cc-card.cc-active { border-color: #7FA8C9; box-shadow: 0 0 0 2px rgba(127,168,201,0.15); }
      `}</style>

      {/* Left arrow */}
      <button aria-label="Попередня категорія" onClick={() => moveTo(cur - 1)} disabled={cur === 0} className={cur === 0 ? undefined : 'btn-icon'} style={{
        position: 'absolute', left: -52, top: '45%', transform: 'translateY(-50%)',
        width: '40px', height: '40px', borderRadius: '50%',
        background: 'var(--bg-card)', border: '1px solid var(--border)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: cur === 0 ? 'var(--border)' : 'var(--text-secondary)',
        boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
        cursor: cur === 0 ? 'default' : 'pointer',
      }}>
        <ChevronLeft size={18} strokeWidth={2} />
      </button>

      {/* Track */}
      <div ref={wrapRef} style={{ overflow: 'hidden', paddingTop: '4px', marginTop: '-4px' }}>
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
                  <CardInner Icon={Icon} color={color} name={name} description={description} href={href} />
                </div>
              );
            }
            return (
              <Link key={key} href={href} className={cls}>
                <CardInner Icon={Icon} color={color} name={name} description={description} href={href} />
              </Link>
            );
          })}
        </div>
      </div>

      {/* Right arrow */}
      <button aria-label="Наступна категорія" onClick={() => moveTo(cur + 1)} disabled={cur >= maxIndex} className={cur >= maxIndex ? undefined : 'btn-icon'} style={{
        position: 'absolute', right: -52, top: '45%', transform: 'translateY(-50%)',
        width: '40px', height: '40px', borderRadius: '50%',
        background: 'var(--bg-card)', border: '1px solid var(--border)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: cur >= maxIndex ? 'var(--border)' : 'var(--text-secondary)',
        boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
        cursor: cur >= maxIndex ? 'default' : 'pointer',
      }}>
        <ChevronRight size={18} strokeWidth={2} />
      </button>

      {/* Dots */}
      {maxIndex > 0 && (
        <div style={{ display: 'flex', justifyContent: 'center', gap: '6px', marginTop: '14px' }}>
          {Array.from({ length: maxIndex + 1 }).map((_, i) => (
            <button key={i} aria-label={`Перейти до слайду ${i + 1}`} onClick={() => moveTo(i)} style={{
              width: i === cur ? '24px' : '8px', height: '8px', borderRadius: '4px',
              background: i === cur ? '#4880B8' : '#CBD5E1',
              border: 'none', padding: 0, cursor: 'pointer', transition: 'all 0.3s ease',
            }} />
          ))}
        </div>
      )}
    </div>
  );
}

function CardInner({ Icon, color, name, href }: {
  Icon: React.ComponentType<{ size?: number; color?: string; strokeWidth?: number }>;
  color: string; name: string; description: string; href: string;
}) {
  return (
    <>
      <div style={{
        width: '68px', height: '68px', borderRadius: '14px', background: color,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        marginBottom: '10px', flexShrink: 0,
      }}>
        <Icon size={32} color="#fff" strokeWidth={1.5} />
      </div>
      <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)', textAlign: 'center', lineHeight: 1.3, marginBottom: 'auto' }}>
        {name}
      </div>
      <Link
        href={href}
        onClick={e => e.stopPropagation()}
        style={{ fontSize: '12px', color: '#4880B8', fontWeight: 600, marginTop: '10px' }}
      >
        Переглянути →
      </Link>
    </>
  );
}
