'use client';

import { useState, useCallback } from 'react';

type UnmappedRow = {
  supplier_id: number;
  supplier_sku: string;
  sample_name: string | null;
  price_in: number | null;
  first_seen_at: string;
  supplier_name: string;
};

type ProductHit = { sku: string; name: string; brand: string; volume: string | null };

const cell: React.CSSProperties = { padding: '10px 12px', borderBottom: '1px solid var(--border)', fontSize: '13px', verticalAlign: 'middle' };
const btn = (color: string): React.CSSProperties => ({ padding: '5px 12px', background: color, color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '12px', fontWeight: 600 });

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
    <div style={{ minWidth: '320px' }}>
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

export default function UnmappedClient({ initial }: { initial: UnmappedRow[] }) {
  const [rows, setRows] = useState<UnmappedRow[]>(initial);
  const [ignoring, setIgnoring] = useState<string | null>(null);

  function removeRow(supplierId: number, supplierSku: string) {
    setRows(r => r.filter(x => !(x.supplier_id === supplierId && x.supplier_sku === supplierSku)));
  }

  async function ignore(supplierId: number, supplierSku: string) {
    const key = `${supplierId}:${supplierSku}`;
    setIgnoring(key);
    await fetch('/api/admin/suppliers/map-sku', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ supplier_id: supplierId, supplier_sku: supplierSku }),
    });
    setIgnoring(null);
    removeRow(supplierId, supplierSku);
  }

  if (rows.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: '60px 0', color: 'var(--text-muted)', fontSize: '14px' }}>
        Всі артикули замаплено — чудово!
      </div>
    );
  }

  // Групуємо по постачальнику
  const grouped = rows.reduce<Record<string, { name: string; rows: UnmappedRow[] }>>((acc, r) => {
    const key = String(r.supplier_id);
    if (!acc[key]) acc[key] = { name: r.supplier_name, rows: [] };
    acc[key].rows.push(r);
    return acc;
  }, {});

  return (
    <>
      {Object.entries(grouped).map(([supplierId, group]) => (
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
                  {['Артикул постач.', 'Назва з файлу', 'Ціна вхід', 'Перший раз', 'Прив\'язати до нашого товару', ''].map(h => (
                    <th key={h} style={{ ...cell, fontWeight: 700, fontSize: '12px', color: 'var(--text-primary)' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {group.rows.map(r => {
                  const key = `${r.supplier_id}:${r.supplier_sku}`;
                  return (
                    <tr key={key}>
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
                          onMapped={() => removeRow(r.supplier_id, r.supplier_sku)}
                        />
                      </td>
                      <td style={cell}>
                        <button
                          style={btn(ignoring === key ? '#94A3B8' : '#DC2626')}
                          onClick={() => ignore(r.supplier_id, r.supplier_sku)}
                          disabled={ignoring === key}
                          title="Ігнорувати — видалити з черги без маппінгу"
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
      ))}
    </>
  );
}
