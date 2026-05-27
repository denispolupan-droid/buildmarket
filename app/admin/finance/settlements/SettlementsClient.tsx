'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';
import { Search, RefreshCw, ArrowLeft, ExternalLink, FileText, ShoppingBag } from 'lucide-react';

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
  return n.toLocaleString('uk-UA', { maximumFractionDigits: 2 });
}

const DOC_LABELS: Record<string, string> = {
  sale:        'Відвантаження',
  payment:     'Оплата',
  return_out:  'Повернення',
  cogs:        'Собівартість',
  correction:  'Коригування',
};

const DOC_COLORS: Record<string, { bg: string; color: string }> = {
  sale:       { bg: '#FEF2F2', color: '#DC2626' },
  payment:    { bg: '#F0FDF4', color: '#15803D' },
  return_out: { bg: '#FEF3C7', color: '#B45309' },
  cogs:       { bg: '#F1F5F9', color: '#475569' },
  correction: { bg: '#EFF6FF', color: '#2563EB' },
};

/** Повертає href документа для рядка */
function docHref(row: TxnRow): string | null {
  if (row.doc_id)   return `/admin/accounting/documents/${row.doc_id}`;
  return null;
}

/** Підпис документа */
function docLabel(row: TxnRow): string | null {
  if (row.order_number) return `#${row.order_number}`;
  if (row.doc_id)       return 'Документ';
  return null;
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

  const [customerId,  setCustomerId]  = useState(defaultCustomerId ?? '');
  const [contractId,  setContractId]  = useState(defaultContractId ?? '');
  const [dateFrom,    setDateFrom]    = useState(monthStart);
  const [dateTo,      setDateTo]      = useState(today);
  const [rows,        setRows]        = useState<TxnRow[]>([]);
  const [opening,     setOpening]     = useState<number | null>(null);
  const [loading,     setLoading]     = useState(false);
  const [searched,    setSearched]    = useState(false);

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

  const totalDebit  = rows.filter(r => r.amount > 0).reduce((s, r) => s + r.amount, 0);
  const totalCredit = rows.filter(r => r.amount < 0).reduce((s, r) => s + Math.abs(r.amount), 0);
  const closing     = (opening ?? 0) + totalDebit - totalCredit;

  const showContractCol = !contractId;

  // Grid: Дата | [Договір] | Документ | Опис | Тип | Дебет | Кредит
  const cols = showContractCol
    ? '90px 130px 110px 1fr 115px 105px 105px'
    : '90px 110px 1fr 115px 105px 105px';

  const inp: React.CSSProperties = {
    height: '36px', padding: '0 10px',
    border: '1.5px solid var(--border)', borderRadius: '8px',
    fontSize: '13px', outline: 'none',
    color: 'var(--text-primary)', background: 'var(--bg-soft)',
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
            Відвантаження, оплати та баланс по контрагентах
          </p>
        </div>
      </div>

      {/* Filters */}
      <div style={{
        background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '12px',
        padding: '16px 20px', marginBottom: '20px',
        display: 'flex', gap: '12px', alignItems: 'flex-end', flexWrap: 'wrap',
      }}>
        {/* Контрагент */}
        <div style={{ flex: '1 1 200px', minWidth: '180px' }}>
          <label style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', display: 'block', marginBottom: '4px', textTransform: 'uppercase' }}>
            Контрагент *
          </label>
          <select value={customerId} onChange={e => handleCustomerChange(e.target.value)}
            style={{ ...inp, width: '100%', cursor: 'pointer' }}>
            <option value="">— оберіть контрагента —</option>
            {customers.map(c => (
              <option key={c.id} value={c.id}>{customerLabel(c)}</option>
            ))}
          </select>
        </div>

        {/* Договір */}
        <div style={{ flex: '1 1 180px', minWidth: '160px' }}>
          <label style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', display: 'block', marginBottom: '4px', textTransform: 'uppercase' }}>
            Договір
          </label>
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

        {/* Дати */}
        <div>
          <label style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', display: 'block', marginBottom: '4px', textTransform: 'uppercase' }}>З</label>
          <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} style={inp} />
        </div>
        <div>
          <label style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', display: 'block', marginBottom: '4px', textTransform: 'uppercase' }}>По</label>
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
          {/* Summary cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px', marginBottom: '16px' }}>
            {[
              { label: 'Вхідний залишок',   value: opening ?? 0, color: '#1E3A5F',  accent: '#4880B8' },
              { label: 'Нараховано (дебет)', value: totalDebit,   color: '#DC2626',  accent: '#DC2626' },
              { label: 'Оплачено (кредит)',  value: totalCredit,  color: '#16A34A',  accent: '#16A34A' },
              {
                label: 'Вихідний залишок',
                value: closing,
                color: closing > 0.005 ? '#DC2626' : '#16A34A',
                accent: closing > 0.005 ? '#DC2626' : '#16A34A',
              },
            ].map(s => (
              <div key={s.label} style={{ padding: '14px 18px', borderRadius: '10px', background: 'var(--bg-card)', border: '1px solid var(--border)', borderLeft: `3px solid ${s.accent}` }}>
                <div style={{ fontSize: '20px', fontWeight: 800, color: s.color }}>{fmt(s.value)} ₴</div>
                <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>{s.label}</div>
              </div>
            ))}
          </div>

          {/* Table */}
          {rows.length === 0 ? (
            <div style={{ padding: '48px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '14px', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '12px' }}>
              Немає операцій за обраний період
            </div>
          ) : (
            <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '12px', overflow: 'hidden' }}>
              {/* Header */}
              <div style={{
                display: 'grid', gridTemplateColumns: cols,
                padding: '8px 16px',
                background: 'var(--bg-soft)', borderBottom: '1px solid var(--border)',
                fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase',
                gap: '8px',
              }}>
                <span>Дата</span>
                {showContractCol && <span>Договір</span>}
                <span>Документ</span>
                <span>Опис</span>
                <span style={{ textAlign: 'center' }}>Тип</span>
                <span style={{ textAlign: 'right' }}>Дебет ₴</span>
                <span style={{ textAlign: 'right' }}>Кредит ₴</span>
              </div>

              {/* Rows */}
              {rows.map((row, idx) => {
                const isDebit  = row.amount > 0;
                const label    = DOC_LABELS[row.doc_type ?? ''] ?? row.doc_type ?? '—';
                const clr      = DOC_COLORS[row.doc_type ?? ''] ?? { bg: '#F1F5F9', color: '#475569' };
                const href     = docHref(row);
                const dLabel   = docLabel(row);
                const isOrder  = !!row.order_id && !row.doc_id;

                return (
                  <div key={row.id} style={{
                    display: 'grid', gridTemplateColumns: cols,
                    padding: '9px 16px', alignItems: 'center', gap: '8px',
                    borderBottom: idx < rows.length - 1 ? '1px solid var(--border-light)' : 'none',
                    background: isDebit ? 'transparent' : 'rgba(21,128,61,0.03)',
                    transition: 'background 0.1s',
                  }}>
                    {/* Дата */}
                    <span style={{ fontSize: '12px', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
                      {row.business_date}
                    </span>

                    {/* Договір */}
                    {showContractCol && (
                      <div>
                        {row.contract_number
                          ? <Link href={`/admin/contracts`} style={{ fontSize: '12px', fontWeight: 600, color: '#1E3A5F', textDecoration: 'none' }}>{row.contract_number}</Link>
                          : <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Без договору</span>
                        }
                      </div>
                    )}

                    {/* Документ (клікабельний) */}
                    <div>
                      {href && dLabel ? (
                        <Link href={href} target="_blank"
                          style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '12px', fontWeight: 600, color: '#1E3A5F', textDecoration: 'none', padding: '2px 7px', borderRadius: '6px', border: '1px solid #BFDBFE', background: '#EFF6FF' }}>
                          <FileText size={11} />
                          {dLabel}
                          <ExternalLink size={10} style={{ opacity: 0.5 }} />
                        </Link>
                      ) : dLabel && isOrder ? (
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '12px', fontWeight: 600, color: '#475569', padding: '2px 7px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--bg-soft)' }}>
                          <ShoppingBag size={11} />
                          {dLabel}
                        </span>
                      ) : (
                        <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>—</span>
                      )}
                    </div>

                    {/* Опис */}
                    <span style={{ fontSize: '12px', color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                      title={row.description ?? label}>
                      {row.description ?? label}
                    </span>

                    {/* Тип */}
                    <div style={{ display: 'flex', justifyContent: 'center' }}>
                      <span style={{
                        fontSize: '11px', padding: '2px 8px', borderRadius: '20px', fontWeight: 600,
                        background: clr.bg, color: clr.color,
                        whiteSpace: 'nowrap',
                      }}>
                        {label}
                      </span>
                    </div>

                    {/* Дебет */}
                    <span style={{ textAlign: 'right', fontSize: '13px', fontWeight: 700, color: '#DC2626' }}>
                      {isDebit ? `${fmt(row.amount)} ₴` : ''}
                    </span>

                    {/* Кредит */}
                    <span style={{ textAlign: 'right', fontSize: '13px', fontWeight: 700, color: '#15803D' }}>
                      {!isDebit ? `${fmt(Math.abs(row.amount))} ₴` : ''}
                    </span>
                  </div>
                );
              })}

              {/* Footer totals */}
              <div style={{
                display: 'grid', gridTemplateColumns: cols,
                padding: '10px 16px', gap: '8px',
                background: 'var(--bg-soft)', borderTop: '2px solid var(--border)',
                fontSize: '13px', fontWeight: 700,
              }}>
                <span style={{
                  gridColumn: showContractCol ? '1 / 6' : '1 / 5',
                  color: 'var(--text-primary)',
                }}>
                  Разом за період
                </span>
                <span style={{ textAlign: 'right', color: '#DC2626' }}>{fmt(totalDebit)} ₴</span>
                <span style={{ textAlign: 'right', color: '#15803D' }}>{fmt(totalCredit)} ₴</span>
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
