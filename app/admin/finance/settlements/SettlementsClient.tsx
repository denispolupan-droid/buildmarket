'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';
import { Search, RefreshCw, TrendingUp, TrendingDown, ArrowLeft, ChevronDown } from 'lucide-react';

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
  order_id: string | null; entry_type: 'debit' | 'credit'; created_by: string | null;
};

function customerLabel(c: Customer) {
  return c.company?.trim() || c.legal_name?.trim() || c.name;
}

function fmt(n: number) {
  return n.toLocaleString('uk-UA', { maximumFractionDigits: 2 });
}

const DOC_LABELS: Record<string, string> = {
  sale: 'Відвантаження', payment: 'Оплата', return_out: 'Повернення',
  cogs: 'Собівартість', correction: 'Коригування',
};

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

  // Договори для обраного клієнта
  const customerContracts = useMemo(
    () => contracts.filter(c => c.customer_id === customerId),
    [contracts, customerId],
  );

  // Коли міняємо клієнта — скидаємо вибраний договір
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
      if (contractId)  params.set('contractId',  contractId);
      if (customerId)  params.set('customerId',  customerId);
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

  // Показувати колонку "Договір" тільки якщо дивимось по клієнту (не по конкретному договору)
  const showContractCol = !contractId;

  const inp: React.CSSProperties = {
    height: '36px', padding: '0 10px',
    border: '1.5px solid var(--border)', borderRadius: '8px',
    fontSize: '13px', outline: 'none',
    color: 'var(--text-primary)', background: 'var(--bg-soft)',
  };

  const selectedCustomer = customers.find(c => c.id === customerId);

  return (
    <div style={{ padding: '28px 32px', maxWidth: '1200px' }}>

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
          <select
            value={customerId}
            onChange={e => handleCustomerChange(e.target.value)}
            style={{ ...inp, width: '100%', cursor: 'pointer' }}
          >
            <option value="">— оберіть контрагента —</option>
            {customers.map(c => (
              <option key={c.id} value={c.id}>{customerLabel(c)}</option>
            ))}
          </select>
        </div>

        {/* Договір (залежний) */}
        <div style={{ flex: '1 1 180px', minWidth: '160px' }}>
          <label style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', display: 'block', marginBottom: '4px', textTransform: 'uppercase' }}>
            Договір
          </label>
          <select
            value={contractId}
            onChange={e => { setContractId(e.target.value); setSearched(false); setRows([]); setOpening(null); }}
            disabled={!customerId}
            style={{ ...inp, width: '100%', cursor: customerId ? 'pointer' : 'not-allowed', opacity: customerId ? 1 : 0.5 }}
          >
            <option value="">Всі договори{selectedCustomer ? ` (${customerContracts.length})` : ''}</option>
            {customerContracts.map(c => (
              <option key={c.id} value={c.id}>
                {c.contract_number}{c.status !== 'active' ? ' ✕' : ''}
              </option>
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

        <button
          onClick={handleSearch}
          disabled={loading || !customerId}
          style={{
            height: '36px', padding: '0 20px', borderRadius: '8px', border: 'none',
            background: '#1E3A5F', color: '#fff', fontSize: '13px', fontWeight: 700,
            cursor: (loading || !customerId) ? 'not-allowed' : 'pointer',
            display: 'flex', alignItems: 'center', gap: '7px',
            opacity: (loading || !customerId) ? 0.5 : 1,
          }}
        >
          {loading ? <RefreshCw size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <Search size={14} />}
          {loading ? 'Завантаження...' : 'Показати'}
        </button>
      </div>

      {/* Summary cards */}
      {searched && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px', marginBottom: '16px' }}>
            {[
              { label: 'Вхідний залишок',    value: opening ?? 0,  color: 'var(--brand-blue)', accent: '#4880B8' },
              { label: 'Нараховано (дебет)',  value: totalDebit,    color: '#DC2626',           accent: '#DC2626' },
              { label: 'Оплачено (кредит)',   value: totalCredit,   color: '#16A34A',           accent: '#16A34A' },
              {
                label: 'Вихідний залишок',
                value: closing,
                color: closing > 0.005 ? '#DC2626' : '#16A34A',
                accent: closing > 0.005 ? '#DC2626' : '#16A34A',
              },
            ].map(s => (
              <div key={s.label} style={{ padding: '14px 18px', borderRadius: '10px', background: 'var(--bg-card)', border: '1px solid var(--border)', borderLeft: `3px solid ${s.accent}` }}>
                <div style={{ fontSize: '18px', fontWeight: 800, color: s.color }}>{fmt(s.value)} ₴</div>
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
                display: 'grid',
                gridTemplateColumns: showContractCol ? '100px 150px 1fr 110px 110px 110px' : '100px 1fr 110px 110px 110px',
                padding: '8px 16px',
                background: 'var(--bg-soft)', borderBottom: '1px solid var(--border)',
                fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase',
              }}>
                <span>Дата</span>
                {showContractCol && <span>Договір</span>}
                <span>Опис</span>
                <span style={{ textAlign: 'center' }}>Тип</span>
                <span style={{ textAlign: 'right' }}>Дебет</span>
                <span style={{ textAlign: 'right' }}>Кредит</span>
              </div>

              {/* Rows */}
              {rows.map((row, idx) => {
                const isDebit = row.amount > 0;
                const label   = DOC_LABELS[row.doc_type ?? ''] ?? row.doc_type ?? '—';
                return (
                  <div key={row.id} style={{
                    display: 'grid',
                    gridTemplateColumns: showContractCol ? '100px 150px 1fr 110px 110px 110px' : '100px 1fr 110px 110px 110px',
                    padding: '9px 16px', alignItems: 'center',
                    borderBottom: idx < rows.length - 1 ? '1px solid var(--border-light)' : 'none',
                    background: isDebit ? 'transparent' : 'rgba(21,128,61,0.03)',
                  }}>
                    <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>{row.business_date}</span>

                    {showContractCol && (
                      <div>
                        {row.contract_number
                          ? <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-primary)' }}>{row.contract_number}</span>
                          : <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Без договору</span>
                        }
                      </div>
                    )}

                    <span style={{ fontSize: '12px', color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {row.description ?? label}
                    </span>

                    <div style={{ display: 'flex', justifyContent: 'center' }}>
                      <span style={{
                        fontSize: '11px', padding: '2px 8px', borderRadius: '20px', fontWeight: 600,
                        background: isDebit ? '#FEF2F2' : '#F0FDF4',
                        color: isDebit ? '#DC2626' : '#15803D',
                      }}>
                        {label}
                      </span>
                    </div>

                    <span style={{ textAlign: 'right', fontSize: '13px', fontWeight: 600, color: '#DC2626' }}>
                      {isDebit ? `${fmt(row.amount)} ₴` : ''}
                    </span>
                    <span style={{ textAlign: 'right', fontSize: '13px', fontWeight: 600, color: '#15803D' }}>
                      {!isDebit ? `${fmt(Math.abs(row.amount))} ₴` : ''}
                    </span>
                  </div>
                );
              })}

              {/* Footer totals */}
              <div style={{
                display: 'grid',
                gridTemplateColumns: showContractCol ? '100px 150px 1fr 110px 110px 110px' : '100px 1fr 110px 110px 110px',
                padding: '10px 16px',
                background: 'var(--bg-soft)', borderTop: '2px solid var(--border)',
                fontSize: '13px', fontWeight: 700,
              }}>
                <span style={{ gridColumn: showContractCol ? '1 / 5' : '1 / 4', color: 'var(--text-primary)' }}>
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

      <style>{`@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}
