'use client';

import { useState, useRef, useEffect } from 'react';
import { X, Minus, Search, Trash2, Send, AlertCircle } from 'lucide-react';
import { getSupabaseBrowser } from '../../../lib/supabase-browser';

export type StockDocType = 'write_off' | 'transfer';

export interface StockDocLine {
  sku: string;
  name: string;
  qty: number;
  cost_price: number;
}

export interface StockDocDraft {
  id: string;
  docType: StockDocType;
  warehouseId: number;
  toWarehouseId: number | null;
  docDate: string;
  notes: string;
  lines: StockDocLine[];
  minimized: boolean;
  createdAt: number;
  lastActivated: number;
}

type Warehouse = { id: number; name: string };

const inp: React.CSSProperties = {
  height: '34px', padding: '0 10px',
  border: '1.5px solid var(--border)', borderRadius: '8px', fontSize: '13px',
  outline: 'none', color: 'var(--text-primary)', background: 'var(--bg-soft)',
  width: '100%', boxSizing: 'border-box',
};
const lbl: React.CSSProperties = {
  fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)',
  display: 'block', marginBottom: '4px', textTransform: 'uppercase',
};

type Props = {
  initialData: StockDocDraft;
  warehouses: Warehouse[];
  zIndex: number;
  onMinimize: () => void;
  onClose: () => void;
  onDraftChange: (data: Partial<StockDocDraft>) => void;
  onSubmitted: () => void;
};

export default function NewStockDocModal({
  initialData, warehouses, zIndex, onMinimize, onClose, onDraftChange, onSubmitted,
}: Props) {
  const [warehouseId,   setWarehouseId]   = useState(initialData.warehouseId || warehouses[0]?.id || 0);
  const [toWarehouseId, setToWarehouseId] = useState<number | null>(initialData.toWarehouseId);
  const [docDate,       setDocDate]       = useState(initialData.docDate);
  const [notes,         setNotes]         = useState(initialData.notes);
  const [lines,         setLines]         = useState<StockDocLine[]>(initialData.lines);
  const [saving,        setSaving]        = useState(false);
  const [error,         setError]         = useState<string | null>(null);

  const [prodSearch,  setProdSearch]  = useState('');
  const [prodResults, setProdResults] = useState<{ sku: string; name: string; cost: number }[]>([]);
  const [prodOpen,    setProdOpen]    = useState(false);
  const [anchor,      setAnchor]      = useState<{ top: number; left: number; width: number } | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const dropRef   = useRef<HTMLDivElement>(null);

  const docType    = initialData.docType;
  const isTransfer = docType === 'transfer';
  const title      = isTransfer ? 'Переміщення товару' : 'Нове списання';

  useEffect(() => {
    onDraftChange({ warehouseId, toWarehouseId, docDate, notes, lines });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [warehouseId, toWarehouseId, docDate, notes, lines]);

  useEffect(() => {
    if (prodSearch.length < 2) { setProdResults([]); return; }
    const t = setTimeout(async () => {
      const sb = getSupabaseBrowser();
      const { data } = await sb
        .from('products')
        .select('sku, name, brand, stock:product_stock(price_cost)')
        .or(`name.ilike.%${prodSearch}%,sku.ilike.%${prodSearch}%`)
        .eq('is_active', true)
        .limit(10);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      setProdResults((data ?? []).map((p: any) => ({
        sku:  p.sku,
        name: `${p.brand ?? ''} ${p.name ?? ''}`.trim(),
        cost: p.stock?.[0]?.price_cost ?? 0,
      })));
      setProdOpen(true);
      if (searchRef.current) {
        const r = searchRef.current.getBoundingClientRect();
        setAnchor({ top: r.bottom + 4, left: r.left, width: r.width });
      }
    }, 300);
    return () => clearTimeout(t);
  }, [prodSearch]);

  useEffect(() => {
    function h(e: MouseEvent) {
      if (
        dropRef.current && !dropRef.current.contains(e.target as Node) &&
        searchRef.current && !searchRef.current.contains(e.target as Node)
      ) setProdOpen(false);
    }
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  function addProduct(p: { sku: string; name: string; cost: number }) {
    setLines(prev => {
      const ex = prev.find(l => l.sku === p.sku);
      if (ex) return prev.map(l => l.sku === p.sku ? { ...l, qty: l.qty + 1 } : l);
      return [...prev, { sku: p.sku, name: p.name, qty: 1, cost_price: p.cost }];
    });
    setProdSearch('');
    setProdOpen(false);
  }

  function removeLine(sku: string) { setLines(prev => prev.filter(l => l.sku !== sku)); }
  function updateLine(sku: string, field: 'qty' | 'cost_price', val: number) {
    setLines(prev => prev.map(l => l.sku === sku ? { ...l, [field]: val } : l));
  }

  const totalCost = lines.reduce((s, l) => s + l.qty * l.cost_price, 0);

  async function handleSave(autoConfirm: boolean) {
    if (lines.length === 0)              { setError('Додайте хоча б один товар'); return; }
    if (isTransfer && !toWarehouseId)    { setError('Оберіть склад призначення'); return; }
    if (isTransfer && toWarehouseId === warehouseId) { setError('Склади відправлення та призначення мають бути різними'); return; }
    setSaving(true);
    setError(null);
    try {
      const body: Record<string, unknown> = {
        doc_type:    docType,
        warehouse_id: warehouseId,
        doc_date:    new Date(docDate).toISOString(),
        notes:       notes || undefined,
        lines:       lines.map(l => ({
          sku: l.sku, qty: l.qty, price: 0,
          cost_price: l.cost_price, fulfillment_type: 'own',
        })),
      };
      if (isTransfer) body.warehouse_to_id = toWarehouseId;

      const res  = await fetch('/api/admin/accounting/documents', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      });
      const doc  = await res.json();
      if (!res.ok) throw new Error(doc.error ?? 'Помилка збереження');

      if (autoConfirm) {
        const res2 = await fetch('/api/admin/accounting/documents', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'confirm', document_id: doc.id }),
        });
        if (!res2.ok) {
          const d2 = await res2.json();
          throw new Error(`Збережено як чернетку, але помилка проведення: ${d2.error}`);
        }
      }
      onSubmitted();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Помилка');
      setSaving(false);
    }
  }

  const toWarehouses = isTransfer ? warehouses.filter(w => w.id !== warehouseId) : [];

  const gridCols = isTransfer
    ? '1fr 1fr'
    : '1fr 1fr';

  return (
    <>
      <div style={{
        position: 'fixed', top: 0, left: '240px', bottom: '42px', zIndex,
        width: 'min(880px, 65vw)',
        display: 'flex', flexDirection: 'column',
        background: 'var(--bg-card)',
        boxShadow: '8px 0 32px rgba(0,0,0,0.22)',
        borderRight: '1px solid var(--border)',
        borderBottom: '1px solid var(--border)',
      }}>
        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '16px 24px', borderBottom: '1px solid var(--border)',
          background: 'var(--bg-card)', flexShrink: 0,
        }}>
          <div style={{ fontSize: '16px', fontWeight: 800, color: 'var(--text-primary)' }}>{title}</div>
          <div style={{ display: 'flex', gap: 6 }}>
            <button onClick={onMinimize} title="Згорнути" style={{
              width: 28, height: 28, borderRadius: 7, border: '1.5px solid var(--border)',
              background: 'var(--bg-soft)', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-secondary)',
            }}><Minus size={13} /></button>
            <button onClick={onClose} title="Закрити" style={{
              width: 28, height: 28, borderRadius: 7, border: '1.5px solid var(--border)',
              background: 'var(--bg-soft)', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-secondary)',
            }}><X size={13} /></button>
          </div>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px' }}>
          {error && (
            <div style={{ marginBottom: 14, padding: '10px 14px', borderRadius: 8, background: '#FEE2E2', color: '#DC2626', fontSize: 13, display: 'flex', alignItems: 'center', gap: 8 }}>
              <AlertCircle size={14} /> {error}
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: gridCols, gap: 14, marginBottom: 20 }}>
            <div>
              <label style={lbl}>{isTransfer ? 'Склад (звідки)' : 'Склад'} *</label>
              <select value={warehouseId} onChange={e => setWarehouseId(Number(e.target.value))} style={inp}>
                {warehouses.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
              </select>
            </div>
            {isTransfer && (
              <div>
                <label style={lbl}>Склад (куди) *</label>
                <select
                  value={toWarehouseId ?? ''}
                  onChange={e => setToWarehouseId(e.target.value ? Number(e.target.value) : null)}
                  style={{ ...inp, borderColor: !toWarehouseId ? '#FCA5A5' : undefined }}
                >
                  <option value="">— Оберіть —</option>
                  {toWarehouses.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
                </select>
              </div>
            )}
            <div>
              <label style={lbl}>Дата документу</label>
              <input type="date" value={docDate} onChange={e => setDocDate(e.target.value)} style={inp} />
            </div>
            {!isTransfer && <div />}
            <div style={{ gridColumn: '1 / -1' }}>
              <label style={lbl}>{isTransfer ? 'Примітка' : 'Причина списання'}</label>
              <input
                value={notes} onChange={e => setNotes(e.target.value)}
                placeholder={isTransfer ? 'Необов\'язково...' : 'Пошкодження, брак, надлишок...'}
                style={inp}
              />
            </div>
          </div>

          {/* Product search */}
          <div style={{ marginBottom: 14 }}>
            <label style={lbl}>Додати товар</label>
            <div style={{ position: 'relative' }}>
              <Search size={14} color="var(--text-muted)" style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} />
              <input
                ref={searchRef}
                value={prodSearch}
                onChange={e => setProdSearch(e.target.value)}
                placeholder="Артикул або назва товару..."
                style={{ ...inp, paddingLeft: 32 }}
              />
            </div>
          </div>

          {/* Lines */}
          {lines.length > 0 ? (
            <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden', marginBottom: 20 }}>
              <div style={{
                display: 'grid',
                gridTemplateColumns: isTransfer ? '1fr 90px 36px' : '1fr 90px 120px 36px',
                padding: '7px 14px', background: 'var(--bg-soft)',
                fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)',
                textTransform: 'uppercase', borderBottom: '1px solid var(--border)',
              }}>
                <span>Товар</span>
                <span style={{ textAlign: 'center' }}>К-сть</span>
                {!isTransfer && <span style={{ textAlign: 'right' }}>Собівартість</span>}
                <span />
              </div>
              {lines.map((line, idx) => (
                <div key={line.sku} style={{
                  display: 'grid',
                  gridTemplateColumns: isTransfer ? '1fr 90px 36px' : '1fr 90px 120px 36px',
                  padding: '8px 14px', alignItems: 'center',
                  borderBottom: idx < lines.length - 1 ? '1px solid var(--border-light)' : 'none',
                }}>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-primary)' }}>{line.name}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'monospace' }}>{line.sku}</div>
                  </div>
                  <input
                    type="number" min={0.001} step={1} value={line.qty}
                    onChange={e => updateLine(line.sku, 'qty', Math.max(0.001, parseFloat(e.target.value) || 1))}
                    style={{ ...inp, width: 72, textAlign: 'center', margin: '0 auto' }}
                  />
                  {!isTransfer && (
                    <input
                      type="number" min={0} step={0.01} value={line.cost_price}
                      onChange={e => updateLine(line.sku, 'cost_price', parseFloat(e.target.value) || 0)}
                      style={{ ...inp, textAlign: 'right' }}
                    />
                  )}
                  <button onClick={() => removeLine(line.sku)} style={{ display: 'flex', justifyContent: 'center', background: 'none', border: 'none', cursor: 'pointer', color: '#EF4444', padding: 4 }}>
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
              {!isTransfer && totalCost > 0 && (
                <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '8px 14px', background: 'var(--bg-soft)', borderTop: '1px solid var(--border)', fontSize: 13 }}>
                  <span style={{ color: 'var(--text-secondary)' }}>
                    Сума списання: <strong style={{ color: '#DC2626' }}>{totalCost.toLocaleString('uk-UA', { minimumFractionDigits: 2 })} ₴</strong>
                  </span>
                </div>
              )}
            </div>
          ) : (
            <div style={{ padding: '32px 20px', textAlign: 'center', color: 'var(--text-muted)', fontSize: 13, background: 'var(--bg-soft)', borderRadius: 10, border: '1px dashed var(--border)' }}>
              Знайдіть та додайте товари для {isTransfer ? 'переміщення' : 'списання'}
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{
          display: 'flex', justifyContent: 'flex-end', gap: 10,
          padding: '14px 24px', borderTop: '1px solid var(--border)',
          background: 'var(--bg-card)', flexShrink: 0,
        }}>
          <button
            onClick={() => handleSave(false)}
            disabled={saving || lines.length === 0}
            style={{
              height: 38, padding: '0 18px', borderRadius: 9, fontSize: 13, fontWeight: 600,
              border: '1.5px solid var(--border)', background: 'var(--bg-soft)',
              color: 'var(--text-secondary)', cursor: 'pointer',
              opacity: saving || lines.length === 0 ? 0.5 : 1,
            }}
          >Чернетка</button>
          <button
            onClick={() => handleSave(true)}
            disabled={saving || lines.length === 0}
            style={{
              height: 38, padding: '0 22px', borderRadius: 9, fontSize: 13, fontWeight: 700,
              border: 'none',
              background: isTransfer ? '#075985' : '#7F1D1D',
              color: '#fff', cursor: 'pointer',
              display: 'flex', alignItems: 'center', gap: 7,
              opacity: saving || lines.length === 0 ? 0.5 : 1,
            }}
          >
            <Send size={13} />
            {saving ? 'Зберігаємо...' : 'Провести'}
          </button>
        </div>
      </div>

      {/* Fixed-position search dropdown */}
      {prodOpen && anchor && prodResults.length > 0 && (
        <div ref={dropRef} style={{
          position: 'fixed',
          top: anchor.top, left: anchor.left, width: anchor.width,
          zIndex: zIndex + 50,
          background: 'var(--bg-card)', border: '1px solid var(--border)',
          borderRadius: 10, boxShadow: '0 8px 24px rgba(0,0,0,0.18)',
          maxHeight: 260, overflowY: 'auto',
        }}>
          {prodResults.map(p => (
            <button key={p.sku} onMouseDown={() => addProduct(p)} style={{
              width: '100%', padding: '9px 14px', background: 'none', border: 'none',
              cursor: 'pointer', textAlign: 'left', fontSize: 13,
              borderBottom: '1px solid var(--border-light)',
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            }}>
              <span>
                <span style={{ color: 'var(--text-muted)', marginRight: 6, fontSize: 11, fontFamily: 'monospace' }}>{p.sku}</span>
                {p.name}
              </span>
              {p.cost > 0 && (
                <span style={{ color: 'var(--text-secondary)', fontSize: 12, flexShrink: 0, marginLeft: 12 }}>{p.cost} ₴</span>
              )}
            </button>
          ))}
        </div>
      )}
    </>
  );
}
