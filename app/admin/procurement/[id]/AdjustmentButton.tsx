'use client';

import { useState } from 'react';
import { Edit3, X, Loader2, Check } from 'lucide-react';

type POLine = { sku: string; qty: number; cost_price: number };

export default function AdjustmentButton({ poId, lines }: { poId: string; lines: POLine[] }) {
  const [open,    setOpen]    = useState(false);
  const [reason,  setReason]  = useState('');
  const [newQtys, setNewQtys] = useState<Record<string, number>>(() => {
    const init: Record<string, number> = {};
    lines.forEach(l => { init[l.sku] = l.qty; });
    return init;
  });
  const [saving, setSaving] = useState(false);
  const [error,  setError]  = useState('');
  const [done,   setDone]   = useState('');

  const changed = lines.filter(l => newQtys[l.sku] !== l.qty);

  async function handleSave() {
    if (!reason.trim()) { setError('Вкажіть причину коригування'); return; }
    if (!changed.length) { setError('Жодного рядка не змінено'); return; }
    setSaving(true); setError('');
    try {
      const res = await fetch(`/api/admin/procurement/${poId}/adjust`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          reason: reason.trim(),
          lines: changed.map(l => ({ sku: l.sku, original_qty: l.qty, new_qty: newQtys[l.sku], original_price: l.cost_price })),
        }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? 'Помилка'); return; }
      setDone(`✅ Коригування ${data.doc_number} проведено`);
      setTimeout(() => { setOpen(false); setDone(''); }, 2000);
    } catch { setError('Мережева помилка'); }
    finally { setSaving(false); }
  }

  const inp: React.CSSProperties = { height: '32px', padding: '0 8px', border: '1.5px solid var(--border)', borderRadius: '6px', fontSize: '12px', outline: 'none', color: 'var(--text-primary)', background: 'var(--bg-soft)', width: '80px', textAlign: 'right' };

  return (
    <>
      <button onClick={() => setOpen(true)}
        style={{ display: 'flex', alignItems: 'center', gap: '6px', height: '34px', padding: '0 14px', borderRadius: '8px', border: '1.5px solid #7C3AED', background: '#F5F3FF', color: '#7C3AED', fontSize: '12px', fontWeight: 700, cursor: 'pointer' }}>
        <Edit3 size={13} /> Коригування
      </button>

      {open && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.55)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}
          onClick={e => { if (e.target === e.currentTarget) setOpen(false); }}>
          <div style={{ background: 'var(--bg-card)', borderRadius: '16px', width: '100%', maxWidth: '560px', maxHeight: '85vh', display: 'flex', flexDirection: 'column', boxShadow: '0 24px 80px rgba(0,0,0,0.22)' }}>
            <div style={{ padding: '18px 24px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ fontSize: '16px', fontWeight: 800, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Edit3 size={18} color="#7C3AED" /> Коригування замовлення
              </div>
              <button onClick={() => setOpen(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex' }}><X size={20} /></button>
            </div>

            <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div style={{ padding: '10px 14px', background: '#F5F3FF', borderRadius: '8px', fontSize: '13px', color: '#7C3AED' }}>
                ⚠ Підтверджений PO не можна редагувати. Коригування створює окремий документ (P6).
              </div>

              <div>
                <label style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', display: 'block', marginBottom: '4px', textTransform: 'uppercase' }}>Причина коригування *</label>
                <input style={{ ...inp, width: '100%', textAlign: 'left', height: '36px' }} value={reason}
                  onChange={e => setReason(e.target.value)} placeholder="Постачальник підтвердив 8 з 10 шт." />
              </div>

              <div>
                <div style={{ display: 'grid', gridTemplateColumns: '110px 1fr 90px 90px', fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', columnGap: '12px', marginBottom: '6px' }}>
                  <span>Артикул</span><span>Ціна</span><span style={{ textAlign: 'right' }}>Замовлено</span><span style={{ textAlign: 'right' }}>Нова к-сть</span>
                </div>
                {lines.map(line => {
                  const changed = newQtys[line.sku] !== line.qty;
                  return (
                    <div key={line.sku} style={{ display: 'grid', gridTemplateColumns: '110px 1fr 90px 90px', alignItems: 'center', columnGap: '12px', padding: '7px 0', borderTop: '1px solid var(--border-light)' }}>
                      <span style={{ fontFamily: 'monospace', fontSize: '11px', color: 'var(--text-muted)' }}>{line.sku}</span>
                      <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>{line.cost_price} ₴/шт</span>
                      <span style={{ textAlign: 'right', fontSize: '12px', color: 'var(--text-secondary)' }}>{line.qty} шт</span>
                      <input style={{ ...inp, borderColor: changed ? '#7C3AED' : undefined, background: changed ? '#F5F3FF' : undefined }}
                        type="number" min="0" value={newQtys[line.sku] ?? line.qty}
                        onChange={e => setNewQtys(prev => ({ ...prev, [line.sku]: parseInt(e.target.value) || 0 }))} />
                    </div>
                  );
                })}
              </div>

              {changed.length > 0 && (
                <div style={{ padding: '10px 14px', background: 'var(--bg-soft)', borderRadius: '8px', fontSize: '12px', color: 'var(--text-secondary)' }}>
                  Змінено {changed.length} позицій: {changed.map(l => `${l.sku} (${l.qty}→${newQtys[l.sku]})`).join(', ')}
                </div>
              )}

              {done && <div style={{ padding: '10px 14px', background: '#F0FDF4', borderRadius: '8px', fontSize: '13px', color: '#15803D', fontWeight: 600 }}>{done}</div>}
              {error && <div style={{ padding: '10px 14px', background: '#FEF2F2', borderRadius: '8px', fontSize: '13px', color: '#DC2626' }}>{error}</div>}
            </div>

            <div style={{ padding: '14px 24px', borderTop: '1px solid var(--border)', display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
              <button onClick={() => setOpen(false)} style={{ height: '36px', padding: '0 16px', borderRadius: '8px', border: '1.5px solid var(--border)', background: 'var(--bg-card)', fontSize: '13px', fontWeight: 600, cursor: 'pointer', color: 'var(--text-secondary)' }}>
                Скасувати
              </button>
              <button onClick={handleSave} disabled={saving || !changed.length}
                style={{ height: '36px', padding: '0 20px', borderRadius: '8px', border: 'none', background: '#7C3AED', color: '#fff', fontSize: '13px', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '7px', opacity: (!changed.length || saving) ? 0.5 : 1 }}>
                {saving ? <><Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} />Збереження...</> : <><Check size={14} />Зберегти коригування</>}
              </button>
            </div>
          </div>
        </div>
      )}
      <style>{`@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}`}</style>
    </>
  );
}
