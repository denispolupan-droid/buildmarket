'use client';

import { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { Search, RefreshCw, ExternalLink, X, ChevronDown, AlertCircle } from 'lucide-react';

type Customer = {
  id: string;
  name: string;
  company: string | null;
  legal_name: string | null;
};
type Contract = {
  id: string;
  contract_number: string;
  customer_id: string;
  customer_name: string | null;
  status: string;
};
type TxnRow = {
  id: string; txn_id: string; business_date: string;
  customer_id: string; contract_id: string | null; contract_number: string | null; customer_name: string | null;
  amount: number; currency: string; doc_type: string | null; description: string | null;
  order_id: string | null; doc_id: string | null; entry_type: 'debit' | 'credit'; created_by: string | null;
  order_number: number | null;
};
type DebtorRow = {
  customer_id: string; customer_name: string | null;
  contract_id: string | null; contract_number: string | null;
  balance: number; credit_limit: number; credit_days: number;
  contract_status: string; last_ship_date: string | null; days_overdue: number;
};

function customerLabel(c: Customer) {
  return c.company?.trim() || c.legal_name?.trim() || c.name;
}
function fmt(n: number) {
  return n.toLocaleString('uk-UA', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function fmtShort(n: number) {
  return n.toLocaleString('uk-UA', { maximumFractionDigits: 0 });
}

const DOC_TYPE_LABELS: Record<string, string> = {
  sale: 'Відвантаження', payment: 'Оплата', return_out: 'Повернення',
  cogs: 'Собівартість',  correction: 'Коригування',
};

function rowContent(row: TxnRow): { label: string; href: string | null } {
  const typeLabel = DOC_TYPE_LABELS[row.doc_type ?? ''] ?? row.doc_type ?? '—';
  const docRef    = row.order_number ? ` / Замовлення #${row.order_number}` : '';
  const label     = (row.description ?? typeLabel) + docRef;
  const href      = row.doc_id ? `/admin/accounting/documents/${row.doc_id}` : null;
  return { label, href };
}

function SaldoBadge({ value, size = 'md' }: { value: number; size?: 'sm' | 'md' }) {
  const color = value > 0.005 ? '#DC2626' : '#15803D';
  const fs    = size === 'sm' ? '12px' : '13px';
  return (
    <span style={{ fontWeight: 700, color, background: 'var(--bg-soft)', borderRadius: '6px', padding: '1px 8px', fontSize: fs, whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>
      {fmt(value)} ₴
    </span>
  );
}

// ── Searchable combobox ───────────────────────────────────────────────────────
function CustomerCombobox({
  customers, value, onChange, placeholder, style,
}: {
  customers: Customer[];
  value: string;
  onChange: (id: string) => void;
  placeholder?: string;
  style?: React.CSSProperties;
}) {
  const [input,    setInput]    = useState('');
  const [open,     setOpen]     = useState(false);
  const [focused,  setFocused]  = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const selected = customers.find(c => c.id === value) ?? null;

  // Синхронізуємо input з вибраним клієнтом
  useEffect(() => {
    if (!focused) {
      setInput(selected ? customerLabel(selected) : '');
    }
  }, [selected, focused]);

  // Клік поза компонентом — закриваємо
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
        setFocused(false);
        setInput(selected ? customerLabel(selected) : '');
      }
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [selected]);

  const filtered = useMemo(() => {
    const q = input.trim().toLowerCase();
    if (!q) return customers;
    return customers.filter(c => customerLabel(c).toLowerCase().includes(q));
  }, [customers, input]);

  function handleSelect(c: Customer) {
    onChange(c.id);
    setInput(customerLabel(c));
    setOpen(false);
    setFocused(false);
  }

  function handleClear(e: React.MouseEvent) {
    e.stopPropagation();
    onChange('');
    setInput('');
    setOpen(false);
  }

  const base: React.CSSProperties = {
    height: '36px', padding: '0 32px 0 10px',
    border: `1.5px solid ${open || focused ? '#1E3A5F' : 'var(--border)'}`,
    borderRadius: '8px', fontSize: '13px', outline: 'none',
    color: 'var(--text-primary)', background: 'var(--bg-soft)',
    width: '100%', boxSizing: 'border-box',
  };

  return (
    <div ref={ref} style={{ position: 'relative', ...style }}>
      <div style={{ position: 'relative' }}>
        <input
          value={input}
          placeholder={placeholder ?? '— введіть назву —'}
          style={base}
          onFocus={() => { setFocused(true); setOpen(true); }}
          onChange={e => { setInput(e.target.value); setOpen(true); if (!e.target.value) onChange(''); }}
          onKeyDown={e => {
            if (e.key === 'Escape') { setOpen(false); setInput(selected ? customerLabel(selected) : ''); }
            if (e.key === 'Enter' && filtered.length === 1) handleSelect(filtered[0]);
          }}
        />
        {/* Clear or chevron icon */}
        {value ? (
          <button onClick={handleClear} style={{ position: 'absolute', right: '8px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex', padding: 0 }}>
            <X size={13} />
          </button>
        ) : (
          <ChevronDown size={13} style={{ position: 'absolute', right: '8px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', pointerEvents: 'none' }} />
        )}
      </div>

      {/* Dropdown */}
      {open && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0, zIndex: 200,
          background: 'var(--bg-card)', border: '1.5px solid #1E3A5F',
          borderRadius: '10px', boxShadow: '0 8px 24px rgba(0,0,0,0.15)',
          maxHeight: '240px', overflowY: 'auto',
        }}>
          {filtered.length === 0 ? (
            <div style={{ padding: '12px 14px', fontSize: '13px', color: 'var(--text-muted)' }}>Нічого не знайдено</div>
          ) : filtered.map(c => (
            <div key={c.id}
              onMouseDown={() => handleSelect(c)}
              style={{
                padding: '8px 14px', fontSize: '13px', cursor: 'pointer',
                borderBottom: '1px solid var(--border-light)',
                background: c.id === value ? 'var(--bg-soft)' : 'transparent',
                color: c.id === value ? '#1E3A5F' : 'var(--text-primary)',
                fontWeight: c.id === value ? 700 : 400,
              }}
            >
              {customerLabel(c)}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

export default function SettlementsClient({
  customers,
  contracts,
  defaultCustomerId,
  defaultContractId,
}: {
  customers:          Customer[];
  contracts:          Contract[];
  defaultCustomerId?: string;
  defaultContractId?: string;
}) {
  const today      = new Date().toISOString().slice(0, 10);
  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10);

  // Режим: 'single' — по одному контрагенту, 'debtors' — всі боржники
  const [mode,       setMode]       = useState<'single' | 'debtors'>('single');
  const [customerId, setCustomerId] = useState(defaultCustomerId ?? '');
  const [contractId, setContractId] = useState(defaultContractId ?? '');
  const [dateFrom,   setDateFrom]   = useState(monthStart);
  const [dateTo,     setDateTo]     = useState(today);
  const [rows,       setRows]       = useState<TxnRow[]>([]);
  const [opening,    setOpening]    = useState<number | null>(null);
  const [loading,    setLoading]    = useState(false);
  const [searched,   setSearched]   = useState(false);

  // Дебіторка: всі боржники
  const [debtors,      setDebtors]      = useState<DebtorRow[]>([]);
  const [debtorsTotal, setDebtorsTotal] = useState(0);
  const [debtorsLoading, setDebtorsLoading] = useState(false);
  const [debtorsLoaded,  setDebtorsLoaded]  = useState(false);

  const customerContracts = useMemo(
    () => contracts.filter(c => c.customer_id === customerId),
    [contracts, customerId],
  );

  function handleCustomerChange(id: string) {
    setCustomerId(id);
    setContractId('');
    setSearched(false);
    setRows([]);
    setOpening(null);
  }

  // ── Карточка рахунку (single) ─────────────────────────────────────────────
  async function handleSearch() {
    if (!customerId && !contractId) return;
    setLoading(true);
    try {
      const params = new URLSearchParams({ dateFrom, dateTo });
      if (contractId) params.set('contractId', contractId);
      if (customerId) params.set('customerId', customerId);
      const res  = await fetch(`/api/admin/settlements?${params}`);
      const data = await res.json();
      setRows(data.rows ?? []);
      setOpening(data.opening ?? 0);
      setSearched(true);
    } catch { /* silent */ }
    finally { setLoading(false); }
  }

  // ── Реєстр дебіторки ─────────────────────────────────────────────────────
  const loadDebtors = useCallback(async () => {
    setDebtorsLoading(true);
    try {
      const res  = await fetch('/api/admin/settlements/debtors');
      const data = await res.json();
      setDebtors(data.debtors ?? []);
      setDebtorsTotal(data.total ?? 0);
      setDebtorsLoaded(true);
    } catch { /* silent */ }
    finally { setDebtorsLoading(false); }
  }, []);

  function switchMode(m: 'single' | 'debtors') {
    setMode(m);
    if (m === 'debtors' && !debtorsLoaded) loadDebtors();
  }

  // Перехід: клік по боржнику → single mode з цим клієнтом
  function openDebtor(d: DebtorRow) {
    setCustomerId(d.customer_id);
    setContractId(d.contract_id ?? '');
    setMode('single');
    setSearched(false);
    setRows([]);
    setOpening(null);
  }

  // Підсумки
  const totalDebit  = rows.filter(r => r.amount > 0).reduce((s, r) => s + r.amount, 0);
  const totalCredit = rows.filter(r => r.amount < 0).reduce((s, r) => s + Math.abs(r.amount), 0);
  const closing     = (opening ?? 0) + totalDebit - totalCredit;

  const rowsWithSaldo = useMemo(() => {
    let saldo = opening ?? 0;
    return rows.map(r => { saldo += r.amount; return { ...r, saldo }; });
  }, [rows, opening]);

  const showContractCol = !contractId;
  const COLS = showContractCol
    ? '90px 120px 1fr 115px 115px 130px'
    : '90px 1fr 115px 115px 130px';

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

  const selectedCustomer = customers.find(c => c.id === customerId);

  return (
    <div>

      {/* Mode toggle */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '20px', flexWrap: 'wrap' }}>
        {([
          { key: 'single',  label: 'По контрагенту' },
          { key: 'debtors', label: 'Всі боржники' },
        ] as const).map(m => (
          <button key={m.key} onClick={() => switchMode(m.key)}
            className={'fin-pill' + (mode === m.key ? ' active' : '')}
            style={{ cursor: 'pointer' }}>
            {m.label}
          </button>
        ))}
      </div>

      {/* ── Single mode ──────────────────────────────────────────────────────── */}
      {mode === 'single' && (
        <>
          {/* Filters */}
          <div className="fin-card" style={{
            marginBottom: '20px',
            display: 'flex', gap: '12px', alignItems: 'flex-end', flexWrap: 'wrap',
          }}>
            {/* Контрагент — combobox */}
            <div style={{ flex: '1 1 220px', minWidth: '200px' }}>
              <label style={{ ...thStyle, display: 'block', marginBottom: '4px' }}>Контрагент *</label>
              <CustomerCombobox
                customers={customers}
                value={customerId}
                onChange={handleCustomerChange}
                placeholder="Введіть назву..."
              />
            </div>

            {/* Договір */}
            <div style={{ flex: '1 1 180px', minWidth: '160px' }}>
              <label style={{ ...thStyle, display: 'block', marginBottom: '4px' }}>Договір</label>
              <select value={contractId}
                onChange={e => { setContractId(e.target.value); setSearched(false); setRows([]); setOpening(null); }}
                disabled={!customerId}
                style={{ ...inp, width: '100%', cursor: customerId ? 'pointer' : 'not-allowed', opacity: customerId ? 1 : 0.5 }}>
                <option value="">Всі договори{selectedCustomer ? ` (${customerContracts.length})` : ''}</option>
                {customerContracts.map(c => (
                  <option key={c.id} value={c.id}>{c.contract_number}{c.status !== 'active' ? ' ✕' : ''}</option>
                ))}
              </select>
            </div>

            <div>
              <label style={{ ...thStyle, display: 'block', marginBottom: '4px' }}>З</label>
              <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} style={inp} />
            </div>
            <div>
              <label style={{ ...thStyle, display: 'block', marginBottom: '4px' }}>По</label>
              <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} style={inp} />
            </div>

            <button onClick={handleSearch} disabled={loading || !customerId}
              style={{
                height: '36px', padding: '0 20px', borderRadius: '8px', border: 'none',
                background: '#1E3A5F', color: '#fff', fontSize: '13px', fontWeight: 700,
                cursor: (loading || !customerId) ? 'not-allowed' : 'pointer',
                display: 'flex', alignItems: 'center', gap: '7px',
                opacity: (loading || !customerId) ? 0.5 : 1,
              }}>
              {loading ? <RefreshCw size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <Search size={14} />}
              {loading ? 'Завантаження...' : 'Показати'}
            </button>
          </div>

          {/* Results */}
          {searched && (
            <>
              {/* Act link */}
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '10px' }}>
                <Link
                  href={`/admin/finance/settlements/${customerId}?from=${dateFrom}&to=${dateTo}`}
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: '6px',
                    height: '32px', padding: '0 14px', borderRadius: '8px',
                    border: '1px solid var(--border)', background: 'var(--bg-soft)',
                    color: '#1E3A5F', fontSize: '12px', fontWeight: 700,
                    textDecoration: 'none',
                  }}>
                  Акт звірки ↗
                </Link>
              </div>

              {/* Summary */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px', marginBottom: '16px' }}>
                {([
                  { label: 'Вхідне сальдо',  value: opening ?? 0, color: undefined },
                  { label: 'Оборот дебет',   value: totalDebit,   color: undefined },
                  { label: 'Оборот кредит',  value: totalCredit,  color: '#15803D' },
                  { label: 'Вихідне сальдо', value: closing,      color: closing > 0.005 ? '#DC2626' : '#15803D' },
                ] as { label: string; value: number; color?: string }[]).map(s => (
                  <div key={s.label} className="fin-card">
                    <div className="fin-kpi-label">{s.label}</div>
                    <div className="fin-money-val" style={s.color ? { color: s.color } : undefined}>
                      {fmt(s.value)} ₴
                    </div>
                  </div>
                ))}
              </div>

              {/* Ledger */}
              {rows.length === 0 ? (
                <div className="fin-card" style={{ padding: '48px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '14px' }}>
                  Немає операцій за обраний період
                </div>
              ) : (
                <div className="fin-card" style={{ padding: 0, overflow: 'hidden', fontSize: '13px' }}>
                  {/* Header */}
                  <div style={{ display: 'grid', gridTemplateColumns: COLS, gap: '0', padding: '8px 16px', background: 'var(--bg-soft)', color: 'var(--text-muted)', fontSize: '12px', fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase' }}>
                    <span>Дата</span>
                    {showContractCol && <span>Договір</span>}
                    <span>Зміст операції</span>
                    <span style={{ textAlign: 'right' }}>Дебет</span>
                    <span style={{ textAlign: 'right' }}>Кредит</span>
                    <span style={{ textAlign: 'right' }}>Сальдо</span>
                  </div>

                  {/* Opening */}
                  <div style={{ display: 'grid', gridTemplateColumns: COLS, gap: '0', padding: '7px 16px', alignItems: 'center', borderBottom: '1px solid var(--border)', fontStyle: 'italic' }}>
                    <span style={{ color: 'var(--text-muted)', fontSize: '12px' }}>{dateFrom}</span>
                    {showContractCol && <span />}
                    <span style={{ color: 'var(--text-secondary)', fontWeight: 600 }}>Сальдо на початок</span>
                    <span /><span />
                    <div style={{ display: 'flex', justifyContent: 'flex-end' }}><SaldoBadge value={opening ?? 0} /></div>
                  </div>

                  {/* Rows */}
                  {rowsWithSaldo.map(row => {
                    const isDebit = row.amount > 0;
                    const { label, href } = rowContent(row);
                    return (
                      <div key={row.id} style={{
                        display: 'grid', gridTemplateColumns: COLS, gap: '0',
                        padding: '8px 16px', alignItems: 'center',
                        borderBottom: '1px solid var(--border-light)',
                      }}>
                        <span style={{ fontSize: '12px', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>{row.business_date}</span>
                        {showContractCol && <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>{row.contract_number ?? '—'}</span>}
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', minWidth: 0 }}>
                          <span style={{ fontSize: '12px', color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={label}>{label}</span>
                          {href && (
                            <Link href={href} target="_blank" style={{ color: '#94A3B8', flexShrink: 0, display: 'flex' }} title="Відкрити документ">
                              <ExternalLink size={12} />
                            </Link>
                          )}
                        </div>
                        <span style={{ textAlign: 'right', fontWeight: isDebit ? 700 : 400, color: isDebit ? 'var(--text-primary)' : 'var(--text-muted)', fontFamily: 'monospace' }}>
                          {isDebit ? `${fmt(row.amount)} ₴` : ''}
                        </span>
                        <span style={{ textAlign: 'right', fontWeight: !isDebit ? 700 : 400, color: !isDebit ? '#15803D' : 'var(--text-muted)', fontFamily: 'monospace' }}>
                          {!isDebit ? `${fmt(Math.abs(row.amount))} ₴` : ''}
                        </span>
                        <div style={{ display: 'flex', justifyContent: 'flex-end' }}><SaldoBadge value={row.saldo} /></div>
                      </div>
                    );
                  })}

                  {/* Turnover */}
                  <div style={{ display: 'grid', gridTemplateColumns: COLS, gap: '0', padding: '9px 16px', alignItems: 'center', background: 'var(--bg-soft)', borderTop: '2px solid var(--border)', fontWeight: 700 }}>
                    <span style={{ color: 'var(--text-muted)', fontSize: '11px' }}>{dateTo}</span>
                    {showContractCol && <span />}
                    <span style={{ fontSize: '12px', color: 'var(--text-secondary)', fontStyle: 'italic' }}>Обороти за період</span>
                    <span style={{ textAlign: 'right', color: 'var(--text-primary)', fontFamily: 'monospace' }}>{fmt(totalDebit)} ₴</span>
                    <span style={{ textAlign: 'right', color: '#15803D', fontFamily: 'monospace' }}>{fmt(totalCredit)} ₴</span>
                    <span />
                  </div>

                  {/* Closing */}
                  <div style={{ display: 'grid', gridTemplateColumns: COLS, gap: '0', padding: '9px 16px', alignItems: 'center', background: 'var(--bg-soft)', borderTop: '1px solid var(--border)', fontWeight: 700 }}>
                    <span />{showContractCol && <span />}
                    <span style={{ fontSize: '12px', color: 'var(--text-secondary)', fontStyle: 'italic' }}>Сальдо на кінець</span>
                    <span /><span />
                    <div style={{ display: 'flex', justifyContent: 'flex-end' }}><SaldoBadge value={closing} /></div>
                  </div>
                </div>
              )}
            </>
          )}

          {!searched && (
            <div style={{ padding: '64px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '14px' }}>
              Оберіть контрагента та натисніть «Показати»
            </div>
          )}
        </>
      )}

      {/* ── Debtors mode ─────────────────────────────────────────────────────── */}
      {mode === 'debtors' && (
        <>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <div style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
              Поточна дебіторська заборгованість на сьогодні — лише контрагенти з ненульовим залишком
            </div>
            <button onClick={loadDebtors} disabled={debtorsLoading}
              style={{ height: '32px', padding: '0 14px', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text-secondary)', fontSize: '12px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <RefreshCw size={13} style={debtorsLoading ? { animation: 'spin 1s linear infinite' } : {}} />
              Оновити
            </button>
          </div>

          {debtorsLoading && (
            <div style={{ padding: '64px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '14px' }}>
              Завантаження...
            </div>
          )}

          {debtorsLoaded && !debtorsLoading && (
            debtors.length === 0 ? (
              <div className="fin-card" style={{ padding: '48px', textAlign: 'center', color: '#15803D', fontSize: '15px', fontWeight: 700 }}>
                ✓ Заборгованостей немає — всі розрахунки закриті
              </div>
            ) : (
              <div className="fin-card" style={{ padding: 0, overflow: 'hidden' }}>
                {/* Header */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 160px 130px 110px 110px 148px', gap: '0', padding: '8px 16px', background: 'var(--bg-soft)', color: 'var(--text-muted)', fontSize: '12px', fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase' }}>
                  <span>Контрагент / Договір</span>
                  <span style={{ textAlign: 'right' }}>Заборгованість</span>
                  <span style={{ textAlign: 'right' }}>Ліміт</span>
                  <span style={{ textAlign: 'center' }}>Статус</span>
                  <span style={{ textAlign: 'center' }}>Прострочення</span>
                  <span />
                </div>

                {debtors.map((d, idx) => {
                  const isOverdue  = d.days_overdue > 0;
                  const limitPct   = d.credit_limit > 0 ? Math.min(100, Math.round((d.balance / d.credit_limit) * 100)) : null;

                  return (
                    <div key={`${d.customer_id}:${d.contract_id}`} style={{
                      display: 'grid', gridTemplateColumns: '1fr 160px 130px 110px 110px 148px', gap: '0',
                      padding: '10px 16px', alignItems: 'center',
                      borderBottom: idx < debtors.length - 1 ? '1px solid var(--border-light)' : 'none',
                    }}>
                      {/* Контрагент */}
                      <div>
                        <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)' }}>
                          {d.customer_name ?? d.customer_id}
                        </div>
                        <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '1px' }}>
                          {d.contract_number ?? 'Без договору'}
                          {d.credit_days > 0 && <span style={{ marginLeft: '8px' }}>· відстрочка {d.credit_days} дн.</span>}
                        </div>
                      </div>

                      {/* Заборгованість */}
                      <div style={{ textAlign: 'right' }}>
                        <SaldoBadge value={d.balance} size="sm" />
                        {limitPct !== null && (
                          <div style={{ marginTop: '3px' }}>
                            <div style={{ height: '3px', background: '#E2E8F0', borderRadius: '2px', overflow: 'hidden' }}>
                              <div style={{ height: '100%', width: `${limitPct}%`, background: limitPct > 80 ? '#DC2626' : '#B45309', borderRadius: '2px' }} />
                            </div>
                            <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginTop: '1px' }}>{limitPct}% ліміту</div>
                          </div>
                        )}
                      </div>

                      {/* Ліміт */}
                      <div style={{ textAlign: 'right', fontSize: '12px', color: 'var(--text-secondary)' }}>
                        {d.credit_limit > 0 ? `${fmtShort(d.credit_limit)} ₴` : <span style={{ color: 'var(--text-muted)' }}>—</span>}
                      </div>

                      {/* Статус договору */}
                      <div style={{ display: 'flex', justifyContent: 'center' }}>
                        <span style={{
                          fontSize: '11px', padding: '2px 8px', borderRadius: '20px', fontWeight: 600,
                          background: 'var(--bg-soft)',
                          color: d.contract_status === 'active' ? '#15803D' : d.contract_status === 'special' || d.contract_status === 'none' ? 'var(--text-muted)' : '#DC2626',
                        }}>
                          {d.contract_status === 'active' ? 'Активний'
                            : d.contract_status === 'suspended' ? 'Призупинено'
                            : d.contract_status === 'special' ? 'Транзит'
                            : d.contract_status === 'none' ? 'Без договору'
                            : 'Закрито'}
                        </span>
                      </div>

                      {/* Прострочення */}
                      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '4px' }}>
                        {isOverdue ? (
                          <span style={{ fontSize: '12px', fontWeight: 700, color: '#DC2626', display: 'flex', alignItems: 'center', gap: '3px' }}>
                            <AlertCircle size={12} /> {d.days_overdue} дн.
                          </span>
                        ) : (
                          <span style={{ fontSize: '12px', color: '#15803D' }}>✓ в нормі</span>
                        )}
                      </div>

                      {/* Дія */}
                      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '6px' }}>
                        <button onClick={() => openDebtor(d)}
                          style={{ height: '28px', padding: '0 10px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--bg-soft)', color: '#1E3A5F', fontSize: '11px', fontWeight: 600, cursor: 'pointer' }}>
                          Картка
                        </button>
                        <Link
                          href={`/admin/finance/settlements/${d.customer_id}`}
                          style={{ display: 'flex', alignItems: 'center', height: '28px', padding: '0 10px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--bg-soft)', color: '#1E3A5F', fontSize: '11px', fontWeight: 600, textDecoration: 'none' }}>
                          Акт ↗
                        </Link>
                      </div>
                    </div>
                  );
                })}

                {/* Total */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 160px 130px 110px 110px 148px', gap: '0', padding: '10px 16px', background: 'var(--bg-soft)', borderTop: '2px solid var(--border)', fontWeight: 700 }}>
                  <span style={{ fontSize: '13px', color: 'var(--text-primary)' }}>
                    Разом: {debtors.length} {debtors.length === 1 ? 'контрагент' : debtors.length < 5 ? 'контрагенти' : 'контрагентів'}
                    {debtors.filter(d => d.days_overdue > 0).length > 0 && (
                      <span style={{ marginLeft: '8px', color: '#DC2626', fontSize: '12px' }}>
                        · {debtors.filter(d => d.days_overdue > 0).length} прострочених
                      </span>
                    )}
                  </span>
                  <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                    <SaldoBadge value={debtorsTotal} size="sm" />
                  </div>
                  <span /><span /><span /><span />
                </div>
              </div>
            )
          )}
        </>
      )}

      <style>{`
        @keyframes spin { from { transform: rotate(0deg) } to { transform: rotate(360deg) } }
      `}</style>
    </div>
  );
}
