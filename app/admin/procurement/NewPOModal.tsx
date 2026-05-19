'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { X, Upload, Loader2, Trash2, Plus, AlertCircle, Minus } from 'lucide-react';
import { useRouter } from 'next/navigation';
import * as XLSX from 'xlsx';

type Supplier = { id: number; name: string };
type Line = {
  sku: string; name: string; qty: number;
  cost_price: number;        // ціна закупки
  catalog_price?: number;    // актуальна з прайсу
  matched: boolean;          // знайдено в базі
};

const inp: React.CSSProperties = {
  border: '1px solid var(--border)', borderRadius: '6px',
  fontSize: '12px', outline: 'none', padding: '4px 8px',
  color: 'var(--text-primary)', background: 'var(--bg-soft)',
  width: '100%', boxSizing: 'border-box',
};
const lbl: React.CSSProperties = {
  fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)',
  display: 'block', marginBottom: '4px', textTransform: 'uppercase',
};
const sinp: React.CSSProperties = {
  height: '34px', padding: '0 10px', border: '1.5px solid var(--border)',
  borderRadius: '8px', fontSize: '13px', outline: 'none',
  color: 'var(--text-primary)', background: 'var(--bg-soft)', width: '100%',
};

// Flexible header detection
function detectCol(headers: string[], keys: string[]): number {
  const lowers = headers.map(h => h.toLowerCase().replace(/[\s_\-\.]/g, ''));
  for (const k of keys) {
    const idx = lowers.findIndex(h => h.includes(k));
    if (idx >= 0) return idx;
  }
  return -1;
}

function parseExcel(buffer: ArrayBuffer): { sku: string; name: string; qty: number; price: number }[] {
  const wb   = XLSX.read(buffer, { type: 'array' });
  const ws   = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<string[]>(ws, { header: 1, defval: '' }) as string[][];

  if (rows.length < 2) return [];

  // Find header row (first row with at least 2 non-empty cells)
  let headerIdx = 0;
  for (let i = 0; i < Math.min(5, rows.length); i++) {
    if (rows[i].filter(Boolean).length >= 2) { headerIdx = i; break; }
  }

  const headers = rows[headerIdx].map(String);
  const skuCol  = detectCol(headers, ['sku','код','арт','code','article']);
  const nameCol = detectCol(headers, ['назв','name','товар','найменув','опис','description']);
  const qtyCol  = detectCol(headers, ['кіл','qty','кол','количество','amount','count']);
  const priceCol= detectCol(headers, ['цін','price','ціна','вартість','cost','прайс']);

  const result: { sku: string; name: string; qty: number; price: number }[] = [];

  for (let i = headerIdx + 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row.some(Boolean)) continue;

    const sku   = skuCol  >= 0 ? String(row[skuCol]  ?? '').trim() : '';
    const name  = nameCol >= 0 ? String(row[nameCol] ?? '').trim() : '';
    const qty   = qtyCol  >= 0 ? parseFloat(String(row[qtyCol]).replace(',', '.')) : 0;
    const price = priceCol>= 0 ? parseFloat(String(row[priceCol]).replace(',', '.')) : 0;

    if (!sku && !name) continue;
    if (qty <= 0) continue;

    result.push({ sku, name, qty: isNaN(qty) ? 1 : qty, price: isNaN(price) ? 0 : price });
  }
  return result;
}

function fmt(n: number) { return n.toLocaleString('uk-UA', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }

import type { PoDraft, PoLine } from '../PoDraftManager';

type Props = {
  initialData:    PoDraft;
  zIndex?:        number;
  onMinimize:     () => void;
  onClose:        () => void;
  onDraftChange:  (data: Partial<PoDraft>) => void;
  onSubmitted:    () => void;
};

export default function NewPOModal({ initialData, zIndex = 1003, onMinimize, onClose, onDraftChange, onSubmitted }: Props) {
  const router  = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);

  const suppliers  = initialData.suppliers as Supplier[];

  const [supplierId,   setSupplierId]   = useState<number>(initialData.supplierId || suppliers[0]?.id || 0);
  const [expectedDate, setExpectedDate] = useState(initialData.expectedDate || '');
  const [notes,        setNotes]        = useState(initialData.notes || '');
  const [lines,        setLines]        = useState<Line[]>(
    initialData.lines?.length ? initialData.lines as Line[] : [{ sku: '', name: '', qty: 1, cost_price: 0, matched: false }]
  );
  const [dragging,   setDragging]   = useState(false);
  const [parsing,    setParsing]    = useState(false);
  const [saving,     setSaving]     = useState(false);
  const [error,      setError]      = useState('');
  const [sendOnPost, setSendOnPost] = useState(false);
  const lookupTimers = useRef<Record<number, ReturnType<typeof setTimeout>>>({});

  // Debounced lookup — спрацьовує через 600мс після завершення друку
  function handleSkuChange(idx: number, val: string) {
    setLineField(idx, 'sku', val);
    setLineField(idx, 'matched', false as unknown as never);
    clearTimeout(lookupTimers.current[idx]);
    if (val.trim().length >= 3) {
      lookupTimers.current[idx] = setTimeout(() => lookupSku(idx, val), 600);
    }
  }

  useEffect(() => {
    const timers = lookupTimers.current;
    return () => { Object.values(timers).forEach(clearTimeout); };
  }, []);

  // Resolve SKUs against DB — підтримує і наші артикули і артикули постачальника
  async function resolveLines(raw: { sku: string; name: string; qty: number; price: number }[]): Promise<Line[]> {
    if (!raw.length) return [];
    const skus = raw.map(r => r.sku).filter(Boolean);
    if (!skus.length) return raw.map(r => ({ ...r, cost_price: r.price, matched: false }));

    const res = await fetch('/api/admin/products/search-skus', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ skus }),
    });

    if (!res.ok) return raw.map(r => ({ ...r, cost_price: r.price, matched: false }));
    const data = await res.json();

    // input_sku → resolved product info
    const byInput = new Map<string, { sku: string; name: string; brand: string; price_cost: number | null; matched: boolean; via_supplier: boolean }>();
    for (const p of (data.products ?? [])) {
      byInput.set(p.input_sku, p);
    }

    return raw.map(r => {
      const found = byInput.get(r.sku);
      return {
        sku:           found?.sku ?? r.sku,           // завжди наш артикул
        name:          found ? `${found.brand ?? ''} ${found.name ?? ''}`.trim() : r.name,
        qty:           r.qty,
        cost_price:    found?.price_cost ?? r.price,
        catalog_price: found?.price_cost ?? undefined,
        matched:       found?.matched ?? false,
      };
    });
  }

  async function processFile(file: File) {
    setParsing(true); setError('');
    try {
      const buf = await file.arrayBuffer();
      const raw = parseExcel(buf);
      if (!raw.length) { setError('Не знайдено рядків у файлі. Перевірте формат.'); return; }
      const resolved = await resolveLines(raw);
      setLines(resolved);
    } catch (e) {
      setError('Помилка читання файлу: ' + (e instanceof Error ? e.message : String(e)));
    } finally { setParsing(false); }
  }

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault(); setDragging(false);
    const f = e.dataTransfer.files[0];
    if (f) processFile(f);
  }, []);

  function setLineField<K extends keyof Line>(idx: number, key: K, val: Line[K]) {
    setLines(prev => prev.map((l, i) => i === idx ? { ...l, [key]: val } : l));
  }

  function addLine() {
    setLines(prev => [...prev, { sku: '', name: '', qty: 1, cost_price: 0, matched: false }]);
  }

  // Lookup single SKU on blur
  async function lookupSku(idx: number, sku: string) {
    if (!sku.trim()) return;
    const res = await fetch('/api/admin/products/search-skus', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ skus: [sku.trim()] }),
    });
    if (!res.ok) return;
    const data = await res.json();
    const found = data.products?.[0];
    if (found?.matched) {
      setLines(prev => prev.map((l, i) => i === idx ? {
        ...l,
        sku:           found.sku,
        name:          `${found.brand ?? ''} ${found.name ?? ''}`.trim(),
        cost_price:    found.price_cost ?? l.cost_price,
        catalog_price: found.price_cost ?? undefined,
        matched:       true,
      } : l));
    } else {
      setLines(prev => prev.map((l, i) => i === idx ? { ...l, matched: false } : l));
    }
  }

  const total = lines.reduce((s, l) => s + l.qty * l.cost_price, 0);
  // Показуємо попередження тільки для рядків де lookup завершився (є sku але не знайдено в базі)
  // Щойно введений SKU (matched=false але ще не шукали) — не рахуємо
  const unmatchedCount = lines.filter(l => l.sku && !l.matched && l.sku.length >= 3).length;
  const filledLines    = lines.filter(l => l.sku || l.name).length;

  // Синхронізуємо зміни в глобальний менеджер чернеток
  useEffect(() => {
    onDraftChange({ supplierId, expectedDate, notes, lines: lines as PoLine[] });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supplierId, expectedDate, notes, lines]);

  async function save(post = false) {
    const valid = lines.filter(l => l.sku.trim() && l.qty > 0);
    if (!supplierId) { setError('Оберіть постачальника'); return; }
    if (!valid.length) { setError('Додайте хоча б один товар з артикулом'); return; }
    setSaving(true); setError('');
    try {
      const res = await fetch('/api/admin/procurement', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          supplier_id:   supplierId,
          expected_date: expectedDate || undefined,
          notes:         notes || undefined,
          lines:         valid.map(l => ({ sku: l.sku.trim(), qty: l.qty, cost_price: l.cost_price })),
        }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? 'Помилка'); return; }

      // "Провести" — надсилаємо постачальнику або просто змінюємо статус
      if (post) {
        if (sendOnPost) {
          // Відправляємо email постачальнику (API також оновлює статус на 'sent')
          await fetch('/api/admin/procurement/send', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ids: [data.id] }),
          });
        } else {
          await fetch(`/api/admin/procurement/${data.id}/status`, {
            method: 'PATCH', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ procurement_status: 'sent' }),
          });
        }
      }

      onSubmitted();
      router.push(`/admin/procurement/${data.id}`);
      router.refresh();
    } catch { setError('Мережева помилка'); }
    finally { setSaving(false); }
  }

  return (
    <>
    {/* Side panel ЛІВОРУЧ — після sidebar (220px) */}
    <div className="po-panel-enter" style={{ position: 'fixed', top: 0, left: '220px', bottom: '42px', zIndex, width: 'min(800px, 56vw)', display: 'flex', flexDirection: 'column', background: 'var(--bg-card)', boxShadow: '8px 0 32px rgba(0,0,0,0.22)', borderRight: '1px solid var(--border)', borderBottom: '1px solid var(--border)' }}>
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>

        {/* Header */}
        <div style={{ padding: '18px 24px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ fontSize: '16px', fontWeight: 800, color: 'var(--text-primary)' }}>
            Нове замовлення постачальнику
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <button onClick={onMinimize} title="Згорнути" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex', padding: '4px', borderRadius: '6px' }}><Minus size={18} /></button>
            <button onClick={onClose} title="Закрити" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex', padding: '4px', borderRadius: '6px' }}><X size={18} /></button>
          </div>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>

          {/* Top fields */}
          <div style={{ display: 'grid', gridTemplateColumns: '200px 160px 1fr', gap: '12px' }}>
            <div>
              <label style={lbl}>Постачальник *</label>
              <select value={supplierId} onChange={e => setSupplierId(Number(e.target.value))}
                style={{ ...sinp, cursor: 'pointer' }}>
                {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
            <div>
              <label style={lbl}>Очікувана дата</label>
              <input style={sinp} type="date" value={expectedDate}
                min={new Date().toISOString().slice(0, 10)}
                onChange={e => setExpectedDate(e.target.value)} />
            </div>
            <div>
              <label style={lbl}>Нотатки</label>
              <input style={sinp} value={notes} onChange={e => setNotes(e.target.value)} placeholder="Коментар до замовлення" />
            </div>
          </div>

          {/* Excel upload */}
          <div
            onDragOver={e => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
            onClick={() => fileRef.current?.click()}
            style={{ border: `2px dashed ${dragging ? '#1E3A5F' : 'var(--border)'}`, borderRadius: '10px', padding: '14px 20px', cursor: 'pointer', background: dragging ? '#EFF4FF' : 'var(--bg-soft)', display: 'flex', alignItems: 'center', gap: '12px', transition: 'all 0.15s' }}>
            {parsing
              ? <><Loader2 size={18} color="#1E3A5F" style={{ animation: 'spin 1s linear infinite' }} /><span style={{ fontSize: '13px', color: '#1E3A5F' }}>Читаємо файл...</span></>
              : <><Upload size={18} color={dragging ? '#1E3A5F' : '#94A3B8'} />
                  <div>
                    <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>Завантажити з Excel / CSV</div>
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Перетягніть файл або натисніть · Колонки: Код, Назва, Кількість, Ціна</div>
                  </div>
                </>}
            <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" style={{ display: 'none' }}
              onChange={e => { const f = e.target.files?.[0]; if (f) processFile(f); e.target.value = ''; }} />
          </div>

          {unmatchedCount > 0 && (
            <div style={{ padding: '8px 14px', background: '#FEF3C7', borderRadius: '8px', fontSize: '12px', color: '#B45309', display: 'flex', gap: '6px', alignItems: 'center' }}>
              <AlertCircle size={13} />
              {unmatchedCount} артикул(ів) не знайдено в базі — перевірте вручну (підсвічені помаранчевим)
            </div>
          )}

          {/* Table */}
          <div style={{ border: '1px solid var(--border)', borderRadius: '10px', overflow: 'hidden' }}>
            {/* Header */}
            <div style={{ display: 'grid', gridTemplateColumns: '130px 1fr 80px 120px 110px 32px', padding: '8px 12px', background: 'var(--bg-soft)', borderBottom: '1px solid var(--border)', fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', gap: '8px' }}>
              <span>Наш артикул</span>
              <span>Найменування</span>
              <span style={{ textAlign: 'right' }}>Кількість</span>
              <span style={{ textAlign: 'right' }}>Ціна закупки</span>
              <span style={{ textAlign: 'right' }}>Сума</span>
              <span />
            </div>

            {/* Rows */}
            <div style={{ maxHeight: '340px', overflowY: 'auto' }}>
              {lines.map((line, idx) => {
                const rowSum = line.qty * line.cost_price;
                const warn = line.sku && !line.matched;
                return (
                  <div key={idx} style={{ display: 'grid', gridTemplateColumns: '130px 1fr 80px 120px 110px 32px', padding: '6px 12px', gap: '8px', alignItems: 'center', borderBottom: '1px solid var(--border-light)', background: warn ? '#FFFBEB' : 'transparent' }}>

                    <input style={{ ...inp, fontFamily: 'monospace', fontSize: '11px', borderColor: warn ? '#FCD34D' : undefined }}
                      placeholder="1300-014"
                      value={line.sku}
                      onChange={e => handleSkuChange(idx, e.target.value)}
                      onBlur={e => { if (e.target.value && !line.matched) lookupSku(idx, e.target.value); }}
                      onKeyDown={e => {
                        if (e.key === 'Backspace' && !line.sku && lines.length > 1) {
                          e.preventDefault();
                          setLines(prev => prev.filter((_, i) => i !== idx));
                        }
                      }} />

                    <input style={inp} placeholder="Назва товару"
                      value={line.name}
                      onChange={e => setLineField(idx, 'name', e.target.value)} />

                    <input style={{ ...inp, textAlign: 'right' }} type="number" min="1" step="1"
                      value={line.qty}
                      onChange={e => setLineField(idx, 'qty', Math.max(1, parseInt(e.target.value) || 1))} />

                    <div style={{ position: 'relative' }}>
                      <input style={{ ...inp, textAlign: 'right', paddingRight: '18px' }} type="number" min="0" step="0.01"
                        value={line.cost_price || ''}
                        placeholder="0.00"
                        onChange={e => setLineField(idx, 'cost_price', parseFloat(e.target.value) || 0)} />
                      <span style={{ position: 'absolute', right: '6px', top: '50%', transform: 'translateY(-50%)', fontSize: '10px', color: 'var(--text-muted)', pointerEvents: 'none' }}>₴</span>
                      {line.catalog_price != null && line.catalog_price !== line.cost_price && (
                        <div style={{ fontSize: '9px', color: '#94A3B8', position: 'absolute', bottom: '-13px', right: 0, whiteSpace: 'nowrap' }}>
                          прайс: {fmt(line.catalog_price)} ₴
                        </div>
                      )}
                    </div>

                    <div style={{ textAlign: 'right', fontSize: '13px', fontWeight: 600, color: rowSum > 0 ? 'var(--text-primary)' : 'var(--text-muted)' }}>
                      {rowSum > 0 ? `${fmt(rowSum)} ₴` : '—'}
                    </div>

                    <button onClick={() => setLines(prev => prev.filter((_, i) => i !== idx))}
                      disabled={lines.length === 1}
                      style={{ background: 'none', border: 'none', cursor: lines.length > 1 ? 'pointer' : 'default', color: lines.length > 1 ? '#EF4444' : 'var(--text-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0 }}>
                      <Trash2 size={13} />
                    </button>
                  </div>
                );
              })}
            </div>

            {/* Footer: add + total */}
            <div style={{ display: 'grid', gridTemplateColumns: '130px 1fr 80px 120px 110px 32px', padding: '8px 12px', gap: '8px', borderTop: '2px solid var(--border)', background: 'var(--bg-soft)', alignItems: 'center' }}>
              <button onClick={addLine}
                style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '12px', color: '#1E3A5F', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600, gridColumn: '1 / 3', padding: 0 }}>
                <Plus size={13} /> Додати рядок
              </button>
              <span />
              <span style={{ textAlign: 'right', fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Разом:</span>
              <span style={{ textAlign: 'right', fontSize: '15px', fontWeight: 800, color: 'var(--text-primary)' }}>
                {fmt(total)} ₴
              </span>
              <span />
            </div>
          </div>

          {error && <div style={{ padding: '10px 14px', background: '#FEF2F2', borderRadius: '8px', color: '#DC2626', fontSize: '13px', display: 'flex', gap: '7px', alignItems: 'center' }}><AlertCircle size={14} />{error}</div>}
        </div>

        {/* Footer */}
        <div style={{ padding: '14px 24px', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
            {lines.filter(l => l.sku).length} позицій · {fmt(total)} ₴
          </div>
          <label style={{ display: 'flex', alignItems: 'center', gap: '7px', cursor: 'pointer', fontSize: '12px', color: 'var(--text-secondary)' }}>
            <input
              type="checkbox"
              checked={sendOnPost}
              onChange={e => setSendOnPost(e.target.checked)}
              style={{ width: '14px', height: '14px', accentColor: '#15803D', cursor: 'pointer' }}
            />
            Відправити постачальнику при проведенні
          </label>

          <div style={{ display: 'flex', gap: '8px' }}>
            <button onClick={() => save(false)} disabled={saving}
              style={{ height: '38px', padding: '0 18px', borderRadius: '8px', border: '1.5px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text-secondary)', fontSize: '13px', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '7px', opacity: saving ? 0.6 : 1 }}>
              💾 Чернетка
            </button>
            <button onClick={() => save(true)} disabled={saving}
              style={{ height: '38px', padding: '0 22px', borderRadius: '8px', border: 'none', background: '#15803D', color: '#fff', fontSize: '13px', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', opacity: saving ? 0.7 : 1 }}>
              {saving ? <><Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} />Збереження...</> : '✅ Провести'}
            </button>
          </div>
        </div>
      </div>
    </div>
    <style>{`
      @keyframes spin { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }
      @keyframes po-panel-enter {
        0%   { opacity:0; transform:scale(0.96) translateY(10px); filter:blur(6px); }
        55%  { filter:blur(0); }
        100% { opacity:1; transform:scale(1) translateY(0); }
      }
      .po-panel-enter { animation: po-panel-enter 0.32s cubic-bezier(0.22,1,0.36,1); }
    `}</style>
    </>
  );
}
