'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { X, Minus, Upload, Loader2, Trash2, AlertCircle, Copy, List, Save, Check, Gift, Truck } from 'lucide-react';
import { showToast } from '../../../lib/toast';
import { useRouter } from 'next/navigation';
import * as XLSX from 'xlsx';
import type { ReceiptDraft, ReceiptLine } from '../ReceiptDraftManager';
import ProductPickerModal from './ProductPickerModal';

type Warehouse = { id: number; name: string };
type Supplier  = { id: number; name: string };

type Props = {
  initialData:   ReceiptDraft;
  warehouses:    Warehouse[];
  suppliers:     Supplier[];
  zIndex?:       number;
  onMinimize:    () => void;
  onClose:       () => void;
  onDraftChange: (data: Partial<ReceiptDraft>) => void;
  onSubmitted:   () => void;
};

// Identical styles to NewPOModal
const inp: React.CSSProperties = {
  border: '1px solid var(--border)', borderRadius: '6px',
  fontSize: '12px', outline: 'none', padding: '4px 8px',
  color: 'var(--text-primary)', background: 'var(--bg-soft)',
  width: '100%', boxSizing: 'border-box',
};
const sinp: React.CSSProperties = {
  height: '34px', padding: '0 10px', border: '1.5px solid var(--border)',
  borderRadius: '8px', fontSize: '13px', outline: 'none',
  color: 'var(--text-primary)', background: 'var(--bg-soft)', width: '100%',
  boxSizing: 'border-box',
};
const lbl: React.CSSProperties = {
  fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)',
  display: 'block', marginBottom: '4px', textTransform: 'uppercase',
};

function fmt(n: number) {
  return n.toLocaleString('uk-UA', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// ── Excel parsing ─────────────────────────────────────────────────────────────
// Normalize: lowercase, strip separators, Ukrainian і/І → ASCII i (1C uses ASCII i in Cyrillic words)
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
function parseExcel(buffer: ArrayBuffer): { sku: string; name: string; qty: number; price: number }[] {
  const wb   = XLSX.read(buffer, { type: 'array' });
  const ws   = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<string[]>(ws, { header: 1, defval: '' }) as string[][];
  if (rows.length < 2) return [];

  // Scan up to 30 rows for a keyword header (handles 1C invoices with many metadata rows)
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
  // Fallback: first row with enough cells
  if (headerIdx < 0) {
    for (let i = 0; i < Math.min(30, rows.length); i++) {
      if (rows[i].filter(Boolean).length >= 2) { headerIdx = i; break; }
    }
  }
  if (headerIdx < 0) return [];

  const headers = rows[headerIdx].map(String);
  const skuCol   = detectCol(headers, ['sku','код','арт','code','article']);
  const nameCol  = detectCol(headers, ['назв','name','товар','найменув','опис','description']);
  const qtyCol   = detectCol(headers, ['кіл','qty','кол','кількість','количество','amount','count']);
  const priceCol = detectCol(headers, ['цін','price','ціна','вартість','cost','прайс']);

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

// Grid: Артикул | Найменування | Зам. | Факт | Закупка | Сума | бонус | копія | Del
const COLS = '90px 1.5fr 66px 76px 100px 88px 24px 24px 24px';

export default function NewReceiptModal({
  initialData, warehouses, suppliers,
  zIndex = 1003, onMinimize, onClose, onDraftChange, onSubmitted,
}: Props) {
  const router  = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);

  const [warehouseId,       setWarehouseId]       = useState(initialData.warehouseId || warehouses[0]?.id || 0);
  const [supplierId,        setSupplierId]         = useState<number | ''>(initialData.supplierId ?? '');
  const [docDate,           setDocDate]           = useState(initialData.docDate || new Date().toISOString().slice(0, 10));
  const [supplierInvNum,    setSupplierInvNum]    = useState(initialData.supplierInvNum || '');
  const [supplierInvDate,   setSupplierInvDate]   = useState(initialData.supplierInvDate || '');
  const [supplierInvAmount, setSupplierInvAmount] = useState<number | ''>(initialData.supplierInvAmount ?? '');
  const [notes,             setNotes]             = useState(initialData.notes || '');
  const [lines,             setLines]             = useState<ReceiptLine[]>(
    initialData.lines?.length ? initialData.lines : [{ sku: '', name: '', qty: 1, cost_price: 0, is_bonus: false, matched: false }]
  );

  const [currentDraftReceiptId, setCurrentDraftReceiptId] = useState<string | null>(initialData.draftReceiptId ?? null);

  // Додаткові витрати (landed costs)
  type LCLine = { cost_type: string; description: string; amount: number; payment_method: 'cash' | 'bank' };
  const [landedCosts,  setLandedCosts]  = useState<LCLine[]>([]);
  const [lcMethod,     setLcMethod]     = useState<'by_cost' | 'by_qty' | 'equal'>('by_cost');
  const [showLC,       setShowLC]       = useState(false);
  const LC_TYPES = [
    { key: 'delivery',  label: 'Доставка' },
    { key: 'loading',   label: 'Навантаж./розвантаж.' },
    { key: 'customs',   label: 'Мито' },
    { key: 'packaging', label: 'Пакування' },
    { key: 'broker',    label: 'Брокер' },
    { key: 'other',     label: 'Інше' },
  ];
  function addLC() { setLandedCosts(prev => [...prev, { cost_type: 'delivery', description: '', amount: 0, payment_method: 'bank' }]); }
  function setLCField<K extends keyof LCLine>(i: number, k: K, v: LCLine[K]) {
    setLandedCosts(prev => prev.map((l, idx) => idx === i ? { ...l, [k]: v } : l));
  }
  const lcTotal = landedCosts.reduce((s, l) => s + (l.amount || 0), 0);
  const [savedAsDraft,          setSavedAsDraft]          = useState(false);

  const [dragging,    setDragging]    = useState(false);
  const [parsing,     setParsing]     = useState(false);
  const [saving,      setSaving]      = useState(false);
  const [showPicker,  setShowPicker]  = useState(false);

  // Per-row name autocomplete (same pattern as NewPOModal)
  const nameTimers    = useRef<Record<number, ReturnType<typeof setTimeout>>>({});
  const lookupTimers  = useRef<Record<number, ReturnType<typeof setTimeout>>>({});
  const nameInputRefs = useRef<Record<number, HTMLInputElement | null>>({});
  const [nameSuggestions,  setNameSuggestions]  = useState<Record<number, { sku: string; name: string; brand: string }[]>>({});
  const [suggestionAnchor, setSuggestionAnchor] = useState<{ idx: number; top: number; left: number; width: number } | null>(null);
  const [activeDropdownIdx, setActiveDropdownIdx] = useState<number>(-1);

  useEffect(() => {
    const lt = lookupTimers.current;
    const nt = nameTimers.current;
    return () => {
      Object.values(lt).forEach(clearTimeout);
      Object.values(nt).forEach(clearTimeout);
    };
  }, []);

  function updateAnchor(idx: number) {
    const el = nameInputRefs.current[idx];
    if (!el) return;
    const inputR = el.getBoundingClientRect();
    const rowEl  = el.parentElement;
    const top    = rowEl ? rowEl.getBoundingClientRect().bottom + 4 : inputR.bottom + 4;
    setSuggestionAnchor({ idx, top, left: inputR.left, width: inputR.width });
  }

  function setLineField<K extends keyof ReceiptLine>(idx: number, key: K, val: ReceiptLine[K]) {
    setLines(prev => prev.map((l, i) => i === idx ? { ...l, [key]: val } : l));
  }

  function handleSkuChange(idx: number, val: string) {
    setLineField(idx, 'sku', val);
    setLineField(idx, 'matched', false);
    clearTimeout(lookupTimers.current[idx]);
    if (val.trim().length >= 3) {
      lookupTimers.current[idx] = setTimeout(() => lookupSku(idx, val), 600);
    }
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
        sku:             found.sku,
        name:       `${found.brand ?? ''} ${found.name ?? ''}`.trim(),
        cost_price: found.price_cost ?? l.cost_price,
        matched:    true,
      } : l));
    } else {
      setLines(prev => prev.map((l, i) => i === idx ? { ...l, matched: false } : l));
    }
  }

  // ── Excel / resolve ────────────────────────────────────────────────────────
  async function resolveLines(raw: { sku: string; name: string; qty: number; price: number }[]): Promise<ReceiptLine[]> {
    if (!raw.length) return [];
    const skus = raw.map(r => r.sku).filter(Boolean);
    if (!skus.length) return raw.map(r => ({ sku: r.sku, name: r.name, qty: r.qty, cost_price: r.price, is_bonus: false, matched: false }));
    const res = await fetch('/api/admin/products/search-skus', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ skus }),
    });
    if (!res.ok) return raw.map(r => ({ sku: r.sku, name: r.name, qty: r.qty, cost_price: r.price, is_bonus: false, matched: false }));
    const data = await res.json();
    const byInput = new Map<string, { sku: string; name: string; brand: string; price_cost: number | null; matched: boolean }>();
    for (const p of (data.products ?? [])) byInput.set(p.input_sku, p);
    return raw.map(r => {
      const found = byInput.get(r.sku);
      return {
        sku:        found?.sku ?? r.sku,
        name:       found ? `${found.brand ?? ''} ${found.name ?? ''}`.trim() : r.name,
        qty:        r.qty,
        cost_price: found?.price_cost ?? r.price,
        is_bonus:   false,
        matched:    found?.matched ?? false,
      };
    });
  }

  async function processFile(file: File) {
    setParsing(true);
    try {
      const buf     = await file.arrayBuffer();
      const raw     = parseExcel(buf);
      if (!raw.length) { showToast('Не знайдено рядків у файлі. Перевірте формат.', 'error'); return; }
      const resolved = await resolveLines(raw);
      setLines(resolved);
    } catch (e) {
      showToast('Помилка читання файлу: ' + (e instanceof Error ? e.message : String(e)), 'error');
    } finally { setParsing(false); }
  }

  function addLine() {
    setLines(prev => [...prev, { sku: '', name: '', qty: 1, cost_price: 0, is_bonus: false, matched: false }]);
  }

  function copyLine(idx: number) {
    setLines(prev => [...prev, { ...prev[idx], ordered_qty: 0, qty: 1 }]);
  }

  function handlePickerAdd(items: { sku: string; name: string; qty: number; cost_price: number }[]) {
    setLines(prev => {
      const filtered = prev.filter(l => l.sku.trim() || l.name.trim());
      return [
        ...filtered,
        ...items.map(item => ({ sku: item.sku, name: item.name, qty: item.qty, cost_price: item.cost_price, is_bonus: false, matched: true })),
      ];
    });
  }

  function toggleBonus(idx: number) {
    setLines(prev => prev.map((l, i) => {
      if (i !== idx) return l;
      const nowBonus = !l.is_bonus;
      return { ...l, is_bonus: nowBonus, cost_price: nowBonus ? 0 : l.cost_price };
    }));
  }

  // Sync draft
  const syncDraft = useCallback(() => {
    onDraftChange({ warehouseId, supplierId: supplierId || null, docDate, supplierInvNum, supplierInvDate, supplierInvAmount, notes, lines });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [warehouseId, supplierId, docDate, supplierInvNum, supplierInvDate, supplierInvAmount, notes, lines]);
  useEffect(() => { syncDraft(); }, [syncDraft]);

  // Автоскрол вниз коли відкривається секція витрат
  useEffect(() => {
    if (showLC && bodyRef.current) {
      const el = bodyRef.current;
      setTimeout(() => el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' }), 50);
    }
  }, [showLC]);

  const total          = lines.reduce((s, l) => s + l.qty * (l.is_bonus ? 0 : l.cost_price), 0);
  const filledLines    = lines.filter(l => l.sku || l.name).length;
  const unmatchedCount = lines.filter(l => l.sku && !l.matched && l.sku.length >= 3).length;

  async function handleSave(autoConfirm: boolean) {
    const valid = lines.filter(l => l.sku.trim() && l.qty > 0);
    if (!valid.length) { showToast('Додайте хоча б один товар з артикулом', 'error'); return; }
    setSaving(true);
    try {
      // ── PO-linked receipt ──────────────────────────────────────────────────
      if (initialData.poId) {
        // Aggregate duplicate SKUs: sum qty, weighted avg cost (bonus lines at 0 reduce avg)
        type Agg = { qty: number; totalCost: number; first: typeof valid[0] };
        const skuAgg = new Map<string, Agg>();
        for (const l of valid) {
          const sku  = l.sku.trim();
          const cost = l.is_bonus ? 0 : l.cost_price;
          const ex   = skuAgg.get(sku);
          if (ex) { ex.qty += l.qty; ex.totalCost += l.qty * cost; }
          else     skuAgg.set(sku, { qty: l.qty, totalCost: l.qty * cost, first: l });
        }
        const agg = [...skuAgg.entries()];
        const res = await fetch(`/api/admin/procurement/${initialData.poId}/receive`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            actualQties:  Object.fromEntries(agg.map(([s, v]) => [s, v.qty])),
            actualPrices: Object.fromEntries(agg.map(([s, v]) => [s, v.qty ? v.totalCost / v.qty : 0])),
            notes:            notes || undefined,
            draft:            !autoConfirm,
            draftReceiptId:   currentDraftReceiptId ?? undefined,
            ...(autoConfirm && landedCosts.length > 0 ? {
              landed_costs: landedCosts.filter(c => c.amount > 0),
              lc_method:    lcMethod,
            } : {}),
          }),
        });
        const data = await res.json();
        if (!res.ok) { showToast(data.error ?? 'Помилка проведення приходу', 'error'); return; }
        if (!autoConfirm) {
          setCurrentDraftReceiptId(data.receiptId);
          onDraftChange({ draftReceiptId: data.receiptId });
          setSavedAsDraft(true);
          setTimeout(() => setSavedAsDraft(false), 3000);
          return;
        }
        onSubmitted();
        router.push(`/admin/procurement/receipts/${data.receiptId}`);
        router.refresh();
        return;
      }

      // ── Standalone receipt (stock_in) ──────────────────────────────────────
      const res = await fetch('/api/admin/accounting/documents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          doc_type:     'stock_in',
          warehouse_id: warehouseId,
          supplier_id:  supplierId || undefined,
          doc_date:     docDate ? new Date(docDate).toISOString() : undefined,
          notes:        notes || undefined,
          supplier_invoice_number: supplierInvNum  || undefined,
          supplier_invoice_date:   supplierInvDate || undefined,
          supplier_invoice_amount: supplierInvAmount !== '' ? supplierInvAmount : undefined,
          lines: valid.map(l => ({
            sku:        l.sku.trim(),
            qty:        l.qty,
            price:      0,
            cost_price: l.is_bonus ? 0 : l.cost_price,
            is_bonus:   l.is_bonus,
            fulfillment_type: 'own',
          })),
        }),
      });
      const data = await res.json();
      if (!res.ok) { showToast(data.error ?? 'Помилка збереження', 'error'); return; }
      if (autoConfirm) {
        const res2 = await fetch('/api/admin/accounting/documents', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'confirm', document_id: data.id }),
        });
        if (!res2.ok) {
          const d2 = await res2.json();
          showToast(`Збережено як чернетку, але помилка проведення: ${d2.error}`, 'error');
          return;
        }
      }
      onSubmitted();
      router.push('/admin/procurement/receipts');
      router.refresh();
    } catch {
      showToast('Мережева помилка', 'error');
    } finally { setSaving(false); }
  }

  return (
    <>
      {showPicker && (
        <ProductPickerModal zIndex={zIndex + 100} onClose={() => setShowPicker(false)} onAdd={handlePickerAdd} />
      )}

      {/* Panel — весь модаль скролиться, header/footer sticky */}
      <div
        className="receipt-panel-enter"
        ref={bodyRef}
        style={{ position: 'fixed', top: 0, left: '240px', right: 0, bottom: '42px', zIndex, overflowY: 'auto', background: 'var(--bg-card)', boxShadow: '8px 0 32px rgba(0,0,0,0.22)', borderBottom: '1px solid var(--border)' }}
      >
        {/* ── Header sticky ── */}
        <div style={{ position: 'sticky', top: 0, zIndex: 20, background: 'var(--bg-card)', padding: '18px 24px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
            <div style={{ fontSize: '16px', fontWeight: 800, color: 'var(--text-primary)' }}>
              {initialData.poId ? `Прихід за ${initialData.poDocNumber ?? 'ЗП'}` : 'Новий прихід товару'}
            </div>
            {initialData.poId && (
              <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Перевірте фактичні кількості, ціни закупки та встановіть ціни продажу</div>
            )}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <button onClick={onMinimize} title="Згорнути" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex', padding: '4px', borderRadius: '6px' }}><Minus size={18} /></button>
            <button onClick={onClose}    title="Закрити"  style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex', padding: '4px', borderRadius: '6px' }}><X size={18} /></button>
          </div>
        </div>

        {/* ── Scrollable body ── */}
        <div style={{ padding: '16px 24px', display: 'flex', flexDirection: 'column', gap: '14px' }}>

          {/* Top fields */}
          <div style={{ display: 'grid', gridTemplateColumns: '180px 160px 200px 1fr', gap: '12px' }}>
            <div>
              <label style={lbl}>Склад *</label>
              <select value={warehouseId} onChange={e => setWarehouseId(Number(e.target.value))} style={{ ...sinp, cursor: 'pointer' }}>
                {warehouses.length === 0
                  ? <option value="">Завантаження...</option>
                  : warehouses.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
              </select>
            </div>
            <div>
              <label style={lbl}>Дата документу</label>
              <input type="date" value={docDate} onChange={e => setDocDate(e.target.value)} style={sinp} />
            </div>
            <div>
              <label style={lbl}>Постачальник</label>
              <select value={supplierId} onChange={e => setSupplierId(e.target.value ? Number(e.target.value) : '')} style={{ ...sinp, cursor: 'pointer' }}>
                <option value="">— Без постачальника —</option>
                {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
            <div>
              <label style={lbl}>Нотатки</label>
              <input value={notes} onChange={e => setNotes(e.target.value)} placeholder="Коментар до приходу" style={sinp} />
            </div>
          </div>

          {/* Supplier invoice (only if supplier selected) */}
          {supplierId && (
            <div style={{ display: 'grid', gridTemplateColumns: '200px 160px 160px 1fr', gap: '12px' }}>
              <div>
                <label style={lbl}>№ рахунку постачальника</label>
                <input value={supplierInvNum} onChange={e => setSupplierInvNum(e.target.value)} placeholder="Необов'язково..." style={sinp} />
              </div>
              <div>
                <label style={lbl}>Дата рахунку</label>
                <input type="date" value={supplierInvDate} onChange={e => setSupplierInvDate(e.target.value)} style={sinp} />
              </div>
              <div>
                <label style={lbl}>Сума рахунку, ₴</label>
                <input type="number" min={0} step={0.01} value={supplierInvAmount} onChange={e => setSupplierInvAmount(e.target.value ? parseFloat(e.target.value) : '')} placeholder="Необов'язково..." style={sinp} />
              </div>
              <div />
            </div>
          )}

          {/* Excel upload — identical to NewPOModal */}
          <div
            onDragOver={e => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={e => { e.preventDefault(); setDragging(false); const f = e.dataTransfer.files[0]; if (f) processFile(f); }}
            onClick={() => fileRef.current?.click()}
            style={{ border: `2px dashed ${dragging ? '#1E3A5F' : 'var(--border)'}`, borderRadius: '10px', padding: '14px 20px', cursor: 'pointer', background: dragging ? '#EFF4FF' : 'var(--bg-soft)', display: 'flex', alignItems: 'center', gap: '12px', transition: 'all 0.15s' }}
          >
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

          {/* ── Lines table — identical structure to NewPOModal ── */}
          <div style={{ border: '1px solid var(--border)', borderRadius: '10px', overflow: 'hidden' }}>

            {/* Header */}
            <div style={{ display: 'grid', gridTemplateColumns: COLS, padding: '8px 12px', background: 'var(--bg-soft)', borderBottom: '1px solid var(--border)', fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', gap: '8px', alignItems: 'center' }}>
              <span>Артикул</span>
              <span>Найменування</span>
              <span style={{ textAlign: 'right', color: 'var(--brand-blue)' }}>Зам.</span>
              <span style={{ textAlign: 'right' }} title={initialData.poId ? '0 = не отримано (виключити з приходу)' : undefined}>Факт</span>
              <span style={{ textAlign: 'right' }}>Закупка</span>
              <span style={{ textAlign: 'right' }}>Сума</span>
              <span style={{ textAlign: 'center' }} title="Бонусний товар"><Gift size={12} style={{ verticalAlign: 'middle' }} /></span>
              <span /><span />
            </div>

            {/* Rows */}
            <div>
              {lines.map((line, idx) => {
                const rowSum = line.qty * (line.is_bonus ? 0 : line.cost_price);
                const warn   = line.sku && !line.matched;
                return (
                  <div key={idx} style={{ display: 'grid', gridTemplateColumns: COLS, padding: '6px 12px', gap: '8px', alignItems: 'center', borderBottom: '1px solid var(--border-light)', background: line.is_bonus ? '#FFFBEB' : warn ? '#FFFBEB' : 'transparent' }}>

                    {/* SKU input */}
                    <input
                      style={{ ...inp, fontFamily: 'monospace', fontSize: '11px', borderColor: warn ? '#FCD34D' : undefined }}
                      placeholder="1300-014"
                      value={line.sku}
                      onChange={e => handleSkuChange(idx, e.target.value)}
                      onBlur={e => { if (e.target.value && !line.matched) lookupSku(idx, e.target.value); }}
                      onKeyDown={e => {
                        if (e.key === 'Backspace' && !line.sku && lines.length > 1) {
                          e.preventDefault();
                          setLines(prev => prev.filter((_, i) => i !== idx));
                        }
                      }}
                    />

                    {/* Name input with autocomplete */}
                    <input
                      ref={el => { nameInputRefs.current[idx] = el; }}
                      style={inp}
                      placeholder="Назва товару або пошук..."
                      title={line.name || undefined}
                      value={line.name}
                      onChange={e => { handleNameChange(idx, e.target.value); setActiveDropdownIdx(-1); }}
                      onBlur={() => setTimeout(() => { setNameSuggestions(prev => ({ ...prev, [idx]: [] })); setSuggestionAnchor(null); setActiveDropdownIdx(-1); }, 150)}
                      onFocus={() => { if (line.name.length >= 2 && !nameSuggestions[idx]?.length) handleNameChange(idx, line.name); }}
                      onKeyDown={e => {
                        const suggestions = nameSuggestions[idx] ?? [];
                        if (!suggestions.length) return;
                        if (e.key === 'ArrowDown') { e.preventDefault(); setActiveDropdownIdx(prev => Math.min(prev + 1, suggestions.length - 1)); }
                        else if (e.key === 'ArrowUp') { e.preventDefault(); setActiveDropdownIdx(prev => Math.max(prev - 1, 0)); }
                        else if (e.key === 'Enter' && activeDropdownIdx >= 0) { e.preventDefault(); selectNameSuggestion(idx, suggestions[activeDropdownIdx]); }
                        else if (e.key === 'Escape') { setNameSuggestions(prev => ({ ...prev, [idx]: [] })); setSuggestionAnchor(null); setActiveDropdownIdx(-1); }
                      }}
                    />

                    {/* Замовлено (read-only) */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end' }}>
                      {line.ordered_qty != null ? (
                        <div style={{ textAlign: 'right', fontSize: '13px', fontWeight: 600, color: 'var(--brand-blue)',
                          background: '#EFF4FF', border: '1px solid #C7D8F0', borderRadius: '6px',
                          padding: '3px 8px', width: '100%', boxSizing: 'border-box' }}>
                          {line.ordered_qty}
                        </div>
                      ) : (
                        <span style={{ fontSize: '11px', color: 'var(--text-muted)', width: '100%', textAlign: 'right' }}>—</span>
                      )}
                    </div>

                    {/* Факт (editable) */}
                    <div>
                      <input style={{ ...inp, textAlign: 'right',
                        opacity: initialData.poId && line.qty === 0 ? 0.45 : 1,
                        borderColor: line.ordered_qty != null
                          ? (line.qty === 0 ? '#CBD5E1' : line.qty === line.ordered_qty ? '#86EFAC' : line.qty < line.ordered_qty ? '#FCD34D' : '#FCA5A5')
                          : undefined }}
                        type="number" min={initialData.poId ? '0' : '0.001'} step="1"
                        value={line.qty === 0 ? '' : (line.qty || '')}
                        placeholder={initialData.poId ? '0' : ''}
                        onChange={e => {
                          const v = parseFloat(e.target.value);
                          setLineField(idx, 'qty', isNaN(v) ? (initialData.poId ? 0 : 1) : Math.max(0, v));
                        }}
                        onBlur={() => {
                          if (!initialData.poId && (!line.qty || line.qty < 0.001)) setLineField(idx, 'qty', 1);
                        }} />
                    </div>

                    {/* Cost price */}
                    <div style={{ position: 'relative' }}>
                      <input style={{ ...inp, textAlign: 'right', paddingRight: '18px', opacity: line.is_bonus ? 0.4 : 1 }}
                        type="number" min="0" step="0.01"
                        value={line.cost_price || ''} placeholder="0.00"
                        disabled={line.is_bonus}
                        onChange={e => setLineField(idx, 'cost_price', parseFloat(e.target.value) || 0)} />
                      <span style={{ position: 'absolute', right: '6px', top: '50%', transform: 'translateY(-50%)', fontSize: '10px', color: 'var(--text-muted)', pointerEvents: 'none' }}>₴</span>
                    </div>

                    {/* Row sum */}
                    <div style={{ textAlign: 'right', fontSize: '12px', fontWeight: 600, color: rowSum > 0 ? 'var(--text-primary)' : 'var(--text-muted)' }}>
                      {rowSum > 0 ? `${fmt(rowSum)} ₴` : '—'}
                    </div>

                    {/* Bonus toggle */}
                    <button onClick={() => toggleBonus(idx)} title={line.is_bonus ? 'Скасувати бонус' : 'Бонусний товар'}
                      style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', background: line.is_bonus ? '#FEF3C7' : 'none', border: line.is_bonus ? '1px solid #FCD34D' : '1px solid transparent', borderRadius: '5px', cursor: 'pointer', color: line.is_bonus ? '#B45309' : 'var(--text-muted)', height: '24px', width: '24px', padding: 0 }}>
                      <Gift size={13} />
                    </button>

                    {/* Copy line */}
                    <button onClick={() => copyLine(idx)} title="Копіювати рядок"
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0 }}>
                      <Copy size={12} />
                    </button>

                    {/* Delete */}
                    <button onClick={() => setLines(prev => prev.filter((_, i) => i !== idx))}
                      disabled={lines.length === 1}
                      style={{ background: 'none', border: 'none', cursor: lines.length > 1 ? 'pointer' : 'default', color: lines.length > 1 ? '#EF4444' : 'var(--text-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0 }}>
                      <Trash2 size={12} />
                    </button>
                  </div>
                );
              })}
            </div>

            {/* Footer — actions only */}
            <div style={{ padding: '8px 12px', borderTop: '1px solid var(--border)', background: 'var(--bg-soft)', display: 'flex', alignItems: 'center', gap: '12px' }}>
              <button onClick={addLine} style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '12px', color: '#1E3A5F', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600, padding: 0 }}>
                + Додати рядок
              </button>
              <button onClick={() => setShowPicker(true)} className="proc-btn sm">
                <List size={13} /> З каталогу
              </button>
            </div>

            {/* Total — окремо під рядками */}
            <div style={{ padding: '10px 16px', borderTop: '2px solid var(--border)', background: 'var(--bg-card)', display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: '12px' }}>
              <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Разом закупка:</span>
              <span style={{ fontSize: '18px', fontWeight: 800, color: 'var(--text-primary)' }}>{fmt(total)} ₴</span>
            </div>
          </div>

          {/* ── Додаткові витрати — всередині body, скролиться разом ── */}
          <div style={{ border: '1px solid var(--border)', borderRadius: '10px', overflow: 'hidden' }}>
            <div style={{ padding: '8px 12px', background: 'var(--bg-soft)', display: 'flex', alignItems: 'center', gap: '10px' }}>
              <button onClick={() => { setShowLC(v => !v); if (!showLC && landedCosts.length === 0) addLC(); }}
                style={{ fontSize: '13px', fontWeight: 600, color: showLC ? 'var(--brand-blue)' : 'var(--text-secondary)', background: 'none', border: 'none', cursor: 'pointer', padding: 0, display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Truck size={14} /> Додаткові витрати {lcTotal > 0 ? `· ${fmt(lcTotal)} ₴` : ''}
                <span style={{ fontSize: '10px' }}>{showLC ? '▲' : '▼'}</span>
              </button>
              {showLC && <>
                <button onClick={addLC} className="proc-btn sm">
                  + Додати
                </button>
                <div style={{ display: 'flex', alignItems: 'center', gap: '5px', marginLeft: 'auto' }}>
                  <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Розподіл:</span>
                  <select value={lcMethod} onChange={e => setLcMethod(e.target.value as typeof lcMethod)}
                    style={{ height: '28px', padding: '0 8px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--bg-card)', fontSize: '11px', cursor: 'pointer' }}>
                    <option value="by_cost">за собівартістю</option>
                    <option value="by_qty">за кількістю</option>
                    <option value="equal">порівну</option>
                  </select>
                </div>
              </>}
            </div>
            {showLC && (
              <div style={{ borderTop: '1px solid var(--border)', background: 'var(--bg-soft)', display: 'flex', flexDirection: 'column', gap: '6px', padding: '8px 12px' }}>
                {landedCosts.map((lc, i) => (
                  <div key={i} style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                    <select value={lc.cost_type} onChange={e => setLCField(i, 'cost_type', e.target.value)}
                      style={{ ...sinp, fontSize: '12px', cursor: 'pointer', flex: '0 0 160px' }}>
                      {LC_TYPES.map(t => <option key={t.key} value={t.key}>{t.label}</option>)}
                    </select>
                    <input value={lc.description} onChange={e => setLCField(i, 'description', e.target.value)}
                      placeholder="Опис (необов'язково)" style={{ ...sinp, fontSize: '12px', flex: '1 1 auto', minWidth: 0, maxWidth: '400px' }} />
                    <div style={{ position: 'relative', flex: '0 0 120px' }}>
                      <input type="number" min={0} step={0.01} value={lc.amount || ''}
                        onChange={e => setLCField(i, 'amount', parseFloat(e.target.value) || 0)}
                        placeholder="0.00" style={{ ...sinp, fontSize: '12px', textAlign: 'right', paddingRight: '22px', width: '100%' }} />
                      <span style={{ position: 'absolute', right: '8px', top: '50%', transform: 'translateY(-50%)', fontSize: '11px', color: 'var(--text-muted)', pointerEvents: 'none' }}>₴</span>
                    </div>
                    <select value={lc.payment_method} onChange={e => setLCField(i, 'payment_method', e.target.value as 'cash' | 'bank')}
                      style={{ ...sinp, fontSize: '12px', cursor: 'pointer', flex: '0 0 120px' }}>
                      <option value="bank">Банк</option>
                      <option value="cash">Готівка</option>
                    </select>
                    <button onClick={() => setLandedCosts(prev => prev.filter((_, idx) => idx !== i))}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#EF4444', display: 'flex', padding: 0, alignItems: 'center', flexShrink: 0 }}>
                      <Trash2 size={13} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

        </div>

        {/* ── Footer sticky ── */}
        <div style={{ position: 'sticky', bottom: 0, zIndex: 20, background: 'var(--bg-card)', padding: '14px 24px', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
            {filledLines} позицій · {fmt(total)} ₴
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button onClick={() => handleSave(false)} disabled={saving}
              className={`proc-btn${savedAsDraft ? ' done' : ''}`} style={{ height: '38px' }}>
              {savedAsDraft ? <><Check size={14} /> Збережено</> : <><Save size={14} /> Чернетка</>}
            </button>
            <button onClick={() => handleSave(true)} disabled={saving}
              className="proc-btn primary" style={{ height: '38px', padding: '0 20px' }}>
              {saving
                ? <><Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> Проводимо...</>
                : <><Check size={14} /> {initialData.poId ? 'Провести прихід' : 'Провести'}</>}
            </button>
          </div>
        </div>
      </div>

      {/* Name autocomplete dropdown — fixed position like NewPOModal */}
      {suggestionAnchor && (nameSuggestions[suggestionAnchor.idx]?.length ?? 0) > 0 && (() => {
        const dropW = 500;
        const left  = Math.min(suggestionAnchor.left, window.innerWidth - dropW - 12);
        return (
          <div style={{ position: 'fixed', top: suggestionAnchor.top, left, width: dropW, zIndex: 9999, background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '8px', boxShadow: '0 8px 24px rgba(0,0,0,0.18)', maxHeight: '280px', overflowY: 'auto' }}>
            {nameSuggestions[suggestionAnchor.idx].map((s, i) => {
              const isActive = i === activeDropdownIdx;
              return (
                <div key={s.sku}
                  onMouseDown={() => selectNameSuggestion(suggestionAnchor.idx, s)}
                  onMouseEnter={() => setActiveDropdownIdx(i)}
                  style={{ padding: '8px 12px', cursor: 'pointer', fontSize: '13px', borderBottom: '1px solid var(--border-light)', display: 'flex', alignItems: 'baseline', gap: '8px', whiteSpace: 'nowrap', overflow: 'hidden', background: isActive ? '#EFF4FF' : 'transparent' }}>
                  <span style={{ color: 'var(--text-muted)', fontSize: '11px', fontFamily: 'monospace', flexShrink: 0 }}>{s.sku}</span>
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
        @keyframes receipt-panel-enter {
          0%   { opacity:0; transform:scale(0.96) translateY(10px); filter:blur(6px); }
          55%  { filter:blur(0); }
          100% { opacity:1; transform:scale(1) translateY(0); }
        }
        .receipt-panel-enter { animation: receipt-panel-enter 0.32s cubic-bezier(0.22,1,0.36,1); }
      `}</style>
    </>
  );
}
