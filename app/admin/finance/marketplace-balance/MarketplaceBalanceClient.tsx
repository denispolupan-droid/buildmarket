'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Scale, X } from 'lucide-react';
import type { LedgerRow } from './page';

type MarketplaceData = { rows: LedgerRow[]; balance: number };

const MARKETPLACE_LABEL: Record<string, { label: string; color: string; bg: string }> = {
  prom:    { label: 'Prom.ua',  color: '#8B5CF6', bg: '#F5F3FF' },
  rozetka: { label: 'Rozetka',  color: '#6366F1', bg: '#EEF2FF' },
};

function fmt(n: number) {
  return n.toLocaleString('uk-UA', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

const inp: React.CSSProperties = {
  height: '38px', padding: '0 12px', border: '1.5px solid var(--border)', borderRadius: '8px',
  fontSize: '13px', outline: 'none', width: '100%', boxSizing: 'border-box',
  color: 'var(--text-primary)', background: 'var(--bg-soft)',
};
const lbl: React.CSSProperties = {
  fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', display: 'block',
  marginBottom: '5px', textTransform: 'uppercase', letterSpacing: '0.04em',
};

export default function MarketplaceBalanceClient({
  prom, rozetka,
}: { prom: MarketplaceData; rozetka: MarketplaceData }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      <MarketplacePanel marketplace="prom" data={prom} />
      <MarketplacePanel marketplace="rozetka" data={rozetka} />
    </div>
  );
}

function MarketplacePanel({ marketplace, data }: { marketplace: 'prom' | 'rozetka'; data: MarketplaceData }) {
  const router = useRouter();
  const cfg = MARKETPLACE_LABEL[marketplace];

  const [topupOpen, setTopupOpen]         = useState(false);
  const [reconcileOpen, setReconcileOpen] = useState(false);
  const [saving, setSaving]               = useState(false);
  const [error, setError]                 = useState('');

  const [topupAmount, setTopupAmount]   = useState('');
  const [topupMethod, setTopupMethod]   = useState<'bank' | 'cash'>('bank');
  const [topupDate, setTopupDate]       = useState(new Date().toISOString().slice(0, 10));

  const [actualBalance, setActualBalance] = useState('');
  const [reconcileReason, setReconcileReason] = useState('');
  const [reconcileResult, setReconcileResult] = useState<{ diff: number; matched: boolean } | null>(null);

  async function submitTopup() {
    const amount = parseFloat(topupAmount);
    if (!amount || amount <= 0) { setError('Вкажіть суму'); return; }
    setSaving(true); setError('');
    const res = await fetch('/api/admin/finance/marketplace-balance/topup', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ marketplace, amount, paymentMethod: topupMethod, businessDate: topupDate }),
    });
    const d = await res.json();
    setSaving(false);
    if (!res.ok) { setError(d.error ?? 'Помилка'); return; }
    setTopupOpen(false); setTopupAmount('');
    router.refresh();
  }

  async function submitReconcile() {
    const val = parseFloat(actualBalance);
    if (Number.isNaN(val)) { setError('Вкажіть баланс з кабінету'); return; }
    setSaving(true); setError('');
    const res = await fetch('/api/admin/finance/marketplace-balance/reconcile', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ marketplace, actualBalance: val, reason: reconcileReason }),
    });
    const d = await res.json();
    setSaving(false);
    if (!res.ok) { setError(d.error ?? 'Помилка'); return; }
    setReconcileResult({ diff: d.diff, matched: d.matched });
    if (d.matched) {
      setTimeout(() => { setReconcileOpen(false); setActualBalance(''); setReconcileResult(null); }, 1500);
    } else {
      router.refresh();
    }
  }

  return (
    <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '14px', overflow: 'hidden' }}>

      {/* Header */}
      <div style={{ padding: '18px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          <span style={{ padding: '3px 10px', borderRadius: '20px', fontSize: '12px', fontWeight: 700, color: cfg.color, background: cfg.bg }}>
            {cfg.label}
          </span>
          <div>
            <div style={{ fontSize: '22px', fontWeight: 800, color: 'var(--text-primary)', lineHeight: 1 }}>
              {fmt(data.balance)} ₴
            </div>
            <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '3px' }}>поточний баланс за нашими записами</div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button onClick={() => { setTopupOpen(v => !v); setReconcileOpen(false); setError(''); }}
            style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', height: '34px', padding: '0 14px', borderRadius: '8px', border: 'none', background: '#1E3A5F', color: '#fff', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}>
            <Plus size={14} /> Поповнити
          </button>
          <button onClick={() => { setReconcileOpen(v => !v); setTopupOpen(false); setError(''); setReconcileResult(null); }}
            style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', height: '34px', padding: '0 14px', borderRadius: '8px', border: '1.5px solid var(--border)', background: 'var(--bg-soft)', color: 'var(--text-secondary)', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}>
            <Scale size={14} /> Звірити
          </button>
        </div>
      </div>

      {/* Top-up form */}
      {topupOpen && (
        <div style={{ padding: '16px 20px', background: 'var(--bg-soft)', borderBottom: '1px solid var(--border)', display: 'flex', gap: '10px', alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <div style={{ width: '140px' }}>
            <label style={lbl}>Сума, грн</label>
            <input style={inp} type="number" min="0" step="0.01" value={topupAmount} onChange={e => setTopupAmount(e.target.value)} placeholder="0.00" />
          </div>
          <div style={{ width: '150px' }}>
            <label style={lbl}>Спосіб оплати</label>
            <select style={inp} value={topupMethod} onChange={e => setTopupMethod(e.target.value as 'bank' | 'cash')}>
              <option value="bank">Банк</option>
              <option value="cash">Готівка</option>
            </select>
          </div>
          <div style={{ width: '160px' }}>
            <label style={lbl}>Дата</label>
            <input style={inp} type="date" value={topupDate} onChange={e => setTopupDate(e.target.value)} />
          </div>
          <button onClick={submitTopup} disabled={saving}
            style={{ height: '38px', padding: '0 18px', borderRadius: '8px', border: 'none', background: '#15803D', color: '#fff', fontSize: '13px', fontWeight: 700, cursor: saving ? 'wait' : 'pointer', opacity: saving ? 0.6 : 1 }}>
            {saving ? '...' : 'Зберегти'}
          </button>
          <button onClick={() => setTopupOpen(false)} style={{ height: '38px', width: '38px', borderRadius: '8px', border: '1.5px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text-muted)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <X size={14} />
          </button>
          {error && <div style={{ width: '100%', color: '#DC2626', fontSize: '12px' }}>{error}</div>}
        </div>
      )}

      {/* Reconcile form */}
      {reconcileOpen && (
        <div style={{ padding: '16px 20px', background: '#FFFBEB', borderBottom: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-end', flexWrap: 'wrap' }}>
            <div style={{ width: '180px' }}>
              <label style={lbl}>Баланс у кабінеті {cfg.label}, грн</label>
              <input style={inp} type="number" step="0.01" value={actualBalance} onChange={e => setActualBalance(e.target.value)} placeholder="0.00" />
            </div>
            <div style={{ flex: 1, minWidth: '200px' }}>
              <label style={lbl}>Коментар (необов&apos;язково)</label>
              <input style={inp} value={reconcileReason} onChange={e => setReconcileReason(e.target.value)} placeholder="Причина розбіжності" />
            </div>
            <button onClick={submitReconcile} disabled={saving}
              style={{ height: '38px', padding: '0 18px', borderRadius: '8px', border: 'none', background: '#B45309', color: '#fff', fontSize: '13px', fontWeight: 700, cursor: saving ? 'wait' : 'pointer', opacity: saving ? 0.6 : 1 }}>
              {saving ? '...' : 'Звірити'}
            </button>
            <button onClick={() => setReconcileOpen(false)} style={{ height: '38px', width: '38px', borderRadius: '8px', border: '1.5px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text-muted)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <X size={14} />
            </button>
          </div>
          {error && <div style={{ marginTop: '8px', color: '#DC2626', fontSize: '12px' }}>{error}</div>}
          {reconcileResult && (
            <div style={{ marginTop: '10px', fontSize: '13px', fontWeight: 600, color: reconcileResult.matched ? '#15803D' : '#B45309' }}>
              {reconcileResult.matched
                ? '✓ Збігається, різниці немає'
                : `Різниця ${reconcileResult.diff > 0 ? '+' : ''}${fmt(reconcileResult.diff)} ₴ — записано як коригування`}
            </div>
          )}
        </div>
      )}

      {/* Ledger */}
      {data.rows.length === 0 ? (
        <div style={{ padding: '32px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '13px' }}>
          Ще немає записів
        </div>
      ) : (
        <div style={{ maxHeight: '360px', overflowY: 'auto' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '100px 140px 1fr 120px', padding: '8px 20px', background: 'var(--bg-soft)', position: 'sticky', top: 0, fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
            <span>Дата</span>
            <span>Тип</span>
            <span>Опис</span>
            <span style={{ textAlign: 'right' }}>Сума</span>
          </div>
          {data.rows.map((row, idx) => {
            const isBalance = row.account_type === 'marketplace_balance';
            const isTopup = isBalance && Number(row.amount) > 0;
            const typeLabel = row.doc_type === 'marketplace_topup' ? 'Поповнення'
              : row.doc_type === 'commission' ? 'Комісія'
              : row.doc_type === 'marketplace_reconciliation' ? 'Коригування' : row.doc_type ?? '—';
            return (
              <div key={row.id} style={{
                display: 'grid', gridTemplateColumns: '100px 140px 1fr 120px',
                padding: '9px 20px', alignItems: 'center', fontSize: '13px',
                borderTop: idx > 0 ? '1px solid var(--border-light)' : 'none',
              }}>
                <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                  {new Date(row.business_date).toLocaleDateString('uk-UA')}
                </span>
                <span style={{ fontSize: '11px', fontWeight: 600, color: isTopup ? '#15803D' : isBalance ? '#DC2626' : 'var(--text-muted)' }}>
                  {typeLabel}
                </span>
                <span style={{ color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', paddingRight: '8px' }}>
                  {row.description}
                </span>
                <span style={{ textAlign: 'right', fontWeight: 700, color: isBalance ? (Number(row.amount) >= 0 ? '#15803D' : '#DC2626') : 'var(--text-muted)' }}>
                  {isBalance ? `${Number(row.amount) >= 0 ? '+' : ''}${fmt(Number(row.amount))}` : `−${fmt(Number(row.amount))}`} ₴
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
