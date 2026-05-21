'use client';

import { useState } from 'react';
import { Edit3, X, Loader2, Check, Trash2, Plus, Search } from 'lucide-react';

type POLine = { sku: string; qty: number; cost_price: number; name?: string; brand?: string };
type AdjLine = POLine & { isNew?: boolean; deleted?: boolean };

const inp: React.CSSProperties = {
  height: '30px', padding: '0 8px',
  border: '1.5px solid var(--border)', borderRadius: '6px',
  fontSize: '12px', outline: 'none',
  color: 'var(--text-primary)', background: 'var(--bg-card)',
  width: '80px', textAlign: 'right',
};

export default function AdjustmentButton({ poId, lines }: { poId: string; lines: POLine[] }) {
  const [open,    setOpen]    = useState(false);
  const [reason,  setReason]  = useState('');
  const [adjLines, setAdjLines] = useState<AdjLine[]>(() =>
    lines.map(l => ({ ...l }))
  );
  const [newSku,     setNewSku]     = useState('');
  const [newQty,     setNewQty]     = useState(1);
  const [newPrice,   setNewPrice]   = useState(0);
  const [saving,     setSaving]     = useState(false);
  const [error,      setError]      = useState('');
  const [done,       setDone]       = useState('');

  function updateQty(sku: string, val: number) {
    setAdjLines(prev => prev.map(l => l.sku === sku ? { ...l, qty: val } : l));
  }
  function toggleDelete(sku: string) {
    setAdjLines(prev => prev.map(l => l.sku === sku ? { ...l, deleted: !l.deleted, qty: l.deleted ? (lines.find(ol => ol.sku === sku)?.qty ?? 1) : 0 } : l));
  }
  function addLine() {
    if (!newSku.trim()) return;
    if (adjLines.find(l => l.sku === newSku.trim())) {
      setError('Цей артикул вже є в замовленні');
      return;
    }
    setAdjLines(prev => [...prev, { sku: newSku.trim(), qty: newQty, cost_price: newPrice, isNew: true }]);
    setNewSku(''); setNewQty(1); setNewPrice(0);
  }

  const changed = adjLines.filter(l => {
    const orig = lines.find(o => o.sku === l.sku);
    if (l.isNew)    return true;
    if (l.deleted)  return true;
    return orig && l.qty !== orig.qty;
  });

  async function handleSave() {
    if (!reason.trim()) { setError('Вкажіть причину коригування'); return; }
    if (!changed.length) { setError('Жодних змін не виявлено'); return; }
    setSaving(true); setError('');
    try {
      const res = await fetch(`/api/admin/procurement/${poId}/adjust`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          reason: reason.trim(),
          lines: changed.map(l => {
            const orig = lines.find(o => o.sku === l.sku);
            return {
              sku:            l.sku,
              original_qty:   orig?.qty ?? 0,
              new_qty:        l.qty,
              original_price: orig?.cost_price ?? l.cost_price,
              is_new:         l.isNew ?? false,
              is_deleted:     l.deleted ?? false,
            };
          }),
        }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? 'Помилка'); return; }
      setDone(`✅ Коригування ${data.doc_number} проведено`);
      setTimeout(() => { setOpen(false); setDone(''); }, 2000);
    } catch { setError('Мережева помилка'); }
    finally { setSaving(false); }
  }

  return (
    <>
      <button onClick={() => setOpen(true)}
        style={{ display: 'flex', alignItems: 'center', gap: '6px', height: '34px', padding: '0 14px', borderRadius: '8px', border: '1.5px solid #7C3AED', background: '#F5F3FF', color: '#7C3AED', fontSize: '12px', fontWeight: 700, cursor: 'pointer' }}>
        <Edit3 size={13} /> Коригування
      </button>

      {open && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.65)', zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}
          onClick={e => { if (e.target === e.currentTarget) setOpen(false); }}>
          <div style={{ background: 'var(--bg-card)', borderRadius: '16px', width: '100%', maxWidth: '680px', maxHeight: '90vh', display: 'flex', flexDirection: 'column', boxShadow: '0 24px 80px rgba(0,0,0,0.35)' }}>

            {/* Header */}
            <div style={{ padding: '18px 24px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
              <div style={{ fontSize: '16px', fontWeight: 800, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Edit3 size={18} color="#7C3AED" /> Коригування замовлення
              </div>
              <button onClick={() => setOpen(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex' }}><X size={20} /></button>
            </div>

            {/* Body */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div style={{ padding: '10px 14px', background: 'var(--bg-soft)', borderRadius: '8px', fontSize: '12px', color: 'var(--text-muted)', borderLeft: '3px solid #7C3AED' }}>
                Підтверджений PO не можна редагувати напряму. Коригування створює окремий документ.
              </div>

              {/* Причина */}
              <div>
                <label style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', display: 'block', marginBottom: '4px', textTransform: 'uppercase' }}>
                  Причина коригування *
                </label>
                <input style={{ ...inp, width: '100%', textAlign: 'left', height: '36px' }}
                  value={reason} onChange={e => setReason(e.target.value)}
                  placeholder="Постачальник підтвердив 8 з 10 шт." />
              </div>

              {/* Таблиця позицій */}
              <div>
                <div style={{ display: 'grid', gridTemplateColumns: '100px 1fr 70px 80px 32px', fontSize: '10px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', columnGap: '10px', marginBottom: '6px', padding: '0 4px' }}>
                  <span>Артикул</span>
                  <span>Назва</span>
                  <span style={{ textAlign: 'right' }}>Замовлено</span>
                  <span style={{ textAlign: 'right' }}>Нова к-сть</span>
                  <span />
                </div>

                {adjLines.map(line => {
                  const orig = lines.find(o => o.sku === line.sku);
                  const isChanged = line.isNew || line.deleted || (orig && line.qty !== orig.qty);
                  return (
                    <div key={line.sku} style={{
                      display: 'grid', gridTemplateColumns: '100px 1fr 70px 80px 32px',
                      alignItems: 'center', columnGap: '10px', padding: '7px 4px',
                      borderTop: '1px solid var(--border-light)',
                      opacity: line.deleted ? 0.4 : 1,
                      background: isChanged ? (line.deleted ? 'rgba(239,68,68,0.05)' : line.isNew ? 'rgba(21,128,61,0.05)' : 'rgba(124,58,237,0.05)') : 'transparent',
                      borderRadius: '6px',
                    }}>
                      <span style={{ fontFamily: 'monospace', fontSize: '11px', color: 'var(--text-muted)' }}>
                        {line.isNew && <span style={{ color: '#15803D', marginRight: '3px' }}>+</span>}
                        {line.sku}
                      </span>
                      <div style={{ overflow: 'hidden', minWidth: 0 }}>
                        <div style={{ fontSize: '12px', color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {line.brand && <span style={{ color: 'var(--text-muted)', marginRight: '4px' }}>{line.brand}</span>}
                          {line.name || line.sku}
                        </div>
                        {line.cost_price > 0 && <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>{line.cost_price} ₴/шт</div>}
                      </div>
                      <span style={{ textAlign: 'right', fontSize: '12px', color: 'var(--text-secondary)' }}>
                        {line.isNew ? '—' : `${orig?.qty ?? 0} шт`}
                      </span>
                      <input
                        style={{ ...inp, borderColor: isChanged ? '#7C3AED' : undefined, background: line.deleted ? 'var(--bg-soft)' : 'var(--bg-card)' }}
                        type="number" min="0"
                        value={line.qty}
                        disabled={line.deleted}
                        onChange={e => updateQty(line.sku, parseInt(e.target.value) || 0)}
                      />
                      <button onClick={() => toggleDelete(line.sku)}
                        title={line.deleted ? 'Відновити' : 'Видалити позицію'}
                        style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '28px', height: '28px', borderRadius: '6px', border: `1px solid ${line.deleted ? '#15803D' : '#FCA5A5'}`, background: 'none', cursor: 'pointer', color: line.deleted ? '#15803D' : '#EF4444', flexShrink: 0 }}>
                        {line.deleted ? <Plus size={12} /> : <Trash2 size={12} />}
                      </button>
                    </div>
                  );
                })}

                {/* Додати нову позицію */}
                <div style={{ marginTop: '10px', padding: '10px', background: 'var(--bg-soft)', borderRadius: '8px' }}>
                  <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '8px' }}>
                    + Додати позицію
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 70px 80px auto', gap: '8px', alignItems: 'center' }}>
                    <input style={{ ...inp, width: '100%', textAlign: 'left' }}
                      placeholder="Артикул (SKU)" value={newSku}
                      onChange={e => setNewSku(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && addLine()} />
                    <input style={inp} type="number" min="1" placeholder="К-сть" value={newQty || ''}
                      onChange={e => setNewQty(parseInt(e.target.value) || 0)} />
                    <input style={inp} type="number" min="0" step="0.01" placeholder="Ціна ₴" value={newPrice || ''}
                      onChange={e => setNewPrice(parseFloat(e.target.value) || 0)} />
                    <button onClick={addLine} disabled={!newSku.trim()}
                      style={{ display: 'flex', alignItems: 'center', gap: '4px', height: '30px', padding: '0 12px', borderRadius: '6px', border: 'none', background: newSku.trim() ? '#1E3A5F' : '#E2E8F0', color: newSku.trim() ? '#fff' : '#94A3B8', fontSize: '12px', fontWeight: 700, cursor: newSku.trim() ? 'pointer' : 'not-allowed', whiteSpace: 'nowrap' }}>
                      <Plus size={12} /> Додати
                    </button>
                  </div>
                </div>
              </div>

              {/* Підсумок змін */}
              {changed.length > 0 && (
                <div style={{ padding: '10px 14px', background: 'var(--bg-soft)', borderRadius: '8px', fontSize: '12px', color: 'var(--text-secondary)' }}>
                  Зміни: {changed.map(l => {
                    const orig = lines.find(o => o.sku === l.sku);
                    if (l.isNew)   return `+${l.sku} (${l.qty} шт)`;
                    if (l.deleted) return `-${l.sku}`;
                    return `${l.sku}: ${orig?.qty}→${l.qty}`;
                  }).join(' · ')}
                </div>
              )}

              {done  && <div style={{ padding: '10px 14px', background: '#F0FDF4', borderRadius: '8px', fontSize: '13px', color: '#15803D', fontWeight: 600 }}>{done}</div>}
              {error && <div style={{ padding: '10px 14px', background: '#FEF2F2', borderRadius: '8px', fontSize: '13px', color: '#DC2626' }}>{error}</div>}
            </div>

            {/* Footer */}
            <div style={{ padding: '14px 24px', borderTop: '1px solid var(--border)', display: 'flex', gap: '8px', justifyContent: 'flex-end', flexShrink: 0 }}>
              <button onClick={() => setOpen(false)}
                style={{ height: '36px', padding: '0 16px', borderRadius: '8px', border: '1.5px solid var(--border)', background: 'none', fontSize: '13px', fontWeight: 600, cursor: 'pointer', color: 'var(--text-secondary)' }}>
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
