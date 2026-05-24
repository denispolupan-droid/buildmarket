'use client';

import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Trash2, Search, ChevronLeft, Send } from 'lucide-react';
import { getSupabaseBrowser } from '../../../../../lib/supabase-browser';

type Warehouse = { id: number; name: string; warehouse_type: string };
type Supplier  = { id: number; name: string };
type DocType   = { code: string; name: string; direction: string };
type LineItem  = { sku: string; name: string; qty: number; price: number; cost_price: number };

const inputStyle = {
  height: '36px', padding: '0 10px', borderRadius: '8px', fontSize: '13px',
  border: '1.5px solid var(--border)', background: 'var(--bg-soft)',
  color: 'var(--text-primary)', outline: 'none', width: '100%', boxSizing: 'border-box' as const,
};
const labelStyle = { fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '6px', display: 'block' as const };

export default function NewDocumentClient({
  warehouses, suppliers, docTypes, initialType,
}: {
  warehouses:  Warehouse[];
  suppliers:   Supplier[];
  docTypes:    DocType[];
  initialType?: string;
}) {
  const router = useRouter();

  const defaultWarehouse = warehouses.find(w => w.warehouse_type === 'physical') ?? warehouses[0];

  const resolvedInitial = initialType && docTypes.find(t => t.code === initialType) ? initialType : (docTypes[0]?.code ?? 'receipt');
  const [docType,      setDocType]      = useState(resolvedInitial);
  const [warehouseId,  setWarehouseId]  = useState(defaultWarehouse?.id ?? 0);
  const [supplierId,   setSupplierId]   = useState<number | ''>('');
  const [notes,        setNotes]        = useState('');
  const [lines,        setLines]        = useState<LineItem[]>([]);
  const [saving,       setSaving]       = useState(false);
  const [error,        setError]        = useState<string | null>(null);

  const [prodSearch,   setProdSearch]   = useState('');
  const [prodResults,  setProdResults]  = useState<{sku:string;name:string;brand:string;price:number;cost:number}[]>([]);
  const [prodOpen,     setProdOpen]     = useState(false);
  const prodRef = useRef<HTMLDivElement>(null);

  const currentType = docTypes.find(t => t.code === docType);
  const isIncoming  = currentType?.direction === 'in'   || currentType?.direction === 'both';
  const isOutgoing  = currentType?.direction === 'out'  || currentType?.direction === 'both';
  const needsSupplier = ['receipt', 'purchase_order', 'return_out'].includes(docType);

  // Product search
  useEffect(() => {
    if (prodSearch.length < 2) { setProdResults([]); return; }
    const t = setTimeout(async () => {
      const sb = getSupabaseBrowser();
      const { data } = await sb
        .from('products')
        .select('sku, name, brand, stock:product_stock(price_unit, price_cost)')
        .or(`name.ilike.%${prodSearch}%,sku.ilike.%${prodSearch}%`)
        .limit(8);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      setProdResults((data ?? []).map((p: any) => ({
        sku: p.sku, name: `${p.brand} ${p.name}`,
        price: p.stock?.[0]?.price_unit ?? 0,
        cost:  p.stock?.[0]?.price_cost ?? 0,
      })));
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

  function addProduct(p: typeof prodResults[0]) {
    setLines(prev => {
      const existing = prev.find(l => l.sku === p.sku);
      if (existing) return prev.map(l => l.sku === p.sku ? { ...l, qty: l.qty + 1 } : l);
      return [...prev, { sku: p.sku, name: p.name, qty: 1, price: p.price, cost_price: p.cost }];
    });
    setProdSearch('');
    setProdOpen(false);
  }

  function updateLine(sku: string, field: keyof LineItem, value: number) {
    setLines(prev => prev.map(l => l.sku === sku ? { ...l, [field]: value } : l));
  }

  function removeLine(sku: string) {
    setLines(prev => prev.filter(l => l.sku !== sku));
  }

  const totalAmount = lines.reduce((s, l) => s + l.qty * l.price, 0);
  const totalCost   = lines.reduce((s, l) => s + l.qty * l.cost_price, 0);
  const margin      = totalAmount - totalCost;

  async function handleSave(autoConfirm: boolean) {
    if (lines.length === 0) { setError('Додайте хоча б один товар'); return; }
    setSaving(true);
    setError(null);

    const res = await fetch('/api/admin/accounting/documents', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        doc_type:    docType,
        warehouse_id: warehouseId,
        supplier_id:  supplierId || undefined,
        notes:        notes || undefined,
        lines: lines.map(l => ({
          sku:        l.sku,
          qty:        l.qty,
          price:      l.price,
          cost_price: l.cost_price,
          fulfillment_type: 'own',
        })),
      }),
    });

    const data = await res.json();
    if (!res.ok) { setError(data.error ?? 'Помилка'); setSaving(false); return; }

    if (autoConfirm) {
      const res2 = await fetch('/api/admin/accounting/documents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'confirm', document_id: data.id }),
      });
      if (!res2.ok) {
        const d2 = await res2.json();
        setError(`Збережено як чернетку, але помилка проведення: ${d2.error}`);
        setSaving(false);
        return;
      }
    }

    router.push('/admin/accounting/documents');
  }

  return (
    <div style={{ padding: '28px 32px', maxWidth: '900px' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '28px' }}>
        <button
          onClick={() => router.back()}
          style={{ display: 'flex', alignItems: 'center', gap: '5px', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: '13px' }}
        >
          <ChevronLeft size={15} /> Назад
        </button>
        <h1 style={{ fontSize: '20px', fontWeight: 800, color: 'var(--text-primary)', margin: 0 }}>
          {initialType === 'receipt' || initialType === 'stock_in' ? 'Новий прихід товару' : 'Новий документ'}
        </h1>
      </div>

      {error && (
        <div style={{ marginBottom: '16px', padding: '10px 14px', borderRadius: '8px', background: '#FEE2E2', color: '#DC2626', fontSize: '13px' }}>
          {error}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '20px' }}>
        {/* Doc type — locked if initialType provided */}
        <div>
          <label style={labelStyle}>Тип документу</label>
          {initialType ? (
            <div style={{ ...inputStyle, display: 'flex', alignItems: 'center', background: 'var(--bg-soft)', color: 'var(--text-primary)', cursor: 'default', height: '36px' }}>
              {docTypes.find(t => t.code === initialType)?.name ?? initialType}
            </div>
          ) : (
            <select value={docType} onChange={e => setDocType(e.target.value)} style={inputStyle}>
              {docTypes.filter(t => t.code !== 'sale').map(t => (
                <option key={t.code} value={t.code}>{t.name}</option>
              ))}
            </select>
          )}
        </div>

        {/* Warehouse */}
        <div>
          <label style={labelStyle}>Склад</label>
          <select value={warehouseId} onChange={e => setWarehouseId(Number(e.target.value))} style={inputStyle}>
            {warehouses.filter(w => w.warehouse_type === 'physical').map(w => (
              <option key={w.id} value={w.id}>{w.name}</option>
            ))}
          </select>
        </div>

        {/* Supplier (conditional) */}
        {needsSupplier && (
          <div>
            <label style={labelStyle}>Постачальник</label>
            <select value={supplierId} onChange={e => setSupplierId(e.target.value ? Number(e.target.value) : '')} style={inputStyle}>
              <option value="">— Оберіть постачальника —</option>
              {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
        )}

        {/* Notes */}
        <div style={{ gridColumn: needsSupplier ? undefined : '1 / -1' }}>
          <label style={labelStyle}>Примітка</label>
          <input
            value={notes}
            onChange={e => setNotes(e.target.value)}
            placeholder="Необов'язково..."
            style={inputStyle}
          />
        </div>
      </div>

      {/* Product search */}
      <div style={{ marginBottom: '16px' }}>
        <label style={labelStyle}>Товари</label>
        <div ref={prodRef} style={{ position: 'relative' }}>
          <Search size={14} color="var(--text-muted)" style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)' }} />
          <input
            value={prodSearch}
            onChange={e => setProdSearch(e.target.value)}
            onFocus={() => prodResults.length > 0 && setProdOpen(true)}
            placeholder="Пошук за назвою або артикулом..."
            style={{ ...inputStyle, paddingLeft: '32px' }}
          />
          {prodOpen && prodResults.length > 0 && (
            <div style={{
              position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0, zIndex: 50,
              background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '10px',
              boxShadow: '0 8px 24px rgba(0,0,0,0.12)', maxHeight: '240px', overflowY: 'auto',
            }}>
              {prodResults.map(p => (
                <button
                  key={p.sku}
                  onMouseDown={() => addProduct(p)}
                  style={{
                    width: '100%', padding: '9px 14px', background: 'none', border: 'none',
                    cursor: 'pointer', textAlign: 'left', fontSize: '13px',
                    borderBottom: '1px solid var(--border-light)', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  }}
                >
                  <span style={{ color: 'var(--text-primary)' }}>
                    <span style={{ color: 'var(--text-muted)', marginRight: '6px', fontSize: '11px', fontFamily: 'monospace' }}>{p.sku}</span>
                    {p.name}
                  </span>
                  <span style={{ color: 'var(--text-secondary)', fontSize: '12px', flexShrink: 0, marginLeft: '12px' }}>
                    {p.price > 0 && `${p.price} ₴`}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Lines table */}
      {lines.length > 0 && (
        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '12px', overflow: 'hidden', marginBottom: '20px' }}>
          {/* Header */}
          <div style={{
            display: 'grid', gridTemplateColumns: '1fr 80px 100px 100px 36px',
            padding: '8px 14px', background: 'var(--bg-soft)',
            fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)',
            textTransform: 'uppercase', borderBottom: '1px solid var(--border)',
          }}>
            <span>Товар</span>
            <span style={{ textAlign: 'center' }}>Кількість</span>
            <span style={{ textAlign: 'right' }}>
              {isIncoming ? 'Ціна закупки' : 'Ціна продажу'}
            </span>
            <span style={{ textAlign: 'right' }}>
              {isIncoming ? 'Роздрібна' : 'Собівартість'}
            </span>
            <span />
          </div>

          {lines.map((line, idx) => (
            <div
              key={line.sku}
              style={{
                display: 'grid', gridTemplateColumns: '1fr 80px 100px 100px 36px',
                padding: '8px 14px', alignItems: 'center',
                borderBottom: idx < lines.length - 1 ? '1px solid var(--border-light)' : 'none',
              }}
            >
              <div>
                <div style={{ fontSize: '13px', color: 'var(--text-primary)', fontWeight: 500 }}>{line.name}</div>
                <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontFamily: 'monospace' }}>{line.sku}</div>
              </div>

              <input
                type="number" min={0.001} step={1} value={line.qty}
                onChange={e => updateLine(line.sku, 'qty', Math.max(0.001, parseFloat(e.target.value) || 1))}
                style={{ ...inputStyle, width: '70px', textAlign: 'center', margin: '0 auto' }}
              />

              <input
                type="number" min={0} step={0.01} value={isIncoming ? line.cost_price : line.price}
                onChange={e => updateLine(line.sku, isIncoming ? 'cost_price' : 'price', parseFloat(e.target.value) || 0)}
                style={{ ...inputStyle, textAlign: 'right' }}
              />

              <input
                type="number" min={0} step={0.01} value={isIncoming ? line.price : line.cost_price}
                onChange={e => updateLine(line.sku, isIncoming ? 'price' : 'cost_price', parseFloat(e.target.value) || 0)}
                style={{ ...inputStyle, textAlign: 'right' }}
              />

              <button
                onClick={() => removeLine(line.sku)}
                style={{ display: 'flex', justifyContent: 'center', background: 'none', border: 'none', cursor: 'pointer', color: '#EF4444', padding: '4px' }}
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))}

          {/* Totals */}
          <div style={{
            display: 'flex', justifyContent: 'flex-end', gap: '24px',
            padding: '10px 14px', background: 'var(--bg-soft)', borderTop: '1px solid var(--border)',
            fontSize: '13px',
          }}>
            <span style={{ color: 'var(--text-secondary)' }}>
              Собівартість: <strong style={{ color: 'var(--text-primary)' }}>{totalCost.toFixed(2)} ₴</strong>
            </span>
            <span style={{ color: 'var(--text-secondary)' }}>
              Сума: <strong style={{ color: 'var(--text-primary)' }}>{totalAmount.toFixed(2)} ₴</strong>
            </span>
            {totalAmount > 0 && totalCost > 0 && (
              <span style={{ color: margin >= 0 ? '#15803D' : '#DC2626', fontWeight: 700 }}>
                Маржа: {margin >= 0 ? '+' : ''}{margin.toFixed(2)} ₴
              </span>
            )}
          </div>
        </div>
      )}

      {/* Actions */}
      <div style={{ display: 'flex', gap: '10px' }}>
        <button
          onClick={() => handleSave(false)}
          disabled={saving || lines.length === 0}
          style={{
            height: '40px', padding: '0 20px', borderRadius: '9px', fontSize: '13px', fontWeight: 600,
            border: '1.5px solid var(--border)', background: 'var(--bg-card)',
            color: 'var(--text-secondary)', cursor: 'pointer',
            opacity: saving || lines.length === 0 ? 0.5 : 1,
          }}
        >
          Зберегти як чернетку
        </button>
        <button
          onClick={() => handleSave(true)}
          disabled={saving || lines.length === 0}
          style={{
            height: '40px', padding: '0 22px', borderRadius: '9px', fontSize: '13px', fontWeight: 700,
            border: 'none', background: '#1E3A5F', color: '#fff',
            cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '7px',
            opacity: saving || lines.length === 0 ? 0.5 : 1,
          }}
        >
          <Send size={14} />
          {saving ? 'Зберігаємо...' : 'Зберегти та провести'}
        </button>
      </div>
    </div>
  );
}
