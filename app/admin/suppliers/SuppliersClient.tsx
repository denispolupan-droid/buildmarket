'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Layers, Eye, EyeOff, Search, Trash2 } from 'lucide-react';
import { getSupabaseBrowser } from '../../../lib/supabase-browser';

type BrandDiscount = {
  brand:             string;
  discount_pct:      number;
  markup_retail?:    number | null;
  markup_wholesale?: number | null;
  markup_drop?:      number | null;
  keep_price?:       boolean | null;
};

type ProductOverride = {
  our_sku:          string;
  name?:            string;
  brand?:           string;
  markup_retail?:   number | string | null;
  markup_wholesale?: number | string | null;
  markup_drop?:     number | string | null;
  fixed_retail?:    number | string | null;
  fixed_wholesale?: number | string | null;
  fixed_drop?:      number | string | null;
  notes?:           string;
};

type SheetInfo = { name: string; hidden: boolean; skuRows: number; totalRows: number; headers: string[] };

type Supplier = {
  id: number;
  slug: string;
  name: string;
  source_url: string | null;
  file_format: string;
  sheet_name: string | null;
  col_sku:   string | null;
  col_price: string | null;
  col_qty:   string | null;
  col_name:  string | null;
  sync_interval_h: number;
  markup_retail: number;
  markup_wholesale: number;
  markup_drop: number;
  is_active: boolean;
  notes: string | null;
  last_synced_at: string | null;
  brand_discounts: BrandDiscount[];
  product_overrides?: ProductOverride[];
  last_sync?: { rows_updated: number; rows_unmapped: number; error_message: string | null }[];
};

const EMPTY: Omit<Supplier, 'id' | 'last_synced_at' | 'last_sync'> = {
  slug: '', name: '', source_url: '', file_format: 'csv',
  sheet_name: null, col_sku: null, col_price: null, col_qty: null, col_name: null,
  sync_interval_h: 24, markup_retail: 22, markup_wholesale: 10,
  markup_drop: 15, is_active: true, notes: '', brand_discounts: [],
};

const FORMAT_LABELS: Record<string, string> = {
  google_sheets: 'Google Sheets (розумний парсер)',
  csv:           'CSV (стандартний)',
  xls:           'Excel (XLS/XLSX)',
  '1c_xml':      '1С CommerceML (XML)',
};

const cell: React.CSSProperties = { padding: '10px 12px', textAlign: 'left', borderBottom: '1px solid var(--border)', fontSize: '13px', verticalAlign: 'middle', color: 'var(--text-primary)' };
const input: React.CSSProperties = { width: '100%', padding: '7px 10px', border: '1px solid var(--border)', borderRadius: '6px', fontSize: '13px', boxSizing: 'border-box', background: 'var(--bg-soft)', color: 'var(--text-primary)' };
const label: React.CSSProperties = { display: 'block', fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '4px', fontWeight: 600 };
const btn = (color: string): React.CSSProperties => ({ padding: '7px 14px', background: color, color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '13px', fontWeight: 600 });

export default function SuppliersClient({ initial, brands }: { initial: Supplier[]; brands: string[] }) {
  const router = useRouter();
  const [suppliers, setSuppliers] = useState<Supplier[]>(initial);
  const [editing, setEditing] = useState<Partial<Supplier> | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [syncing,       setSyncing]       = useState<number | null>(null);
  const [saving,        setSaving]        = useState(false);
  const [error,         setError]         = useState('');
  const [sheets,        setSheets]        = useState<SheetInfo[] | null>(null);
  const [sheetsLoading, setSheetsLoading] = useState(false);
  const [sheetsError,   setSheetsError]   = useState('');

  // ── Пошук товарів для product overrides ───────────────────────────────────
  const [prodSearch,   setProdSearch]   = useState('');
  const [prodResults,  setProdResults]  = useState<{sku:string;name:string;brand:string}[]>([]);
  const [prodOpen,     setProdOpen]     = useState(false);
  const prodRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (prodSearch.length < 2) { setProdResults([]); return; }
    const t = setTimeout(async () => {
      const sb = getSupabaseBrowser();
      const { data } = await sb.from('products')
        .select('sku, name, brand')
        .or(`name.ilike.%${prodSearch}%,sku.ilike.%${prodSearch}%`)
        .limit(8);
      setProdResults(data ?? []);
      setProdOpen(true);
    }, 300);
    return () => clearTimeout(t);
  }, [prodSearch]);

  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (prodRef.current && !prodRef.current.contains(e.target as Node)) setProdOpen(false);
    };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  function addProductOverride(prod: { sku: string; name: string; brand: string }) {
    const overrides = editing?.product_overrides ?? [];
    if (overrides.find(o => o.our_sku === prod.sku)) return;
    setEditing(e => ({
      ...e,
      product_overrides: [...(e?.product_overrides ?? []), { our_sku: prod.sku, name: prod.name, brand: prod.brand }],
    }));
    setProdSearch('');
    setProdOpen(false);
  }

  function removeProductOverride(sku: string) {
    setEditing(e => ({ ...e, product_overrides: (e?.product_overrides ?? []).filter(o => o.our_sku !== sku) }));
  }

  function updateProductOverride(sku: string, field: keyof ProductOverride, value: string) {
    setEditing(e => ({
      ...e,
      product_overrides: (e?.product_overrides ?? []).map(o => o.our_sku === sku ? { ...o, [field]: value } : o),
    }));
  }

  // ── Скидки на бренды ──────────────────────────────────────────────────────

  function addDiscount() {
    setEditing(e => ({ ...e, brand_discounts: [...(e?.brand_discounts ?? []), { brand: '', discount_pct: 0 }] }));
  }

  function removeDiscount(i: number) {
    setEditing(e => ({ ...e, brand_discounts: (e?.brand_discounts ?? []).filter((_, idx) => idx !== i) }));
  }

  function updateDiscount(i: number, field: keyof BrandDiscount, value: string | number | boolean) {
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

  async function loadSheets() {
    if (!editing?.id) return;
    setSheetsLoading(true); setSheetsError(''); setSheets(null);
    const res = await fetch(`/api/admin/suppliers/${editing.id}/sheets`);
    const data = await res.json();
    setSheetsLoading(false);
    if (!res.ok) { setSheetsError(data.error ?? 'Помилка'); return; }
    setSheets(data.sheets);
  }

  // ── Рендер форми ──────────────────────────────────────────────────────────

  if (editing !== null) {
    const e = editing;
    const set = (k: keyof typeof EMPTY, v: unknown) => {
      setEditing(prev => ({ ...prev, [k]: v }));
      if (k === 'source_url' || k === 'file_format') { setSheets(null); setSheetsError(''); }
    };

    return (
      <div style={{ maxWidth: '760px' }}>
        <h2 style={{ fontSize: '17px', fontWeight: 700, marginBottom: '24px', color: 'var(--text-primary)' }}>
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
            <input style={input} type="number" min={1} value={e.sync_interval_h ?? ''} onChange={ev => set('sync_interval_h', ev.target.value)} />
          </div>
        </div>

        {/* Sheet selector — only for Excel */}
        {e.file_format === 'xls' && (
          <div style={{ background: '#F0F7FF', border: '1px solid #BFDBFE', borderRadius: '8px', padding: '14px 16px', marginBottom: '16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
              <Layers size={15} color="#3B82F6" />
              <span style={{ fontSize: '13px', fontWeight: 700, color: '#1D4ED8' }}>Аркуш Excel</span>
            </div>
            <p style={{ fontSize: '12px', color: '#475569', marginBottom: '10px' }}>
              Якщо файл містить кілька аркушів — вкажіть назву того, де знаходиться весь асортимент.
              Залиште порожнім, щоб система обрала аркуш з найбільшою кількістю товарів автоматично.
            </p>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-end', marginBottom: sheets ? '12px' : '0' }}>
              <div style={{ flex: 1 }}>
                <span style={label}>Назва аркушу</span>
                <input
                  style={input}
                  value={e.sheet_name ?? ''}
                  onChange={ev => set('sheet_name', ev.target.value || null)}
                  placeholder="Наприклад: Весь асортимент"
                />
              </div>
              <button
                type="button"
                onClick={loadSheets}
                disabled={sheetsLoading || !e.id || !e.source_url}
                style={{ ...btn('#3B82F6'), height: '34px', whiteSpace: 'nowrap', opacity: (!e.id || !e.source_url) ? 0.4 : 1 }}
                title={!e.id ? 'Спочатку збережіть постачальника' : !e.source_url ? 'Вкажіть URL файлу' : ''}
              >
                {sheetsLoading ? 'Завантаження...' : 'Переглянути аркуші'}
              </button>
            </div>

            {sheetsError && (
              <p style={{ fontSize: '12px', color: '#DC2626', margin: '4px 0 0' }}>{sheetsError}</p>
            )}

            {sheets && (
              <div style={{ border: '1px solid #BFDBFE', borderRadius: '7px', overflow: 'hidden', background: '#fff' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                  <thead>
                    <tr style={{ background: '#EFF6FF' }}>
                      <th style={{ padding: '7px 10px', textAlign: 'left', color: '#1D4ED8', fontWeight: 700 }}>Аркуш</th>
                      <th style={{ padding: '7px 10px', textAlign: 'left', color: '#1D4ED8', fontWeight: 700 }}>Видимість</th>
                      <th style={{ padding: '7px 10px', textAlign: 'right', color: '#1D4ED8', fontWeight: 700 }}>Рядків з товарами</th>
                      <th style={{ padding: '7px 10px', textAlign: 'right', color: '#1D4ED8', fontWeight: 700 }}>Всього рядків</th>
                      <th style={{ padding: '7px 10px' }}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {sheets.map(s => (
                      <tr key={s.name} style={{ borderTop: '1px solid #DBEAFE', background: e.sheet_name === s.name ? '#EFF6FF' : '#fff' }}>
                        <td style={{ padding: '7px 10px', fontWeight: e.sheet_name === s.name ? 700 : 400, color: '#0F172A' }}>
                          {s.name}
                        </td>
                        <td style={{ padding: '7px 10px' }}>
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '11px', color: s.hidden ? '#94A3B8' : '#16A34A' }}>
                            {s.hidden ? <><EyeOff size={11} /> Прихований</> : <><Eye size={11} /> Видимий</>}
                          </span>
                        </td>
                        <td style={{ padding: '7px 10px', textAlign: 'right', fontWeight: 700, color: s.skuRows > 0 ? '#1D4ED8' : '#94A3B8' }}>
                          {s.skuRows > 0 ? s.skuRows : '—'}
                        </td>
                        <td style={{ padding: '7px 10px', textAlign: 'right', color: '#64748B' }}>
                          {s.totalRows}
                        </td>
                        <td style={{ padding: '7px 10px', textAlign: 'right' }}>
                          <button
                            type="button"
                            onClick={() => set('sheet_name', e.sheet_name === s.name ? null : s.name)}
                            style={{
                              padding: '3px 10px', borderRadius: '5px', border: 'none', cursor: 'pointer', fontSize: '11px', fontWeight: 600,
                              background: e.sheet_name === s.name ? '#DCFCE7' : '#EFF6FF',
                              color: e.sheet_name === s.name ? '#16A34A' : '#3B82F6',
                            }}
                          >
                            {e.sheet_name === s.name ? '✓ Обрано' : 'Обрати'}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* Column mapping — for XLS and CSV */}
        {(e.file_format === 'xls' || e.file_format === 'csv') && (
          <div style={{ background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: '8px', padding: '14px 16px', marginBottom: '16px' }}>
            <p style={{ fontSize: '13px', fontWeight: 700, color: '#92400E', marginBottom: '4px' }}>Маппінг колонок</p>
            <p style={{ fontSize: '12px', color: '#78350F', marginBottom: '12px' }}>
              Вкажіть точні назви колонок з файлу постачальника. Залиште порожнім — система спробує знайти автоматично за стандартними словами.
            </p>

            {/* Show headers from selected sheet */}
            {sheets && (() => {
              const activeSheet = sheets.find(s => s.name === e.sheet_name) ?? sheets.find(s => s.skuRows > 0) ?? sheets[0];
              const hdrs = activeSheet?.headers ?? [];
              return hdrs.length > 0 ? (
                <div style={{ marginBottom: '12px' }}>
                  <div style={{ fontSize: '11px', fontWeight: 600, color: '#92400E', marginBottom: '5px' }}>
                    Колонки у файлі ({activeSheet?.name}):
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px' }}>
                    {hdrs.map(h => (
                      <span
                        key={h}
                        style={{ padding: '2px 8px', background: '#FEF3C7', border: '1px solid #FDE68A', borderRadius: '4px', fontSize: '11px', cursor: 'default' }}
                        title={`Клікніть щоб скопіювати: "${h}"`}
                        onClick={() => navigator.clipboard?.writeText(h)}
                      >
                        {h}
                      </span>
                    ))}
                  </div>
                  <div style={{ fontSize: '10px', color: '#A16207', marginTop: '4px' }}>Клік по назві — скопіювати в буфер</div>
                </div>
              ) : null;
            })()}

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
              {([
                { key: 'col_sku',   lbl: 'Артикул (SKU)',       ph: 'напр. Артикул, Код' },
                { key: 'col_price', lbl: 'Ціна',                ph: 'напр. Ціна, Прайс' },
                { key: 'col_qty',   lbl: 'Залишок / Наявність', ph: 'напр. Залишок, Наявність, Кількість' },
              ] as const).map(({ key, lbl, ph }) => (
                <div key={key}>
                  <span style={label}>{lbl}</span>
                  <input
                    style={input}
                    value={(e as Record<string, unknown>)[key] as string ?? ''}
                    onChange={ev => set(key as keyof typeof EMPTY, ev.target.value || null)}
                    placeholder={ph}
                  />
                </div>
              ))}
            </div>
          </div>
        )}

        <div style={{ background: 'var(--bg-soft)', border: '1px solid var(--border)', borderRadius: '8px', padding: '16px', marginBottom: '16px' }}>
          <p style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '12px' }}>Наценки від вхідної ціни</p>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px' }}>
            <div>
              <span style={label}>Магазин %</span>
              <input style={input} type="number" step="0.1" value={e.markup_retail ?? ''} onChange={ev => set('markup_retail', ev.target.value)} />
            </div>
            <div>
              <span style={label}>Опт/каталог %</span>
              <input style={input} type="number" step="0.1" value={e.markup_wholesale ?? ''} onChange={ev => set('markup_wholesale', ev.target.value)} />
            </div>
            <div>
              <span style={label}>Дроп %</span>
              <input style={input} type="number" step="0.1" value={e.markup_drop ?? ''} onChange={ev => set('markup_drop', ev.target.value)} />
            </div>
          </div>
        </div>

        {/* ── Наценки і знижки по брендах ─────────────────────────────── */}
        <div style={{ background: 'var(--bg-soft)', border: '1px solid var(--border)', borderRadius: '8px', padding: '16px', marginBottom: '16px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
            <p style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>Наценки і знижки по брендах</p>
            <button style={btn('#3B82F6')} onClick={addDiscount}>+ Додати бренд</button>
          </div>
          <p style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '12px' }}>
            Знижка% зменшує вхідну ціну. Наценка% перекриває глобальну наценку для цього бренду. Порожнє поле = використовувати глобальне.
          </p>
          {(e.brand_discounts ?? []).length > 0 && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 90px 90px 90px 90px auto 32px', gap: '6px', marginBottom: '6px', alignItems: 'center' }}>
              {['Бренд', 'Знижка вх.%', 'Магазин%', 'Опт%', 'Дроп%', 'Ціна від оригіналу', ''].map(h => (
                <span key={h} style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>{h}</span>
              ))}
            </div>
          )}
          {(e.brand_discounts ?? []).map((d, i) => (
            <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 90px 90px 90px 90px auto 32px', gap: '6px', marginBottom: '6px', alignItems: 'center' }}>
              <select style={input} value={d.brand} onChange={ev => updateDiscount(i, 'brand', ev.target.value)}>
                <option value="">— Бренд —</option>
                {brands.map(b => <option key={b} value={b}>{b}</option>)}
              </select>
              <input style={{ ...input, textAlign: 'center' }} type="number" step="0.1" placeholder="0" value={d.discount_pct ?? ''} onChange={ev => updateDiscount(i, 'discount_pct', ev.target.value)} />
              <input style={{ ...input, textAlign: 'center' }} type="number" step="0.1" placeholder="глоб." value={(d as any).markup_retail ?? ''} onChange={ev => updateDiscount(i, 'markup_retail' as any, ev.target.value)} />
              <input style={{ ...input, textAlign: 'center' }} type="number" step="0.1" placeholder="глоб." value={(d as any).markup_wholesale ?? ''} onChange={ev => updateDiscount(i, 'markup_wholesale' as any, ev.target.value)} />
              <input style={{ ...input, textAlign: 'center' }} type="number" step="0.1" placeholder="глоб." value={(d as any).markup_drop ?? ''} onChange={ev => updateDiscount(i, 'markup_drop' as any, ev.target.value)} />
              <label
                title="Ціна продажу рахується від оригінальної вхідної ціни (без знижки). Знижка зменшує лише собівартість — маржа зростає, клієнт ціни не бачить."
                style={{ display: 'flex', alignItems: 'center', gap: '5px', cursor: 'pointer', whiteSpace: 'nowrap', fontSize: '12px', color: d.keep_price ? '#15803D' : 'var(--text-muted)' }}
              >
                <input
                  type="checkbox"
                  checked={d.keep_price ?? false}
                  onChange={ev => updateDiscount(i, 'keep_price' as any, ev.target.checked)}
                />
                {d.keep_price ? '✓ Активно' : 'Вимкнено'}
              </label>
              <button onClick={() => removeDiscount(i)} style={{ padding: '7px', background: '#FEE2E2', border: 'none', borderRadius: '6px', cursor: 'pointer', color: '#DC2626' }}>✕</button>
            </div>
          ))}
          {!(e.brand_discounts ?? []).length && <p style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Немає налаштувань — використовуються глобальні наценки</p>}
        </div>

        {/* ── Override цін на окремі товари ──────────────────────────── */}
        <div style={{ background: 'var(--bg-soft)', border: '1px solid var(--border)', borderRadius: '8px', padding: '16px', marginBottom: '16px' }}>
          <p style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '6px' }}>
            Ціни на окремі товари
          </p>
          <p style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '12px' }}>
            Перекриває налаштування бренду. Наценка% або фіксована ціна — заповнити одне. Порожнє = успадкувати від бренду/постачальника.
          </p>

          {/* Пошук товарів */}
          <div ref={prodRef} style={{ position: 'relative', marginBottom: '12px' }}>
            <Search size={13} color="var(--text-muted)" style={{ position: 'absolute', left: '9px', top: '50%', transform: 'translateY(-50%)' }} />
            <input
              value={prodSearch}
              onChange={ev => setProdSearch(ev.target.value)}
              onFocus={() => prodResults.length > 0 && setProdOpen(true)}
              placeholder="Пошук товару для додавання override..."
              style={{ ...input, paddingLeft: '28px' }}
            />
            {prodOpen && prodResults.length > 0 && (
              <div style={{ position: 'absolute', top: 'calc(100% + 2px)', left: 0, right: 0, zIndex: 50, background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '8px', boxShadow: '0 8px 20px rgba(0,0,0,0.12)', maxHeight: '200px', overflowY: 'auto' }}>
                {prodResults.map(p => (
                  <button key={p.sku} onMouseDown={() => addProductOverride(p)} style={{ width: '100%', padding: '8px 12px', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left', fontSize: '12px', borderBottom: '1px solid var(--border-light)', color: 'var(--text-primary)' }}>
                    <span style={{ color: 'var(--text-muted)', marginRight: '6px', fontFamily: 'monospace' }}>{p.sku}</span>
                    {p.brand} {p.name}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Таблиця overrides */}
          {(e.product_overrides ?? []).length > 0 && (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 75px 75px 75px 85px 85px 85px 32px', gap: '5px', marginBottom: '5px', alignItems: 'center' }}>
                {['Товар', 'Маг%', 'Опт%', 'Дроп%', 'Ціна маг.', 'Ціна опт.', 'Ціна дроп.', ''].map(h => (
                  <span key={h} style={{ fontSize: '10px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>{h}</span>
                ))}
              </div>
              {(e.product_overrides ?? []).map(o => (
                <div key={o.our_sku} style={{ display: 'grid', gridTemplateColumns: '1fr 75px 75px 75px 85px 85px 85px 32px', gap: '5px', marginBottom: '5px', alignItems: 'center' }}>
                  <div>
                    <div style={{ fontSize: '12px', color: 'var(--text-primary)', fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {o.brand} {o.name}
                    </div>
                    <div style={{ fontSize: '10px', color: 'var(--text-muted)', fontFamily: 'monospace' }}>{o.our_sku}</div>
                  </div>
                  {(['markup_retail','markup_wholesale','markup_drop'] as const).map(f => (
                    <input key={f} style={{ ...input, textAlign: 'center', padding: '5px 6px', fontSize: '12px' }} type="number" step="0.1" placeholder="—" value={o[f] ?? ''} onChange={ev => updateProductOverride(o.our_sku, f, ev.target.value)} />
                  ))}
                  {(['fixed_retail','fixed_wholesale','fixed_drop'] as const).map(f => (
                    <input key={f} style={{ ...input, textAlign: 'center', padding: '5px 6px', fontSize: '12px' }} type="number" step="0.01" placeholder="—" value={o[f] ?? ''} onChange={ev => updateProductOverride(o.our_sku, f, ev.target.value)} />
                  ))}
                  <button onClick={() => removeProductOverride(o.our_sku)} style={{ padding: '5px', background: '#FEE2E2', border: 'none', borderRadius: '5px', cursor: 'pointer', color: '#DC2626', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Trash2 size={12} />
                  </button>
                </div>
              ))}
            </>
          )}
          {!(e.product_overrides ?? []).length && (
            <p style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Немає overrides — знайдіть товар вище щоб додати</p>
          )}
        </div>

        {/* ── Акційні ціни ─────────────────────────────────────── */}
        <div style={{ background: 'var(--bg-soft)', border: '1px solid var(--border)', borderRadius: '8px', padding: '16px', marginBottom: '16px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
            <div>
              <p style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>Акційні ціни</p>
              <p style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>
                Знижка автоматично застосовується при синку. Стара ціна зберігається для відображення на сайті.
              </p>
            </div>
            <button style={btn('#E11D48')} onClick={() => setEditing(prev => ({
              ...prev,
              promotions: [...((prev as any).promotions ?? []), {
                name: '', our_sku: null, brand: null, promo_type: 'percent', value: '',
                apply_retail: true, apply_wholesale: false, apply_drop: false,
                starts_at: '', ends_at: '', is_active: true,
              }],
            }))}>+ Акція</button>
          </div>

          {((e as any).promotions ?? []).length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '10px' }}>
              {((e as any).promotions as any[]).map((p: any, i: number) => {
                const setP = (field: string, val: unknown) => setEditing(prev => ({
                  ...prev,
                  promotions: ((prev as any).promotions ?? []).map((x: any, xi: number) =>
                    xi === i ? { ...x, [field]: val } : x
                  ),
                }));
                return (
                  <div key={i} style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '8px', padding: '12px' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 150px 100px 32px', gap: '8px', marginBottom: '8px', alignItems: 'end' }}>
                      <div>
                        <span style={label}>Назва акції</span>
                        <input style={input} value={p.name} onChange={ev => setP('name', ev.target.value)} placeholder="напр. Літній розпродаж" />
                      </div>
                      <div>
                        <span style={label}>Тип знижки</span>
                        <select style={input} value={p.promo_type} onChange={ev => setP('promo_type', ev.target.value)}>
                          <option value="percent">Знижка %</option>
                          <option value="fixed_price">Нова ціна (грн)</option>
                          <option value="fixed_discount">Знижка (грн)</option>
                        </select>
                      </div>
                      <div>
                        <span style={label}>{p.promo_type === 'percent' ? 'Знижка %' : 'Значення'}</span>
                        <input style={input} type="number" step="0.01" value={p.value ?? ''} onChange={ev => setP('value', ev.target.value)} placeholder="0" />
                      </div>
                      <button onClick={() => setEditing(prev => ({
                        ...prev,
                        promotions: ((prev as any).promotions ?? []).filter((_: any, xi: number) => xi !== i),
                      }))} style={{ height: '36px', background: '#FEE2E2', border: 'none', borderRadius: '6px', cursor: 'pointer', color: '#DC2626', display: 'flex', alignItems: 'center', justifyContent: 'center', alignSelf: 'flex-end' }}>
                        ✕
                      </button>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px', marginBottom: '8px' }}>
                      <div>
                        <span style={label}>Ціль — бренд</span>
                        <select style={input} value={p.brand ?? ''} onChange={ev => setP('brand', ev.target.value || null)}>
                          <option value="">Всі товари</option>
                          {brands.map(b => <option key={b} value={b}>{b}</option>)}
                        </select>
                      </div>
                      <div>
                        <span style={label}>Дата початку</span>
                        <input style={input} type="date" value={p.starts_at ? p.starts_at.slice(0,10) : ''} onChange={ev => setP('starts_at', ev.target.value || null)} />
                      </div>
                      <div>
                        <span style={label}>Дата кінця</span>
                        <input style={input} type="date" value={p.ends_at ? p.ends_at.slice(0,10) : ''} onChange={ev => setP('ends_at', ev.target.value || null)} />
                      </div>
                    </div>

                    <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
                      <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)' }}>Застосувати до:</span>
                      {[
                        { field: 'apply_retail', label: 'Магазин' },
                        { field: 'apply_wholesale', label: 'Опт' },
                        { field: 'apply_drop', label: 'Дроп' },
                      ].map(({ field, label: lbl }) => (
                        <label key={field} style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '12px', cursor: 'pointer', color: 'var(--text-primary)' }}>
                          <input type="checkbox" checked={p[field] ?? false} onChange={ev => setP(field, ev.target.checked)} />
                          {lbl}
                        </label>
                      ))}
                      <label style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '12px', cursor: 'pointer', marginLeft: 'auto', color: p.is_active ? '#15803D' : 'var(--text-muted)' }}>
                        <input type="checkbox" checked={p.is_active ?? true} onChange={ev => setP('is_active', ev.target.checked)} />
                        Активна
                      </label>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
          {((e as any).promotions ?? []).length === 0 && (
            <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '8px' }}>Немає активних акцій</p>
          )}
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
          <h1 style={{ fontSize: '22px', fontWeight: 800, color: 'var(--text-primary)', margin: 0 }}>Постачальники</h1>
          <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginTop: '4px' }}>{suppliers.length} постачальників</p>
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
        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '10px', overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: 'var(--bg-soft)' }}>
                {['Назва', 'Формат', 'Інтервал', 'Наценки (маг/опт/дроп)', 'Остання синх.', 'Статус', ''].map(h => (
                  <th key={h} style={{ ...cell, fontWeight: 700, color: 'var(--text-secondary)', fontSize: '12px' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {suppliers.map(s => {
                const lastSync = s.last_sync?.[0];
                return (
                  <tr key={s.id} style={{ background: s.is_active ? 'var(--bg-card)' : 'var(--bg-soft)' }}>
                    <td style={cell}>
                      <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{s.name}</div>
                      <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>{s.slug}</div>
                      {s.source_url && <div style={{ fontSize: '11px', color: '#3B82F6', marginTop: '2px', maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.source_url}</div>}
                    </td>
                    <td style={cell}>
                      <div>{FORMAT_LABELS[s.file_format] ?? s.file_format}</div>
                      {s.file_format === 'xls' && s.sheet_name && (
                        <div style={{ fontSize: '11px', color: '#3B82F6', marginTop: '2px', display: 'flex', alignItems: 'center', gap: '3px' }}>
                          <Layers size={10} /> {s.sheet_name}
                        </div>
                      )}
                      {s.file_format === 'xls' && !s.sheet_name && (
                        <div style={{ fontSize: '11px', color: '#94A3B8', marginTop: '2px' }}>авто-вибір аркушу</div>
                      )}
                    </td>
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
                          <div style={{ fontSize: '12px', color: 'var(--text-primary)' }}>{new Date(s.last_synced_at).toLocaleString('uk-UA')}</div>
                          {lastSync && (
                            <div style={{ fontSize: '11px', color: lastSync.error_message ? '#DC2626' : '#16A34A', marginTop: '2px' }}>
                              {lastSync.error_message ?? `оновлено: ${lastSync.rows_updated}, немаплених: ${lastSync.rows_unmapped}`}
                            </div>
                          )}
                        </>
                      ) : <span style={{ color: 'var(--text-muted)', fontSize: '12px' }}>ніколи</span>}
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
