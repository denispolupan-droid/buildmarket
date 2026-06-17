'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { X, Upload, Loader2, Trash2, Plus, AlertCircle, Minus } from 'lucide-react';
import { useRouter } from 'next/navigation';
import * as XLSX from 'xlsx';

type Supplier = { id: number; name: string; email?: string | null };
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

// Ukrainian і/І (U+0456/U+0406) → ASCII i — 1C outputs ASCII i in Cyrillic column names
function normalizeKw(s: string): string {
  return s.toLowerCase().replace(/[\s_\-\.]/g, '').replace(/[іІ]/g, 'i');
}
function detectCol(headers: string[], keys: string[]): number {
  const lowers = headers.map(h => normalizeKw(h));
  for (const k of keys) {
    const nk = normalizeKw(k);
    const idx = lowers.findIndex(h => h.includes(nk));
    if (idx >= 0) return idx;
  }
  return -1;
}

// Number() is stricter than parseFloat: rejects "2109-016" (parseFloat gives 2109)
const isStrictNum = (v: string) => v.trim() !== '' && !isNaN(Number(v.replace(/\s/g, '').replace(',', '.')));

function parseExcel(buffer: ArrayBuffer): { sku: string; name: string; qty: number; price: number }[] {
  const wb   = XLSX.read(buffer, { type: 'array' });
  const ws   = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<string[]>(ws, { header: 1, defval: '' }) as string[][];

  if (rows.length < 1) return [];

  // 1. Try to find a keyword header row (scan up to 30 rows — 1C invoices have many metadata rows)
  let headerIdx = -1;
  for (let i = 0; i < Math.min(30, rows.length); i++) {
    if (rows[i].filter(Boolean).length < 2) continue;
    const h = rows[i].map(String);
    const hasSku   = detectCol(h, ['sku','код','арт','code','article']) >= 0;
    const hasName  = detectCol(h, ['назв','name','товар','найменув','опис','description']) >= 0;
    const hasQty   = detectCol(h, ['кіл','qty','кол','кількість','количество','amount','count']) >= 0;
    const hasPrice = detectCol(h, ['цін','price','ціна','вартість','cost','прайс']) >= 0;
    if ((hasSku || hasName) && (hasQty || hasPrice)) { headerIdx = i; break; }
  }

  // 2. No keyword header → positional detection from first row with enough cells
  const positional = headerIdx < 0;
  if (positional) {
    for (let i = 0; i < Math.min(30, rows.length); i++) {
      if (rows[i].filter(Boolean).length >= 2) { headerIdx = i; break; }
    }
  }
  if (headerIdx < 0) return [];

  const headers = rows[headerIdx].map(String);
  let skuCol   = detectCol(headers, ['sku','код','арт','code','article']);
  let nameCol  = detectCol(headers, ['назв','name','товар','найменув','опис','description']);
  let qtyCol   = detectCol(headers, ['кіл','qty','кол','количество','amount','count']);
  let priceCol = detectCol(headers, ['цін','price','ціна','вартість','cost','прайс']);
  let dataStart = headerIdx + 1;

  // Positional fallback: classify columns by content
  if (positional) {
    dataStart = headerIdx; // the "header" row is actually first data row
    const sample = rows.slice(headerIdx, Math.min(headerIdx + 6, rows.length));
    const colCount = Math.max(...sample.map(r => r.length));

    let bestSkuCol = -1, bestNameCol = -1, bestNameLen = 0;
    const numCols: { col: number; avg: number }[] = [];

    for (let c = 0; c < colCount; c++) {
      const vals = sample.map(r => String(r[c] ?? '')).filter(Boolean);
      if (!vals.length) continue;
      if (vals.every(isStrictNum)) {
        const numVals = vals.map(v => Number(v.replace(/\s/g, '').replace(',', '.')));
        numCols.push({ col: c, avg: numVals.reduce((s, n) => s + n, 0) / numVals.length });
      } else {
        const avgLen = vals.reduce((s, v) => s + v.length, 0) / vals.length;
        const looksLikeSku = vals.every(v => v.length < 20 && /\d/.test(v) && /[-\/]/.test(v));
        if (looksLikeSku && bestSkuCol < 0) bestSkuCol = c;
        else if (avgLen > bestNameLen) { bestNameLen = avgLen; bestNameCol = c; }
      }
    }
    if (bestSkuCol < 0) {
      for (let c = 0; c < colCount; c++) {
        if (c === bestNameCol) continue;
        const vals = sample.map(r => String(r[c] ?? '')).filter(Boolean);
        if (vals.every(isStrictNum)) continue;
        bestSkuCol = c; break;
      }
    }
    skuCol  = bestSkuCol;
    nameCol = bestNameCol;
    numCols.sort((a, b) => a.avg - b.avg);
    qtyCol   = numCols.length >= 2 ? numCols[0].col : -1;
    priceCol = numCols.length >= 2 ? numCols[1].col : (numCols[0]?.col ?? -1);
  }

  const result: { sku: string; name: string; qty: number; price: number }[] = [];
  for (let i = dataStart; i < rows.length; i++) {
    const row = rows[i];
    if (!row.some(Boolean)) continue;
    const sku   = skuCol  >= 0 ? String(row[skuCol]  ?? '').trim() : '';
    const name  = nameCol >= 0 ? String(row[nameCol] ?? '').trim() : '';
    const qty   = qtyCol  >= 0 ? parseFloat(String(row[qtyCol]  ?? '').replace(',', '.')) : 1;
    const price = priceCol>= 0 ? parseFloat(String(row[priceCol] ?? '').replace(',', '.')) : 0;
    if (!sku && !name) continue;
    if (qtyCol >= 0 && (isNaN(qty) || qty <= 0)) continue;
    result.push({ sku, name, qty: isNaN(qty) ? 1 : qty, price: isNaN(price) ? 0 : price });
  }
  return result;
}

function fmt(n: number) { return n.toLocaleString('uk-UA', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }

import type { PoDraft, PoLine } from '../PoDraftManager';
import ProductPickerModal from './ProductPickerModal';

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
  const [dragging,     setDragging]     = useState(false);
  const [parsing,      setParsing]      = useState(false);
  const [saving,       setSaving]       = useState(false);
  const [error,        setError]        = useState('');

  type RawRow = { sku: string; name: string; qty: number; price: number };
  const [rawImport,  setRawImport]  = useState<RawRow[] | null>(null);
  const [priceMode,  setPriceMode]  = useState<'file' | 'last'>('file');
  const [showPicker,     setShowPicker]     = useState(false);
  const [lastPriceMap,   setLastPriceMap]   = useState<Record<string, number>>({});
  const lookupTimers = useRef<Record<number, ReturnType<typeof setTimeout>>>({});
  const nameTimers   = useRef<Record<number, ReturnType<typeof setTimeout>>>({});
  const nameInputRefs = useRef<Record<number, HTMLInputElement | null>>({});
  const [nameSuggestions, setNameSuggestions] = useState<Record<number, { sku: string; name: string; brand: string }[]>>({});
  const [suggestionAnchor, setSuggestionAnchor] = useState<{ idx: number; top: number; left: number; width: number } | null>(null);
  const [activeDropdownIdx, setActiveDropdownIdx] = useState<number>(-1);

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
    const ntimers = nameTimers.current;
    return () => {
      Object.values(timers).forEach(clearTimeout);
      Object.values(ntimers).forEach(clearTimeout);
    };
  }, []);

  const [demandMap, setDemandMap] = useState<Record<string, { orders: number; qty: number }>>({});

  // Підтягуємо останні закупівельні ціни для всіх знайдених SKU
  useEffect(() => {
    const matchedSkus = lines.filter(l => l.matched && l.sku).map(l => l.sku);
    if (!matchedSkus.length) return;
    fetch(`/api/admin/products/last-purchase-price?skus=${matchedSkus.map(encodeURIComponent).join(',')}`)
      .then(r => r.json())
      .then((data: Record<string, { last_price: number }>) => {
        const map: Record<string, number> = {};
        for (const [sku, v] of Object.entries(data)) map[sku] = v.last_price;
        setLastPriceMap(map);
      })
      .catch(() => {});
  }, [lines.map(l => l.sku + ':' + l.matched).join('|')]); // eslint-disable-line react-hooks/exhaustive-deps

  // Попит з відкритих замовлень покупців
  useEffect(() => {
    const matchedSkus = lines.filter(l => l.matched && l.sku).map(l => l.sku);
    if (!matchedSkus.length) { setDemandMap({}); return; }
    fetch(`/api/admin/procurement/demand?skus=${matchedSkus.map(encodeURIComponent).join(',')}`)
      .then(r => r.json())
      .then((data: { demand: Record<string, { orders: number; qty: number }> }) => setDemandMap(data.demand ?? {}))
      .catch(() => {});
  }, [lines.map(l => l.sku + ':' + l.matched).join('|')]); // eslint-disable-line react-hooks/exhaustive-deps

  function updateAnchor(idx: number) {
    const el = nameInputRefs.current[idx];
    if (!el) return;
    const r = el.getBoundingClientRect();
    // +8 щоб дропдаун не перекривав рядок з полем вводу
    setSuggestionAnchor({ idx, top: r.top + r.height + 20, left: r.left, width: r.width });
  }

  function handleNameChange(idx: number, val: string) {
    setLineField(idx, 'name', val);
    clearTimeout(nameTimers.current[idx]);
    if (val.trim().length >= 2) {
      nameTimers.current[idx] = setTimeout(async () => {
        const res = await fetch(`/api/admin/products/search?q=${encodeURIComponent(val.trim())}`);
        if (!res.ok) return;
        const data = await res.json();
        setNameSuggestions(prev => ({ ...prev, [idx]: data.slice(0, 8) }));
        updateAnchor(idx);
      }, 300);
    } else {
      setNameSuggestions(prev => ({ ...prev, [idx]: [] }));
      setSuggestionAnchor(null);
      setActiveDropdownIdx(-1);
    }
  }

  async function selectNameSuggestion(idx: number, s: { sku: string; name: string; brand: string }) {
    setNameSuggestions(prev => ({ ...prev, [idx]: [] }));
    setSuggestionAnchor(null);
    setActiveDropdownIdx(-1);
    setLines(prev => prev.map((l, i) => i === idx
      ? { ...l, sku: s.sku, name: `${s.brand} ${s.name}`.trim(), matched: true }
      : l
    ));
    await lookupSku(idx, s.sku);
  }

  // Resolve SKUs against DB — підтримує і наші артикули і артикули постачальника
  // useFilePrice=true → ціна з Excel пріоритетна; false → ігноруємо, беремо з бази
  async function resolveLines(raw: { sku: string; name: string; qty: number; price: number }[], useFilePrice = true): Promise<Line[]> {
    if (!raw.length) return [];
    const skus = raw.map(r => r.sku).filter(Boolean);
    if (!skus.length) return raw.map(r => ({ ...r, cost_price: useFilePrice ? r.price : 0, matched: false }));

    const res = await fetch('/api/admin/products/search-skus', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ skus }),
    });

    if (!res.ok) return raw.map(r => ({ ...r, cost_price: useFilePrice ? r.price : 0, matched: false }));
    const data = await res.json();

    const byInput = new Map<string, { sku: string; name: string; brand: string; price_cost: number | null; price_unit: number | null; matched: boolean }>();
    for (const p of (data.products ?? [])) byInput.set(p.input_sku, p);

    return raw.map(r => {
      const found = byInput.get(r.sku);
      const dbPrice = found?.price_cost ?? found?.price_unit ?? 0;
      return {
        sku:           found?.sku ?? r.sku,
        name:          found ? `${found.brand ?? ''} ${found.name ?? ''}`.trim() : r.name,
        qty:           r.qty,
        cost_price:    useFilePrice
          ? (r.price > 0 ? r.price : dbPrice)   // Excel ціна → fallback DB
          : dbPrice,                             // тільки DB (остання закупочна)
        catalog_price: found?.price_cost ?? found?.price_unit ?? undefined,
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
      // Show price dialog before importing
      setRawImport(raw);
      setPriceMode('file');
    } catch (e) {
      setError('Помилка читання файлу: ' + (e instanceof Error ? e.message : String(e)));
    } finally { setParsing(false); }
  }

  async function confirmImport() {
    if (!rawImport) return;
    setParsing(true); setError('');
    try {
      const resolved = await resolveLines(rawImport, priceMode === 'file');
      setLines(resolved);
      setRawImport(null);
    } catch (e) {
      setError('Помилка обробки: ' + (e instanceof Error ? e.message : String(e)));
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
        // price_cost → user-entered price (if non-zero) → price_unit → 0
        // Збігається з логікою каталог-пікера: price_cost ?? price_unit ?? 0
        cost_price:    found.price_cost ?? (l.cost_price > 0 ? l.cost_price : (found.price_unit ?? 0)),
        catalog_price: found.price_cost ?? found.price_unit ?? undefined,
        matched:       true,
      } : l));
    } else {
      setLines(prev => prev.map((l, i) => i === idx ? { ...l, matched: false } : l));
    }
  }

  const total          = lines.reduce((s, l) => s + l.qty * l.cost_price, 0);
  const unmatchedCount = lines.filter(l => l.sku && !l.matched && l.sku.length >= 3).length;
  const filledLines    = lines.filter(l => l.sku || l.name).length;

  // Синхронізуємо зміни в глобальний менеджер чернеток
  useEffect(() => {
    onDraftChange({ supplierId, expectedDate, notes, lines: lines as PoLine[] });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supplierId, expectedDate, notes, lines]);

  function handlePickerAdd(items: { sku: string; name: string; qty: number; cost_price: number }[]) {
    setLines(prev => {
      // Remove the trailing empty placeholder line if lines is just one empty row
      const filtered = prev.filter(l => l.sku.trim() || l.name.trim());
      return [
        ...filtered,
        ...items.map(item => ({
          sku:        item.sku,
          name:       item.name,
          qty:        item.qty,
          cost_price: item.cost_price,
          matched:    true,
        })),
      ];
    });
  }

  async function save(post = false) {
    const valid = lines.filter(l => l.sku.trim() && l.qty > 0);
    if (!supplierId) { setError('Оберіть постачальника'); return; }
    if (!valid.length) { setError('Додайте хоча б один товар з артикулом'); return; }
    setSaving(true); setError('');
    try {
      // Якщо є dbId — оновлюємо існуючу чернетку (PUT), інакше створюємо нову (POST)
      const isEdit = !!initialData.dbId;
      const url    = isEdit ? `/api/admin/procurement/${initialData.dbId}` : '/api/admin/procurement';
      const method = isEdit ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method, headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          supplier_id:   supplierId,
          expected_date: expectedDate || undefined,
          notes:         notes || undefined,
          order_id:      initialData.orderId || undefined,
          lines:         valid.map(l => ({ sku: l.sku.trim(), qty: l.qty, cost_price: l.cost_price })),
          // Провести: міняємо статус прямо в тілі запиту (атомарно, без окремого PATCH)
          conduct: post,
        }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? 'Помилка'); return; }
      // При редагуванні зберігаємо той же ID документа
      if (isEdit) data.id = initialData.dbId;

      onSubmitted();
      router.refresh(); // скидаємо кеш списку до навігації
      if (post) {
        router.push(`/admin/procurement/${data.id}`);
      } else {
        router.push('/admin/procurement');
      }
    } catch { setError('Мережева помилка'); }
    finally { setSaving(false); }
  }

  return (
    <>
    {/* Catalog product picker */}
    {showPicker && (
      <ProductPickerModal
        zIndex={zIndex + 100}
        onClose={() => setShowPicker(false)}
        onAdd={handlePickerAdd}
      />
    )}

    {/* Діалог вибору ціни при імпорті Excel */}
    {rawImport && (
      <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: zIndex + 50, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ background: 'var(--bg-card)', borderRadius: '14px', padding: '24px 28px', width: '420px', boxShadow: '0 20px 60px rgba(0,0,0,0.25)' }}>
          <div style={{ fontSize: '15px', fontWeight: 800, color: 'var(--text-primary)', marginBottom: '4px' }}>
            📊 Знайдено {rawImport.length} позицій
          </div>
          <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '18px' }}>
            {rawImport.filter(r => r.price > 0).length > 0
              ? `Ціни у файлі: ${rawImport.filter(r => r.price > 0).slice(0, 3).map(r => `${r.price} ₴`).join(', ')}${rawImport.filter(r => r.price > 0).length > 3 ? '…' : ''}`
              : 'Ціни у файлі не визначені'}
          </div>

          <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '8px' }}>
            Яку ціну використовувати?
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '20px' }}>
            {([
              { value: 'file', label: 'Ціну з файлу', desc: rawImport.filter(r => r.price > 0).length > 0 ? 'Завантажити ціни як закупочні' : 'У файлі немає цін — використає бази' },
              { value: 'last', label: 'Останню закупочну з бази', desc: 'Ігнорувати ціни з файлу' },
            ] as { value: 'file' | 'last'; label: string; desc: string }[]).map(opt => {
              const isSelected = priceMode === opt.value;
              return (
                <button key={opt.value} type="button" onClick={() => setPriceMode(opt.value)}
                  style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 12px', borderRadius: '8px', cursor: 'pointer', textAlign: 'left', border: `1.5px solid ${isSelected ? '#1E3A5F' : 'var(--border)'}`, background: isSelected ? '#EFF4FF' : 'var(--bg-soft)' }}>
                  <div style={{ width: '16px', height: '16px', borderRadius: '50%', flexShrink: 0, border: `2px solid ${isSelected ? '#1E3A5F' : '#CBD5E1'}`, background: isSelected ? '#1E3A5F' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    {isSelected && <div style={{ width: '5px', height: '5px', borderRadius: '50%', background: '#fff' }} />}
                  </div>
                  <div>
                    <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>{opt.label}</div>
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{opt.desc}</div>
                  </div>
                </button>
              );
            })}
          </div>

          <div style={{ display: 'flex', gap: '10px' }}>
            <button onClick={() => setRawImport(null)}
              style={{ flex: 1, height: '38px', borderRadius: '8px', border: '1px solid var(--border)', background: 'none', cursor: 'pointer', fontSize: '13px', fontWeight: 600, color: 'var(--text-muted)' }}>
              Скасувати
            </button>
            <button onClick={confirmImport} disabled={parsing}
              style={{ flex: 2, height: '38px', borderRadius: '8px', border: 'none', background: '#1E3A5F', color: '#fff', cursor: 'pointer', fontSize: '13px', fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '7px', opacity: parsing ? 0.7 : 1 }}>
              {parsing ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> : null}
              Завантажити
            </button>
          </div>
        </div>
      </div>
    )}

    {/* Side panel ЛІВОРУЧ — після sidebar (220px) */}
    <div className="po-panel-enter" style={{ position: 'fixed', top: 0, left: '240px', bottom: '42px', zIndex, width: 'min(1040px, 74vw)', display: 'flex', flexDirection: 'column', background: 'var(--bg-card)', boxShadow: '8px 0 32px rgba(0,0,0,0.22)', borderRight: '1px solid var(--border)', borderBottom: '1px solid var(--border)' }}>
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
            <div style={{ display: 'grid', gridTemplateColumns: '130px 2fr 80px 120px 110px 32px', padding: '8px 12px', background: 'var(--bg-soft)', borderBottom: '1px solid var(--border)', fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', gap: '8px' }}>
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
                  <div key={idx} style={{ display: 'grid', gridTemplateColumns: '130px 2fr 80px 120px 110px 32px', padding: '6px 12px', gap: '8px', alignItems: 'center', borderBottom: '1px solid var(--border-light)', background: warn ? '#FFFBEB' : 'transparent' }}>

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

                    <input
                      ref={el => { nameInputRefs.current[idx] = el; }}
                      style={inp} placeholder="Назва товару або пошук..."
                      title={line.name || undefined}
                      value={line.name}
                      onChange={e => { handleNameChange(idx, e.target.value); setActiveDropdownIdx(-1); }}
                      onBlur={() => setTimeout(() => { setNameSuggestions(prev => ({ ...prev, [idx]: [] })); setSuggestionAnchor(null); setActiveDropdownIdx(-1); }, 150)}
                      onFocus={() => { if (line.name.length >= 2 && !nameSuggestions[idx]?.length) handleNameChange(idx, line.name); }}
                      onKeyDown={e => {
                        const suggestions = nameSuggestions[idx] ?? [];
                        if (!suggestions.length) return;
                        if (e.key === 'ArrowDown') {
                          e.preventDefault();
                          setActiveDropdownIdx(prev => Math.min(prev + 1, suggestions.length - 1));
                        } else if (e.key === 'ArrowUp') {
                          e.preventDefault();
                          setActiveDropdownIdx(prev => Math.max(prev - 1, 0));
                        } else if (e.key === 'Enter' && activeDropdownIdx >= 0) {
                          e.preventDefault();
                          selectNameSuggestion(idx, suggestions[activeDropdownIdx]);
                        } else if (e.key === 'Escape') {
                          setNameSuggestions(prev => ({ ...prev, [idx]: [] }));
                          setSuggestionAnchor(null);
                          setActiveDropdownIdx(-1);
                        }
                      }}
                    />

                    <input style={{ ...inp, textAlign: 'right' }} type="number" min="1" step="1"
                      value={line.qty || ''}
                      onChange={e => {
                        const n = parseInt(e.target.value);
                        setLineField(idx, 'qty', isNaN(n) ? 0 : n);
                      }}
                      onBlur={() => { if (!line.qty || line.qty < 1) setLineField(idx, 'qty', 1); }} />

                    <div style={{ position: 'relative' }}>
                      <input style={{ ...inp, textAlign: 'right', paddingRight: '18px' }} type="number" min="0" step="0.01"
                        value={line.cost_price || ''}
                        placeholder="0.00"
                        onChange={e => setLineField(idx, 'cost_price', parseFloat(e.target.value) || 0)} />
                      <span style={{ position: 'absolute', right: '6px', top: '50%', transform: 'translateY(-50%)', fontSize: '10px', color: 'var(--text-muted)', pointerEvents: 'none' }}>₴</span>
                      {line.catalog_price != null && line.catalog_price !== line.cost_price && lastPriceMap[line.sku] == null && (
                        <div style={{ fontSize: '9px', color: line.cost_price === 0 ? '#F59E0B' : '#94A3B8', position: 'absolute', bottom: '-13px', right: 0, whiteSpace: 'nowrap' }}>
                          {line.cost_price === 0 ? '⚠ роздріб' : 'прайс'}: {fmt(line.catalog_price)} ₴
                        </div>
                      )}
                      {line.matched && lastPriceMap[line.sku] != null && line.cost_price > 0 && (() => {
                        const last = lastPriceMap[line.sku];
                        const diff = ((line.cost_price - last) / last) * 100;
                        if (Math.abs(diff) < 5) return null;
                        return (
                          <div style={{ fontSize: '9px', fontWeight: 700, color: diff > 0 ? '#DC2626' : '#15803D', position: 'absolute', bottom: '-13px', right: 0, whiteSpace: 'nowrap' }}>
                            {diff > 0 ? '↑' : '↓'} {Math.abs(diff).toFixed(0)}% vs. попер.
                          </div>
                        );
                      })()}
                    </div>

                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: '13px', fontWeight: 600, color: rowSum > 0 ? 'var(--text-primary)' : 'var(--text-muted)' }}>
                        {rowSum > 0 ? `${fmt(rowSum)} ₴` : '—'}
                      </div>
                      {line.matched && demandMap[line.sku] && (
                        <div title={`${demandMap[line.sku].orders} замовлень клієнтів очікують цей товар`}
                          style={{ display: 'inline-flex', alignItems: 'center', gap: '3px', marginTop: '2px', fontSize: '9px', fontWeight: 700, color: '#92400E', background: '#FEF3C7', border: '1px solid #FDE68A', padding: '1px 5px', borderRadius: '4px', cursor: 'default' }}>
                          🛒 {demandMap[line.sku].orders} зам. · {demandMap[line.sku].qty} шт
                        </div>
                      )}
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
            <div style={{ display: 'grid', gridTemplateColumns: '130px 2fr 80px 120px 110px 32px', padding: '8px 12px', gap: '8px', borderTop: '2px solid var(--border)', background: 'var(--bg-soft)', alignItems: 'center' }}>
              <div style={{ gridColumn: '1 / 3', display: 'flex', alignItems: 'center', gap: '12px' }}>
                <button onClick={addLine}
                  style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '12px', color: '#1E3A5F', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600, padding: 0 }}>
                  <Plus size={13} /> Додати рядок
                </button>
                <button onClick={() => setShowPicker(true)}
                  style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '12px', color: '#7C3AED', background: 'none', border: '1px solid #DDD6FE', borderRadius: '6px', cursor: 'pointer', fontWeight: 600, padding: '3px 8px' }}>
                  ⋯ З каталогу
                </button>
              </div>
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
    {/* Дропдаун пошуку — position:fixed, ширина 500px від лівого краю input */}
    {suggestionAnchor && (nameSuggestions[suggestionAnchor.idx]?.length ?? 0) > 0 && (() => {
      const dropW = 500;
      // Не виходимо за правий край екрану
      const left = Math.min(suggestionAnchor.left, window.innerWidth - dropW - 12);
      return (
        <div style={{ position: 'fixed', top: suggestionAnchor.top, left, width: dropW, zIndex: 9999, background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '8px', boxShadow: '0 8px 24px rgba(0,0,0,0.18)', maxHeight: '280px', overflowY: 'auto' }}>
          {nameSuggestions[suggestionAnchor.idx].map((s, i) => {
            const isActive = i === activeDropdownIdx;
            return (
              <div key={s.sku}
                onMouseDown={() => selectNameSuggestion(suggestionAnchor.idx, s)}
                onMouseEnter={() => setActiveDropdownIdx(i)}
                title={`${s.brand} ${s.name}`.trim()}
                style={{ padding: '8px 12px', cursor: 'pointer', fontSize: '13px', borderBottom: '1px solid var(--border-light)', display: 'flex', alignItems: 'baseline', gap: '8px', whiteSpace: 'nowrap', overflow: 'hidden', background: isActive ? '#EFF4FF' : 'transparent', transition: 'background 0.1s' }}>
                <span style={{ color: isActive ? '#1E3A5F' : 'var(--text-muted)', fontSize: '11px', fontFamily: 'monospace', flexShrink: 0 }}>{s.sku}</span>
                <span style={{ fontWeight: 700, color: '#1E3A5F', flexShrink: 0 }}>{s.brand}</span>
                <span style={{ color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis' }}>{s.name}</span>
              </div>
            );
          })}
        </div>
      );
    })()}

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
