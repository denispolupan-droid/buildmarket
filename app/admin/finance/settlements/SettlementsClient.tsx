'use client';

import { useState } from 'react';
import { Search, RefreshCw, TrendingUp, TrendingDown } from 'lucide-react';

type Contract = { id: string; contract_number: string; customer_id: string; customer_name: string | null; status: string };
type TxnRow = {
  id: string; txn_id: string; business_date: string;
  customer_id: string; contract_id: string | null; contract_number: string | null; customer_name: string | null;
  amount: number; currency: string; doc_type: string | null; description: string | null;
  order_id: string | null; entry_type: 'debit' | 'credit'; created_by: string | null;
};

function fmt(n: number) { return n.toLocaleString('uk-UA', { maximumFractionDigits: 2 }); }

export default function SettlementsClient({ contracts, defaultContractId }: { contracts: Contract[]; defaultContractId?: string }) {
  const today = new Date().toISOString().slice(0, 10);
  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10);

  const [contractId, setContractId] = useState(defaultContractId ?? '');
  const [dateFrom,   setDateFrom]   = useState(monthStart);
  const [dateTo,     setDateTo]     = useState(today);
  const [rows,       setRows]       = useState<TxnRow[]>([]);
  const [opening,    setOpening]    = useState<number | null>(null);
  const [loading,    setLoading]    = useState(false);
  const [searched,   setSearched]   = useState(false);

  async function handleSearch() {
    setLoading(true);
    try {
      const params = new URLSearchParams({ dateFrom, dateTo });
      if (contractId) params.set('contractId', contractId);
      const res = await fetch(`/api/admin/settlements?${params}`);
      const data = await res.json();
      setRows(data.rows ?? []);
      setOpening(data.opening ?? 0);
      setSearched(true);
    } catch { /* silent */ }
    finally { setLoading(false); }
  }

  const totalDebit  = rows.filter(r => r.amount > 0).reduce((s, r) => s + r.amount, 0);
  const totalCredit = rows.filter(r => r.amount < 0).reduce((s, r) => s + Math.abs(r.amount), 0);
  const closing = (opening ?? 0) + totalDebit - totalCredit;

  const inp: React.CSSProperties = { height: '36px', padding: '0 10px', border: '1.5px solid var(--border)', borderRadius: '8px', fontSize: '13px', outline: 'none', color: 'var(--text-primary)', background: 'var(--bg-soft)' };

  return (
    <div style={{ padding: '28px 32px', maxWidth: '1200px' }}>
      <div style={{ marginBottom: '24px' }}>
        <h1 style={{ fontSize: '22px', fontWeight: 800, color: 'var(--text-primary)', margin: 0 }}>Взаєморозрахунки</h1>
        <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginTop: '4px' }}>
          Детальні рухи по договорах: відвантаження, оплати, коригування
        </p>
      </div>

      {/* Filters */}
      <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '12px', padding: '16px 20px', marginBottom: '20px', display: 'flex', gap: '12px', alignItems: 'flex-end', flexWrap: 'wrap' }}>
        <div>
          <label style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', display: 'block', marginBottom: '4px', textTransform: 'uppercase' }}>Договір</label>
          <select value={contractId} onChange={e => setContractId(e.target.value)}
            style={{ ...inp, width: '220px', cursor: 'pointer' }}>
            <option value="">Всі договори</option>
            {contracts.map(c => (
              <option key={c.id} value={c.id}>
                {c.contract_number} — {c.customer_name || c.customer_id}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', display: 'block', marginBottom: '4px', textTransform: 'uppercase' }}>З</label>
          <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} style={inp} />
        </div>
        <div>
          <label style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', display: 'block', marginBottom: '4px', textTransform: 'uppercase' }}>По</label>
          <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} style={inp} />
        </div>
        <button onClick={handleSearch} disabled={loading}
          style={{ height: '36px', padding: '0 20px', borderRadius: '8px', border: 'none', background: '#1E3A5F', color: '#fff', fontSize: '13px', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '7px', opacity: loading ? 0.7 : 1 }}>
          {loading ? <RefreshCw size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <Search size={14} />}
          {loading ? 'Завантаження...' : 'Показати'}
        </button>
      </div>

      {/* Summary */}
      {searched && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px', marginBottom: '16px' }}>
            {[
              { label: 'Вхідний залишок',   value: opening ?? 0, color: 'var(--brand-blue)', accent: '#4880B8' },
              { label: 'Нараховано (дебет)', value: totalDebit,  color: '#DC2626',            accent: '#DC2626' },
              { label: 'Оплачено (кредит)',  value: totalCredit, color: '#16A34A',            accent: '#16A34A' },
              { label: 'Вихідний залишок',   value: closing,     color: closing > 0 ? '#DC2626' : '#16A34A', accent: closing > 0 ? '#DC2626' : '#16A34A' },
            ].map(s => (
              <div key={s.label} style={{ padding: '14px 18px', borderRadius: '10px', background: 'var(--bg-card)', border: '1px solid var(--border)', borderLeft: `3px solid ${s.accent}` }}>
                <div style={{ fontSize: '18px', fontWeight: 800, color: s.color }}>{fmt(s.value)} ₴</div>
                <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>{s.label}</div>
              </div>
            ))}
          </div>

          {/* Transactions table */}
          {rows.length === 0 ? (
            <div style={{ padding: '48px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '14px', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '12px' }}>
              Немає операцій за обраний період
            </div>
          ) : (
            <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '12px', overflow: 'hidden' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '100px 140px 1fr 120px 110px 110px', padding: '8px 16px', background: 'var(--bg-soft)', borderBottom: '1px solid var(--border)', fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                <span>Дата</span><span>Договір</span><span>Опис</span><span>Тип</span>
                <span style={{ textAlign: 'right' }}>Дебет</span><span style={{ textAlign: 'right' }}>Кредит</span>
              </div>
              {rows.map((row, idx) => {
                const isDebit = row.amount > 0;
                const DOC_LABELS: Record<string, string> = {
                  sale: 'Відвантаження', payment: 'Оплата', return_out: 'Повернення',
                  cogs: 'Собівартість', correction: 'Коригування',
                };
                return (
                  <div key={row.id} style={{
                    display: 'grid', gridTemplateColumns: '100px 140px 1fr 120px 110px 110px',
                    padding: '9px 16px', alignItems: 'center',
                    borderBottom: idx < rows.length - 1 ? '1px solid var(--border-light)' : 'none',
                    background: isDebit ? 'transparent' : 'rgba(21,128,61,0.03)',
                  }}>
                    <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>{row.business_date}</span>
                    <div>
                      <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-primary)' }}>{row.contract_number ?? '—'}</div>
                      <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{row.customer_name ?? row.customer_id}</div>
                    </div>
                    <span style={{ fontSize: '12px', color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {row.description ?? DOC_LABELS[row.doc_type ?? ''] ?? row.doc_type ?? '—'}
                    </span>
                    <span style={{ fontSize: '11px', padding: '2px 8px', borderRadius: '20px', background: isDebit ? '#FEF2F2' : '#F0FDF4', color: isDebit ? '#DC2626' : '#15803D', fontWeight: 600, display: 'inline-block' }}>
                      {DOC_LABELS[row.doc_type ?? ''] ?? row.doc_type ?? '—'}
                    </span>
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
              <div style={{ display: 'grid', gridTemplateColumns: '100px 140px 1fr 120px 110px 110px', padding: '10px 16px', background: 'var(--bg-soft)', borderTop: '2px solid var(--border)', fontSize: '13px', fontWeight: 700 }}>
                <span style={{ gridColumn: '1 / 5', color: 'var(--text-primary)' }}>Разом за період</span>
                <span style={{ textAlign: 'right', color: '#DC2626' }}>{fmt(totalDebit)} ₴</span>
                <span style={{ textAlign: 'right', color: '#15803D' }}>{fmt(totalCredit)} ₴</span>
              </div>
            </div>
          )}
        </>
      )}

      {!searched && (
        <div style={{ padding: '64px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '14px' }}>
          Оберіть договір та період, натисніть «Показати»
        </div>
      )}
      <style>{`@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}
