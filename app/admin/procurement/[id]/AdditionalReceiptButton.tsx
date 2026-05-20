'use client';

import { useState } from 'react';
import { Plus, X, Loader2, Package } from 'lucide-react';
import { useRouter } from 'next/navigation';

type RemainingLine = {
  sku: string; ordered_qty: number; received_qty: number;
  remaining_qty: number; cost_price: number;
  supplier_id: number | null; warehouse_id: number | null;
};

function fmt(n: number) { return n.toLocaleString('uk-UA', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }

export default function AdditionalReceiptButton({ poId, supplierName }: { poId: string; supplierName: string | null }) {
  const router = useRouter();
  const [open,      setOpen]      = useState(false);
  const [loading,   setLoading]   = useState(false);
  const [saving,    setSaving]    = useState(false);
  const [remaining, setRemaining] = useState<RemainingLine[]>([]);
  const [qtys,      setQtys]      = useState<Record<string, number>>({});
  const [notes,     setNotes]     = useState('Додатковий прихід');
  const [error,     setError]     = useState('');

  async function handleOpen() {
    setOpen(true);
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`/api/admin/procurement/${poId}/remaining`);
      const data = await res.json();
      const lines: RemainingLine[] = data.remaining ?? [];
      setRemaining(lines);
      // Pre-fill with remaining quantities
      const initial: Record<string, number> = {};
      lines.forEach(l => { initial[l.sku] = l.remaining_qty; });
      setQtys(initial);
    } catch { setError('Помилка завантаження'); }
    finally { setLoading(false); }
  }

  async function handleCreate() {
    const lines = remaining.filter(l => (qtys[l.sku] ?? 0) > 0);
    if (!lines.length) { setError('Вкажіть кількість для хоча б одного товару'); return; }
    setSaving(true); setError('');
    try {
      const res = await fetch('/api/admin/procurement', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          supplier_id:  lines[0].supplier_id,
          parent_doc_id: poId,
          notes,
          is_receipt: true,  // create as receipt, not PO
          lines: lines.map(l => ({ sku: l.sku, qty: qtys[l.sku] ?? l.remaining_qty, cost_price: l.cost_price })),
        }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? 'Помилка'); return; }
      setOpen(false);
      router.push(`/admin/accounting/documents/${data.receiptId ?? data.id}`);
      router.refresh();
    } catch { setError('Мережева помилка'); }
    finally { setSaving(false); }
  }

  const inp: React.CSSProperties = { height: '32px', padding: '0 8px', border: '1.5px solid var(--border)', borderRadius: '6px', fontSize: '12px', outline: 'none', color: 'var(--text-primary)', background: 'var(--bg-soft)', width: '80px', textAlign: 'right' };

  return (
    <>
      <button onClick={handleOpen}
        style={{ display: 'flex', alignItems: 'center', gap: '6px', height: '34px', padding: '0 14px', borderRadius: '8px', border: '1.5px solid #15803D', background: '#F0FDF4', color: '#15803D', fontSize: '12px', fontWeight: 700, cursor: 'pointer' }}>
        <Plus size={14} /> Додатковий прихід
      </button>

      {open && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.55)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}
          onClick={e => { if (e.target === e.currentTarget) setOpen(false); }}>
          <div style={{ background: 'var(--bg-card)', borderRadius: '16px', width: '100%', maxWidth: '580px', maxHeight: '85vh', display: 'flex', flexDirection: 'column', boxShadow: '0 24px 80px rgba(0,0,0,0.22)' }}>

            <div style={{ padding: '18px 24px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ fontSize: '16px', fontWeight: 800, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Package size={18} color="#15803D" /> Додатковий прихід
              </div>
              <button onClick={() => setOpen(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex' }}><X size={20} /></button>
            </div>

            <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px' }}>
              {loading && <div style={{ color: 'var(--text-muted)', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '8px' }}><Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> Завантаження залишків...</div>}

              {!loading && remaining.length === 0 && (
                <div style={{ padding: '24px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '14px' }}>
                  ✅ Всі товари з цього замовлення вже отримано
                </div>
              )}

              {!loading && remaining.length > 0 && (
                <>
                  <div style={{ padding: '10px 14px', background: '#EFF4FF', borderRadius: '8px', fontSize: '13px', color: '#1E3A5F', marginBottom: '16px' }}>
                    Відображено тільки товари яких не вистачає. Відкоригуйте кількість якщо потрібно.
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '110px 1fr 80px 80px 80px', fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', columnGap: '12px', padding: '4px 0', marginBottom: '6px' }}>
                    <span>Артикул</span><span>Замовлено</span>
                    <span style={{ textAlign: 'right' }}>Замовл.</span>
                    <span style={{ textAlign: 'right' }}>Отримано</span>
                    <span style={{ textAlign: 'right' }}>Залишок</span>
                  </div>

                  {remaining.map(line => (
                    <div key={line.sku} style={{ display: 'grid', gridTemplateColumns: '110px 1fr 80px 80px 80px', alignItems: 'center', columnGap: '12px', padding: '8px 0', borderTop: '1px solid var(--border-light)' }}>
                      <span style={{ fontFamily: 'monospace', fontSize: '11px', color: 'var(--text-muted)' }}>{line.sku}</span>
                      <span style={{ fontSize: '12px', color: 'var(--text-primary)' }}>{fmt(line.cost_price)} ₴/шт</span>
                      <span style={{ textAlign: 'right', fontSize: '12px', color: 'var(--text-secondary)' }}>{line.ordered_qty} шт</span>
                      <span style={{ textAlign: 'right', fontSize: '12px', color: '#B45309' }}>{line.received_qty} шт</span>
                      <input style={inp} type="number" min="0" max={line.remaining_qty} step="1"
                        value={qtys[line.sku] ?? line.remaining_qty}
                        onChange={e => setQtys(prev => ({ ...prev, [line.sku]: parseInt(e.target.value) || 0 }))} />
                    </div>
                  ))}

                  <div style={{ marginTop: '16px' }}>
                    <label style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', display: 'block', marginBottom: '4px', textTransform: 'uppercase' }}>Примітка до приходу</label>
                    <input style={{ ...inp, width: '100%', textAlign: 'left' }} value={notes} onChange={e => setNotes(e.target.value)} />
                  </div>

                  {error && <div style={{ padding: '8px 12px', background: '#FEF2F2', borderRadius: '8px', color: '#DC2626', fontSize: '13px', marginTop: '12px' }}>{error}</div>}
                </>
              )}
            </div>

            {remaining.length > 0 && (
              <div style={{ padding: '14px 24px', borderTop: '1px solid var(--border)', display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                <button onClick={() => setOpen(false)} style={{ height: '36px', padding: '0 16px', borderRadius: '8px', border: '1.5px solid var(--border)', background: 'var(--bg-card)', fontSize: '13px', fontWeight: 600, cursor: 'pointer', color: 'var(--text-secondary)' }}>
                  Скасувати
                </button>
                <button onClick={handleCreate} disabled={saving}
                  style={{ height: '36px', padding: '0 20px', borderRadius: '8px', border: 'none', background: '#15803D', color: '#fff', fontSize: '13px', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '7px', opacity: saving ? 0.7 : 1 }}>
                  {saving ? <><Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} />Створення...</> : <><Package size={14} />Створити прихід</>}
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
