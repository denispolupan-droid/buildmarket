'use client';

import { useState } from 'react';
import { CheckCircle, Banknote, Loader2, X, Clock } from 'lucide-react';
import { showToast } from '../../../../../lib/toast';

type PaymentMode = 'transfer' | 'deferred' | 'cash';
type PaymentEntry = { created_at: string; amount: number; payment_mode: string | null };

const inp: React.CSSProperties = {
  height: '36px', padding: '0 10px', border: '1.5px solid var(--border)',
  borderRadius: '8px', fontSize: '13px', outline: 'none',
  color: 'var(--text-primary)', background: 'var(--bg-soft)', width: '100%',
};
const lbl: React.CSSProperties = {
  fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)',
  display: 'block', marginBottom: '4px', textTransform: 'uppercase',
};

function fmt(n: number) {
  return n.toLocaleString('uk-UA', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function payModeLabel(mode: string | null) {
  if (mode === 'cash')     return '💵 Готівка';
  if (mode === 'transfer') return '🏦 Переказ';
  if (mode === 'deferred') return '📅 Відстрочка';
  return '💳';
}

const PAY_MODES: { key: PaymentMode; label: string }[] = [
  { key: 'transfer', label: '🏦 Рахунок'    },
  { key: 'deferred', label: '📅 Відстрочка' },
  { key: 'cash',     label: '💵 Готівка'    },
];

export default function ReceiptPaymentPanel({
  receiptId,
  totalCost,
  paymentHistory: initHistory,
  totalPaid: initPaid,
  deferredUntil: initDeferredUntil,
}: {
  receiptId: string;
  totalCost: number;
  paymentHistory: PaymentEntry[];
  totalPaid: number;
  deferredUntil?: string | null;
}) {
  const [history,        setHistory]        = useState(initHistory);
  const [totalPaid,      setTotalPaid]      = useState(initPaid);
  const [isPaid,         setIsPaid]         = useState(initPaid >= totalCost * 0.999 && totalCost > 0);
  const [deferredUntil,  setDeferredUntil]  = useState(initDeferredUntil ?? null);
  const [editing,        setEditing]        = useState(initPaid <= 0 && !initDeferredUntil);
  const [showAdd,        setShowAdd]        = useState(false);
  const [showReverse,    setShowReverse]    = useState(false);
  const [reverseReason,  setReverseReason]  = useState('');

  const defaultMode: PaymentMode = initDeferredUntil
    ? 'deferred'
    : (totalCost > 0 ? 'transfer' : 'cash');

  const [payMode,        setPayMode]        = useState<PaymentMode>(defaultMode);
  const [payAmount,      setPayAmount]      = useState(String(totalCost.toFixed(2)));
  const [payDate,        setPayDate]        = useState(new Date().toISOString().slice(0, 10));
  const [deferDate,      setDeferDate]      = useState(() => {
    if (initDeferredUntil) return initDeferredUntil;
    const d = new Date(); d.setDate(d.getDate() + 30);
    return d.toISOString().slice(0, 10);
  });
  const [paying,         setPaying]         = useState(false);
  const [reversing,      setReversing]      = useState(false);

  const remaining = Math.max(0, totalCost - totalPaid);

  async function handlePay() {
    // ── Відстрочка ──
    if (payMode === 'deferred') {
      setPaying(true);
      try {
        const res = await fetch(`/api/admin/procurement/${receiptId}/add-payment`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ payment_mode: 'deferred', payment_defer_date: deferDate }),
        });
        if (!res.ok) { const d = await res.json(); showToast(d.error ?? 'Помилка', 'error'); return; }
        showToast('📅 Відстрочку збережено', 'success');
        setDeferredUntil(deferDate);
        setEditing(false);
      } catch { showToast('Мережева помилка', 'error'); }
      finally { setPaying(false); }
      return;
    }

    // ── Готівка / Рахунок ──
    const amt = parseFloat(payAmount);
    if (!amt || amt <= 0) { showToast('Вкажіть суму', 'error'); return; }
    setPaying(true);
    try {
      const res = await fetch(`/api/admin/procurement/${receiptId}/add-payment`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount: amt, payment_mode: payMode, payment_date: payDate }),
      });
      const data = await res.json();
      if (!res.ok) { showToast(data.error ?? 'Помилка', 'error'); return; }
      showToast(`✅ Оплату ${fmt(amt)} ₴ проведено`, 'success');
      setHistory(h => [...h, { created_at: new Date().toISOString(), amount: amt, payment_mode: payMode }]);
      const newTotal = totalPaid + amt;
      setTotalPaid(newTotal);
      setDeferredUntil(null);
      if (data.is_fully_paid || newTotal >= totalCost * 0.999) setIsPaid(true);
      setEditing(false);
      setShowAdd(false);
    } catch { showToast('Мережева помилка', 'error'); }
    finally { setPaying(false); }
  }

  async function handleReverse() {
    setReversing(true);
    try {
      const res = await fetch(`/api/admin/procurement/${receiptId}/reverse-payment`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: reverseReason.trim() || undefined }),
      });
      if (!res.ok) { const d = await res.json(); showToast(d.error ?? 'Помилка', 'error'); return; }
      showToast('✅ Оплату скасовано. Компенсуюча проводка проведена.', 'success');
      setIsPaid(false); setTotalPaid(0); setHistory([]); setDeferredUntil(null);
      setEditing(true); setShowReverse(false); setReverseReason('');
    } catch { showToast('Мережева помилка', 'error'); }
    finally { setReversing(false); }
  }

  const isDeferred = !!deferredUntil && !isPaid && totalPaid === 0;

  // ── Форма оплати ────────────────────────────────────────────────────────
  const payForm = (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
      {/* Режим оплати */}
      <div>
        <label style={lbl}>Спосіб оплати</label>
        <div style={{ display: 'flex', borderRadius: '8px', overflow: 'hidden', border: '1px solid var(--border)' }}>
          {PAY_MODES.map((m, i) => (
            <button key={m.key} onClick={() => setPayMode(m.key)}
              style={{
                flex: 1, height: '34px', fontSize: '12px', fontWeight: 600, cursor: 'pointer',
                border: 'none', borderLeft: i > 0 ? '1px solid var(--border)' : 'none',
                background: payMode === m.key ? '#1E3A5F' : 'var(--bg-soft)',
                color:      payMode === m.key ? '#fff'    : 'var(--text-secondary)',
                transition: 'all 0.15s',
              }}>
              {m.label}
            </button>
          ))}
        </div>
      </div>

      {/* Відстрочка */}
      {payMode === 'deferred' && (
        <>
          <div>
            <label style={lbl}>Оплатити до</label>
            <input style={inp} type="date" value={deferDate} onChange={e => setDeferDate(e.target.value)} />
          </div>
          <div style={{ padding: '8px 12px', background: '#FFF7ED', borderRadius: '8px', fontSize: '12px', color: '#92400E' }}>
            📌 Товар оприходовано. Оплату буде зроблено до {deferDate ? new Date(deferDate).toLocaleDateString('uk-UA') : '—'}.
            Проводки в леджері будуть записані при фактичній оплаті.
          </div>
          <button
            onClick={handlePay} disabled={paying}
            style={{ height: '40px', borderRadius: '8px', border: 'none', background: '#B45309', color: '#fff', fontSize: '14px', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
            {paying ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <Clock size={14} />}
            {paying ? 'Зберігаємо...' : 'Зберегти відстрочку'}
          </button>
        </>
      )}

      {/* Готівка / Рахунок */}
      {payMode !== 'deferred' && (
        <>
          <div style={{ display: 'flex', gap: '8px' }}>
            <div style={{ flex: 1 }}>
              <label style={lbl}>Сума, ₴</label>
              <input style={inp} type="number" step="0.01" value={payAmount} onChange={e => setPayAmount(e.target.value)} placeholder="0.00" />
            </div>
            <div style={{ flex: 1 }}>
              <label style={lbl}>Дата оплати</label>
              <input style={inp} type="date" value={payDate} onChange={e => setPayDate(e.target.value)} />
            </div>
          </div>
          <button
            onClick={handlePay}
            disabled={paying || !payAmount || parseFloat(payAmount) <= 0}
            style={{
              height: '40px', borderRadius: '8px', border: 'none',
              background: !payAmount || parseFloat(payAmount) <= 0 ? '#E2E8F0' : '#15803D',
              color:      !payAmount || parseFloat(payAmount) <= 0 ? '#94A3B8' : '#fff',
              fontSize: '14px', fontWeight: 700, cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
            }}>
            {paying ? <><Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> Проводимо...</> : '💳 Провести оплату'}
          </button>
        </>
      )}
    </div>
  );

  return (
    <>
      <div style={{
        background: 'var(--bg-card)',
        border: `1px solid ${isPaid ? '#86EFAC' : isDeferred ? '#FDE68A' : 'var(--border)'}`,
        borderRadius: '12px', padding: '16px',
      }}>
        <div style={{ fontSize: '13px', fontWeight: 700, color: isPaid ? '#15803D' : isDeferred ? '#B45309' : 'var(--text-muted)', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '7px' }}>
          <Banknote size={15} color={isPaid ? '#15803D' : isDeferred ? '#B45309' : undefined} />
          Оплата постачальнику
        </div>

        {/* ── Повністю оплачено ── */}
        {isPaid && !editing ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <div style={{ padding: '10px 12px', background: '#F0FDF4', borderRadius: '8px', fontSize: '13px', color: '#15803D', fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}><CheckCircle size={16} /> Повністю оплачено</span>
              <span>{fmt(totalPaid)} ₴</span>
            </div>
            {history.map((p, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '5px 10px', background: 'var(--bg-soft)', borderRadius: '6px', fontSize: '12px' }}>
                <span style={{ color: 'var(--text-secondary)' }}>{payModeLabel(p.payment_mode)} · {new Date(p.created_at).toLocaleDateString('uk-UA')}</span>
                <span style={{ fontWeight: 700, color: '#15803D' }}>{fmt(p.amount)} ₴</span>
              </div>
            ))}
            {!showAdd && (
              <button onClick={() => setShowAdd(true)} style={{ height: '30px', borderRadius: '8px', border: '1px solid var(--border)', background: 'none', color: 'var(--text-secondary)', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}>
                + Додати ще оплату
              </button>
            )}
            {showAdd && (
              <div style={{ background: 'var(--bg-soft)', borderRadius: '8px', padding: '10px 12px' }}>
                <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '8px' }}>Нова оплата</div>
                {payForm}
                <button onClick={() => setShowAdd(false)} style={{ marginTop: '6px', height: '28px', width: '100%', borderRadius: '7px', border: '1px solid var(--border)', background: 'none', color: 'var(--text-secondary)', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}>Скасувати</button>
              </div>
            )}
            <button onClick={() => setShowReverse(true)} style={{ height: '28px', borderRadius: '7px', border: '1px solid #FCA5A5', background: 'none', color: '#DC2626', fontSize: '11px', fontWeight: 600, cursor: 'pointer' }}>
              ↩ Скасувати оплату (Admin)
            </button>
          </div>

        /* ── Відстрочка ── */
        ) : isDeferred && !editing ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <div style={{ padding: '10px 12px', background: '#FEF3C7', borderRadius: '8px', fontSize: '13px', color: '#92400E', fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Clock size={16} /> Відстрочка
              </span>
              <span>до {new Date(deferredUntil!).toLocaleDateString('uk-UA')}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: 'var(--text-muted)', padding: '2px 4px' }}>
              <span>До сплати</span>
              <span style={{ fontWeight: 700, color: '#B45309' }}>{fmt(totalCost)} ₴</span>
            </div>
            <button onClick={() => { setEditing(true); setPayMode('transfer'); setPayAmount(String(totalCost.toFixed(2))); }}
              style={{ height: '36px', borderRadius: '8px', border: 'none', background: '#15803D', color: '#fff', fontSize: '13px', fontWeight: 700, cursor: 'pointer' }}>
              💳 Провести оплату
            </button>
            <button onClick={() => setEditing(true)}
              style={{ height: '28px', borderRadius: '7px', border: '1px solid var(--border)', background: 'none', color: 'var(--text-secondary)', fontSize: '11px', fontWeight: 600, cursor: 'pointer' }}>
              ✏️ Змінити дату
            </button>
          </div>

        /* ── Часткова оплата ── */
        ) : history.length > 0 && !editing ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <div style={{ padding: '8px 12px', background: '#FFFBEB', borderRadius: '8px', fontSize: '12px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--text-muted)' }}>Оплачено</span>
                <span style={{ fontWeight: 700, color: '#15803D' }}>{fmt(totalPaid)} ₴</span>
              </div>
              {remaining > 0 && (
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--text-muted)' }}>Залишилось</span>
                  <span style={{ fontWeight: 700, color: '#DC2626' }}>{fmt(remaining)} ₴</span>
                </div>
              )}
              <div style={{ marginTop: '4px', height: '4px', background: '#E5E7EB', borderRadius: '2px', overflow: 'hidden' }}>
                <div style={{ height: '100%', background: remaining > 0 ? '#F59E0B' : '#15803D', borderRadius: '2px', width: `${Math.min(100, totalCost > 0 ? (totalPaid / totalCost) * 100 : 0)}%`, transition: 'width 0.3s' }} />
              </div>
            </div>
            {history.map((p, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '4px 10px', background: 'var(--bg-soft)', borderRadius: '6px', fontSize: '11px' }}>
                <span style={{ color: 'var(--text-secondary)' }}>{payModeLabel(p.payment_mode)} · {new Date(p.created_at).toLocaleDateString('uk-UA')}</span>
                <span style={{ fontWeight: 700, color: '#15803D' }}>{fmt(p.amount)} ₴</span>
              </div>
            ))}
            <div style={{ display: 'flex', gap: '6px' }}>
              <button onClick={() => setEditing(true)} style={{ flex: 1, height: '32px', borderRadius: '8px', border: '1px solid var(--border)', background: 'none', color: 'var(--text-secondary)', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}>
                ✏️ Редагувати
              </button>
              {remaining > 0 && (
                <button onClick={() => setEditing(true)} style={{ flex: 1, height: '32px', borderRadius: '8px', border: 'none', background: '#15803D', color: '#fff', fontSize: '12px', fontWeight: 700, cursor: 'pointer' }}>
                  + Ще оплату
                </button>
              )}
            </div>
          </div>

        /* ── Форма оплати (новий або режим редагування) ── */
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {history.length > 0 && (
              <div style={{ padding: '8px 12px', background: 'var(--bg-soft)', borderRadius: '8px', fontSize: '12px', display: 'flex', flexDirection: 'column', gap: '3px' }}>
                {history.map((p, i) => (
                  <div key={i} style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: 'var(--text-secondary)' }}>{payModeLabel(p.payment_mode)} · {new Date(p.created_at).toLocaleDateString('uk-UA')}</span>
                    <span style={{ fontWeight: 700, color: '#15803D' }}>{fmt(p.amount)} ₴</span>
                  </div>
                ))}
                {remaining > 0 && totalCost > 0 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: '4px', borderTop: '1px solid var(--border-light)', marginTop: '2px' }}>
                    <span style={{ color: '#DC2626', fontWeight: 600 }}>Залишилось</span>
                    <span style={{ fontWeight: 700, color: '#DC2626' }}>{fmt(remaining)} ₴</span>
                  </div>
                )}
              </div>
            )}
            {payForm}
            {(history.length > 0 || isDeferred) && (
              <button onClick={() => setEditing(false)} style={{ height: '32px', borderRadius: '8px', border: '1px solid var(--border)', background: 'none', color: 'var(--text-muted)', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}>
                Скасувати
              </button>
            )}
          </div>
        )}
      </div>

      {/* Модалка скасування оплати */}
      {showReverse && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 3000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: 'var(--bg-card)', borderRadius: '16px', padding: '28px', width: '420px', boxShadow: '0 20px 60px rgba(0,0,0,0.25)' }}>
            <div style={{ fontSize: '16px', fontWeight: 800, color: '#DC2626', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <X size={16} /> Скасувати оплату?
            </div>
            <div style={{ padding: '10px 12px', background: '#FEF3C7', borderRadius: '8px', fontSize: '12px', color: '#92400E', marginBottom: '16px' }}>
              ⚠ Буде проведено компенсуючу проводку в леджері. Дія тільки для адміністратора.
            </div>
            <div style={{ marginBottom: '16px' }}>
              <label style={lbl}>Причина (необов&apos;язково)</label>
              <input value={reverseReason} onChange={e => setReverseReason(e.target.value)} placeholder="Наприклад: помилкова оплата" style={inp} />
            </div>
            <div style={{ display: 'flex', gap: '10px' }}>
              <button onClick={() => { setShowReverse(false); setReverseReason(''); }}
                style={{ flex: 1, height: '40px', borderRadius: '8px', border: '1px solid var(--border)', background: 'none', cursor: 'pointer', fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)' }}>
                Назад
              </button>
              <button onClick={handleReverse} disabled={reversing}
                style={{ flex: 1, height: '40px', borderRadius: '8px', border: 'none', background: '#DC2626', color: '#fff', cursor: reversing ? 'default' : 'pointer', fontSize: '14px', fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', opacity: reversing ? 0.7 : 1 }}>
                {reversing ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> : null}
                Скасувати оплату
              </button>
            </div>
          </div>
        </div>
      )}
      <style>{`@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}`}</style>
    </>
  );
}
