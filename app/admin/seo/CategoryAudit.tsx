'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import type { CategoryAuditRow, CategoryAuditGaps } from '../../../lib/seo/category-audit';

const GAP_LABELS: { key: keyof CategoryAuditGaps; label: string; color: string; hint: string }[] = [
  { key: 'staleBrands',   label: 'бренд зник',        color: '#EF4444', hint: 'Текст називає бренд, якого в категорії вже немає' },
  { key: 'noProducts',    label: 'порожня сторінка',  color: '#EF4444', hint: 'Є текст, але жодного активного товару — сторінка нічого не продає' },
  { key: 'noMeta',        label: 'немає тексту',      color: '#EF4444', hint: 'Є товар, але категорія без курованого опису' },
  { key: 'missingBrands', label: 'бренд не згаданий', color: '#F59E0B', hint: 'Помітна частка асортименту не потрапила в перелік' },
  { key: 'noCatalogLine', label: 'немає переліку',    color: '#F59E0B', hint: 'У seoText немає речення з асортиментом — текст не прив\'язаний до каталогу' },
  { key: 'thinFaq',       label: 'мало FAQ',          color: '#0EA5E9', hint: 'Менше 4 питань хоча б однією мовою' },
  { key: 'ruBehind',      label: 'рос. відстає',      color: '#8B5CF6', hint: 'Російська версія коротша за українську або відсутня' },
];

function hasGap(row: CategoryAuditRow): boolean {
  return Object.values(row.gaps).some(Boolean);
}

export default function CategoryAudit({ rows }: { rows: CategoryAuditRow[] }) {
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState<keyof CategoryAuditGaps | 'any'>('any');

  const withGaps = useMemo(() => rows.filter(hasGap), [rows]);
  const visible = useMemo(
    () => (filter === 'any' ? withGaps : withGaps.filter(r => r.gaps[filter])),
    [withGaps, filter],
  );
  const counts = useMemo(() => {
    const c = {} as Record<keyof CategoryAuditGaps, number>;
    for (const g of GAP_LABELS) c[g.key] = withGaps.filter(r => r.gaps[g.key]).length;
    return c;
  }, [withGaps]);

  const critical = withGaps.filter(r => r.gaps.staleBrands || r.gaps.noProducts || r.gaps.noMeta).length;

  return (
    <section style={{ border: '1px solid #E2E8F0', borderRadius: 10, marginBottom: 20, background: 'var(--bg-card, #fff)' }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '14px 16px',
          background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left', font: 'inherit',
        }}
      >
        <span style={{ fontWeight: 700, fontSize: 15 }}>Категорії: текст проти асортименту</span>
        <span style={{
          fontSize: 12, fontWeight: 700, padding: '2px 8px', borderRadius: 20,
          color: critical ? '#B91C1C' : '#15803D',
          background: critical ? '#FEE2E2' : '#F0FDF4',
          border: `1px solid ${critical ? '#FCA5A5' : '#BBF7D0'}`,
        }}>
          {withGaps.length === 0 ? 'усе сходиться' : `${withGaps.length} з ${rows.length}`}
        </span>
        <span style={{ marginLeft: 'auto', color: '#64748B', fontSize: 13 }}>{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <div style={{ padding: '0 16px 16px' }}>
          <p style={{ color: '#64748B', fontSize: 13, margin: '0 0 12px' }}>
            Бренди звіряються лише в реченні з переліком асортименту (тому, де згадано FIXLINE) — так проза
            на кшталт «конструкційних сталей» не читається як бренд «Сталь». Тексти правляться вручну
            у <code>lib/category-descriptions.ts</code> та <code>-ru.ts</code>.
          </p>

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
            <button
              onClick={() => setFilter('any')}
              style={chipStyle(filter === 'any', '#334155')}
            >
              Усі ({withGaps.length})
            </button>
            {GAP_LABELS.filter(g => counts[g.key] > 0).map(g => (
              <button key={g.key} onClick={() => setFilter(g.key)} title={g.hint} style={chipStyle(filter === g.key, g.color)}>
                {g.label} ({counts[g.key]})
              </button>
            ))}
          </div>

          {visible.length === 0 ? (
            <p style={{ color: '#15803D', fontSize: 14, margin: 0 }}>Розбіжностей немає.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {visible.map(row => (
                <div key={row.slug} style={{ border: '1px solid #E2E8F0', borderRadius: 8, padding: '10px 12px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 6 }}>
                    <Link
                      href={`/shop/${row.slug}`}
                      target="_blank"
                      style={{ fontWeight: 600, color: '#0F172A', textDecoration: 'none' }}
                    >
                      {row.name}
                    </Link>
                    <code style={{ fontSize: 12, color: '#64748B' }}>{row.slug}</code>
                    <span style={{ fontSize: 12, color: '#64748B' }}>· {row.productCount} товарів</span>
                    <span style={{ fontSize: 12, color: '#64748B' }}>· FAQ {row.uaFaq}/{row.ruFaq}</span>
                  </div>

                  <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 6 }}>
                    {GAP_LABELS.filter(g => row.gaps[g.key]).map(g => (
                      <span key={g.key} title={g.hint} style={badgeStyle(g.color)}>{g.label}</span>
                    ))}
                  </div>

                  {row.staleBrands.length > 0 && (
                    <div style={lineStyle}>
                      <b style={{ color: '#B91C1C' }}>У тексті, але не в каталозі:</b> {row.staleBrands.join(', ')}
                    </div>
                  )}
                  {row.missingBrands.length > 0 && (
                    <div style={lineStyle}>
                      <b style={{ color: '#B45309' }}>Є в каталозі, але не в тексті:</b>{' '}
                      {row.missingBrands
                        .map(b => `${b} (${row.actualBrands.find(a => a.brand === b)?.count ?? 0})`)
                        .join(', ')}
                    </div>
                  )}
                  {row.actualBrands.length > 0 && (
                    <div style={{ ...lineStyle, color: '#64748B' }}>
                      Фактично: {row.actualBrands.slice(0, 8).map(b => `${b.brand} (${b.count})`).join(', ')}
                      {row.actualBrands.length > 8 ? ' …' : ''}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </section>
  );
}

const lineStyle: React.CSSProperties = { fontSize: 13, lineHeight: 1.5 };

function chipStyle(active: boolean, color: string): React.CSSProperties {
  return {
    padding: '5px 10px', borderRadius: 20, fontSize: 12, fontWeight: 600, cursor: 'pointer',
    border: `1px solid ${active ? color : '#E2E8F0'}`,
    background: active ? color : '#fff',
    color: active ? '#fff' : '#334155',
  };
}

function badgeStyle(color: string): React.CSSProperties {
  return {
    display: 'inline-flex', alignItems: 'center', fontSize: 11, fontWeight: 700,
    color, background: '#fff', border: `1px solid ${color}`, borderRadius: 5, padding: '1px 6px',
  };
}
