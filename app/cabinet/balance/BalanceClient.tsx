'use client';

import { useState } from 'react';

type Transaction = { id: number; tx_type: string; amount: number; balance_after: number | null; description: string; created_at: string };
type PayoutRequest = { id: string; amount: number; method: string; status: string; requested_at: string; notes: string | null };

const TX_LABELS: Record<string, string> = {
  top_up: 'Поповнення', charge: 'Списання (замовлення)', cod_credit: 'Нарахування COD',
  np_fee: 'Комісія НП', return_refund: 'Повернення товару', return_fee: 'Зворотна доставка',
  payout: 'Виплата', goods_offset: 'Товарний залік', adjustment: 'Коригування',
};

const PAYOUT_STATUS: Record<string, { label: string; color: string }> = {
  pending:  { label: 'Очікує',    color: '#B45309' },
  approved: { label: 'Схвалено',  color: '#15803D' },
  paid:     { label: 'Виплачено', color: '#15803D' },
  rejected: { label: 'Відхилено', color: '#DC2626' },
};

const input: React.CSSProperties = {
  width: '100%', padding: '8px 12px', border: '1px solid var(--border)',
  borderRadius: '8px', fontSize: '13px', background: 'var(--bg-soft)',
  color: 'var(--text-primary)', boxSizing: 'border-box',
};

export default function BalanceClient({ customerId, transactions, payoutRequests }: {
  customerId: string;
  transactions: Transaction[];
  payoutRequests: PayoutRequest[];
}) {
  const [showPayout, setShowPayout] = useState(false);
  const [method,      setMethod]    = useState<'bank' | 'goods_offset'>('bank');
  const [amount,      setAmount]    = useState('');
  const [bankDetails, setBankDetails] = useState('');
  const [saving,      setSaving]    = useState(false);
  const [done,        setDone]      = useState(false);
  const [error,       setError]     = useState('');

  async function submitPayout() {
    if (!amount || Number(amount) < 500) { setError('Мінімальна сума — 500 грн'); return; }
    if (method === 'bank' && !bankDetails) { setError('Вкажіть реквізити для переказу'); return; }
    setSaving(true); setError('');
    const res = await fetch('/api/cabinet/payout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ amount: Number(amount), method, bank_details: bankDetails }),
    });
    const data = await res.json();
    setSaving(false);
    if (!res.ok) { setError(data.error ?? 'Помилка'); return; }
    setDone(true);
  }

  return (
    <>
      {/* Payout section */}
      <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '12px', padding: '20px 24px', marginBottom: '24px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: showPayout ? '16px' : '0' }}>
          <h2 style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>Виведення коштів</h2>
          {!done && (
            <button onClick={() => setShowPayout(v => !v)} style={{
              height: '34px', padding: '0 16px', borderRadius: '8px', fontSize: '13px', fontWeight: 600,
              border: '1.5px solid var(--border)', background: 'var(--bg-soft)', color: 'var(--text-primary)', cursor: 'pointer',
            }}>
              {showPayout ? 'Скасувати' : 'Подати заявку'}
            </button>
          )}
        </div>

        {done && (
          <div style={{ padding: '12px', background: '#F0FDF4', border: '1px solid #86EFAC', borderRadius: '8px', fontSize: '13px', color: '#15803D', fontWeight: 600 }}>
            ✓ Заявку прийнято. Обробка — до 3 робочих днів.
          </div>
        )}

        {showPayout && !done && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {error && <div style={{ padding: '10px', background: '#FEE2E2', borderRadius: '8px', fontSize: '13px', color: '#DC2626' }}>{error}</div>}

            <div style={{ display: 'flex', gap: '8px' }}>
              {[{ v: 'bank', l: 'Банківський переказ' }, { v: 'goods_offset', l: 'Товарний залік' }].map(opt => (
                <button key={opt.v} type="button" onClick={() => setMethod(opt.v as any)} style={{
                  flex: 1, padding: '10px', borderRadius: '8px', fontSize: '13px', fontWeight: 600, cursor: 'pointer',
                  border: `1.5px solid ${method === opt.v ? '#4880B8' : 'var(--border)'}`,
                  background: method === opt.v ? '#EFF6FF' : 'var(--bg-soft)',
                  color: method === opt.v ? '#1E3A5F' : 'var(--text-secondary)',
                }}>
                  {opt.l}
                </button>
              ))}
            </div>

            <div>
              <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>
                Сума (мін. 500 ₴)
              </label>
              <input type="number" min={500} step={50} value={amount} onChange={e => setAmount(e.target.value)} placeholder="500" style={input} />
            </div>

            {method === 'bank' && (
              <div>
                <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>
                  Реквізити (IBAN або картка)
                </label>
                <textarea value={bankDetails} onChange={e => setBankDetails(e.target.value)} placeholder="UA12 3456 7890..." style={{ ...input, minHeight: '72px', resize: 'vertical' }} />
              </div>
            )}

            {method === 'goods_offset' && (
              <p style={{ fontSize: '12px', color: 'var(--text-muted)', background: 'var(--bg-soft)', padding: '10px', borderRadius: '8px' }}>
                Баланс буде використано для оплати товарів за вашими дроп-цінами. Менеджер зв'яжеться для уточнення деталей.
              </p>
            )}

            <button onClick={submitPayout} disabled={saving} style={{
              height: '40px', borderRadius: '9px', background: '#4880B8', color: '#fff',
              border: 'none', fontSize: '13px', fontWeight: 700, cursor: 'pointer', opacity: saving ? 0.6 : 1,
            }}>
              {saving ? 'Відправляємо...' : 'Подати заявку'}
            </button>
          </div>
        )}
      </div>

      {/* Payout history */}
      {payoutRequests.length > 0 && (
        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '12px', overflow: 'hidden', marginBottom: '24px' }}>
          <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)', fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)' }}>
            Заявки на виведення
          </div>
          {payoutRequests.map((r, i) => {
            const st = PAYOUT_STATUS[r.status] ?? { label: r.status, color: '#64748B' };
            return (
              <div key={r.id} style={{ padding: '12px 20px', borderBottom: i < payoutRequests.length - 1 ? '1px solid var(--border-light)' : 'none', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>
                    {r.method === 'bank' ? 'Банківський переказ' : 'Товарний залік'} — {r.amount} ₴
                  </div>
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{new Date(r.requested_at).toLocaleDateString('uk-UA')}</div>
                </div>
                <span style={{ fontSize: '12px', fontWeight: 700, color: st.color }}>{st.label}</span>
              </div>
            );
          })}
        </div>
      )}

      {/* Transaction history */}
      <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '12px', overflow: 'hidden' }}>
        <div style={{ padding: '14px 20px', background: 'var(--bg-soft)', borderBottom: '1px solid var(--border)' }}>
          <h2 style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>Усі транзакції</h2>
        </div>
        {transactions.length === 0 ? (
          <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '13px' }}>Транзакцій ще немає</div>
        ) : (
          transactions.map((tx, i) => (
            <div key={tx.id} style={{ padding: '12px 20px', borderBottom: i < transactions.length - 1 ? '1px solid var(--border-light)' : 'none', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontSize: '13px', fontWeight: 500, color: 'var(--text-primary)' }}>{TX_LABELS[tx.tx_type] ?? tx.tx_type}</div>
                {tx.description && <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>{tx.description}</div>}
                <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{new Date(tx.created_at).toLocaleDateString('uk-UA', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: '14px', fontWeight: 700, color: tx.amount >= 0 ? '#15803D' : '#DC2626' }}>
                  {tx.amount >= 0 ? '+' : ''}{tx.amount.toFixed(2)} ₴
                </div>
                {tx.balance_after !== null && (
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>залишок: {tx.balance_after.toFixed(2)} ₴</div>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </>
  );
}
