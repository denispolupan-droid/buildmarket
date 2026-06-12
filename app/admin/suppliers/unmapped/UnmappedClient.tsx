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

type BulkItem = { supplier_id: number; supplier_sku: string; name: string; price_cost: number };

function BulkAddModal({ items, onClose, onDone }: {
  items: BulkItem[];
  onClose: () => void;
  onDone: (skus: string[]) => void;
}) {
  const [brand, setBrand] = useState('');
  const [names, setNames] = useState<string[]>(items.map(i => i.name));
  const [progress, setProgress] = useState<null | { done: number; total: number; errors: string[] }>(null);

  async function handleCreate() {
    if (!brand.trim()) { alert('Вкажіть бренд'); return; }
    const total = items.length;
    const errors: string[] = [];
    const created: string[] = [];
    setProgress({ done: 0, total, errors: [] });

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      const name = names[i]?.trim() || item.name;
      const res = await fetch('/api/admin/products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sku: item.supplier_sku,
          product: {
            sku: item.supplier_sku, name, brand: brand.trim(),
            is_active: false, pack_qty: 1, min_order: 1,
          },
          stock: {
            sku: item.supplier_sku,
            price_unit: 0, price_retail: 0,
            price_cost: item.price_cost || null,
            stock_status: 'in_stock', stock_qty: 0,
          },
          characteristics: [],
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        errors.push(`${item.supplier_sku}: ${data.error ?? 'помилка'}`);
      } else {
        created.push(item.supplier_sku);
        // auto-map supplier SKU
        await fetch('/api/admin/suppliers/map-sku', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ supplier_id: item.supplier_id, supplier_sku: item.supplier_sku, our_sku: item.supplier_sku }),
        });
      }
      setProgress({ done: i + 1, total, errors: [...errors] });
    }

    onDone(created);
  }

  const isDone = progress && progress.done === progress.total;

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ background: 'var(--bg-card)', borderRadius: '16px', width: '560px', maxHeight: '80vh', display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: '0 20px 60px rgba(0,0,0,0.3)' }}>
        {/* Header */}
        <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ fontSize: '16px', fontWeight: 700 }}>Додати {items.length} товарів</div>
            <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>Будуть створені як неактивні — активуй після заповнення</div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: '20px', cursor: 'pointer', color: 'var(--text-muted)' }}>×</button>
        </div>

        {/* Brand input */}
        <div style={{ padding: '16px 24px', borderBottom: '1px solid var(--border)' }}>
          <label style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: '6px' }}>
            Бренд для всіх *
          </label>
          <input
            value={brand}
            onChange={e => setBrand(e.target.value)}
            placeholder="напр. Ceresit"
            style={{ width: '100%', height: '40px', padding: '0 12px', borderRadius: '8px', border: '1px solid var(--border)', fontSize: '14px', boxSizing: 'border-box' }}
            autoFocus
          />
        </div>

        {/* Product list */}
        <div style={{ overflowY: 'auto', flex: 1 }}>
          {items.map((item, i) => (
            <div key={item.supplier_sku} style={{ padding: '10px 24px', borderBottom: '1px solid var(--border-light)', display: 'flex', gap: '10px', alignItems: 'center' }}>
              <code style={{ fontSize: '11px', background: 'var(--border-light)', padding: '2px 6px', borderRadius: '4px', flexShrink: 0 }}>
                {item.supplier_sku}
              </code>
              <input
                value={names[i]}
                onChange={e => setNames(n => n.map((v, j) => j === i ? e.target.value : v))}
                style={{ flex: 1, height: '32px', padding: '0 8px', borderRadius: '6px', border: '1px solid var(--border)', fontSize: '12px' }}
              />
              {item.price_cost > 0 && (
                <span style={{ fontSize: '11px', color: 'var(--text-muted)', flexShrink: 0 }}>{item.price_cost} грн</span>
              )}
            </div>
          ))}
        </div>

        {/* Footer */}
        <div style={{ padding: '16px 24px', borderTop: '1px solid var(--border)' }}>
          {progress && (
            <div style={{ marginBottom: '12px' }}>
              <div style={{ height: '6px', background: 'var(--border)', borderRadius: '3px', overflow: 'hidden' }}>
                <div style={{ height: '100%', background: '#16A34A', borderRadius: '3px', width: `${(progress.done / progress.total) * 100}%`, transition: 'width 0.2s' }} />
              </div>
              <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px' }}>
                {progress.done} / {progress.total}
                {progress.errors.length > 0 && <span style={{ color: '#DC2626', marginLeft: '8px' }}>{progress.errors.length} помилок</span>}
              </div>
              {progress.errors.length > 0 && (
                <div style={{ fontSize: '11px', color: '#DC2626', marginTop: '4px', maxHeight: '60px', overflowY: 'auto' }}>
                  {progress.errors.map((e, i) => <div key={i}>{e}</div>)}
                </div>
              )}
            </div>
          )}
          {isDone ? (
            <button onClick={onClose} style={{ ...btn('#1E3A5F'), width: '100%', justifyContent: 'center', display: 'flex', height: '40px', alignItems: 'center', fontSize: '14px' }}>
              Готово — закрити
            </button>
          ) : (
            <button
              onClick={handleCreate}
              disabled={!!progress}
              style={{ ...btn('#16A34A'), width: '100%', justifyContent: 'center', display: 'flex', height: '40px', alignItems: 'center', fontSize: '14px', opacity: progress ? 0.6 : 1 }}
            >
              {progress ? `Створюю... ${progress.done}/${progress.total}` : `Створити ${items.length} товарів`}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export default function UnmappedClient({ initial }: { initial: UnmappedRow[] }) {
  const [rows, setRows]       = useState<UnmappedRow[]>(initial);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [ignoring, setIgnoring] = useState<Set<string>>(new Set());
  const [bulkAddOpen, setBulkAddOpen] = useState(false);

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
  const bulkItems: BulkItem[] = selectedRows.map(r => ({
    supplier_id: r.supplier_id,
    supplier_sku: r.supplier_sku,
    name: r.sample_name ?? r.supplier_sku,
    price_cost: r.price_in ?? 0,
  }));

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
      {/* Sticky bulk action bar */}
      {selected.size > 0 && (
        <div style={{
          position: 'sticky', top: 0, zIndex: 50,
          background: '#1E3A5F', color: '#fff', borderRadius: '10px',
          padding: '10px 16px', display: 'flex', alignItems: 'center', gap: '10px',
          marginBottom: '16px', boxShadow: '0 4px 16px rgba(0,0,0,0.2)', whiteSpace: 'nowrap',
          flexWrap: 'wrap',
        }}>
          <span style={{ fontSize: '14px', fontWeight: 600, marginRight: '4px' }}>
            Вибрано: {selected.size}
          </span>
          <button
            style={{ ...btn('#fff', true), color: '#fff', borderColor: 'rgba(255,255,255,0.4)' }}
            onClick={() => exportXlsx(selectedRows, 'unmapped-selected.xlsx')}
          >
            ↓ Скачати XLSX
          </button>
          <button style={btn('#16A34A')} onClick={() => setBulkAddOpen(true)}>
            + Додати вибрані
          </button>
          <button style={btn('#DC2626')} onClick={ignoreSelected}>
            Ігнорувати вибрані
          </button>
          <button
            style={{ ...btn('transparent', true), color: 'rgba(255,255,255,0.6)', borderColor: 'transparent', fontSize: '20px', padding: '0 4px', marginLeft: 'auto' }}
            onClick={() => setSelected(new Set())}
            title="Зняти виділення"
          >
            ×
          </button>
        </div>
      )}

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

      {/* Bulk add modal */}
      {bulkAddOpen && (
        <BulkAddModal
          items={bulkItems}
          onClose={() => setBulkAddOpen(false)}
          onDone={(createdSkus) => {
            setBulkAddOpen(false);
            removeRows(selectedRows.filter(r => createdSkus.includes(r.supplier_sku)).map(rowKey));
          }}
        />
      )}

    </>
  );
}
