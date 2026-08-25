'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ChevronDown, ChevronRight, CheckCircle, Search, X, Banknote } from 'lucide-react';
import { showToast } from '../../../../lib/toast';

export type SupplierTransaction = {
  doc_type:      string;
  amount:        number;
  business_date: string;
  description:   string;
  doc_id:        string | null;
  doc_number:    string | null;
  acc_doc_type:  string | null;
  /** Замовлення, через яке виник борг (дропшип) — щоб було видно, за що саме */
  order_number:  number | null;
  entry_id:      string;
  /** Для оплати: які борги вона закрила */
  allocations:   { amount: number; date: string; total: number; docNumber: string | null; orderNumber: number | null }[];
  /** Для боргу: скільки з нього вже погашено */
  closed:        number;
  /** Для боргу: якими оплатами його закрито */
  paid_by:       { amount: number; date: string; docId: string | null; docNumber: string | null; docType: string | null }[];
};

/** Непогашений борг: одна проводка (прихід або РН дропшипу) із залишком */
export type OpenCharge = {
  id: string;
  date: string;
  total: number;
  allocated: number;
  remaining: number;
  docNumber: string | null;
  orderNumber: number | null;
  description: string;
};

export type SupplierAging = {
  d0_30: number; d31_60: number; d61_90: number; d90p: number;
  oldest_date: string | null;
};

export type TransitItem = {
  doc_id:          string;
  doc_number:      string | null;
  doc_date:        string;
  order_number:    number | null;
  tracking_number: string | null;
  amount:          number;
};

export type SupplierBalance = {
  supplier_id:    number;
  supplier_name:  string;
  total_receipts: number;
  total_payments: number;
  balance:        number;
  transactions:   SupplierTransaction[];
  aging?:         SupplierAging;
  /** Дропшип «в дорозі»: відвантажено, ще не доставлено — борг виникне при доставці */
  in_transit_total?: number;
  in_transit_items?: TransitItem[];
};

function fmt(n: number) {
  return Math.abs(n).toLocaleString('uk-UA', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function creditHref(docType: string | null, docId: string | null): string | null {
  if (!docId) return null;
  if (docType === 'supplier_payment' || docType === 'supplier_payment_reversal') return `/admin/finance/voucher/${docId}`;
  if (docType === 'receipt' || docType === 'stock_in') return `/admin/procurement/receipts/${docId}`;
  return `/admin/accounting/documents/${docId}`;
}

function docLink(txn: SupplierTransaction): { href: string; label: string } | null {
  if (!txn.doc_id) return null;
  if (txn.doc_type === 'receipt' || txn.acc_doc_type === 'receipt') {
    return { href: `/admin/procurement/receipts/${txn.doc_id}`, label: txn.doc_number ?? 'Прихід' };
  }
  if (txn.doc_type === 'supplier_payment' || txn.doc_type === 'supplier_payment_reversal') {
    return { href: `/admin/finance/voucher/${txn.doc_id}`, label: txn.doc_number ?? 'Оплата' };
  }
  return txn.doc_number ? { href: '#', label: txn.doc_number } : null;
}

const inp: React.CSSProperties = {
  height: '36px', padding: '0 10px',
  border: '1.5px solid var(--border)', borderRadius: '8px',
  fontSize: '13px', outline: 'none',
  color: 'var(--text-primary)', background: 'var(--bg-soft)',
};
const thStyle: React.CSSProperties = {
  fontSize: '11px', fontWeight: 700,
  color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em',
};

type Props = { balances: SupplierBalance[] };

export default function PayablesClient({ balances: allBalances }: Props) {
  const today      = new Date().toISOString().slice(0, 10);
  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10);

  const router = useRouter();
  const [filterSupplierId, setFilterSupplierId] = useState<number | ''>('');
  const [dateFrom,         setDateFrom]         = useState(monthStart);
  const [dateTo,           setDateTo]           = useState(today);
  const [dateApplied,      setDateApplied]      = useState(false);
  const [expanded,         setExpanded]         = useState<Set<number>>(new Set());

  // ── Фіксація оплати постачальнику ──
  const [payFor,    setPayFor]    = useState<number | null>(null);
  const [payAmount, setPayAmount] = useState('');
  const [payMode,   setPayMode]   = useState<'transfer' | 'cash'>('transfer');
  const [payDate,   setPayDate]   = useState(today);
  const [payNote,   setPayNote]   = useState('');
  const [paySaving, setPaySaving] = useState(false);
  // Як рознести суму по боргах. За замовчуванням — найстаріші: так закривається
  // те, що висить найдовше, і старіння боргу не росте на порожньому місці.
  const [payFill,   setPayFill]   = useState<'oldest' | 'newest' | 'manual'>('oldest');
  const [charges,   setCharges]   = useState<OpenCharge[] | null>(null);
  const [manual,    setManual]    = useState<Record<string, string>>({});
  /** Розгорнуті рознесення оплат: «на що пішла ця оплата» */
  const [openAlloc, setOpenAlloc] = useState<Record<string, boolean>>({});

  function openPay(b: SupplierBalance) {
    setPayFor(b.supplier_id);
    setPayAmount(b.balance < 0 ? Math.abs(b.balance).toFixed(2) : '');
    setPayMode('transfer');
    setPayDate(today);
    setPayNote('');
    setPayFill('oldest');
    setManual({});
    setCharges(null);
    // Список боргів тягнемо при відкритті: він потрібен і для попереднього
    // перегляду («що саме закриється»), і для ручного рознесення.
    fetch(`/api/admin/finance/supplier-payments?supplier_id=${b.supplier_id}`)
      .then(r => r.ok ? r.json() : { charges: [] })
      .then(d => setCharges(d.charges ?? []))
      .catch(() => setCharges([]));
  }

  /** Що закриє введена сума — рахуємо на льоту, тим самим правилом, що й сервер */
  function previewLines(): { id: string; amount: number }[] {
    const amount = parseFloat(payAmount.replace(',', '.'));
    if (!charges || !Number.isFinite(amount) || amount <= 0) return [];
    if (payFill === 'manual') {
      return Object.entries(manual)
        .map(([id, v]) => ({ id, amount: parseFloat(String(v).replace(',', '.')) }))
        .filter(l => Number.isFinite(l.amount) && l.amount > 0);
    }
    const sorted = [...charges].sort((a, b) => (a.date === b.date ? a.id.localeCompare(b.id) : a.date.localeCompare(b.date)));
    if (payFill === 'newest') sorted.reverse();
    let left = Math.round(amount * 100);
    const out: { id: string; amount: number }[] = [];
    for (const c of sorted) {
      if (left <= 0) break;
      const take = Math.min(left, Math.round(c.remaining * 100));
      if (take <= 0) continue;
      out.push({ id: c.id, amount: take / 100 });
      left -= take;
    }
    return out;
  }

  async function submitPay() {
    const amount = parseFloat(payAmount.replace(',', '.'));
    if (!payFor || !Number.isFinite(amount) || amount <= 0) {
      showToast('Вкажіть коректну суму', 'error');
      return;
    }
    setPaySaving(true);
    try {
      const res = await fetch('/api/admin/finance/supplier-payments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          supplier_id: payFor, amount, payment_mode: payMode, payment_date: payDate, note: payNote,
          allocation_mode: payFill,
          allocations: payFill === 'manual'
            ? previewLines().map(l => ({ charge_id: l.id, amount: l.amount }))
            : undefined,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        const left = Number(data.unallocated ?? 0);
        showToast(
          data.warning
            ? data.warning
            : `Оплату зафіксовано (${data.doc_number ?? ''}) · закрито документів: ${data.allocated ?? 0}`
              + (left > 0.005 ? ` · аванс ${left.toFixed(2)} ₴` : ''),
          data.warning ? 'error' : 'success',
        );
        setPayFor(null);
        router.refresh();
      } else {
        showToast(data.error ?? 'Помилка збереження оплати', 'error');
      }
    } catch {
      showToast('Помилка збереження оплати', 'error');
    }
    setPaySaving(false);
  }

  function toggle(id: number) {
    setExpanded(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function handleSearch() {
    setDateApplied(true);
    // Авто-розкриваємо якщо вибраний один постачальник
    if (filterSupplierId !== '') {
      setExpanded(new Set([filterSupplierId as number]));
    }
  }

  function handleReset() {
    setFilterSupplierId('');
    setDateFrom(monthStart);
    setDateTo(today);
    setDateApplied(false);
    setExpanded(new Set());
  }

  // Фільтрована + перерахована вибірка
  const balances = useMemo(() => {
    let result = allBalances;

    if (filterSupplierId !== '') {
      result = result.filter(b => b.supplier_id === filterSupplierId);
    }

    if (dateApplied) {
      result = result.map(b => {
        const txns = b.transactions.filter(t =>
          (!dateFrom || t.business_date >= dateFrom) &&
          (!dateTo   || t.business_date <= dateTo)
        );
        let receipts = 0, payments = 0, bal = 0;
        for (const t of txns) {
          bal += t.amount;
          if (t.amount < 0) receipts += Math.abs(t.amount);
          else payments += t.amount;
        }
        return { ...b, transactions: txns, total_receipts: receipts, total_payments: payments, balance: bal };
      }).filter(b => b.transactions.length > 0);
    } else {
      result = result.filter(b => Math.abs(b.balance) > 0.01);
    }

    return result.sort((a, b) => a.balance - b.balance);
  }, [allBalances, filterSupplierId, dateFrom, dateTo, dateApplied]);

  const totalDebt      = balances.filter(b => b.balance < 0).reduce((s, b) => s + Math.abs(b.balance), 0);
  const totalOverpaid  = balances.filter(b => b.balance > 0).reduce((s, b) => s + b.balance, 0);
  const debtCount      = balances.filter(b => b.balance < 0).length;
  const overpaidCount  = balances.filter(b => b.balance > 0).length;
  // «В дорозі» — стан на зараз (не залежить від фільтра дат): відвантажено, не доставлено
  const totalTransit   = balances.reduce((s, b) => s + (b.in_transit_total ?? 0), 0);
  const transitCount   = balances.reduce((s, b) => s + (b.in_transit_items?.length ?? 0), 0);
  const totalOwed      = totalDebt + totalTransit;

  const periodLabel = dateApplied
    ? `${dateFrom} — ${dateTo}`
    : 'за весь час';

  return (
    <>
      {/* ── Filter bar ───────────────────────────────────────────────────── */}
      <div className="fin-card" style={{
        marginBottom: '20px',
        display: 'flex', gap: '12px', alignItems: 'flex-end', flexWrap: 'wrap',
      }}>
        {/* Постачальник */}
        <div style={{ flex: '1 1 220px', minWidth: '180px', position: 'relative' }}>
          <label style={{ ...thStyle, display: 'block', marginBottom: '4px' }}>Постачальник</label>
          <div style={{ position: 'relative' }}>
            <select
              value={filterSupplierId}
              onChange={e => {
                setFilterSupplierId(e.target.value === '' ? '' : Number(e.target.value));
                setDateApplied(false);
              }}
              style={{ ...inp, width: '100%', paddingRight: '28px', cursor: 'pointer', appearance: 'none', WebkitAppearance: 'none' }}
            >
              <option value="">Всі постачальники ({allBalances.length})</option>
              {allBalances.map(b => (
                <option key={b.supplier_id} value={b.supplier_id}>{b.supplier_name}</option>
              ))}
            </select>
            {filterSupplierId !== '' && (
              <button
                onClick={() => { setFilterSupplierId(''); setDateApplied(false); }}
                style={{ position: 'absolute', right: '24px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex', padding: 0 }}
              >
                <X size={13} />
              </button>
            )}
            <ChevronDown size={13} style={{ position: 'absolute', right: '8px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', pointerEvents: 'none' }} />
          </div>
        </div>

        {/* Від */}
        <div>
          <label style={{ ...thStyle, display: 'block', marginBottom: '4px' }}>З</label>
          <input type="date" value={dateFrom} onChange={e => { setDateFrom(e.target.value); setDateApplied(false); }} style={inp} />
        </div>

        {/* До */}
        <div>
          <label style={{ ...thStyle, display: 'block', marginBottom: '4px' }}>По</label>
          <input type="date" value={dateTo} onChange={e => { setDateTo(e.target.value); setDateApplied(false); }} style={inp} />
        </div>

        {/* Buttons */}
        <button
          onClick={handleSearch}
          style={{
            height: '36px', padding: '0 20px', borderRadius: '8px', border: 'none',
            background: '#1E3A5F', color: '#fff', fontSize: '13px', fontWeight: 700,
            cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '7px',
          }}
        >
          <Search size={14} />
          Показати
        </button>

        {(filterSupplierId !== '' || dateApplied) && (
          <button
            onClick={handleReset}
            style={{
              height: '36px', padding: '0 14px', borderRadius: '8px',
              border: '1px solid var(--border)', background: 'var(--bg-soft)',
              color: 'var(--text-secondary)', fontSize: '13px', cursor: 'pointer',
            }}
          >
            Скинути
          </button>
        )}
      </div>

      {/* Summary cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px', marginBottom: '20px' }}>
        {[
          {
            label: 'Разом до сплати',
            value: totalOwed > 0 ? `${fmt(totalOwed)} ₴` : '—',
            sub: 'проведений борг + в дорозі',
            color: totalOwed > 0 ? '#DC2626' : undefined,
          },
          {
            label: 'Отримано клієнтами (борг)',
            value: totalDebt > 0 ? `${fmt(totalDebt)} ₴` : '—',
            sub: `${debtCount} пост. · ${periodLabel}`,
            color: totalDebt > 0 ? '#DC2626' : undefined,
          },
          {
            label: 'В дорозі (не доставлено)',
            value: totalTransit > 0 ? `${fmt(totalTransit)} ₴` : '—',
            sub: transitCount > 0 ? `${transitCount} посилок · борг виникне при доставці` : 'посилок немає',
            color: totalTransit > 0 ? '#B45309' : undefined,
          },
          {
            label: 'Переплата',
            value: totalOverpaid > 0 ? `${fmt(totalOverpaid)} ₴` : '—',
            sub: `${overpaidCount} пост. · ${periodLabel}`,
            color: totalOverpaid > 0 ? '#15803D' : undefined,
          },
        ].map(c => (
          <div key={c.label} className="fin-card">
            <div className="fin-kpi-label">{c.label}</div>
            <div className="fin-money-val" style={c.color ? { color: c.color } : undefined}>{c.value}</div>
            <div className="fin-money-sub">{c.sub}</div>
          </div>
        ))}
      </div>

      {balances.length === 0 ? (
        <div className="fin-card" style={{ padding: '64px', textAlign: 'center' }}>
          <CheckCircle size={32} color="#15803D" style={{ marginBottom: '12px' }} />
          <div style={{ fontSize: '15px', fontWeight: 700, color: '#15803D' }}>
            {dateApplied ? 'Немає операцій за обраний період' : 'Взаєморозрахунків немає'}
          </div>
          <div style={{ fontSize: '13px', color: 'var(--text-muted)', marginTop: '4px' }}>
            {dateApplied ? `${dateFrom} — ${dateTo}` : 'Немає операцій з постачальниками'}
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {balances.map(b => {
            const isOpen      = expanded.has(b.supplier_id);
            const transit     = b.in_transit_total ?? 0;
            const totalOwedB  = -b.balance + transit; // >0 = винні разом (проведено + в дорозі)
            const isDebt      = totalOwedB > 0.005;
            const accentColor = isDebt ? '#DC2626' : '#15803D';

            return (
              <div key={b.supplier_id} className="fin-card" style={{ padding: 0, overflow: 'hidden' }}>
                {/* Header row */}
                <div
                  className="sup-row"
                  onClick={() => toggle(b.supplier_id)}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '1fr 130px 130px 130px 170px 36px',
                    padding: '14px 16px', alignItems: 'center', cursor: 'pointer',
                    background: isOpen ? 'var(--bg-soft)' : 'transparent',
                  }}
                >
                  <div>
                    <div style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text-primary)' }}>
                      {b.supplier_name}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginTop: '2px' }}>
                      <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                        {b.transactions.length} транзакцій · {periodLabel}
                      </span>
                      <Link
                        href={`/admin/finance/payables/${b.supplier_id}`}
                        onClick={e => e.stopPropagation()}
                        style={{ fontSize: '11px', fontWeight: 700, color: '#1E3A5F', textDecoration: 'none', background: 'var(--bg-soft)', border: '1px solid var(--border)', borderRadius: '5px', padding: '1px 7px' }}>
                        Акт звірки ↗
                      </Link>
                      <button
                        onClick={e => { e.stopPropagation(); payFor === b.supplier_id ? setPayFor(null) : openPay(b); }}
                        style={{ fontSize: '11px', fontWeight: 700, color: '#15803D', background: 'var(--bg-soft)', border: '1px solid var(--border)', borderRadius: '5px', padding: '1px 7px', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                        <Banknote size={11} /> Оплатити
                      </button>
                    </div>
                    {/* AP-aging: старіння непогашеного боргу (оплати погашають найстаріші борги за FIFO) */}
                    {!dateApplied && b.aging && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '5px', flexWrap: 'wrap' }}>
                        {([
                          ['0–30 дн', b.aging.d0_30,  'var(--text-secondary)'],
                          ['31–60',   b.aging.d31_60, '#B45309'],
                          ['61–90',   b.aging.d61_90, '#B45309'],
                          ['90+',     b.aging.d90p,   '#DC2626'],
                        ] as const).filter(([, v]) => v > 0.005).map(([lbl, v, color]) => (
                          <span key={lbl} style={{ fontSize: '10.5px', fontWeight: 700, color, background: 'var(--bg-soft)', borderRadius: '5px', padding: '1px 7px' }}>
                            {lbl}: {fmt(v)} ₴
                          </span>
                        ))}
                        {b.aging.oldest_date && (
                          <span style={{ fontSize: '10.5px', color: 'var(--text-muted)' }}>
                            найстаріший борг: {new Date(b.aging.oldest_date).toLocaleDateString('uk-UA')}
                          </span>
                        )}
                      </div>
                    )}
                  </div>

                  <div className="oc-hide-m" style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '2px' }}>Куплено</div>
                    <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)' }}>{fmt(b.total_receipts)} ₴</div>
                  </div>

                  <div className="oc-hide-m" style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '2px' }}>Оплачено</div>
                    <div style={{ fontSize: '14px', fontWeight: 600, color: '#15803D' }}>{fmt(b.total_payments)} ₴</div>
                  </div>

                  <div className="oc-hide-m" style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '2px' }}>В дорозі</div>
                    <div style={{ fontSize: '14px', fontWeight: 700, color: transit > 0 ? '#B45309' : 'var(--text-muted)' }}>
                      {transit > 0 ? `${fmt(transit)} ₴` : '—'}
                    </div>
                  </div>

                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '2px' }}>
                      {isDebt ? 'Разом до сплати' : 'Переплата'}
                    </div>
                    <div style={{ fontSize: '16px', fontWeight: 800, color: accentColor }}>
                      {isDebt ? '−' : '+'}{fmt(totalOwedB)} ₴
                    </div>
                    {isDebt && transit > 0 && (
                      <div style={{ fontSize: '10.5px', color: 'var(--text-muted)', marginTop: '1px' }}>
                        отримано: {fmt(Math.max(-b.balance, 0))} · в дорозі: <span style={{ color: '#B45309', fontWeight: 700 }}>{fmt(transit)}</span>
                      </div>
                    )}
                  </div>

                  <span style={{ display: 'flex', justifyContent: 'center', color: 'var(--text-muted)' }}>
                    {isOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                  </span>
                </div>

                {/* Payment form */}
                {payFor === b.supplier_id && (
                  <div style={{ borderTop: '1px solid var(--border)', background: 'var(--bg-soft)', padding: '14px 20px', display: 'flex', gap: '10px', alignItems: 'flex-end', flexWrap: 'wrap' }}>
                    <div>
                      <label style={{ ...thStyle, display: 'block', marginBottom: '4px' }}>Сума, ₴</label>
                      <input value={payAmount} onChange={e => setPayAmount(e.target.value)} inputMode="decimal" placeholder="0.00"
                        style={{ ...inp, width: '120px', fontWeight: 700 }} />
                    </div>
                    <div>
                      <label style={{ ...thStyle, display: 'block', marginBottom: '4px' }}>Спосіб</label>
                      <select value={payMode} onChange={e => setPayMode(e.target.value as 'transfer' | 'cash')} style={{ ...inp, cursor: 'pointer' }}>
                        <option value="transfer">🏦 Безготівковий</option>
                        <option value="cash">💵 Готівка</option>
                      </select>
                    </div>
                    <div>
                      <label style={{ ...thStyle, display: 'block', marginBottom: '4px' }}>Дата</label>
                      <input type="date" value={payDate} onChange={e => setPayDate(e.target.value)} style={inp} />
                    </div>
                    <div style={{ flex: '1 1 180px' }}>
                      <label style={{ ...thStyle, display: 'block', marginBottom: '4px' }}>Коментар</label>
                      <input value={payNote} onChange={e => setPayNote(e.target.value)} placeholder="напр., оплата за тиждень"
                        style={{ ...inp, width: '100%', boxSizing: 'border-box' }} />
                    </div>
                    <button onClick={submitPay} disabled={paySaving}
                      style={{ height: '36px', padding: '0 20px', borderRadius: '8px', border: 'none', background: '#1E3A5F', color: '#fff', fontSize: '13px', fontWeight: 700, cursor: paySaving ? 'wait' : 'pointer', opacity: paySaving ? 0.6 : 1 }}>
                      {paySaving ? 'Зберігаємо…' : 'Зафіксувати оплату'}
                    </button>
                    <button onClick={() => setPayFor(null)}
                      style={{ height: '36px', padding: '0 12px', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text-secondary)', fontSize: '13px', cursor: 'pointer' }}>
                      Скасувати
                    </button>

                    {/* Рознесення оплати по боргах. Без нього оплата зменшувала
                        загальне сальдо, і питання «за які накладні ми ще винні»
                        лишалось без відповіді. */}
                    <div style={{ flexBasis: '100%', borderTop: '1px dashed var(--border)', paddingTop: '12px', marginTop: '2px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap', marginBottom: '8px' }}>
                        <span style={thStyle}>Рознести на</span>
                        {([
                          { key: 'oldest', label: 'найстаріші накладні' },
                          { key: 'newest', label: 'найновіші' },
                          { key: 'manual', label: 'вибрати вручну' },
                        ] as const).map(o => (
                          <button key={o.key} type="button" onClick={() => setPayFill(o.key)}
                            style={{
                              height: '28px', padding: '0 12px', borderRadius: '999px', cursor: 'pointer', fontSize: '12px',
                              fontWeight: payFill === o.key ? 700 : 600,
                              border: `1.5px solid ${payFill === o.key ? '#1E3A5F' : 'var(--border)'}`,
                              background: payFill === o.key ? '#EAF1F8' : 'var(--bg-card)',
                              color: payFill === o.key ? '#1E3A5F' : 'var(--text-secondary)',
                            }}>
                            {o.label}
                          </button>
                        ))}
                      </div>

                      {charges === null ? (
                        <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Завантажуємо борги…</div>
                      ) : charges.length === 0 ? (
                        <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                          Непогашених накладних немає — оплата ляже авансом.
                        </div>
                      ) : (() => {
                        const lines = previewLines();
                        const picked = new Map(lines.map(l => [l.id, l.amount]));
                        const sum = lines.reduce((t, l) => t + l.amount, 0);
                        const amount = parseFloat(payAmount.replace(',', '.')) || 0;
                        const rest = Math.round((amount - sum) * 100) / 100;
                        return (
                          <div>
                            <div style={{ maxHeight: '190px', overflowY: 'auto', border: '1px solid var(--border-light)', borderRadius: '8px' }}>
                              {charges.map((c, i) => {
                                const take = picked.get(c.id) ?? 0;
                                return (
                                  <div key={c.id} style={{
                                    display: 'grid', gridTemplateColumns: '80px 120px 1fr 110px 120px', gap: '8px', alignItems: 'center',
                                    padding: '6px 10px', fontSize: '12px',
                                    background: take > 0 ? '#F0FDF4' : 'transparent',
                                    borderBottom: i < charges.length - 1 ? '1px solid var(--border-light)' : 'none',
                                  }}>
                                    <span style={{ color: 'var(--text-muted)' }}>{c.date.slice(8, 10)}.{c.date.slice(5, 7)}.{c.date.slice(2, 4)}</span>
                                    <span style={{ fontFamily: 'monospace', fontWeight: 700, color: '#B45309' }}>{c.docNumber ?? '—'}</span>
                                    <span style={{ color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                      {c.orderNumber != null ? (
                                        <Link href={`/admin?status=&q=${c.orderNumber}`} style={{ color: 'var(--brand-blue)', fontWeight: 700, textDecoration: 'none' }}>
                                          #{c.orderNumber}
                                        </Link>
                                      ) : c.description}
                                    </span>
                                    <span style={{ textAlign: 'right', fontFamily: 'monospace' }}>
                                      {fmt(c.remaining)} ₴
                                      {c.allocated > 0.005 && (
                                        <span style={{ color: 'var(--text-muted)', fontSize: '11px' }}> із {fmt(c.total)}</span>
                                      )}
                                    </span>
                                    {payFill === 'manual' ? (() => {
                                      const entered = parseFloat(String(manual[c.id] ?? '').replace(',', '.')) || 0;
                                      const full = Math.abs(entered - c.remaining) < 0.005;
                                      // Скільки з оплати ще вільно (без цього рядка)
                                      const usedElsewhere = Object.entries(manual)
                                        .filter(([id]) => id !== c.id)
                                        .reduce((t, [, v]) => t + (parseFloat(String(v).replace(',', '.')) || 0), 0);
                                      const free = Math.max(0, (parseFloat(payAmount.replace(',', '.')) || 0) - usedElsewhere);
                                      const fill = Math.round(Math.min(c.remaining, free) * 100) / 100;
                                      return (
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                          <input type="checkbox" checked={full}
                                            disabled={!full && fill <= 0}
                                            title={full ? 'Зняти рознесення на цю накладну'
                                              : fill < c.remaining ? `Закрити частково: вільно лише ${fmt(fill)} ₴`
                                              : 'Закрити накладну повністю'}
                                            onChange={e => setManual(m => {
                                              const next = { ...m };
                                              if (e.target.checked) next[c.id] = fill.toFixed(2);
                                              else delete next[c.id];
                                              return next;
                                            })}
                                            style={{ width: '15px', height: '15px', flexShrink: 0, cursor: (!full && fill <= 0) ? 'not-allowed' : 'pointer' }} />
                                          <input
                                            value={manual[c.id] ?? ''}
                                            onChange={e => setManual(m => ({ ...m, [c.id]: e.target.value }))}
                                            inputMode="decimal" placeholder="0.00"
                                            style={{ ...inp, height: '26px', width: '100%', minWidth: 0, boxSizing: 'border-box', textAlign: 'right' }} />
                                        </div>
                                      );
                                    })() : (
                                      <span style={{ textAlign: 'right', fontWeight: 700, color: take > 0 ? '#15803D' : 'var(--text-muted)', fontFamily: 'monospace' }}>
                                        {take > 0 ? `−${fmt(take)} ₴` : '—'}
                                      </span>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                            <div style={{ marginTop: '6px', fontSize: '12px', color: 'var(--text-secondary)' }}>
                              Закриється документів: <b>{lines.length}</b> на <b>{fmt(sum)} ₴</b>
                              {rest > 0.005 && <span style={{ color: '#B45309' }}> · аванс {fmt(rest)} ₴</span>}
                              {rest < -0.005 && <span style={{ color: '#DC2626' }}> · рознесено більше за оплату на {fmt(-rest)} ₴</span>}
                            </div>
                          </div>
                        );
                      })()}
                    </div>
                  </div>
                )}

                {/* В дорозі: відвантажені, ще не доставлені посилки — борг виникне при доставці */}
                {isOpen && (b.in_transit_items?.length ?? 0) > 0 && (
                  <div style={{ borderTop: '1px solid var(--border)', background: 'var(--bg-soft)', padding: '10px 20px' }}>
                    <div style={{ fontSize: '11px', fontWeight: 700, color: '#B45309', textTransform: 'uppercase', marginBottom: '6px' }}>
                      В дорозі — {b.in_transit_items!.length} посилок на {fmt(transit)} ₴ (борг проведеться при доставці)
                    </div>
                    {b.in_transit_items!.map(it => (
                      <div key={it.doc_id} style={{ display: 'grid', gridTemplateColumns: '100px 140px 1fr 140px', gap: '8px', padding: '4px 0', fontSize: '12px', alignItems: 'center' }}>
                        <span style={{ color: 'var(--text-muted)' }}>
                          {it.doc_date ? new Date(it.doc_date).toLocaleDateString('uk-UA', { day: '2-digit', month: '2-digit', year: '2-digit' }) : '—'}
                        </span>
                        <span style={{ fontFamily: 'monospace', fontWeight: 700, color: '#B45309' }}>{it.doc_number ?? '—'}</span>
                        <span style={{ color: 'var(--text-secondary)' }}>
                          {it.order_number ? `Замовлення #${it.order_number}` : ''}{it.tracking_number ? ` · ТТН ${it.tracking_number}` : ''}
                        </span>
                        <span style={{ textAlign: 'right', fontWeight: 700, color: '#B45309' }}>−{fmt(it.amount)} ₴</span>
                      </div>
                    ))}
                  </div>
                )}

                {/* Transactions */}
                {isOpen && (
                  <div style={{ borderTop: '1px solid var(--border)' }}>
                    <div className="sup-txn-row" style={{
                      display: 'grid', gridTemplateColumns: '100px 140px 1fr 140px',
                      padding: '6px 20px', gap: '8px',
                      fontSize: '12px', fontWeight: 700, color: 'var(--text-muted)',
                      textTransform: 'uppercase', background: 'var(--bg-soft)',
                      borderBottom: '1px solid var(--border)',
                    }}>
                      <span>Дата</span>
                      <span className="oc-hide-m">Документ</span>
                      <span>Опис</span>
                      <span style={{ textAlign: 'right' }}>Сума</span>
                    </div>

                    {b.transactions.length === 0 ? (
                      <div style={{ padding: '24px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '13px' }}>
                        Немає операцій за обраний період
                      </div>
                    ) : (() => {
                      let running = 0;
                      return b.transactions.map((txn, idx) => {
                        running += txn.amount;
                        const isPayment = txn.amount > 0;
                        const link = docLink(txn);

                        const allocOpen = openAlloc[txn.entry_id] ?? false;

                        return (
                          <div key={idx}>
                          <div className="sup-txn-row" style={{
                            display: 'grid', gridTemplateColumns: '100px 140px 1fr 140px',
                            padding: '9px 20px', gap: '8px', alignItems: 'center',
                            borderTop: idx > 0 ? '1px solid var(--border-light)' : 'none',
                          }}>
                            <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                              {new Date(txn.business_date).toLocaleDateString('uk-UA', { day: '2-digit', month: '2-digit', year: '2-digit' })}
                            </span>

                            <span className="oc-hide-m">
                              {link && link.href !== '#' ? (
                                <Link href={link.href} onClick={e => e.stopPropagation()} style={{ fontSize: '12px', fontWeight: 700, color: 'var(--brand-blue)', textDecoration: 'none', fontFamily: 'monospace' }}>
                                  {link.label}
                                </Link>
                              ) : (
                                <span style={{ fontSize: '12px', color: 'var(--text-muted)', fontFamily: 'monospace' }}>
                                  {link?.label ?? '—'}
                                </span>
                              )}
                            </span>

                            <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                              {txn.description}
                              {txn.order_number != null && (
                                <Link href={`/admin?status=&q=${txn.order_number}`}
                                  title="Відкрити замовлення"
                                  style={{ marginLeft: '6px', color: 'var(--brand-blue)', fontWeight: 700, textDecoration: 'none', whiteSpace: 'nowrap' }}>
                                  #{txn.order_number}
                                </Link>
                              )}
                              {/* Куди пішла оплата: без цього після проведення
                                  відповісти на «які накладні вона закрила» можна
                                  було лише запитом до бази. */}
                              {isPayment && txn.allocations.length > 0 && (
                                <button type="button"
                                  onClick={e => { e.stopPropagation(); setOpenAlloc(m => ({ ...m, [txn.entry_id]: !allocOpen })); }}
                                  style={{ marginLeft: '8px', background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontSize: '11.5px', fontWeight: 600, color: 'var(--brand-blue)' }}>
                                  {allocOpen ? '▾' : '▸'} закрила {txn.allocations.length} док.
                                </button>
                              )}
                              {!isPayment && txn.closed > 0.005 && (() => {
                                const full = Math.abs(txn.closed - Math.abs(txn.amount)) < 0.005;
                                const label = full ? '✓ оплачено' : `частково: ${fmt(txn.closed)} із ${fmt(Math.abs(txn.amount))} ₴`;
                                const color = full ? '#15803D' : '#B45309';
                                const single = txn.paid_by.length === 1 ? txn.paid_by[0] : null;
                                // Одна оплата — ведемо просто на неї; кілька —
                                // розкриваємо перелік, бо вести «на першу» було б
                                // напівправдою.
                                const singleHref = single ? creditHref(single.docType, single.docId) : null;
                                if (single && singleHref) {
                                  return (
                                    <Link href={singleHref} onClick={e => e.stopPropagation()}
                                      title={`Закрито документом ${single.docNumber ?? ''} від ${single.date ? new Date(single.date).toLocaleDateString('uk-UA') : '—'}`}
                                      style={{ marginLeft: '8px', fontSize: '11.5px', fontWeight: 600, color, textDecoration: 'none', borderBottom: `1px dotted ${color}` }}>
                                      {label}
                                    </Link>
                                  );
                                }
                                if (txn.paid_by.length > 1) {
                                  return (
                                    <button type="button"
                                      onClick={e => { e.stopPropagation(); setOpenAlloc(m => ({ ...m, [txn.entry_id]: !allocOpen })); }}
                                      style={{ marginLeft: '8px', background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontSize: '11.5px', fontWeight: 600, color }}>
                                      {allocOpen ? '▾' : '▸'} {label} · {txn.paid_by.length} оплати
                                    </button>
                                  );
                                }
                                return <span style={{ marginLeft: '8px', fontSize: '11.5px', fontWeight: 600, color }}>{label}</span>;
                              })()}
                            </span>

                            <div style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                              <div style={{ fontSize: '13px', fontWeight: 700, color: isPayment ? '#15803D' : '#DC2626' }}>
                                {isPayment ? '+' : '−'}{fmt(txn.amount)} ₴
                              </div>
                              <div style={{ fontSize: '10px', color: running < 0 ? '#DC2626' : '#15803D', marginTop: '1px' }}>
                                баланс: {running < 0 ? '−' : '+'}{fmt(running)} ₴
                              </div>
                            </div>
                          </div>

                          {!isPayment && allocOpen && txn.paid_by.length > 0 && (
                            <div style={{ background: 'var(--bg-soft)', padding: '6px 20px 10px 40px' }}>
                              {txn.paid_by.map((p, i) => (
                                <div key={i} style={{ display: 'grid', gridTemplateColumns: '90px 1fr 150px', gap: '8px', padding: '3px 0', fontSize: '12px', alignItems: 'center' }}>
                                  <span style={{ color: 'var(--text-muted)' }}>
                                    {p.date ? new Date(p.date).toLocaleDateString('uk-UA', { day: '2-digit', month: '2-digit', year: '2-digit' }) : '—'}
                                  </span>
                                  <span>
                                    {creditHref(p.docType, p.docId) ? (
                                      <Link href={creditHref(p.docType, p.docId)!} onClick={e => e.stopPropagation()}
                                        style={{ color: 'var(--brand-blue)', fontWeight: 700, textDecoration: 'none', fontFamily: 'monospace' }}>
                                        {p.docNumber ?? 'Оплата'}
                                      </Link>
                                    ) : (p.docNumber ?? 'Оплата')}
                                  </span>
                                  <span style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: '#15803D', fontWeight: 600 }}>
                                    {fmt(p.amount)} ₴
                                  </span>
                                </div>
                              ))}
                            </div>
                          )}

                          {isPayment && allocOpen && (
                            <div style={{ background: 'var(--bg-soft)', padding: '6px 20px 10px 40px' }}>
                              {txn.allocations.map((a, i) => (
                                <div key={i} style={{ display: 'grid', gridTemplateColumns: '90px 130px 1fr 150px', gap: '8px', padding: '3px 0', fontSize: '12px', alignItems: 'center' }}>
                                  <span style={{ color: 'var(--text-muted)' }}>
                                    {a.date ? new Date(a.date).toLocaleDateString('uk-UA', { day: '2-digit', month: '2-digit', year: '2-digit' }) : '—'}
                                  </span>
                                  <span style={{ fontFamily: 'monospace', fontWeight: 700, color: '#B45309' }}>{a.docNumber ?? '—'}</span>
                                  <span>
                                    {a.orderNumber != null && (
                                      <Link href={`/admin?status=&q=${a.orderNumber}`} onClick={e => e.stopPropagation()}
                                        style={{ color: 'var(--brand-blue)', fontWeight: 700, textDecoration: 'none' }}>
                                        #{a.orderNumber}
                                      </Link>
                                    )}
                                  </span>
                                  <span style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: '#15803D', fontWeight: 600 }}>
                                    {fmt(a.amount)} ₴
                                    {Math.abs(a.amount - a.total) > 0.005 && (
                                      <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}> із {fmt(a.total)}</span>
                                    )}
                                  </span>
                                </div>
                              ))}
                            </div>
                          )}
                          </div>
                        );
                      });
                    })()}

                    {/* Total */}
                    <div className="sup-txn-row" style={{
                      display: 'grid', gridTemplateColumns: '100px 140px 1fr 140px',
                      padding: '8px 20px', gap: '8px',
                      borderTop: '2px solid var(--border)',
                      background: 'var(--bg-soft)',
                    }}>
                      <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-muted)', gridColumn: '1 / 4' }}>
                        Підсумок · {periodLabel}
                      </span>
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontSize: '14px', fontWeight: 800, color: accentColor }}>
                          {isDebt ? '−' : '+'}{fmt(b.balance)} ₴
                        </div>
                        <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                          {isDebt ? 'борг постачальнику' : 'переплата'}
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}
