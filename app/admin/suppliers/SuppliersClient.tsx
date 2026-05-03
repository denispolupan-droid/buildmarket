'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

type BrandDiscount = { brand: string; discount_pct: number };

type Supplier = {
  id: number;
  slug: string;
  name: string;
  source_url: string | null;
  file_format: string;
  sync_interval_h: number;
  markup_retail: number;
  markup_wholesale: number;
  markup_drop: number;
  is_active: boolean;
  notes: string | null;
  last_synced_at: string | null;
  brand_discounts: BrandDiscount[];
  last_sync?: { rows_updated: number; rows_unmapped: number; error_message: string | null }[];
};

const EMPTY: Omit<Supplier, 'id' | 'last_synced_at' | 'last_sync'> = {
  slug: '', name: '', source_url: '', file_format: 'csv',
  sync_interval_h: 24, markup_retail: 22, markup_wholesale: 10,
  markup_drop: 15, is_active: true, notes: '', brand_discounts: [],
};

const FORMAT_LABELS: Record<string, string> = {
  csv: 'CSV', xls: 'Excel (XLS/XLSX)', '1c_xml': '1С CommerceML (XML)',
};

const cell: React.CSSProperties = { padding: '10px 12px', textAlign: 'left', borderBottom: '1px solid #E2E8F0', fontSize: '13px', verticalAlign: 'middle' };
const input: React.CSSProperties = { width: '100%', padding: '7px 10px', border: '1px solid #CBD5E1', borderRadius: '6px', fontSize: '13px', boxSizing: 'border-box' };
const label: React.CSSProperties = { display: 'block', fontSize: '12px', color: '#64748B', marginBottom: '4px', fontWeight: 600 };
const btn = (color: string): React.CSSProperties => ({ padding: '7px 14px', background: color, color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '13px', fontWeight: 600 });

export default function SuppliersClient({ initial, brands }: { initial: Supplier[]; brands: string[] }) {
  const router = useRouter();
  const [suppliers, setSuppliers] = useState<Supplier[]>(initial);
  const [editing, setEditing] = useState<Partial<Supplier> | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [syncing, setSyncing] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // ── Скидки на бренды ──────────────────────────────────────────────────────

  function addDiscount() {
    setEditing(e => ({ ...e, brand_discounts: [...(e?.brand_discounts ?? []), { brand: '', discount_pct: 0 }] }));
  }

  function removeDiscount(i: number) {
    setEditing(e => ({ ...e, brand_discounts: (e?.brand_discounts ?? []).filter((_, idx) => idx !== i) }));
  }

  function updateDiscount(i: number, field: keyof BrandDiscount, value: string | number) {
    setEditing(e => {
      const ds = [...(e?.brand_discounts ?? [])];
      ds[i] = { ...ds[i], [field]: value };
      return { ...e, brand_discounts: ds };
    });
  }

  // ── CRUD ──────────────────────────────────────────────────────────────────

  async function save() {
    setSaving(true); setError('');
    const method = isNew ? 'POST' : 'PUT';
    const url = isNew ? '/api/admin/suppliers' : `/api/admin/suppliers/${editing!.id}`;
    const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(editing) });
    setSaving(false);
    if (!res.ok) { setError((await res.json()).error ?? 'Помилка'); return; }
    setEditing(null);
    router.refresh();
    const all = await fetch('/api/admin/suppliers').then(r => r.json());
    setSuppliers(all);
  }

  async function remove(id: number) {
    if (!confirm('Видалити постачальника?')) return;
    await fetch(`/api/admin/suppliers/${id}`, { method: 'DELETE' });
    setSuppliers(s => s.filter(x => x.id !== id));
  }

  async function syncNow(id: number) {
    setSyncing(id);
    await fetch(`/api/admin/suppliers/${id}/sync`, { method: 'POST' });
    setSyncing(null);
    router.refresh();
    const all = await fetch('/api/admin/suppliers').then(r => r.json());
    setSuppliers(all);
  }

  // ── Рендер форми ──────────────────────────────────────────────────────────

  if (editing !== null) {
    const e = editing;
    const set = (k: keyof typeof EMPTY, v: unknown) => setEditing(prev => ({ ...prev, [k]: v }));

    return (
      <div style={{ maxWidth: '760px' }}>
        <h2 style={{ fontSize: '17px', fontWeight: 700, marginBottom: '24px', color: '#0F172A' }}>
          {isNew ? 'Новий постачальник' : `Редагування: ${e.name}`}
        </h2>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
          <div>
            <span style={label}>Назва *</span>
            <input style={input} value={e.name ?? ''} onChange={ev => set('name', ev.target.value)} />
          </div>
          <div>
            <span style={label}>Slug *</span>
            <input style={input} value={e.slug ?? ''} onChange={ev => set('slug', ev.target.value)} placeholder="ceresit" />
          </div>
        </div>

        <div style={{ marginBottom: '16px' }}>
          <span style={label}>URL файлу прайсу</span>
          <input style={input} value={e.source_url ?? ''} onChange={ev => set('source_url', ev.target.value)} placeholder="https://supplier.com/pricelist.csv?token=XXX" />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
          <div>
            <span style={label}>Формат файлу</span>
            <select style={input} value={e.file_format ?? 'csv'} onChange={ev => set('file_format', ev.target.value)}>
              {Object.entries(FORMAT_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </div>
          <div>
            <span style={label}>Синхронізація (кожні N годин)</span>
            <input style={input} type="number" min={1} value={e.sync_interval_h ?? 24} onChange={ev => set('sync_interval_h', Number(ev.target.value))} />
          </div>
        </div>

        <div style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '8px', padding: '16px', marginBottom: '16px' }}>
          <p style={{ fontSize: '13px', fontWeight: 700, color: '#0F172A', marginBottom: '12px' }}>Наценки від вхідної ціни</p>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px' }}>
            <div>
              <span style={label}>Магазин %</span>
              <input style={input} type="number" step="0.1" value={e.markup_retail ?? 22} onChange={ev => set('markup_retail', Number(ev.target.value))} />
            </div>
            <div>
              <span style={label}>Опт/каталог %</span>
              <input style={input} type="number" step="0.1" value={e.markup_wholesale ?? 10} onChange={ev => set('markup_wholesale', Number(ev.target.value))} />
            </div>
            <div>
              <span style={label}>Дроп %</span>
              <input style={input} type="number" step="0.1" value={e.markup_drop ?? 15} onChange={ev => set('markup_drop', Number(ev.target.value))} />
            </div>
          </div>
        </div>

        <div style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '8px', padding: '16px', marginBottom: '16px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
            <p style={{ fontSize: '13px', fontWeight: 700, color: '#0F172A', margin: 0 }}>Додаткові знижки на бренди</p>
            <button style={btn('#3B82F6')} onClick={addDiscount}>+ Додати</button>
          </div>
          <p style={{ fontSize: '12px', color: '#64748B', marginBottom: '10px' }}>
            Реальний вхід = ціна з файлу × (1 − знижка%)
          </p>
          {(e.brand_discounts ?? []).map((d, i) => (
            <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 120px 32px', gap: '8px', marginBottom: '8px', alignItems: 'end' }}>
              <select style={input} value={d.brand} onChange={ev => updateDiscount(i, 'brand', ev.target.value)}>
                <option value="">— Оберіть бренд —</option>
                {brands.map(b => <option key={b} value={b}>{b}</option>)}
              </select>
              <div>
                <span style={label}>Знижка %</span>
                <input style={input} type="number" step="0.1" value={d.discount_pct} onChange={ev => updateDiscount(i, 'discount_pct', Number(ev.target.value))} />
              </div>
              <button onClick={() => removeDiscount(i)} style={{ padding: '7px', background: '#FEE2E2', border: 'none', borderRadius: '6px', cursor: 'pointer', color: '#DC2626', fontSize: '14px' }}>✕</button>
            </div>
          ))}
          {!(e.brand_discounts ?? []).length && <p style={{ fontSize: '12px', color: '#94A3B8' }}>Немає знижок — ціна береться з файлу напряму</p>}
        </div>

        <div style={{ marginBottom: '20px' }}>
          <span style={label}>Нотатки</span>
          <textarea style={{ ...input, minHeight: '72px', resize: 'vertical' }} value={e.notes ?? ''} onChange={ev => set('notes', ev.target.value)} />
        </div>

        <label style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '20px', fontSize: '13px', cursor: 'pointer' }}>
          <input type="checkbox" checked={e.is_active ?? true} onChange={ev => set('is_active', ev.target.checked)} />
          Активний (буде синхронізуватись автоматично)
        </label>

        {error && <p style={{ color: '#DC2626', fontSize: '13px', marginBottom: '12px' }}>{error}</p>}

        <div style={{ display: 'flex', gap: '10px' }}>
          <button style={btn('#0F172A')} onClick={save} disabled={saving}>{saving ? 'Збереження...' : 'Зберегти'}</button>
          <button style={{ ...btn('#64748B') }} onClick={() => setEditing(null)}>Скасувати</button>
        </div>
      </div>
    );
  }

  // ── Рендер списку ─────────────────────────────────────────────────────────

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <div>
          <h1 style={{ fontSize: '22px', fontWeight: 800, color: '#0F172A', margin: 0 }}>Постачальники</h1>
          <p style={{ fontSize: '13px', color: '#64748B', marginTop: '4px' }}>{suppliers.length} постачальників</p>
        </div>
        <div style={{ display: 'flex', gap: '10px' }}>
          <a href="/admin/suppliers/unmapped" style={{ ...btn('#64748B'), textDecoration: 'none', display: 'inline-block' }}>
            Немаплені артикули
          </a>
          <button style={btn('#0F172A')} onClick={() => { setIsNew(true); setEditing({ ...EMPTY }); }}>
            + Додати постачальника
          </button>
        </div>
      </div>

      {suppliers.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px 0', color: '#94A3B8', fontSize: '14px' }}>
          Постачальників ще немає. Додайте першого.
        </div>
      ) : (
        <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: '10px', overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: '#F8FAFC' }}>
                {['Назва', 'Формат', 'Інтервал', 'Наценки (маг/опт/дроп)', 'Остання синх.', 'Статус', ''].map(h => (
                  <th key={h} style={{ ...cell, fontWeight: 700, color: '#374151', fontSize: '12px' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {suppliers.map(s => {
                const lastSync = s.last_sync?.[0];
                return (
                  <tr key={s.id} style={{ background: s.is_active ? '#fff' : '#F8FAFC' }}>
                    <td style={cell}>
                      <div style={{ fontWeight: 600, color: '#0F172A' }}>{s.name}</div>
                      <div style={{ fontSize: '11px', color: '#94A3B8', marginTop: '2px' }}>{s.slug}</div>
                      {s.source_url && <div style={{ fontSize: '11px', color: '#3B82F6', marginTop: '2px', maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.source_url}</div>}
                    </td>
                    <td style={cell}>{FORMAT_LABELS[s.file_format] ?? s.file_format}</td>
                    <td style={cell}>кожні {s.sync_interval_h} год</td>
                    <td style={cell}>
                      <span style={{ fontSize: '12px' }}>
                        {s.markup_retail}% / {s.markup_wholesale}% / {s.markup_drop}%
                      </span>
                      {(s.brand_discounts ?? []).length > 0 && (
                        <div style={{ fontSize: '11px', color: '#64748B', marginTop: '2px' }}>
                          {s.brand_discounts.length} знижок на бренди
                        </div>
                      )}
                    </td>
                    <td style={cell}>
                      {s.last_synced_at ? (
                        <>
                          <div style={{ fontSize: '12px' }}>{new Date(s.last_synced_at).toLocaleString('uk-UA')}</div>
                          {lastSync && (
                            <div style={{ fontSize: '11px', color: lastSync.error_message ? '#DC2626' : '#16A34A', marginTop: '2px' }}>
                              {lastSync.error_message ?? `оновлено: ${lastSync.rows_updated}, немаплених: ${lastSync.rows_unmapped}`}
                            </div>
                          )}
                        </>
                      ) : <span style={{ color: '#94A3B8', fontSize: '12px' }}>ніколи</span>}
                    </td>
                    <td style={cell}>
                      <span style={{ padding: '2px 8px', borderRadius: '999px', fontSize: '11px', fontWeight: 600, background: s.is_active ? '#DCFCE7' : '#F1F5F9', color: s.is_active ? '#16A34A' : '#64748B' }}>
                        {s.is_active ? 'активний' : 'вимкнено'}
                      </span>
                    </td>
                    <td style={{ ...cell, whiteSpace: 'nowrap' }}>
                      <div style={{ display: 'flex', gap: '6px' }}>
                        <button style={btn('#3B82F6')} onClick={() => { setIsNew(false); setEditing(s); }}>Редагувати</button>
                        <button
                          style={btn(syncing === s.id ? '#94A3B8' : '#0F172A')}
                          onClick={() => syncNow(s.id)}
                          disabled={syncing === s.id}
                        >
                          {syncing === s.id ? 'Синх...' : 'Синх зараз'}
                        </button>
                        <button style={btn('#DC2626')} onClick={() => remove(s.id)}>Видалити</button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
