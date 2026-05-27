'use client';

import { useState } from 'react';
import { X, Loader2, Plus, Trash2 } from 'lucide-react';

const COST_TYPES = [
  { value: 'delivery',  label: '🚚 Доставка' },
  { value: 'loading',   label: '📦 Навантаж./розвантаж.' },
  { value: 'customs',   label: '🏛 Мито / митний збір' },
  { value: 'packaging', label: '📦 Пакування' },
  { value: 'broker',    label: '🏛 Брокер' },
  { value: 'other',     label: '➕ Інше' },
];

const METHODS = [
  { value: 'by_cost', label: 'Пропорційно до вартості товару' },
  { value: 'by_qty',  label: 'Пропорційно до кількості' },
  { value: 'equal',   label: 'Рівномірно по всіх позиціях' },
];

const PAYMENT_METHODS = [
  { value: 'cash', label: '💵 Готівка' },
  { value: 'bank', label: '🏦 Безготівковий' },
];

type CostLine = { cost_type: string; description: string; amount: string };

export default function ReceiptLandedCostButton({
  receiptId,
  renderTrigger,
}: {
  receiptId: string;
  renderTrigger?: (onClick: () => void) => React.ReactNode;
}) {
  const [open,          setOpen]          = useState(false);
  const [lines,         setLines]         = useState<CostLine[]>([{ cost_type: 'delivery', description: '', amount: '' }]);
  const [method,        setMethod]        = useState<'by_cost' | 'by_qty' | 'equal'>('by_cost');
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'bank'>('cash');
  const [saving,        setSaving]        = useState(false);
  const [error,         setError]         = useState('');
  const [done,          setDone]          = useState('');

  function addLine() {
    setLines(prev => [...prev, { cost_type: 'delivery', description: '', amount: '' }]);
  }
  function removeLine(i: number) {
    setLines(prev => prev.filter((_, idx) => idx !== i));
  }
  function updateLine(i: number, field: keyof CostLine, val: string) {
    setLines(prev => prev.map((l, idx) => idx === i ? { ...l, [field]: val } : l));
  }

  async function handleSave() {
    const costs = lines
      .map(l => ({ cost_type: l.cost_type, description: l.description || undefined, amount: parseFloat(l.amount) }))
      .filter(c => c.amount > 0);

    if (!costs.length) { setError('Вкажіть суму хоча б для однієї статті'); return; }

    setSaving(true); setError('');
    try {
      const res = await fetch(`/api/admin/receipts/${receiptId}/landed-cost`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ costs, method, paymentMethod }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? 'Помилка'); return; }
      setDone(`✅ Витрати розподілено. Собівартість оновлено.`);
      setTimeout(() => { setOpen(false); setDone(''); setLines([{ cost_type: 'delivery', description: '', amount: '' }]); window.location.reload(); }, 2000);
    } catch { setError('Мережева помилка'); }
    finally { setSaving(false); }
  }

  const totalAmount = lines.reduce((s, l) => s + (parseFloat(l.amount) || 0), 0);

  const inp: React.CSSProperties = {
    height: '32px', padding: '0 8px', border: '1.5px solid var(--border)',
    borderRadius: '6px', fontSize: '12px', color: 'var(--text-primary)',
    background: 'var(--bg-soft)', outline: 'none',
  };
  const sel: React.CSSProperties = { ...inp, cursor: 'pointer' };

  return (
    <>
      {renderTrigger
        ? renderTrigger(() => setOpen(true))
        : (
          <button onClick={() => setOpen(true)} style={{ display: 'flex', alignItems: 'center', gap: '6px', height: '34px', padding: '0 14px', borderRadius: '8px', border: '1.5px solid var(--border)', background: 'var(--bg-soft)', color: 'var(--text-secondary)', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}>
            + Додаткові витрати
          </button>
        )
      }

      {open && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.55)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}
          onClick={e => { if (e.target === e.currentTarget) setOpen(false); }}>
          <div style={{ background: 'var(--bg-card)', borderRadius: '16px', width: '100%', maxWidth: '580px', maxHeight: '88vh', display: 'flex', flexDirection: 'column', boxShadow: '0 24px 80px rgba(0,0,0,0.22)' }}>

            {/* Header */}
            <div style={{ padding: '18px 24px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ fontSize: '16px', fontWeight: 800, color: 'var(--text-primary)' }}>
                📦 Додаткові витрати (Landed Cost)
              </div>
              <button onClick={() => setOpen(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex' }}><X size={20} /></button>
            </div>

            <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>

              {/* Рядки витрат */}
              <div>
                <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '8px' }}>
                  Статті витрат
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {lines.map((line, i) => (
                    <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 90px 28px', gap: '8px', alignItems: 'center' }}>
                      <select style={sel} value={line.cost_type}
                        onChange={e => updateLine(i, 'cost_type', e.target.value)}>
                        {COST_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                      </select>
                      <input style={inp} placeholder="Примітка (необов'язково)"
                        value={line.description} onChange={e => updateLine(i, 'description', e.target.value)} />
                      <input style={{ ...inp, textAlign: 'right' }} type="number" min="0" step="0.01" placeholder="0.00"
                        value={line.amount} onChange={e => updateLine(i, 'amount', e.target.value)} />
                      <button onClick={() => removeLine(i)} disabled={lines.length === 1}
                        style={{ width: '28px', height: '28px', border: 'none', background: 'none', cursor: lines.length === 1 ? 'default' : 'pointer', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: lines.length === 1 ? 0.3 : 1 }}>
                        <Trash2 size={13} />
                      </button>
                    </div>
                  ))}
                </div>
                <button onClick={addLine}
                  style={{ marginTop: '8px', display: 'flex', alignItems: 'center', gap: '6px', height: '30px', padding: '0 12px', borderRadius: '6px', border: '1.5px dashed var(--border)', background: 'none', color: 'var(--text-muted)', fontSize: '12px', cursor: 'pointer' }}>
                  <Plus size={12} /> Додати рядок
                </button>
              </div>

              {/* Метод розподілу */}
              <div>
                <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '8px' }}>
                  Метод розподілу між позиціями
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  {METHODS.map(m => (
                    <label key={m.value} style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '13px', color: 'var(--text-primary)' }}>
                      <input type="radio" name="method" value={m.value} checked={method === m.value}
                        onChange={() => setMethod(m.value as typeof method)}
                        style={{ accentColor: '#1E3A5F' }} />
                      {m.label}
                    </label>
                  ))}
                </div>
              </div>

              {/* Спосіб оплати */}
              <div>
                <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '8px' }}>
                  Спосіб оплати
                </div>
                <div style={{ display: 'flex', gap: '12px' }}>
                  {PAYMENT_METHODS.map(pm => (
                    <label key={pm.value} style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '13px', color: paymentMethod === pm.value ? 'var(--text-primary)' : 'var(--text-secondary)', fontWeight: paymentMethod === pm.value ? 700 : 400 }}>
                      <input type="radio" name="paymentMethod" value={pm.value} checked={paymentMethod === pm.value}
                        onChange={() => setPaymentMethod(pm.value as 'cash' | 'bank')}
                        style={{ accentColor: '#1E3A5F' }} />
                      {pm.label}
                    </label>
                  ))}
                </div>
              </div>

              {totalAmount > 0 && (
                <div style={{ padding: '10px 14px', background: '#F5F3FF', borderRadius: '8px', fontSize: '13px', fontWeight: 600, display: 'flex', justifyContent: 'space-between', color: '#7C3AED' }}>
                  <span>Загальна сума витрат:</span>
                  <span>{totalAmount.toLocaleString('uk-UA', { minimumFractionDigits: 2 })} ₴</span>
                </div>
              )}

              {done  && <div style={{ padding: '10px 14px', background: '#F0FDF4', borderRadius: '8px', fontSize: '13px', color: '#15803D', fontWeight: 600 }}>{done}</div>}
              {error && <div style={{ padding: '10px 14px', background: '#FEF2F2', borderRadius: '8px', fontSize: '13px', color: '#DC2626' }}>{error}</div>}
            </div>

            {/* Footer */}
            <div style={{ padding: '14px 24px', borderTop: '1px solid var(--border)', display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
              <button onClick={() => setOpen(false)}
                style={{ height: '36px', padding: '0 16px', borderRadius: '8px', border: '1.5px solid var(--border)', background: 'var(--bg-card)', fontSize: '13px', fontWeight: 600, cursor: 'pointer', color: 'var(--text-secondary)' }}>
                Скасувати
              </button>
              <button onClick={handleSave} disabled={saving || totalAmount === 0}
                style={{ height: '36px', padding: '0 20px', borderRadius: '8px', border: 'none', background: '#7C3AED', color: '#fff', fontSize: '13px', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '7px', opacity: (saving || totalAmount === 0) ? 0.5 : 1 }}>
                {saving ? <><Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> Розподіл...</> : '📦 Розподілити витрати'}
              </button>
            </div>
          </div>
        </div>
      )}
      <style>{`@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}`}</style>
    </>
  );
}
