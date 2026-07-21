'use client';

import { useState } from 'react';
import { RotateCcw, X, Loader2, AlertCircle } from 'lucide-react';

type ReceiptLine = { sku: string; qty: number; cost_price: number; name?: string };

export default function ReturnButton({
  receiptId, lines, renderTrigger, open: externalOpen, onClose,
}: {
  receiptId: string;
  lines: ReceiptLine[];
  renderTrigger?: (onClick: () => void) => React.ReactNode;
  open?: boolean;
  onClose?: () => void;
}) {
  const [internalOpen, setInternalOpen] = useState(false);
  const open    = externalOpen !== undefined ? externalOpen : internalOpen;
  const setOpen = externalOpen !== undefined
    ? (v: boolean | ((prev: boolean) => boolean)) => {
        const next = typeof v === 'function' ? v(open) : v;
        if (!next) onClose?.();
      }
    : setInternalOpen;
  const [reason,  setReason]  = useState('');
  const [qtys,    setQtys]    = useState<Record<string, number>>({});
  const [saving,  setSaving]  = useState(false);
  const [error,   setError]   = useState('');
  const [done,    setDone]    = useState('');

  const toReturn = lines.filter(l => (qtys[l.sku] ?? 0) > 0);
  const totalAmt = toReturn.reduce((s, l) => s + (qtys[l.sku] ?? 0) * l.cost_price, 0);

  async function handleReturn() {
    if (!reason.trim()) { setError('Вкажіть причину повернення'); return; }
    if (!toReturn.length) { setError('Вкажіть кількість для повернення'); return; }
    setSaving(true); setError('');
    try {
      const res = await fetch(`/api/admin/procurement/${receiptId}/return`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          reason: reason.trim(),
          lines: toReturn.map(l => ({ sku: l.sku, qty: qtys[l.sku], cost_price: l.cost_price })),
        }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? 'Помилка'); return; }
      setDone(`✅ Повернення ${data.doc_number} проведено. Залишки зменшено.`);
      setTimeout(() => { setOpen(false); setDone(''); }, 2500);
    } catch { setError('Мережева помилка'); }
    finally { setSaving(false); }
  }

  const inp: React.CSSProperties = { height: '32px', padding: '0 8px', border: '1.5px solid var(--border)', borderRadius: '6px', fontSize: '12px', outline: 'none', color: 'var(--text-primary)', background: 'var(--bg-soft)', width: '80px', textAlign: 'right' };

  return (
    <>
      {renderTrigger
        ? renderTrigger(() => setOpen(true))
        : externalOpen === undefined && (
          <button onClick={() => setInternalOpen(true)}
            style={{ display: 'flex', alignItems: 'center', gap: '6px', height: '34px', padding: '0 14px', borderRadius: '8px', border: '1.5px solid #DC2626', background: '#FEF2F2', color: '#DC2626', fontSize: '12px', fontWeight: 700, cursor: 'pointer' }}>
            <RotateCcw size={13} /> Повернення
          </button>
        )
      }

      {open && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.55)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}>
          <div style={{ background: 'var(--bg-card)', borderRadius: '16px', width: '100%', maxWidth: '560px', maxHeight: '85vh', display: 'flex', flexDirection: 'column', boxShadow: '0 24px 80px rgba(0,0,0,0.22)' }}>

            <div style={{ padding: '18px 24px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ fontSize: '16px', fontWeight: 800, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <RotateCcw size={18} color="#DC2626" /> Повернення постачальнику
              </div>
              <button onClick={() => setOpen(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex' }}><X size={20} /></button>
            </div>

            <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div style={{ padding: '10px 14px', background: '#FEF2F2', borderRadius: '8px', fontSize: '12px', color: '#DC2626', display: 'flex', gap: '6px' }}>
                <AlertCircle size={14} style={{ flexShrink: 0, marginTop: '1px' }} />
                Товар буде знято зі складу. Кредиторська заборгованість перед постачальником зменшиться.
              </div>

              <div>
                <label style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', display: 'block', marginBottom: '4px', textTransform: 'uppercase' }}>Причина повернення *</label>
                <input style={{ ...inp, width: '100%', textAlign: 'left', height: '36px' }} value={reason}
                  onChange={e => setReason(e.target.value)} placeholder="Бракований товар / пересортиця / надлишок" />
              </div>

              <div>
                <div style={{ display: 'grid', gridTemplateColumns: '110px minmax(0,1fr) 80px 90px', fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', columnGap: '12px', marginBottom: '6px' }}>
                  <span>Артикул</span><span>Назва</span><span style={{ textAlign: 'right' }}>Є на складі</span><span style={{ textAlign: 'right' }}>Повернути</span>
                </div>
                {lines.map(line => (
                  <div key={line.sku} style={{ display: 'grid', gridTemplateColumns: '110px minmax(0,1fr) 80px 90px', alignItems: 'center', columnGap: '12px', padding: '7px 0', borderTop: '1px solid var(--border-light)' }}>
                    <span style={{ fontFamily: 'monospace', fontSize: '11px', color: 'var(--text-muted)' }}>{line.sku}</span>
                    <div style={{ overflow: 'hidden', minWidth: 0 }}>
                      <div style={{ fontSize: '12px', color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{line.name || line.sku}</div>
                      <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>{line.cost_price} ₴/шт</div>
                    </div>
                    <span style={{ textAlign: 'right', fontSize: '12px', color: 'var(--text-secondary)' }}>{line.qty} шт</span>
                    <input style={{ ...inp, borderColor: (qtys[line.sku] ?? 0) > 0 ? '#DC2626' : undefined }}
                      type="number" min="0" max={line.qty} step="1" placeholder="0"
                      value={qtys[line.sku] ?? ''}
                      onChange={e => setQtys(prev => ({ ...prev, [line.sku]: parseInt(e.target.value) || 0 }))} />
                  </div>
                ))}
              </div>

              {toReturn.length > 0 && (
                <div style={{ padding: '10px 14px', background: '#FEF2F2', borderRadius: '8px', fontSize: '13px', fontWeight: 600, display: 'flex', justifyContent: 'space-between', color: '#DC2626' }}>
                  <span>Сума повернення:</span>
                  <span>{totalAmt.toLocaleString('uk-UA', { minimumFractionDigits: 2 })} ₴</span>
                </div>
              )}

              {done  && <div style={{ padding: '10px 14px', background: '#F0FDF4', borderRadius: '8px', fontSize: '13px', color: '#15803D', fontWeight: 600 }}>{done}</div>}
              {error && <div style={{ padding: '10px 14px', background: '#FEF2F2', borderRadius: '8px', fontSize: '13px', color: '#DC2626' }}>{error}</div>}
            </div>

            <div style={{ padding: '14px 24px', borderTop: '1px solid var(--border)', display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
              <button onClick={() => setOpen(false)} style={{ height: '36px', padding: '0 16px', borderRadius: '8px', border: '1.5px solid var(--border)', background: 'var(--bg-card)', fontSize: '13px', fontWeight: 600, cursor: 'pointer', color: 'var(--text-secondary)' }}>
                Скасувати
              </button>
              <button onClick={handleReturn} disabled={saving || !toReturn.length}
                style={{ height: '36px', padding: '0 20px', borderRadius: '8px', border: 'none', background: '#DC2626', color: '#fff', fontSize: '13px', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '7px', opacity: (!toReturn.length || saving) ? 0.5 : 1 }}>
                {saving ? <><Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} />Проведення...</> : `↩ Провести повернення (${toReturn.length} SKU)`}
              </button>
            </div>
          </div>
        </div>
      )}
      <style>{`@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}`}</style>
    </>
  );
}
