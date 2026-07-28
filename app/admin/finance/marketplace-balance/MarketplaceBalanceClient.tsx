'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Scale, X, ArrowLeftRight, Landmark, RefreshCw } from 'lucide-react';
import type { LedgerRow, InTransit } from './page';

type CabinetRow = {
  rozetkaOrderId: number;
  orderNumber: number | null;
  orderStatus: string | null;
  date: string;
  theirAmount: number;
  ourAmount: number;
  delta: number;
  status: 'ok' | 'diff' | 'missing_ours' | 'missing_theirs' | 'pending_delivery' | 'reserved_theirs';
};
type CabinetData = {
  cabinet: { balance: number; sumInGray: number };
  from: string; to: string;
  rows: CabinetRow[];
  others: Array<{ op: number; name: string; count: number; debit: number; credit: number }>;
  smartFees?: { count: number; total: number };
  totals: { their: number; ours: number; delta: number };
};

type MarketplaceData = { rows: LedgerRow[]; balance: number; inTransit: InTransit };

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
  const [showTransit, setShowTransit]     = useState(false);
  const [saving, setSaving]               = useState(false);
  const [error, setError]                 = useState('');

  const [topupAmount, setTopupAmount]   = useState('');
  const [topupMethod, setTopupMethod]   = useState<'bank' | 'cash'>('bank');
  const [topupDate, setTopupDate]       = useState(new Date().toISOString().slice(0, 10));

  const [actualBalance, setActualBalance] = useState('');
  const [reconcileReason, setReconcileReason] = useState('');
  const [reconcileResult, setReconcileResult] = useState<{ diff: number; matched: boolean } | null>(null);

  const [adjustOpen, setAdjustOpen]         = useState(false);
  const [adjDirection, setAdjDirection]     = useState<'charge' | 'credit'>('charge');
  const [adjAmount, setAdjAmount]           = useState('');
  const [adjCategory, setAdjCategory]       = useState('delivery');
  const [adjOrder, setAdjOrder]             = useState('');
  const [adjNote, setAdjNote]               = useState('');
  const [adjDate, setAdjDate]               = useState(new Date().toISOString().slice(0, 10));

  // Звірка з кабінетом Rozetka (живий леджер /balances/search)
  const [cabinetOpen, setCabinetOpen]       = useState(false);
  const [cabinetLoading, setCabinetLoading] = useState(false);
  const [cabinetError, setCabinetError]     = useState('');
  const [cabinetData, setCabinetData]       = useState<CabinetData | null>(null);
  const [cabinetFrom, setCabinetFrom]       = useState(new Date(Date.now() - 30 * 86400e3).toISOString().slice(0, 10));
  const [cabinetTo, setCabinetTo]           = useState(new Date().toISOString().slice(0, 10));

  async function loadCabinet(from = cabinetFrom, to = cabinetTo) {
    setCabinetLoading(true); setCabinetError('');
    try {
      const res = await fetch(`/api/admin/finance/marketplace-balance/rozetka-reconcile?from=${from}&to=${to}`);
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? 'Помилка запиту до Rozetka');
      setCabinetData(d);
    } catch (e) {
      setCabinetError(e instanceof Error ? e.message : String(e));
    } finally {
      setCabinetLoading(false);
    }
  }

  // «Провести різницю» з рядка звірки → відкриває форму «Операція» з передзаповненими полями
  function prefillAdjustFromRow(row: CabinetRow) {
    setAdjDirection(row.delta > 0 ? 'charge' : 'credit');
    setAdjAmount(Math.abs(row.delta).toFixed(2));
    setAdjCategory('other');
    setAdjOrder(row.orderNumber ? String(row.orderNumber) : '');
    setAdjNote(`Звірка з кабінетом Rozetka: у них ${fmt(row.theirAmount)} ₴, у нас ${fmt(row.ourAmount)} ₴`);
    setAdjDate(new Date().toISOString().slice(0, 10));
    setAdjustOpen(true); setTopupOpen(false); setReconcileOpen(false); setError('');
  }

  async function submitAdjust() {
    const amount = parseFloat(adjAmount);
    if (!amount || amount <= 0) { setError('Вкажіть суму'); return; }
    setSaving(true); setError('');
    const res = await fetch('/api/admin/finance/marketplace-balance/adjust', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        marketplace, direction: adjDirection, amount, category: adjCategory,
        orderNumber: adjOrder || null, note: adjNote, businessDate: adjDate,
      }),
    });
    const d = await res.json();
    setSaving(false);
    if (!res.ok) { setError(d.error ?? 'Помилка'); return; }
    setAdjustOpen(false); setAdjAmount(''); setAdjOrder(''); setAdjNote('');
    router.refresh();
  }

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

  // Стрічка: показуємо лише сторону marketplace_balance (кожна операція — один рядок
  // із правильним знаком). Контр-рядки marketplace_fee — це подвійний запис, у стрічці
  // вони дублювали б операцію.
  const ledgerRows = data.rows.filter(r => r.account_type === 'marketplace_balance');

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
          <button onClick={() => { setAdjustOpen(v => !v); setTopupOpen(false); setReconcileOpen(false); setError(''); }}
            style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', height: '34px', padding: '0 14px', borderRadius: '8px', border: '1.5px solid var(--border)', background: 'var(--bg-soft)', color: 'var(--text-secondary)', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}>
            <ArrowLeftRight size={14} /> Операція
          </button>
          <button onClick={() => { setReconcileOpen(v => !v); setTopupOpen(false); setAdjustOpen(false); setError(''); setReconcileResult(null); }}
            style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', height: '34px', padding: '0 14px', borderRadius: '8px', border: '1.5px solid var(--border)', background: 'var(--bg-soft)', color: 'var(--text-secondary)', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}>
            <Scale size={14} /> Звірити
          </button>
          {marketplace === 'rozetka' && (
            <button onClick={() => {
              setCabinetOpen(v => !v);
              if (!cabinetOpen && !cabinetData) void loadCabinet();
            }}
              style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', height: '34px', padding: '0 14px', borderRadius: '8px', border: cabinetOpen ? '1.5px solid #6366F1' : '1.5px solid var(--border)', background: cabinetOpen ? '#EEF2FF' : 'var(--bg-soft)', color: cabinetOpen ? '#6366F1' : 'var(--text-secondary)', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}>
              <Landmark size={14} /> Кабінет
            </button>
          )}
        </div>
      </div>

      {/* Комісії в дорозі — очікуване списання по відвантажених, ще не доставлених посилках */}
      {data.inTransit.total > 0 && (
        <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)', background: '#FFFBEB' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
            <div>
              <span style={lbl}>Комісії в дорозі (ще не проведені)</span>
              <div style={{ fontSize: '17px', fontWeight: 800, color: '#B45309' }}>
                −{fmt(data.inTransit.total)} ₴
                <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)', marginLeft: '8px' }}>{data.inTransit.items.length} посилок</span>
              </div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <span style={lbl}>Прогноз балансу після доставки</span>
              <div style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text-primary)' }}>{fmt(data.balance - data.inTransit.total)} ₴</div>
            </div>
            <button onClick={() => setShowTransit(v => !v)}
              style={{ height: '30px', padding: '0 12px', borderRadius: '7px', border: '1.5px solid #FDBA74', background: 'var(--bg-card)', color: '#B45309', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}>
              {showTransit ? 'Сховати' : 'Показати'} посилки
            </button>
          </div>
          {showTransit && (
            <div style={{ marginTop: '12px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
              {data.inTransit.items.map(it => (
                <div key={it.docId} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '12px', padding: '5px 8px', borderRadius: '6px', background: 'var(--bg-card)', border: '1px solid var(--border-light)' }}>
                  <span style={{ color: 'var(--text-secondary)' }}>Замовлення №{it.orderNumber ?? '—'} · ТТН {it.ttn ?? '—'}</span>
                  <span style={{ fontWeight: 700, color: '#B45309' }}>−{fmt(it.commission)} ₴</span>
                </div>
              ))}
            </div>
          )}
          <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '10px', lineHeight: 1.4 }}>
            Очікувана комісія по посилках, що вже відвантажені, але ще не доставлені — площадка спише її при доставці. Порівняйте «прогноз балансу» з балансом у кабінеті Prom/Rozetka.
          </div>
        </div>
      )}

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

      {/* Manual operation form — списання збору / нарахування (компенсація) */}
      {adjustOpen && (
        <div style={{ padding: '16px 20px', background: 'var(--bg-soft)', borderBottom: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-end', flexWrap: 'wrap' }}>
            <div style={{ width: '190px' }}>
              <label style={lbl}>Тип операції</label>
              <div style={{ display: 'flex', border: '1.5px solid var(--border)', borderRadius: '8px', overflow: 'hidden', height: '38px' }}>
                {([['charge', 'Списання −'], ['credit', 'Нарахування +']] as const).map(([v, t]) => {
                  const active = adjDirection === v;
                  return (
                    <button key={v} type="button" onClick={() => setAdjDirection(v)}
                      style={{ flex: 1, border: 'none', cursor: 'pointer', fontSize: '12px', fontWeight: 700,
                        background: active ? (v === 'charge' ? '#DC2626' : '#15803D') : 'var(--bg-card)',
                        color: active ? '#fff' : 'var(--text-secondary)' }}>
                      {t}
                    </button>
                  );
                })}
              </div>
            </div>
            <div style={{ width: '120px' }}>
              <label style={lbl}>Сума, грн</label>
              <input style={inp} type="number" min="0" step="0.01" value={adjAmount} onChange={e => setAdjAmount(e.target.value)} placeholder="0.00" />
            </div>
            <div style={{ width: '150px' }}>
              <label style={lbl}>Категорія</label>
              <select style={inp} value={adjCategory} onChange={e => setAdjCategory(e.target.value)}>
                <option value="delivery">Доставка</option>
                <option value="ad">Реклама</option>
                <option value="compensation">Компенсація</option>
                <option value="other">Інше</option>
              </select>
            </div>
            <div style={{ width: '120px' }}>
              <label style={lbl}>№ замовлення</label>
              <input style={inp} value={adjOrder} onChange={e => setAdjOrder(e.target.value)} placeholder="необовʼязково" />
            </div>
            <div style={{ width: '150px' }}>
              <label style={lbl}>Дата</label>
              <input style={inp} type="date" value={adjDate} onChange={e => setAdjDate(e.target.value)} />
            </div>
            <div style={{ flex: 1, minWidth: '160px' }}>
              <label style={lbl}>Коментар</label>
              <input style={inp} value={adjNote} onChange={e => setAdjNote(e.target.value)} placeholder="необовʼязково" />
            </div>
            <button onClick={submitAdjust} disabled={saving}
              style={{ height: '38px', padding: '0 18px', borderRadius: '8px', border: 'none', background: adjDirection === 'charge' ? '#DC2626' : '#15803D', color: '#fff', fontSize: '13px', fontWeight: 700, cursor: saving ? 'wait' : 'pointer', opacity: saving ? 0.6 : 1 }}>
              {saving ? '...' : 'Зберегти'}
            </button>
            <button onClick={() => setAdjustOpen(false)} style={{ height: '38px', width: '38px', borderRadius: '8px', border: '1.5px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text-muted)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <X size={14} />
            </button>
          </div>
          <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '8px' }}>
            Списання зменшує баланс на площадці (збір за доставку/рекламу), нарахування — збільшує (компенсація від площадки).
          </div>
          {error && <div style={{ marginTop: '8px', color: '#DC2626', fontSize: '12px' }}>{error}</div>}
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

      {/* Звірка з кабінетом Rozetka — живі дані /balances API */}
      {marketplace === 'rozetka' && cabinetOpen && (
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', background: 'var(--bg-soft)' }}>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: '10px', flexWrap: 'wrap', marginBottom: '14px' }}>
            <div style={{ width: '150px' }}>
              <label style={lbl}>Період з</label>
              <input style={inp} type="date" value={cabinetFrom} onChange={e => setCabinetFrom(e.target.value)} />
            </div>
            <div style={{ width: '150px' }}>
              <label style={lbl}>по</label>
              <input style={inp} type="date" value={cabinetTo} onChange={e => setCabinetTo(e.target.value)} />
            </div>
            <button onClick={() => loadCabinet()} disabled={cabinetLoading}
              style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', height: '38px', padding: '0 16px', borderRadius: '8px', border: 'none', background: '#6366F1', color: '#fff', fontSize: '13px', fontWeight: 700, cursor: cabinetLoading ? 'wait' : 'pointer', opacity: cabinetLoading ? 0.6 : 1 }}>
              <RefreshCw size={14} style={cabinetLoading ? { animation: 'spin 1s linear infinite' } : undefined} />
              {cabinetLoading ? 'Завантаження…' : 'Оновити'}
            </button>
            <style>{`@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}`}</style>
            {cabinetData && (
              <div style={{ display: 'flex', gap: '22px', marginLeft: 'auto', flexWrap: 'wrap' }}>
                <div>
                  <span style={lbl}>Баланс у кабінеті</span>
                  <div style={{ fontSize: '16px', fontWeight: 800, color: 'var(--text-primary)' }}>{fmt(cabinetData.cabinet.balance)} ₴</div>
                </div>
                <div>
                  <span style={lbl}>Сіра зона (резерви)</span>
                  <div style={{ fontSize: '16px', fontWeight: 800, color: '#B45309' }}>{fmt(cabinetData.cabinet.sumInGray)} ₴</div>
                </div>
                <div>
                  <span style={lbl}>Комісії за період: Rozetka / у нас</span>
                  <div style={{ fontSize: '16px', fontWeight: 800, color: cabinetData.rows.some(r => ['diff', 'missing_ours', 'missing_theirs'].includes(r.status)) ? '#DC2626' : '#15803D' }}>
                    {fmt(cabinetData.totals.their)} / {fmt(cabinetData.totals.ours)} ₴
                  </div>
                </div>
              </div>
            )}
          </div>

          {cabinetError && <div style={{ color: '#DC2626', fontSize: '12px', marginBottom: '10px' }}>{cabinetError}</div>}

          {cabinetData && (
            <>
              <div style={{ border: '1px solid var(--border)', borderRadius: '10px', overflow: 'hidden', background: 'var(--bg-card)' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '90px 1fr 110px 110px 90px 190px', padding: '8px 14px', background: 'var(--bg-soft)', fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                  <span>Дата</span>
                  <span>Замовлення</span>
                  <span style={{ textAlign: 'right' }}>Rozetka</span>
                  <span style={{ textAlign: 'right' }}>У нас</span>
                  <span style={{ textAlign: 'right' }}>Різниця</span>
                  <span style={{ textAlign: 'right' }}>Статус</span>
                </div>
                <div style={{ maxHeight: '320px', overflowY: 'auto' }}>
                  {cabinetData.rows.length === 0 && (
                    <div style={{ padding: '20px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '13px' }}>Немає комісій за період</div>
                  )}
                  {cabinetData.rows.map((row, idx) => {
                    const statusUi: Record<CabinetRow['status'], { text: string; color: string; action: boolean }> = {
                      ok:               { text: '✓ Збігається',                        color: '#15803D', action: false },
                      diff:             { text: 'Розбіжність',                        color: '#DC2626', action: true },
                      missing_ours:     { text: 'Немає у нас',                        color: '#DC2626', action: true },
                      missing_theirs:   { text: 'Немає у Rozetka',                    color: '#DC2626', action: true },
                      pending_delivery: { text: 'В дорозі — спишеться при доставці',  color: '#B45309', action: false },
                      reserved_theirs:  { text: 'У резерві Rozetka — ще не списано',  color: '#B45309', action: false },
                    };
                    const s = statusUi[row.status];
                    return (
                      <div key={`${row.rozetkaOrderId}-${idx}`} style={{
                        display: 'grid', gridTemplateColumns: '90px 1fr 110px 110px 90px 190px',
                        padding: '8px 14px', alignItems: 'center', fontSize: '13px',
                        borderTop: idx > 0 ? '1px solid var(--border-light)' : 'none',
                      }}>
                        <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                          {row.date ? new Date(row.date).toLocaleDateString('uk-UA') : '—'}
                        </span>
                        <span style={{ color: 'var(--text-secondary)' }}>
                          {row.orderNumber ? `№${row.orderNumber}` : 'не знайдено в БД'}
                          <span style={{ color: 'var(--text-muted)', fontSize: '11px', marginLeft: '6px' }}>rz {row.rozetkaOrderId || '—'}</span>
                        </span>
                        <span style={{ textAlign: 'right', fontWeight: 600 }}>{fmt(row.theirAmount)}</span>
                        <span style={{ textAlign: 'right', fontWeight: 600 }}>{fmt(row.ourAmount)}</span>
                        <span style={{ textAlign: 'right', fontWeight: 700, color: Math.abs(row.delta) < 0.01 ? 'var(--text-muted)' : '#DC2626' }}>
                          {Math.abs(row.delta) < 0.01 ? '—' : `${row.delta > 0 ? '+' : ''}${fmt(row.delta)}`}
                        </span>
                        <span style={{ textAlign: 'right', fontSize: '11px', fontWeight: 600, color: s.color }}>
                          {s.text}
                          {s.action && (
                            <button onClick={() => prefillAdjustFromRow(row)}
                              style={{ marginLeft: '8px', height: '24px', padding: '0 10px', borderRadius: '6px', border: '1px solid #DC2626', background: 'var(--bg-card)', color: '#DC2626', fontSize: '11px', fontWeight: 700, cursor: 'pointer' }}>
                              Провести
                            </button>
                          )}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>

              {cabinetData.others.length > 0 && (
                <div style={{ marginTop: '10px', fontSize: '11px', color: 'var(--text-muted)', lineHeight: 1.6 }}>
                  <strong style={{ fontWeight: 700 }}>Інші операції кабінету за період:</strong>{' '}
                  {cabinetData.others.map(o =>
                    `${o.name} ×${o.count}${o.debit ? ` (−${fmt(o.debit)})` : ''}${o.credit ? ` (+${fmt(o.credit)})` : ''}`
                  ).join(' · ')}
                </div>
              )}
              {(cabinetData.smartFees?.count ?? 0) > 0 && (
                <div style={{ marginTop: '6px', fontSize: '11px', color: '#B45309', lineHeight: 1.6 }}>
                  <strong style={{ fontWeight: 700 }}>Smart-збори за період (наші проводки):</strong>{' '}
                  ×{cabinetData.smartFees!.count} на −{fmt(cabinetData.smartFees!.total)} ₴ — Rozetka списує їх поза випискою,
                  тому в таблиці вище їх немає; у балансі кабінету вони вже враховані.
                </div>
              )}
              <div style={{ marginTop: '6px', fontSize: '11px', color: 'var(--text-muted)', lineHeight: 1.4 }}>
                Порівнюємо комісії Rozetka (списання по замовленнях із живої виписки кабінету) з нашими проводками.
                «Провести» відкриє форму «Операція» з передзаповненою різницею — перевірте та збережіть.
              </div>
            </>
          )}
        </div>
      )}

      {/* Ledger */}
      {ledgerRows.length === 0 ? (
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
          {ledgerRows.map((row, idx) => {
            const isBalance = true;
            const isTopup = Number(row.amount) > 0;
            const typeLabel = row.doc_type === 'marketplace_topup' ? 'Поповнення'
              : row.doc_type === 'commission' ? 'Комісія'
              : row.doc_type === 'marketplace_reconciliation' ? 'Коригування'
              : row.doc_type === 'marketplace_manual_fee' || row.doc_type === 'delivery_fee' ? 'Списання'
              : row.doc_type === 'marketplace_manual_credit' ? 'Нарахування'
              : row.doc_type ?? '—';
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
