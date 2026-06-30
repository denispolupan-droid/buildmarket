'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';
import { formatForRozetka } from '../../../../lib/rozetka-name';
import { Save, CheckCircle } from 'lucide-react';

interface Product {
  sku: string; name: string; rozetka_name: string | null;
  brand: string | null; category_slug: string;
  color: string | null; volume: string | null;
}

type Flag = 'ok' | 'warn' | 'error';

interface AuditRow {
  product: Product;
  catName: string;
  finalName: string;   // те що піде в фід
  autoName: string;    // formatForRozetka результат
  isManual: boolean;
  flag: Flag;
  issues: string[];
}

function detectIssues(finalName: string, brand: string | null): string[] {
  const issues: string[] = [];
  if (finalName.includes(','))        issues.push('є кома');
  if (/\s[—–]\s/.test(finalName))    issues.push('є тире-роздільник');
  if (!brand)                         issues.push('нема бренду в БД');
  else if (finalName.toLowerCase().startsWith(brand.toLowerCase()))
                                      issues.push('назва починається з бренду');
  if (finalName.length > 200)         issues.push(`назва задовга (${finalName.length} симв.)`);
  return issues;
}

export default function RozetkaAuditClient({
  products, categories,
}: {
  products: Product[];
  categories: { slug: string; name: string }[];
}) {
  const catMap = useMemo(() => new Map(categories.map(c => [c.slug, c.name])), [categories]);

  const [filter, setFilter] = useState<'all' | 'issues' | 'ok'>('all');
  const [search, setSearch] = useState('');
  // per-row manual name edits (overlay on top of DB rozetka_name)
  const [overrides, setOverrides] = useState<Record<string, string>>(
    Object.fromEntries(products.map(p => [p.sku, p.rozetka_name ?? '']))
  );
  const [saving, setSaving] = useState<string | null>(null);
  const [saved,  setSaved]  = useState<Record<string, boolean>>({});

  const rows = useMemo<AuditRow[]>(() => {
    return products.map(p => {
      const autoName  = formatForRozetka(p.name, p.brand, p.volume, p.color);
      const isManual  = (overrides[p.sku] ?? '').trim() !== '';
      const finalName = isManual ? overrides[p.sku].trim() : autoName;
      const issues    = detectIssues(finalName, p.brand);
      const flag: Flag = issues.length === 0 ? 'ok'
        : issues.some(i => i.includes('тире') || i.includes('бренду') || i.includes('кома')) ? 'error'
        : 'warn';
      return {
        product: p,
        catName: catMap.get(p.category_slug) ?? p.category_slug,
        finalName, autoName, isManual, flag, issues,
      };
    });
  }, [products, catMap, overrides]);

  const filtered = useMemo(() => {
    let list = rows;
    if (filter === 'issues') list = list.filter(r => r.flag !== 'ok');
    if (filter === 'ok')     list = list.filter(r => r.flag === 'ok');
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(r =>
        r.product.name.toLowerCase().includes(q) ||
        r.product.sku.toLowerCase().includes(q) ||
        (r.product.brand ?? '').toLowerCase().includes(q) ||
        r.catName.toLowerCase().includes(q)
      );
    }
    return list;
  }, [rows, filter, search]);

  const total   = rows.length;
  const nOk     = rows.filter(r => r.flag === 'ok').length;
  const nWarn   = rows.filter(r => r.flag === 'warn').length;
  const nError  = rows.filter(r => r.flag === 'error').length;

  async function saveOverride(sku: string) {
    setSaving(sku);
    const val = overrides[sku]?.trim() ?? '';
    await fetch('/api/admin/rozetka/product', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sku, rozetka_name: val === '' ? '' : val }),
    });
    setSaving(null);
    setSaved(p => ({ ...p, [sku]: true }));
    setTimeout(() => setSaved(p => ({ ...p, [sku]: false })), 2000);
  }

  const CHIP: Record<Flag, React.CSSProperties> = {
    ok:    { background: '#ECFDF5', color: '#059669', border: '1px solid #A7F3D0' },
    warn:  { background: '#FFFBEB', color: '#B45309', border: '1px solid #FDE68A' },
    error: { background: '#FEF2F2', color: '#DC2626', border: '1px solid #FECACA' },
  };

  return (
    <div style={{ padding: '24px 32px', maxWidth: 1300, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 20, flexWrap: 'wrap' }}>
        <Link href="/admin/rozetka/products" style={{ fontSize: 13, color: '#64748B', textDecoration: 'none' }}>← Товари</Link>
        <h1 style={{ fontSize: 20, fontWeight: 700, color: '#1E293B', margin: 0 }}>Аудит назв Rozetka</h1>

        {/* Summary chips */}
        <span style={{ fontSize: 12, color: '#64748B' }}>{total} товарів</span>
        <span style={{ ...CHIP.ok,    fontSize: 11, padding: '2px 8px', borderRadius: 12 }}>✓ {nOk} OK</span>
        <span style={{ ...CHIP.warn,  fontSize: 11, padding: '2px 8px', borderRadius: 12 }}>! {nWarn} попередж.</span>
        <span style={{ ...CHIP.error, fontSize: 11, padding: '2px 8px', borderRadius: 12 }}>✗ {nError} помилок</span>
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
        {(['all', 'issues', 'ok'] as const).map(f => (
          <button key={f} onClick={() => setFilter(f)} style={{
            padding: '5px 12px', borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: 'pointer',
            background: filter === f ? '#1E293B' : '#F1F5F9',
            color:      filter === f ? '#fff'    : '#475569',
            border: 'none',
          }}>
            {f === 'all' ? 'Всі' : f === 'issues' ? `Проблемні (${nError + nWarn})` : `OK (${nOk})`}
          </button>
        ))}
        <input
          value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Пошук..."
          style={{ marginLeft: 'auto', padding: '5px 12px', borderRadius: 6, border: '1px solid #E2E8F0', fontSize: 13, width: 240 }}
        />
      </div>

      {/* Table */}
      <div style={{ background: '#fff', borderRadius: 10, border: '1px solid #E2E8F0', overflow: 'hidden' }}>
        {/* Column headers */}
        <div style={{
          display: 'grid', gridTemplateColumns: '90px 1fr 1fr 90px 36px',
          gap: 0, padding: '6px 12px',
          background: '#F1F5F9', borderBottom: '1px solid #E2E8F0',
          fontSize: 11, fontWeight: 600, color: '#64748B', textTransform: 'uppercase', letterSpacing: '.04em',
        }}>
          <div>Арт. / Кат.</div>
          <div>Назва в магазині (оригінал)</div>
          <div>Назва для Rozetka (фід)</div>
          <div>Статус</div>
          <div />
        </div>

        {filtered.length === 0 && (
          <div style={{ padding: 32, textAlign: 'center', color: '#94A3B8', fontSize: 13 }}>Нічого не знайдено</div>
        )}

        {filtered.map(row => {
          const p = row.product;
          const override = overrides[p.sku] ?? '';
          const isEdited = override !== (p.rozetka_name ?? '');

          return (
            <div key={p.sku} style={{
              display: 'grid', gridTemplateColumns: '90px 1fr 1fr 90px 36px',
              gap: 0, padding: '7px 12px', borderBottom: '1px solid #F8FAFC', alignItems: 'start',
              background: row.flag === 'error' ? '#FFFAFA' : row.flag === 'warn' ? '#FFFDF5' : '#fff',
            }}>
              {/* SKU + category */}
              <div>
                <div style={{ fontSize: 11, fontWeight: 600, color: '#334155', fontFamily: 'monospace' }}>{p.sku}</div>
                <div style={{ fontSize: 10, color: '#94A3B8', marginTop: 1 }}>{row.catName}</div>
              </div>

              {/* Original name */}
              <div style={{ paddingRight: 12 }}>
                <div style={{ fontSize: 12, color: '#475569', lineHeight: 1.4 }}>{p.name}</div>
                {p.brand && (
                  <div style={{ fontSize: 10, color: '#94A3B8', marginTop: 2 }}>
                    brand: {p.brand}{p.color ? ` · колір: ${p.color}` : ''}{p.volume ? ` · обсяг: ${p.volume}` : ''}
                  </div>
                )}
              </div>

              {/* Rozetka name (editable) */}
              <div style={{ paddingRight: 8 }}>
                <input
                  value={override}
                  onChange={e => setOverrides(prev => ({ ...prev, [p.sku]: e.target.value }))}
                  placeholder={row.autoName}
                  style={{
                    width: '100%', boxSizing: 'border-box',
                    padding: '4px 7px', borderRadius: 5, fontSize: 12, lineHeight: 1.4,
                    border: `1px solid ${isEdited ? '#BFDBFE' : row.flag === 'error' ? '#FECACA' : row.flag === 'warn' ? '#FDE68A' : '#E2E8F0'}`,
                    background: row.isManual || isEdited ? '#EFF6FF' : 'transparent',
                    color: '#1E293B',
                  }}
                />
                {row.issues.length > 0 && (
                  <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 3 }}>
                    {row.issues.map(iss => (
                      <span key={iss} style={{ fontSize: 10, padding: '1px 5px', borderRadius: 3, background: '#FEF2F2', color: '#DC2626' }}>
                        {iss}
                      </span>
                    ))}
                  </div>
                )}
                {row.isManual && !isEdited && (
                  <div style={{ fontSize: 10, color: '#2563EB', marginTop: 2 }}>✎ ручна назва</div>
                )}
              </div>

              {/* Status chip */}
              <div>
                <span style={{ ...CHIP[row.flag], fontSize: 10, padding: '2px 6px', borderRadius: 10, display: 'inline-block' }}>
                  {row.flag === 'ok' ? '✓ OK' : row.flag === 'error' ? '✗ Помилка' : '! Перевір'}
                </span>
              </div>

              {/* Save button */}
              <div>
                {isEdited && (
                  <button
                    onClick={() => saveOverride(p.sku)}
                    disabled={saving === p.sku}
                    style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      padding: '4px 6px', borderRadius: 4,
                      background: saved[p.sku] ? '#ECFDF5' : '#2563EB',
                      color: saved[p.sku] ? '#059669' : '#fff',
                      border: 'none', cursor: 'pointer',
                    }}
                  >
                    {saved[p.sku] ? <CheckCircle size={12} /> : <Save size={12} />}
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <div style={{ marginTop: 10, fontSize: 11, color: '#94A3B8' }}>
        Назву можна відредагувати прямо тут — зміни зберігаються в полі rozetka_name і одразу впливають на фід.
        Порожнє поле = авто-формат.
      </div>
    </div>
  );
}
