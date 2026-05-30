'use client';

import { useState } from 'react';
import { Plus, X, Loader2, Package, Trash2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { showToast } from '../../../../lib/toast';

type RemainingLine = {
  sku: string; name: string; ordered_qty: number; received_qty: number;
  remaining_qty: number; cost_price: number;
  supplier_id: number | null; warehouse_id: number | null;
};

type ExtraLine = { sku: string; name: string; qty: number; cost_price: number };

function fmt(n: number) { return n.toLocaleString('uk-UA', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }

const inp: React.CSSProperties = {
  height: '32px', padding: '0 8px', border: '1.5px solid var(--border)',
  borderRadius: '6px', fontSize: '12px', outline: 'none',
  color: 'var(--text-primary)', background: 'var(--bg-soft)', boxSizing: 'border-box',
};

export default function AdditionalReceiptButton({ poId, supplierName }: { poId: string; supplierName: string | null }) {
  const router = useRouter();
  const [open,      setOpen]      = useState(false);
  const [loading,   setLoading]   = useState(false);
  const [saving,    setSaving]    = useState(false);
  const [remaining, setRemaining] = useState<RemainingLine[]>([]);
  const [qtys,      setQtys]      = useState<Record<string, number>>({});
  const [notes,     setNotes]     = useState('Додатковий прихід');
  const [extras,    setExtras]    = useState<ExtraLine[]>([]);
  const [defaultSupplierId,  setDefaultSupplierId]  = useState<number | null>(null);
  const [defaultWarehouseId, setDefaultWarehouseId] = useState<number | null>(null);

  async function handleOpen() {
    setOpen(true); setLoading(true); setExtras([]);
    try {
      const res  = await fetch(`/api/admin/procurement/${poId}/remaining`);
      const data = await res.json();
      const lines: RemainingLine[] = data.remaining ?? [];
      setRemaining(lines);
      setDefaultSupplierId(data.defaultSupplierId ?? null);
      setDefaultWarehouseId(data.defaultWarehouseId ?? null);
      const initial: Record<string, number> = {};
      lines.forEach(l => { initial[l.sku] = l.remaining_qty; });
      setQtys(initial);
    } catch { showToast('Помилка завантаження', 'error'); }
    finally { setLoading(false); }
  }

  function addExtra() {
    setExtras(prev => [...prev, { sku: '', name: '', qty: 1, cost_price: 0 }]);
  }
  function setExtraField<K extends keyof ExtraLine>(i: number, k: K, v: ExtraLine[K]) {
    setExtras(prev => prev.map((e, idx) => idx === i ? { ...e, [k]: v } : e));
  }

  function removeLine(sku: string) {
    setRemaining(prev => prev.filter(l => l.sku !== sku));
    setQtys(prev => { const n = { ...prev }; delete n[sku]; return n; });
  }

  async function handleCreate(draft: boolean) {
    const poLines = remaining
      .filter(l => (qtys[l.sku] ?? 0) > 0)
      .map(l => ({ sku: l.sku, qty: qtys[l.sku], cost_price: l.cost_price,
                   supplier_id: l.supplier_id, warehouse_id: l.warehouse_id }));

    const extraLines = extras
      .filter(e => e.sku.trim() && e.qty > 0)
      .map(e => ({ sku: e.sku.trim(), qty: e.qty, cost_price: e.cost_price,
                   supplier_id: defaultSupplierId, warehouse_id: defaultWarehouseId }));

    const allLines = [...poLines, ...extraLines];
    if (!allLines.length) { showToast('Вкажіть кількість для хоча б одного товару', 'error'); return; }

    setSaving(true);
    try {
      const res = await fetch('/api/admin/procurement', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          supplier_id:   allLines[0].supplier_id,
          parent_doc_id: poId,
          notes,
          is_receipt:    true,
          draft,
          lines: allLines.map(l => ({ sku: l.sku, qty: l.qty, cost_price: l.cost_price })),
        }),
      });
      const data = await res.json();
      if (!res.ok) { showToast(data.error ?? 'Помилка', 'error'); return; }
      setOpen(false);
      router.push(`/admin/procurement/receipts/${data.receiptId ?? data.id}`);
      router.refresh();
    } catch { showToast('Мережева помилка', 'error'); }
    finally { setSaving(false); }
  }

  const COLS = '110px 1fr 100px 70px 70px 90px 28px';

  return (
    <>
      <button onClick={handleOpen}
        style={{ display: 'flex', alignItems: 'center', gap: '6px', height: '34px', padding: '0 14px', borderRadius: '8px', border: '1.5px solid #15803D', background: '#F0FDF4', color: '#15803D', fontSize: '12px', fontWeight: 700, cursor: 'pointer' }}>
        <Plus size={14} /> Додатковий прихід
      </button>

      {open && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.55)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}
          onClick={e => { if (e.target === e.currentTarget) setOpen(false); }}>
          <div style={{ background: 'var(--bg-card)', borderRadius: '16px', width: '100%', maxWidth: '900px', maxHeight: '88vh', display: 'flex', flexDirection: 'column', boxShadow: '0 24px 80px rgba(0,0,0,0.22)' }}>

            {/* Header */}
            <div style={{ padding: '18px 24px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ fontSize: '16px', fontWeight: 800, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Package size={18} color="#15803D" /> Додатковий прихід
                {supplierName && <span style={{ fontSize: '13px', fontWeight: 500, color: 'var(--text-muted)' }}>· {supplierName}</span>}
              </div>
              <button onClick={() => setOpen(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex' }}><X size={20} /></button>
            </div>

            {/* Body */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px' }}>
              {loading && (
                <div style={{ color: 'var(--text-muted)', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> Завантаження...
                </div>
              )}

              {!loading && remaining.length === 0 && extras.length === 0 && (
                <div style={{ padding: '24px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '14px' }}>
                  ✅ Всі товари з цього замовлення вже отримано
                </div>
              )}

              {!loading && (remaining.length > 0 || extras.length > 0) && (
                <>
                  {remaining.length > 0 && (
                    <div style={{ padding: '10px 14px', background: '#EFF4FF', borderRadius: '8px', fontSize: '13px', color: '#1E3A5F', marginBottom: '14px' }}>
                      Відображено тільки товари яких не вистачає. Відкоригуйте кількість у полі «Залишок».
                    </div>
                  )}

                  {/* Table header */}
                  <div style={{ display: 'grid', gridTemplateColumns: COLS, fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', gap: '10px', padding: '4px 0 8px', borderBottom: '2px solid var(--border)' }}>
                    <span>Артикул</span>
                    <span>Найменування</span>
                    <span style={{ textAlign: 'right' }}>Ціна закупки</span>
                    <span style={{ textAlign: 'right' }}>Замовл.</span>
                    <span style={{ textAlign: 'right' }}>Отримано</span>
                    <span style={{ textAlign: 'right' }}>Залишок ↓</span>
                    <span />
                  </div>

                  {/* Existing PO lines */}
                  {remaining.map(line => (
                    <div key={line.sku} style={{ display: 'grid', gridTemplateColumns: COLS, alignItems: 'center', gap: '10px', padding: '8px 0', borderBottom: '1px solid var(--border-light)' }}>
                      <span style={{ fontFamily: 'monospace', fontSize: '11px', color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{line.sku}</span>
                      <span style={{ fontSize: '12px', color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={line.name}>{line.name || '—'}</span>
                      <span style={{ textAlign: 'right', fontSize: '12px', color: 'var(--text-secondary)' }}>{fmt(line.cost_price)} ₴</span>
                      <span style={{ textAlign: 'right', fontSize: '12px', color: 'var(--text-muted)' }}>{line.ordered_qty}</span>
                      <span style={{ textAlign: 'right', fontSize: '12px', color: '#B45309', fontWeight: 600 }}>{line.received_qty}</span>
                      <input style={{ ...inp, width: '80px', marginLeft: 'auto', textAlign: 'right' }}
                        type="number" min="0" max={line.remaining_qty} step="1"
                        value={qtys[line.sku] ?? line.remaining_qty}
                        onChange={e => setQtys(prev => ({ ...prev, [line.sku]: parseInt(e.target.value) || 0 }))} />
                      <button onClick={() => removeLine(line.sku)} title="Прибрати позицію"
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#EF4444', display: 'flex', padding: 0, alignItems: 'center' }}>
                        <Trash2 size={14} />
                      </button>
                    </div>
                  ))}

                  {/* Extra lines (new products) */}
                  {extras.length > 0 && (
                    <>
                      <div style={{ fontSize: '11px', fontWeight: 700, color: '#7C3AED', textTransform: 'uppercase', margin: '14px 0 8px', letterSpacing: '0.04em' }}>
                        Додаткові позиції (не з замовлення)
                      </div>
                      {extras.map((e, i) => (
                        <div key={i} style={{ display: 'grid', gridTemplateColumns: '120px 1fr 110px 80px 28px', alignItems: 'center', gap: '8px', padding: '6px 0', borderBottom: '1px solid var(--border-light)' }}>
                          <input style={inp} placeholder="Артикул" value={e.sku}
                            onChange={ev => setExtraField(i, 'sku', ev.target.value)} />
                          <input style={inp} placeholder="Назва товару" value={e.name}
                            onChange={ev => setExtraField(i, 'name', ev.target.value)} />
                          <div style={{ position: 'relative' }}>
                            <input style={{ ...inp, paddingRight: '22px', width: '100%' }}
                              type="number" min="0" step="0.01" placeholder="0.00" value={e.cost_price || ''}
                              onChange={ev => setExtraField(i, 'cost_price', parseFloat(ev.target.value) || 0)} />
                            <span style={{ position: 'absolute', right: '7px', top: '50%', transform: 'translateY(-50%)', fontSize: '10px', color: 'var(--text-muted)', pointerEvents: 'none' }}>₴</span>
                          </div>
                          <input style={{ ...inp, textAlign: 'right' }}
                            type="number" min="1" step="1" placeholder="Кіл." value={e.qty || ''}
                            onChange={ev => setExtraField(i, 'qty', parseInt(ev.target.value) || 1)} />
                          <button onClick={() => setExtras(prev => prev.filter((_, idx) => idx !== i))}
                            style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#EF4444', display: 'flex', padding: 0 }}>
                            <Trash2 size={14} />
                          </button>
                        </div>
                      ))}
                    </>
                  )}

                  <button onClick={addExtra}
                    style={{ marginTop: '12px', fontSize: '12px', color: '#7C3AED', background: 'none', border: '1px dashed #DDD6FE', borderRadius: '7px', cursor: 'pointer', fontWeight: 600, padding: '6px 14px', display: 'flex', alignItems: 'center', gap: '5px' }}>
                    <Plus size={13} /> Додати позицію не з замовлення
                  </button>

                  <div style={{ marginTop: '14px' }}>
                    <label style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', display: 'block', marginBottom: '4px', textTransform: 'uppercase' }}>Примітка до приходу</label>
                    <input style={{ ...inp, width: '100%', textAlign: 'left' }} value={notes} onChange={e => setNotes(e.target.value)} />
                  </div>

                </>
              )}
            </div>

            {/* Footer */}
            {(!loading) && (remaining.length > 0 || extras.length > 0) && (
              <div style={{ padding: '14px 24px', borderTop: '1px solid var(--border)', display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                <button onClick={() => setOpen(false)}
                  style={{ height: '36px', padding: '0 16px', borderRadius: '8px', border: '1.5px solid var(--border)', background: 'var(--bg-card)', fontSize: '13px', fontWeight: 600, cursor: 'pointer', color: 'var(--text-secondary)' }}>
                  Скасувати
                </button>
                <button onClick={() => handleCreate(true)} disabled={saving}
                  style={{ height: '36px', padding: '0 16px', borderRadius: '8px', border: '1.5px solid var(--border)', background: 'var(--bg-card)', fontSize: '13px', fontWeight: 600, cursor: 'pointer', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '6px', opacity: saving ? 0.6 : 1 }}>
                  💾 Чернетка
                </button>
                <button onClick={() => handleCreate(false)} disabled={saving}
                  style={{ height: '36px', padding: '0 20px', borderRadius: '8px', border: 'none', background: '#15803D', color: '#fff', fontSize: '13px', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '7px', opacity: saving ? 0.7 : 1 }}>
                  {saving ? <><Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} />Створення...</> : <><Package size={14} />Провести прихід</>}
                </button>
              </div>
            )}
          </div>
        </div>
      )}
      <style>{`@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}`}</style>
    </>
  );
}
