'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';
import { ArrowLeft, Pencil, Check, X, ChevronDown, ChevronUp } from 'lucide-react';

interface Category {
  slug:                     string;
  name:                     string;
  parent_slug:              string | null;
  prom_commission_pct:      number | null;
  prom_commission_pct_econom: number | null;
}

interface Props {
  categories: Category[];
  plan:       'single' | 'econom';
}

function pctColor(pct: number | null): string {
  if (pct == null) return '#9CA3AF';
  if (pct >= 15)  return '#DC2626';
  if (pct >= 12)  return '#EA580C';
  if (pct >= 10)  return '#D97706';
  if (pct >= 7)   return '#16A34A';
  return '#0369A1';
}

function PctBar({ pct, max = 16 }: { pct: number | null; max?: number }) {
  if (pct == null) return <span style={{ color: '#D1D5DB', fontSize: 12 }}>—</span>;
  const w = Math.min(100, (pct / max) * 100);
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <div style={{ width: 80, height: 6, background: '#F3F4F6', borderRadius: 3, overflow: 'hidden' }}>
        <div style={{ width: `${w}%`, height: '100%', background: pctColor(pct), borderRadius: 3 }} />
      </div>
      <span style={{ fontSize: 13, fontWeight: 700, color: pctColor(pct), width: 48 }}>
        {pct.toFixed(2)}%
      </span>
    </div>
  );
}

export default function PromCommissionsClient({ categories, plan }: Props) {
  const [editSlug, setEditSlug]   = useState<string | null>(null);
  const [editVal, setEditVal]     = useState('');
  const [editEco, setEditEco]     = useState('');
  const [saving, setSaving]       = useState(false);
  const [data, setData]           = useState<Category[]>(categories);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [search, setSearch]       = useState('');

  // Group: parents first, then children under their parent
  const parents = useMemo(() =>
    data.filter(c => !c.parent_slug).sort((a, b) => a.name.localeCompare(b.name, 'uk')),
  [data]);

  const childrenOf = (slug: string) =>
    data.filter(c => c.parent_slug === slug).sort((a, b) => a.name.localeCompare(b.name, 'uk'));

  const filtered = useMemo(() => {
    if (!search) return null;
    const q = search.toLowerCase();
    return data.filter(c => c.name.toLowerCase().includes(q) || c.slug.includes(q));
  }, [data, search]);

  function startEdit(c: Category) {
    setEditSlug(c.slug);
    setEditVal(c.prom_commission_pct != null ? String(c.prom_commission_pct) : '');
    setEditEco(c.prom_commission_pct_econom != null ? String(c.prom_commission_pct_econom) : '');
  }

  async function save(slug: string) {
    setSaving(true);
    const single = parseFloat(editVal);
    const econom = parseFloat(editEco);
    try {
      await fetch('/api/admin/prom/category-commission', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug, single: isNaN(single) ? null : single, econom: isNaN(econom) ? null : econom }),
      });
      setData(prev => prev.map(c => c.slug === slug
        ? { ...c, prom_commission_pct: isNaN(single) ? null : single, prom_commission_pct_econom: isNaN(econom) ? null : econom }
        : c,
      ));
      setEditSlug(null);
    } finally {
      setSaving(false);
    }
  }

  const activePct = (c: Category) =>
    plan === 'econom' ? c.prom_commission_pct_econom : c.prom_commission_pct;

  function renderRow(c: Category, isChild: boolean) {
    const isEditing = editSlug === c.slug;
    const active    = activePct(c);
    return (
      <tr key={c.slug} style={{ borderBottom: '1px solid #F3F4F6', background: isChild ? '#FAFAFA' : '#fff' }}>
        <td style={{ padding: '10px 16px', fontSize: 13 }}>
          {isChild && <span style={{ display: 'inline-block', width: 16, marginRight: 4, color: '#D1D5DB' }}>└</span>}
          <div style={{ fontWeight: isChild ? 400 : 600, color: '#111' }}>{c.name}</div>
          <div style={{ fontSize: 11, color: '#9CA3AF', marginTop: 1, fontFamily: 'monospace' }}>{c.slug}</div>
        </td>

        {/* Active plan column */}
        <td style={{ padding: '10px 16px', width: 150 }}>
          <PctBar pct={active} />
        </td>

        {/* Edit columns */}
        {isEditing ? (
          <>
            <td style={{ padding: '8px 12px', width: 110 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <input
                  type="number" step="0.01" min="0" max="50"
                  value={editVal} onChange={e => setEditVal(e.target.value)}
                  autoFocus
                  style={{ width: 64, height: 30, padding: '0 6px', border: '1.5px solid #1D4ED8', borderRadius: 6, fontSize: 13, fontWeight: 700, outline: 'none' }}
                />
                <span style={{ fontSize: 12, color: '#6B7280' }}>%</span>
              </div>
            </td>
            <td style={{ padding: '8px 12px', width: 110 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <input
                  type="number" step="0.01" min="0" max="50"
                  value={editEco} onChange={e => setEditEco(e.target.value)}
                  style={{ width: 64, height: 30, padding: '0 6px', border: '1.5px solid #6B7280', borderRadius: 6, fontSize: 13, fontWeight: 700, outline: 'none' }}
                />
                <span style={{ fontSize: 12, color: '#6B7280' }}>%</span>
              </div>
            </td>
            <td style={{ padding: '8px 12px', width: 80 }}>
              <div style={{ display: 'flex', gap: 4 }}>
                <button onClick={() => save(c.slug)} disabled={saving}
                  style={{ width: 28, height: 28, borderRadius: 6, border: '1.5px solid #16A34A', background: '#F0FDF4', color: '#16A34A', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Check size={13} />
                </button>
                <button onClick={() => setEditSlug(null)}
                  style={{ width: 28, height: 28, borderRadius: 6, border: '1.5px solid #E5E7EB', background: '#F9FAFB', color: '#6B7280', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <X size={13} />
                </button>
              </div>
            </td>
          </>
        ) : (
          <>
            <td style={{ padding: '10px 16px', width: 110 }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: pctColor(c.prom_commission_pct) }}>
                {c.prom_commission_pct != null ? `${c.prom_commission_pct.toFixed(2)}%` : <span style={{ color: '#D1D5DB' }}>—</span>}
              </span>
            </td>
            <td style={{ padding: '10px 16px', width: 110 }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: pctColor(c.prom_commission_pct_econom) }}>
                {c.prom_commission_pct_econom != null ? `${c.prom_commission_pct_econom.toFixed(2)}%` : <span style={{ color: '#D1D5DB' }}>—</span>}
              </span>
            </td>
            <td style={{ padding: '10px 16px', width: 80 }}>
              <button onClick={() => startEdit(c)}
                style={{ width: 28, height: 28, borderRadius: 6, border: '1.5px solid #E5E7EB', background: 'transparent', color: '#9CA3AF', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Pencil size={12} />
              </button>
            </td>
          </>
        )}
      </tr>
    );
  }

  const rows = filtered
    ? filtered.map(c => renderRow(c, !!c.parent_slug))
    : parents.flatMap(p => {
        const children = childrenOf(p.slug);
        const isCollapsed = collapsed.has(p.slug);
        return [
          // Parent row with collapse toggle
          <tr key={p.slug} style={{ borderBottom: '1px solid #F3F4F6', background: '#fff' }}>
            <td style={{ padding: '10px 16px', fontSize: 13 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                {children.length > 0 && (
                  <button onClick={() => setCollapsed(prev => { const s = new Set(prev); s.has(p.slug) ? s.delete(p.slug) : s.add(p.slug); return s; })}
                    style={{ width: 20, height: 20, borderRadius: 4, border: '1px solid #E5E7EB', background: 'transparent', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    {isCollapsed ? <ChevronDown size={11} /> : <ChevronUp size={11} />}
                  </button>
                )}
                <div>
                  <div style={{ fontWeight: 700, color: '#111' }}>{p.name}</div>
                  <div style={{ fontSize: 11, color: '#9CA3AF', fontFamily: 'monospace' }}>{p.slug}{children.length > 0 && ` · ${children.length} підкатегорій`}</div>
                </div>
              </div>
            </td>
            <td style={{ padding: '10px 16px' }}><PctBar pct={activePct(p)} /></td>
            {editSlug === p.slug ? (
              <>
                <td style={{ padding: '8px 12px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <input type="number" step="0.01" min="0" max="50" value={editVal} onChange={e => setEditVal(e.target.value)} autoFocus
                      style={{ width: 64, height: 30, padding: '0 6px', border: '1.5px solid #1D4ED8', borderRadius: 6, fontSize: 13, fontWeight: 700, outline: 'none' }} />
                    <span style={{ fontSize: 12, color: '#6B7280' }}>%</span>
                  </div>
                </td>
                <td style={{ padding: '8px 12px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <input type="number" step="0.01" min="0" max="50" value={editEco} onChange={e => setEditEco(e.target.value)}
                      style={{ width: 64, height: 30, padding: '0 6px', border: '1.5px solid #6B7280', borderRadius: 6, fontSize: 13, fontWeight: 700, outline: 'none' }} />
                    <span style={{ fontSize: 12, color: '#6B7280' }}>%</span>
                  </div>
                </td>
                <td style={{ padding: '8px 12px' }}>
                  <div style={{ display: 'flex', gap: 4 }}>
                    <button onClick={() => save(p.slug)} disabled={saving}
                      style={{ width: 28, height: 28, borderRadius: 6, border: '1.5px solid #16A34A', background: '#F0FDF4', color: '#16A34A', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <Check size={13} />
                    </button>
                    <button onClick={() => setEditSlug(null)}
                      style={{ width: 28, height: 28, borderRadius: 6, border: '1.5px solid #E5E7EB', background: '#F9FAFB', color: '#6B7280', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <X size={13} />
                    </button>
                  </div>
                </td>
              </>
            ) : (
              <>
                <td style={{ padding: '10px 16px' }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: pctColor(p.prom_commission_pct) }}>
                    {p.prom_commission_pct != null ? `${p.prom_commission_pct.toFixed(2)}%` : <span style={{ color: '#D1D5DB' }}>—</span>}
                  </span>
                </td>
                <td style={{ padding: '10px 16px' }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: pctColor(p.prom_commission_pct_econom) }}>
                    {p.prom_commission_pct_econom != null ? `${p.prom_commission_pct_econom.toFixed(2)}%` : <span style={{ color: '#D1D5DB' }}>—</span>}
                  </span>
                </td>
                <td style={{ padding: '10px 16px' }}>
                  <button onClick={() => startEdit(p)}
                    style={{ width: 28, height: 28, borderRadius: 6, border: '1.5px solid #E5E7EB', background: 'transparent', color: '#9CA3AF', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Pencil size={12} />
                  </button>
                </td>
              </>
            )}
          </tr>,
          ...(!isCollapsed ? children.map(c => renderRow(c, true)) : []),
        ];
      });

  const noCommission = data.filter(c => c.prom_commission_pct == null).length;

  return (
    <div style={{ padding: '28px 32px 64px', maxWidth: 900 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
        <Link href="/admin/prom" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 32, height: 32, borderRadius: 8, border: '1px solid #E5E7EB', color: '#6B7280', textDecoration: 'none' }}>
          <ArrowLeft size={16} />
        </Link>
        <div>
          <h1 style={{ margin: 0, fontSize: 20, fontWeight: 800, color: '#111' }}>Комісії Prom.ua по категоріях</h1>
          <p style={{ margin: '3px 0 0', color: '#6B7280', fontSize: 13 }}>
            Активний план: <strong>{plan === 'econom' ? 'Економ' : 'Єдина комісія'}</strong>
            {noCommission > 0 && <span style={{ marginLeft: 12, color: '#EF4444', fontWeight: 600 }}>⚠ {noCommission} без комісії</span>}
          </p>
        </div>
      </div>

      {/* Legend */}
      <div style={{ display: 'flex', gap: 16, marginBottom: 20, flexWrap: 'wrap' }}>
        {[['#0369A1', '< 7%'], ['#16A34A', '7–10%'], ['#D97706', '10–12%'], ['#EA580C', '12–15%'], ['#DC2626', '≥ 15%']].map(([color, label]) => (
          <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, color: '#374151' }}>
            <div style={{ width: 10, height: 10, borderRadius: 2, background: color }} />
            {label}
          </div>
        ))}
      </div>

      {/* Search */}
      <input
        type="text" placeholder="Пошук категорії..." value={search}
        onChange={e => setSearch(e.target.value)}
        style={{ width: '100%', height: 38, padding: '0 14px', borderRadius: 9, border: '1px solid #E5E7EB', fontSize: 13, marginBottom: 16, boxSizing: 'border-box', outline: 'none' }}
      />

      {/* Table */}
      <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #E5E7EB', overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: '#F9FAFB', borderBottom: '1px solid #E5E7EB' }}>
              <th style={{ padding: '10px 16px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Категорія</th>
              <th style={{ padding: '10px 16px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: plan === 'single' ? '#1D4ED8' : '#6B7280', textTransform: 'uppercase', letterSpacing: '0.05em', width: 150 }}>
                {plan === 'single' ? '★ Єдина' : 'Єдина'}
              </th>
              <th style={{ padding: '10px 16px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.05em', width: 110 }}>Єдина %</th>
              <th style={{ padding: '10px 16px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: plan === 'econom' ? '#1D4ED8' : '#6B7280', textTransform: 'uppercase', letterSpacing: '0.05em', width: 110 }}>
                {plan === 'econom' ? '★ Економ' : 'Економ %'}
              </th>
              <th style={{ width: 80 }} />
            </tr>
          </thead>
          <tbody>
            {rows.length === 0
              ? <tr><td colSpan={5} style={{ padding: 40, textAlign: 'center', color: '#9CA3AF' }}>Нічого не знайдено</td></tr>
              : rows
            }
          </tbody>
        </table>
      </div>

      <p style={{ fontSize: 12, color: '#9CA3AF', marginTop: 12 }}>
        ★ — активний план. Натисни олівець щоб змінити % для конкретної категорії.
      </p>
    </div>
  );
}
