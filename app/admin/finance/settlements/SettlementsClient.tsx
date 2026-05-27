'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';
import { Search, RefreshCw, ArrowLeft, ExternalLink } from 'lucide-react';

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

function customerLabel(c: Customer) {
  return c.company?.trim() || c.legal_name?.trim() || c.name;
}

function fmt(n: number) {
  return n.toLocaleString('uk-UA', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

const DOC_TYPE_LABELS: Record<string, string> = {
  sale:       'Відвантаження',
  payment:    'Оплата',
  return_out: 'Повернення',
  cogs:       'Собівартість',
  correction: 'Коригування',
};

/** Формує підпис рядка: тип + посилання на документ */
function rowContent(row: TxnRow): { label: string; href: string | null } {
  const typeLabel = DOC_TYPE_LABELS[row.doc_type ?? ''] ?? row.doc_type ?? '—';
  const docRef    = row.order_number ? ` / Замовлення #${row.order_number}` : '';
  const label     = (row.description ?? typeLabel) + docRef;
  const href      = row.doc_id ? `/admin/accounting/documents/${row.doc_id}` : null;
  return { label, href };
}

function SaldoBadge({ value }: { value: number }) {
  const color  = value > 0.005 ? '#DC2626' : value < -0.005 ? '#2563EB' : '#15803D';
  const bg     = value > 0.005 ? '#FEF2F2' : value < -0.005 ? '#EFF6FF' : '#F0FDF4';
  return (
    <span style={{ fontWeight: 700, color, background: bg, borderRadius: '6px', padding: '1px 8px', fontSize: '13px', whiteSpace: 'nowrap' }}>
      {fmt(value)} ₴
    </span>
  );
}

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

  const [customerId, setCustomerId] = useState(defaultCustomerId ?? '');
  const [contractId, setContractId] = useState(defaultContractId ?? '');
  const [dateFrom,   setDateFrom]   = useState(monthStart);
  const [dateTo,     setDateTo]     = useState(today);
  const [rows,       setRows]       = useState<TxnRow[]>([]);
  const [opening,    setOpening]    = useState<number | null>(null);
  const [loading,    setLoading]    = useState(false);
  const [searched,   setSearched]   = useState(false);

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

  // Підсумки
  const totalDebit  = rows.filter(r => r.amount > 0).reduce((s, r) => s + r.amount, 0);
  const totalCredit = rows.filter(r => r.amount < 0).reduce((s, r) => s + Math.abs(r.amount), 0);
  const closing     = (opening ?? 0) + totalDebit - totalCredit;

  // Наростаюче сальдо по рядках
  const rowsWithSaldo = useMemo(() => {
    let saldo = opening ?? 0;
    return rows.map(r => {
      saldo += r.amount; // debit = +, credit = -
      return { ...r, saldo };
    });
  }, [rows, opening]);

  const showContractCol = !contractId;

  // Колонки: Дата | [Договір] | Зміст операції | Дебет | Кредит | Сальдо
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
    <div style={{ padding: '28px 32px', maxWidth: '1300px' }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '24px' }}>
        <Link href="/admin/finance" style={{ display: 'flex', alignItems: 'center', color: 'var(--text-secondary)', textDecoration: 'none' }}>
          <ArrowLeft size={16} />
        </Link>
        <div>
          <h1 style={{ fontSize: '22px', fontWeight: 800, color: 'var(--text-primary)', margin: 0 }}>Взаєморозрахунки</h1>
          <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginTop: '4px', marginBottom: 0 }}>
            Карточка рахунку дебіторської заборгованості
          </p>
        </div>
      </div>

      {/* Filters */}
      <div style={{
        background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '12px',
        padding: '16px 20px', marginBottom: '20px',
        display: 'flex', gap: '12px', alignItems: 'flex-end', flexWrap: 'wrap',
      }}>
        <div style={{ flex: '1 1 200px', minWidth: '180px' }}>
          <label style={{ ...thStyle, display: 'block', marginBottom: '4px' }}>Контрагент *</label>
          <select value={customerId} onChange={e => handleCustomerChange(e.target.value)}
            style={{ ...inp, width: '100%', cursor: 'pointer' }}>
            <option value="">— оберіть контрагента —</option>
            {customers.map(c => (
              <option key={c.id} value={c.id}>{customerLabel(c)}</option>
            ))}
          </select>
        </div>

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
          {/* Summary strip */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '10px', marginBottom: '16px' }}>
            {[
              { label: 'Вхідне сальдо',    value: opening ?? 0, accent: '#94A3B8' },
              { label: 'Оборот дебет',      value: totalDebit,   accent: '#DC2626' },
              { label: 'Оборот кредит',     value: totalCredit,  accent: '#16A34A' },
              { label: 'Вихідне сальдо',    value: closing,      accent: closing > 0.005 ? '#DC2626' : '#16A34A' },
            ].map(s => (
              <div key={s.label} style={{
                padding: '12px 16px', borderRadius: '10px',
                background: 'var(--bg-card)', border: '1px solid var(--border)',
                borderLeft: `3px solid ${s.accent}`,
              }}>
                <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '3px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{s.label}</div>
                <div style={{ fontSize: '17px', fontWeight: 800, color: s.accent === '#94A3B8' ? 'var(--text-primary)' : s.accent }}>
                  {fmt(s.value)} ₴
                </div>
              </div>
            ))}
          </div>

          {/* Ledger table */}
          {rows.length === 0 ? (
            <div style={{ padding: '48px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '14px', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '12px' }}>
              Немає операцій за обраний період
            </div>
          ) : (
            <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '12px', overflow: 'hidden', fontSize: '13px' }}>

              {/* Column headers */}
              <div style={{
                display: 'grid', gridTemplateColumns: COLS, gap: '0',
                padding: '8px 16px',
                background: '#1E3A5F',
                color: '#CBD5E1',
                fontSize: '11px', fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase',
              }}>
                <span>Дата</span>
                {showContractCol && <span>Договір</span>}
                <span>Зміст операції</span>
                <span style={{ textAlign: 'right' }}>Дебет</span>
                <span style={{ textAlign: 'right' }}>Кредит</span>
                <span style={{ textAlign: 'right' }}>Сальдо</span>
              </div>

              {/* Opening balance row */}
              <div style={{
                display: 'grid', gridTemplateColumns: COLS, gap: '0',
                padding: '7px 16px', alignItems: 'center',
                background: '#F8FAFC', borderBottom: '1px solid var(--border)',
                fontStyle: 'italic',
              }}>
                <span style={{ color: 'var(--text-muted)', fontSize: '12px' }}>{dateFrom}</span>
                {showContractCol && <span />}
                <span style={{ color: 'var(--text-secondary)', fontWeight: 600 }}>Сальдо на початок</span>
                <span />
                <span />
                <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                  <SaldoBadge value={opening ?? 0} />
                </div>
              </div>

              {/* Transaction rows */}
              {rowsWithSaldo.map((row, idx) => {
                const isDebit = row.amount > 0;
                const { label, href } = rowContent(row);
                const isEven = idx % 2 === 0;

                return (
                  <div key={row.id} style={{
                    display: 'grid', gridTemplateColumns: COLS, gap: '0',
                    padding: '8px 16px', alignItems: 'center',
                    borderBottom: '1px solid var(--border-light)',
                    background: isDebit
                      ? (isEven ? '#fff' : '#FAFAFA')
                      : (isEven ? '#F0FDF4' : '#ECFDF5'),
                    transition: 'background 0.1s',
                  }}>
                    {/* Дата */}
                    <span style={{ fontSize: '12px', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
                      {row.business_date}
                    </span>

                    {/* Договір */}
                    {showContractCol && (
                      <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                        {row.contract_number ?? <span style={{ color: 'var(--text-muted)' }}>—</span>}
                      </span>
                    )}

                    {/* Зміст */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', minWidth: 0 }}>
                      <span style={{
                        fontSize: '12px', color: 'var(--text-primary)',
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                      }} title={label}>
                        {label}
                      </span>
                      {href && (
                        <Link href={href} target="_blank"
                          style={{ color: '#94A3B8', flexShrink: 0, display: 'flex', alignItems: 'center' }}
                          title="Відкрити документ">
                          <ExternalLink size={12} />
                        </Link>
                      )}
                    </div>

                    {/* Дебет */}
                    <span style={{ textAlign: 'right', fontWeight: isDebit ? 700 : 400, color: isDebit ? '#1E293B' : 'var(--text-muted)', fontFamily: 'monospace' }}>
                      {isDebit ? `${fmt(row.amount)} ₴` : ''}
                    </span>

                    {/* Кредит */}
                    <span style={{ textAlign: 'right', fontWeight: !isDebit ? 700 : 400, color: !isDebit ? '#15803D' : 'var(--text-muted)', fontFamily: 'monospace' }}>
                      {!isDebit ? `${fmt(Math.abs(row.amount))} ₴` : ''}
                    </span>

                    {/* Сальдо */}
                    <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                      <SaldoBadge value={row.saldo} />
                    </div>
                  </div>
                );
              })}

              {/* Turnover row */}
              <div style={{
                display: 'grid', gridTemplateColumns: COLS, gap: '0',
                padding: '9px 16px', alignItems: 'center',
                background: '#F1F5F9', borderTop: '2px solid #CBD5E1',
                fontWeight: 700,
              }}>
                <span style={{ color: 'var(--text-muted)', fontSize: '11px' }}>{dateTo}</span>
                {showContractCol && <span />}
                <span style={{ fontSize: '12px', color: 'var(--text-secondary)', fontStyle: 'italic' }}>
                  Обороти за період
                </span>
                <span style={{ textAlign: 'right', color: '#1E293B', fontFamily: 'monospace' }}>
                  {fmt(totalDebit)} ₴
                </span>
                <span style={{ textAlign: 'right', color: '#15803D', fontFamily: 'monospace' }}>
                  {fmt(totalCredit)} ₴
                </span>
                <span />
              </div>

              {/* Closing balance row */}
              <div style={{
                display: 'grid', gridTemplateColumns: COLS, gap: '0',
                padding: '9px 16px', alignItems: 'center',
                background: '#EEF2F7', borderTop: '1px solid #CBD5E1',
                fontWeight: 700,
              }}>
                <span />
                {showContractCol && <span />}
                <span style={{ fontSize: '12px', color: 'var(--text-secondary)', fontStyle: 'italic' }}>
                  Сальдо на кінець
                </span>
                <span />
                <span />
                <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                  <SaldoBadge value={closing} />
                </div>
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

      <style>{`
        @keyframes spin { from { transform: rotate(0deg) } to { transform: rotate(360deg) } }
      `}</style>
    </div>
  );
}
