'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';
import { ArrowDownLeft, ArrowUpRight, Minus } from 'lucide-react';

export type CashflowEntry = {
  id:           string;
  txn_id:       string;
  account_type: 'cash' | 'bank' | 'acquiring';
  amount:       number;           // + надходження, - видаток
  description:  string | null;
  business_date: string;
  doc_id:       string | null;
  doc_type:     string | null;
  doc_number:   string | null;
  counterparty: string | null;    // ім'я клієнта або постачальника
};

const ACCOUNT_LABELS: Record<string, { label: string; color: string; bg: string }> = {
  cash:      { label: 'Каса',       color: '#15803D', bg: '#F0FDF4' },
  bank:      { label: 'Банк',       color: '#1D4ED8', bg: '#EFF6FF' },
  acquiring: { label: 'Еквайринг', color: '#7C3AED', bg: '#F5F3FF' },
};

function docHref(e: CashflowEntry): string | null {
  if (!e.doc_id) return null;
  if (e.doc_type === 'purchase_order' || e.doc_type === 'supplier_payment') return `/admin/procurement/${e.doc_id}`;
  if (e.doc_type === 'receipt' || e.doc_type === 'stock_in') return `/admin/procurement/receipts/${e.doc_id}`;
  if (e.doc_type === 'sale' || e.doc_type === 'payment') return `/admin/accounting/documents/${e.doc_id}`;
  return null;
}

function fmt(n: number) {
  return Math.abs(n).toLocaleString('uk-UA', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtBalance(n: number) {
  return n.toLocaleString('uk-UA', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

type Props = {
  entries:       CashflowEntry[];
  openingBalance: number;          // сума всіх записів ДО period start
  defaultFrom:   string;
  defaultTo:     string;
};

export default function CashflowClient({ entries, openingBalance, defaultFrom, defaultTo }: Props) {
  const [from,    setFrom]    = useState(defaultFrom);
  const [to,      setTo]      = useState(defaultTo);
  const [account, setAccount] = useState<'all' | 'cash' | 'bank' | 'acquiring'>('all');
  const [dir,     setDir]     = useState<'all' | 'in' | 'out'>('all');
  const [search,  setSearch]  = useState('');

  // Apply client-side filters (the data is already period-filtered server-side)
  const filtered = useMemo(() => {
    return entries.filter(e => {
      if (account !== 'all' && e.account_type !== account) return false;
      if (dir === 'in'  && e.amount <= 0) return false;
      if (dir === 'out' && e.amount >= 0) return false;
      if (search) {
        const q = search.toLowerCase();
        if (
          !e.description?.toLowerCase().includes(q) &&
          !e.counterparty?.toLowerCase().includes(q) &&
          !e.doc_number?.toLowerCase().includes(q)
        ) return false;
      }
      return true;
    });
  }, [entries, account, dir, search]);

  // Running balance (entries are newest-first; calculate oldest-first, then reverse display)
  const withBalance = useMemo(() => {
    const reversed = [...filtered].reverse();
    let bal = openingBalance;
    const rows = reversed.map(e => {
      bal += e.amount;
      return { ...e, balance: bal };
    });
    return rows.reverse();
  }, [filtered, openingBalance]);

  // Summary
  const totalIn  = filtered.filter(e => e.amount > 0).reduce((s, e) => s + e.amount, 0);
  const totalOut = filtered.filter(e => e.amount < 0).reduce((s, e) => s + e.amount, 0);
  const closingBalance = openingBalance + entries.reduce((s, e) => s + e.amount, 0);

  const inp: React.CSSProperties = {
    height: '34px', padding: '0 10px', borderRadius: '8px',
    border: '1px solid var(--border)', background: 'var(--bg-card)',
    fontSize: '13px', color: 'var(--text-primary)', outline: 'none',
  };

  return (
    <div>
      {/* ── Summary cards ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px', marginBottom: '20px' }}>
        {[
          { label: 'Залишок на початок', value: openingBalance, color: '#1E3A5F', neutral: true },
          { label: 'Надходження',        value: totalIn,        color: '#15803D', neutral: false },
          { label: 'Видатки',            value: Math.abs(totalOut), color: '#DC2626', neutral: false },
          { label: 'Залишок на кінець',  value: closingBalance, color: closingBalance >= 0 ? '#15803D' : '#DC2626', neutral: true },
        ].map(card => (
          <div key={card.label} style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '12px', padding: '16px 18px' }}>
            <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '6px' }}>
              {card.label}
            </div>
            <div style={{ fontSize: '22px', fontWeight: 800, color: card.color }}>
              {card.neutral ? '' : card.label === 'Видатки' ? '−' : '+'}{fmtBalance(card.value)} ₴
            </div>
          </div>
        ))}
      </div>

      {/* ── Filters ── */}
      <div style={{ display: 'flex', gap: '10px', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap' }}>
        {/* Date range */}
        <input type="date" value={from} onChange={e => setFrom(e.target.value)} style={{ ...inp, width: '138px' }} />
        <span style={{ color: 'var(--text-muted)', fontSize: '13px' }}>—</span>
        <input type="date" value={to}   onChange={e => setTo(e.target.value)}   style={{ ...inp, width: '138px' }} />

        {/* Account tabs */}
        <div style={{ display: 'flex', borderRadius: '8px', overflow: 'hidden', border: '1px solid var(--border)', marginLeft: '8px' }}>
          {(['all', 'cash', 'bank', 'acquiring'] as const).map((a, i) => (
            <button key={a} onClick={() => setAccount(a)} style={{
              height: '34px', padding: '0 14px', fontSize: '12px', fontWeight: 600,
              cursor: 'pointer', border: 'none',
              borderLeft: i > 0 ? '1px solid var(--border)' : 'none',
              background: account === a ? '#1E3A5F' : 'var(--bg-soft)',
              color:      account === a ? '#fff' : 'var(--text-secondary)',
            }}>
              {a === 'all' ? 'Всі' : ACCOUNT_LABELS[a].label}
            </button>
          ))}
        </div>

        {/* Direction tabs */}
        <div style={{ display: 'flex', borderRadius: '8px', overflow: 'hidden', border: '1px solid var(--border)' }}>
          {([
            { key: 'all', label: 'Всі' },
            { key: 'in',  label: '↓ Прихід' },
            { key: 'out', label: '↑ Видаток' },
          ] as const).map((d, i) => (
            <button key={d.key} onClick={() => setDir(d.key)} style={{
              height: '34px', padding: '0 14px', fontSize: '12px', fontWeight: 600,
              cursor: 'pointer', border: 'none',
              borderLeft: i > 0 ? '1px solid var(--border)' : 'none',
              background: dir === d.key ? '#1E3A5F' : 'var(--bg-soft)',
              color:      dir === d.key ? '#fff' : 'var(--text-secondary)',
            }}>
              {d.label}
            </button>
          ))}
        </div>

        {/* Search */}
        <input
          type="text" placeholder="Пошук…" value={search}
          onChange={e => setSearch(e.target.value)}
          style={{ ...inp, width: '200px', marginLeft: 'auto' }}
        />
      </div>

      {/* ── Table ── */}
      <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '12px', overflow: 'hidden' }}>
        {/* Header */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: '100px 90px 1fr 140px 110px 120px',
          padding: '8px 16px',
          background: 'var(--bg-soft)',
          borderBottom: '1px solid var(--border)',
          fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase',
        }}>
          <span>Дата</span>
          <span>Рахунок</span>
          <span>Опис</span>
          <span>Контрагент</span>
          <span style={{ textAlign: 'right' }}>Сума</span>
          <span style={{ textAlign: 'right' }}>Баланс</span>
        </div>

        {withBalance.length === 0 && (
          <div style={{ padding: '48px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '13px' }}>
            Операцій не знайдено
          </div>
        )}

        {withBalance.map((e, idx) => {
          const isIn   = e.amount > 0;
          const href   = docHref(e);
          const accCfg = ACCOUNT_LABELS[e.account_type];
          const isLast = idx === withBalance.length - 1;

          return (
            <div key={e.id} style={{
              display: 'grid',
              gridTemplateColumns: '100px 90px 1fr 140px 110px 120px',
              padding: '10px 16px',
              alignItems: 'center',
              borderBottom: isLast ? 'none' : '1px solid var(--border-light)',
              background: idx % 2 === 0 ? 'transparent' : 'var(--bg-soft)',
            }}>
              {/* Date */}
              <span style={{ fontSize: '12px', color: 'var(--text-secondary)', fontVariantNumeric: 'tabular-nums' }}>
                {new Date(e.business_date).toLocaleDateString('uk-UA', { day: '2-digit', month: '2-digit', year: '2-digit' })}
              </span>

              {/* Account badge */}
              <span style={{
                display: 'inline-flex', alignItems: 'center', gap: '4px',
                fontSize: '11px', fontWeight: 700,
                color: accCfg.color, background: accCfg.bg,
                padding: '2px 8px', borderRadius: '20px',
                width: 'fit-content',
              }}>
                {accCfg.label}
              </span>

              {/* Description + doc link */}
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: '13px', color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {e.description ?? '—'}
                </div>
                {href && e.doc_number && (
                  <Link href={href} style={{
                    fontSize: '11px', color: '#1D4ED8', textDecoration: 'none', fontWeight: 600,
                  }}>
                    {e.doc_number}
                  </Link>
                )}
              </div>

              {/* Counterparty */}
              <span style={{ fontSize: '12px', color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {e.counterparty ?? '—'}
              </span>

              {/* Amount */}
              <div style={{ textAlign: 'right' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '4px' }}>
                  {isIn
                    ? <ArrowDownLeft size={13} color="#15803D" />
                    : <ArrowUpRight  size={13} color="#DC2626" />}
                  <span style={{
                    fontSize: '14px', fontWeight: 700,
                    color: isIn ? '#15803D' : '#DC2626',
                    fontVariantNumeric: 'tabular-nums',
                  }}>
                    {isIn ? '+' : '−'}{fmt(e.amount)} ₴
                  </span>
                </div>
              </div>

              {/* Running balance */}
              <div style={{ textAlign: 'right' }}>
                <span style={{
                  fontSize: '13px', fontWeight: 600,
                  color: e.balance >= 0 ? 'var(--text-primary)' : '#DC2626',
                  fontVariantNumeric: 'tabular-nums',
                }}>
                  {fmtBalance(e.balance)} ₴
                </span>
              </div>
            </div>
          );
        })}
      </div>

      <div style={{ marginTop: '10px', fontSize: '12px', color: 'var(--text-muted)', textAlign: 'right' }}>
        {filtered.length} операцій
      </div>
    </div>
  );
}
