'use client';

import { useState, useCallback } from 'react';
import * as XLSX from 'xlsx';

type UnmappedRow = {
  supplier_id: number;
  supplier_sku: string;
  sample_name: string | null;
  price_in: number | null;
  first_seen_at: string;
  supplier_name: string;
};

type ProductHit = { sku: string; name: string; brand: string; volume: string | null };

const cell: React.CSSProperties = {
  padding: '10px 12px', borderBottom: '1px solid var(--border)',
  fontSize: '13px', verticalAlign: 'middle',
};
const btn = (color: string, outline = false): React.CSSProperties => ({
  padding: '5px 12px',
  background: outline ? 'transparent' : color,
  color: outline ? color : '#fff',
  border: `1px solid ${color}`,
  borderRadius: '6px', cursor: 'pointer', fontSize: '12px', fontWeight: 600,
  whiteSpace: 'nowrap',
});

function SearchBox({ supplierId, supplierSku, onMapped }: {
  supplierId: number;
  supplierSku: string;
  onMapped: () => void;
}) {
  const [query, setQuery] = useState('');
  const [hits, setHits] = useState<ProductHit[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const search = useCallback(async (q: string) => {
    setQuery(q);
    if (q.length < 2) { setHits([]); return; }
    setLoading(true);
    const res = await fetch(`/api/admin/products/search?q=${encodeURIComponent(q)}`);
    const data = await res.json();
    setHits(data ?? []);
    setLoading(false);
  }, []);

  async function map(ourSku: string) {
    setSaving(true);
    await fetch('/api/admin/suppliers/map-sku', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ supplier_id: supplierId, supplier_sku: supplierSku, our_sku: ourSku }),
    });
    setSaving(false);
    onMapped();
  }

  return (
    <div style={{ minWidth: '280px' }}>
      <input
        style={{ width: '100%', padding: '6px 10px', border: '1px solid #CBD5E1', borderRadius: '6px', fontSize: '12px', boxSizing: 'border-box' }}
        placeholder="Пошук по назві, SKU, бренду..."
        value={query}
        onChange={e => search(e.target.value)}
      />
      {loading && <p style={{ fontSize: '11px', color: 'var(--text-muted)', margin: '4px 0 0' }}>Пошук...</p>}
      {hits.length > 0 && (
        <div style={{ border: '1px solid var(--border)', borderRadius: '6px', marginTop: '4px', background: 'var(--bg-card)', maxHeight: '200px', overflowY: 'auto' }}>
          {hits.map(h => (
            <div
              key={h.sku}
              style={{ padding: '8px 10px', borderBottom: '1px solid var(--border-light)', cursor: saving ? 'default' : 'pointer' }}
              onClick={() => !saving && map(h.sku)}
            >
              <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-primary)' }}>{h.name}</div>
              <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>{h.sku} · {h.brand}{h.volume ? ` · ${h.volume}` : ''}</div>
            </div>
          ))}
        </div>
      )}
      {!loading && query.length >= 2 && hits.length === 0 && (
        <p style={{ fontSize: '11px', color: 'var(--text-muted)', margin: '4px 0 0' }}>Нічого не знайдено</p>
      )}
    </div>
  );
}

function exportXlsx(rows: UnmappedRow[], filename: string) {
  const data = rows.map(r => ({
    'Артикул постач.': r.supplier_sku,
    'Назва з файлу': r.sample_name ?? '',
    'Ціна вхід (грн)': r.price_in ?? '',
    'Постачальник': r.supplier_name,
    'Перший раз': new Date(r.first_seen_at).toLocaleDateString('uk-UA'),
  }));
  const ws = XLSX.utils.json_to_sheet(data);
  ws['!cols'] = [{ wch: 16 }, { wch: 50 }, { wch: 14 }, { wch: 16 }, { wch: 14 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Немаплені');
  XLSX.writeFile(wb, filename);
}

export default function UnmappedClient({ initial }: { initial: UnmappedRow[] }) {
  const [rows, setRows]       = useState<UnmappedRow[]>(initial);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [ignoring, setIgnoring] = useState<Set<string>>(new Set());

  const rowKey = (r: UnmappedRow) => `${r.supplier_id}:${r.supplier_sku}`;

  function removeRows(keys: string[]) {
    const ks = new Set(keys);
    setRows(r => r.filter(x => !ks.has(rowKey(x))));
    setSelected(s => { const n = new Set(s); keys.forEach(k => n.delete(k)); return n; });
  }

  function toggleRow(key: string) {
    setSelected(s => { const n = new Set(s); n.has(key) ? n.delete(key) : n.add(key); return n; });
  }

  function toggleAll(rowsInGroup: UnmappedRow[]) {
    const keys = rowsInGroup.map(rowKey);
    const allSelected = keys.every(k => selected.has(k));
    setSelected(s => {
      const n = new Set(s);
      allSelected ? keys.forEach(k => n.delete(k)) : keys.forEach(k => n.add(k));
      return n;
    });
  }

  async function ignoreOne(supplierId: number, supplierSku: string) {
    const key = `${supplierId}:${supplierSku}`;
    setIgnoring(s => new Set(s).add(key));
    await fetch('/api/admin/suppliers/map-sku', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ supplier_id: supplierId, supplier_sku: supplierSku }),
    });
    setIgnoring(s => { const n = new Set(s); n.delete(key); return n; });
    removeRows([key]);
  }

  async function ignoreSelected() {
    const keys = [...selected];
    const toIgnore = rows.filter(r => keys.includes(rowKey(r)));
    await Promise.all(toIgnore.map(r =>
      fetch('/api/admin/suppliers/map-sku', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ supplier_id: r.supplier_id, supplier_sku: r.supplier_sku }),
      })
    ));
    removeRows(keys);
  }

  function addNew(r: UnmappedRow) {
    const params = new URLSearchParams({
      sku:        r.supplier_sku,
      name:       r.sample_name ?? '',
      price_cost: String(r.price_in ?? ''),
    });
    window.open(`/admin/products/new?${params}`, '_blank');
  }

  const selectedRows = rows.filter(r => selected.has(rowKey(r)));

  if (rows.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: '60px 0', color: 'var(--text-muted)', fontSize: '14px' }}>
        Всі артикули замаплено — чудово!
      </div>
    );
  }

  const grouped = rows.reduce<Record<string, { name: string; rows: UnmappedRow[] }>>((acc, r) => {
    const key = String(r.supplier_id);
    if (!acc[key]) acc[key] = { name: r.supplier_name, rows: [] };
    acc[key].rows.push(r);
    return acc;
  }, {});

  return (
    <>
      {/* Top toolbar */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '16px' }}>
        <button style={btn('#1E3A5F')} onClick={() => exportXlsx(rows, 'unmapped-all.xlsx')}>
          ↓ Скачати все XLSX ({rows.length})
        </button>
      </div>

      {Object.entries(grouped).map(([supplierId, group]) => {
        const allGroupSelected = group.rows.every(r => selected.has(rowKey(r)));
        return (
          <div key={supplierId} style={{ marginBottom: '32px' }}>
            <h2 style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '12px' }}>
              {group.name}
              <span style={{ marginLeft: '8px', fontSize: '13px', color: 'var(--text-secondary)', fontWeight: 400 }}>
                {group.rows.length} немаплених
              </span>
            </h2>
            <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '10px', overflow: 'hidden' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: 'var(--bg-soft)' }}>
                    <th style={{ ...cell, width: 36 }}>
                      <input type="checkbox" checked={allGroupSelected} onChange={() => toggleAll(group.rows)} />
                    </th>
                    {['Артикул постач.', 'Назва з файлу', 'Ціна вхід', 'Перший раз', 'Прив\'язати до нашого товару', ''].map(h => (
                      <th key={h} style={{ ...cell, fontWeight: 700, fontSize: '12px', color: 'var(--text-primary)' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {group.rows.map(r => {
                    const key = rowKey(r);
                    const isIgnoring = ignoring.has(key);
                    return (
                      <tr key={key} style={{ background: selected.has(key) ? 'var(--bg-soft)' : undefined }}>
                        <td style={{ ...cell, width: 36 }}>
                          <input type="checkbox" checked={selected.has(key)} onChange={() => toggleRow(key)} />
                        </td>
                        <td style={cell}>
                          <code style={{ fontSize: '12px', background: 'var(--border-light)', padding: '2px 6px', borderRadius: '4px' }}>
                            {r.supplier_sku}
                          </code>
                        </td>
                        <td style={{ ...cell, color: 'var(--text-secondary)' }}>{r.sample_name ?? '—'}</td>
                        <td style={cell}>{r.price_in ? `${r.price_in} грн` : '—'}</td>
                        <td style={{ ...cell, color: 'var(--text-muted)', fontSize: '12px' }}>
                          {new Date(r.first_seen_at).toLocaleDateString('uk-UA')}
                        </td>
                        <td style={cell}>
                          <SearchBox
                            supplierId={r.supplier_id}
                            supplierSku={r.supplier_sku}
                            onMapped={() => removeRows([key])}
                          />
                        </td>
                        <td style={{ ...cell, display: 'flex', gap: '6px', alignItems: 'center' }}>
                          <button style={btn('#16A34A')} onClick={() => addNew(r)}>
                            + Додати
                          </button>
                          <button
                            style={btn(isIgnoring ? '#94A3B8' : '#DC2626')}
                            onClick={() => ignoreOne(r.supplier_id, r.supplier_sku)}
                            disabled={isIgnoring}
                            title="Видалити з черги без маппінгу"
                          >
                            Ігнор
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        );
      })}

      {/* Floating bulk action bar */}
      {selected.size > 0 && (
        <div style={{
          position: 'fixed', bottom: '24px', left: '50%', transform: 'translateX(-50%)',
          background: '#1E3A5F', color: '#fff', borderRadius: '12px',
          padding: '12px 20px', display: 'flex', alignItems: 'center', gap: '12px',
          boxShadow: '0 8px 32px rgba(0,0,0,0.25)', zIndex: 100, whiteSpace: 'nowrap',
        }}>
          <span style={{ fontSize: '14px', fontWeight: 600 }}>
            Вибрано: {selected.size}
          </span>
          <button
            style={{ ...btn('#fff', true), color: '#fff', borderColor: 'rgba(255,255,255,0.4)' }}
            onClick={() => exportXlsx(selectedRows, 'unmapped-selected.xlsx')}
          >
            ↓ Скачати XLSX
          </button>
          <button
            style={{ ...btn('#DC2626') }}
            onClick={ignoreSelected}
          >
            Ігнорувати вибрані
          </button>
          <button
            style={{ ...btn('transparent', true), color: 'rgba(255,255,255,0.5)', borderColor: 'transparent', fontSize: '18px', padding: '0 4px' }}
            onClick={() => setSelected(new Set())}
            title="Зняти виділення"
          >
            ×
          </button>
        </div>
      )}
    </>
  );
}
