'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ChevronDown, ChevronRight, TrendingDown, TrendingUp, CheckCircle } from 'lucide-react';

export type SupplierTransaction = {
  doc_type:      string;
  amount:        number;
  business_date: string;
  description:   string;
  doc_id:        string | null;
  doc_number:    string | null;
  acc_doc_type:  string | null;
};

export type SupplierBalance = {
  supplier_id:    number;
  supplier_name:  string;
  total_receipts: number;
  total_payments: number;
  balance:        number; // < 0 = ми винні, > 0 = постачальник винний нам
  transactions:   SupplierTransaction[];
};

function fmt(n: number) {
  return Math.abs(n).toLocaleString('uk-UA', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function docLink(txn: SupplierTransaction): { href: string; label: string } | null {
  if (!txn.doc_id) return null;
  if (txn.doc_type === 'receipt' || txn.acc_doc_type === 'receipt') {
    return { href: `/admin/procurement/receipts/${txn.doc_id}`, label: txn.doc_number ?? 'Прихід' };
  }
  if (txn.doc_type === 'supplier_payment') {
    return { href: `/admin/procurement/${txn.doc_id}`, label: txn.doc_number ?? 'Оплата' };
  }
  return txn.doc_number ? { href: '#', label: txn.doc_number } : null;
}

type Props = { balances: SupplierBalance[] };

export default function PayablesClient({ balances }: Props) {
  const [expanded, setExpanded] = useState<Set<number>>(new Set());

  function toggle(id: number) {
    setExpanded(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  const totalDebt      = balances.filter(b => b.balance < 0).reduce((s, b) => s + Math.abs(b.balance), 0);
  const totalOverpaid  = balances.filter(b => b.balance > 0).reduce((s, b) => s + b.balance, 0);
  const debtCount      = balances.filter(b => b.balance < 0).length;
  const overpaidCount  = balances.filter(b => b.balance > 0).length;

  return (
    <>
      {/* Summary cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px', marginBottom: '20px' }}>
        {[
          {
            label: 'Борг постачальникам',
            value: totalDebt > 0 ? `${fmt(totalDebt)} ₴` : '—',
            sub: `${debtCount} постачальник${debtCount === 1 ? '' : 'и'}`,
            color: totalDebt > 0 ? '#DC2626' : '#15803D',
            icon: TrendingDown,
          },
          {
            label: 'Переплата',
            value: totalOverpaid > 0 ? `${fmt(totalOverpaid)} ₴` : '—',
            sub: `${overpaidCount} постачальник${overpaidCount === 1 ? '' : 'и'}`,
            color: totalOverpaid > 0 ? '#15803D' : '#64748B',
            icon: TrendingUp,
          },
          {
            label: 'Всього куплено',
            value: `${fmt(balances.reduce((s, b) => s + b.total_receipts, 0))} ₴`,
            sub: 'за весь час',
            color: '#1E3A5F',
            icon: TrendingDown,
          },
          {
            label: 'Всього оплачено',
            value: `${fmt(balances.reduce((s, b) => s + b.total_payments, 0))} ₴`,
            sub: 'за весь час',
            color: '#15803D',
            icon: TrendingUp,
          },
        ].map(c => {
          const Icon = c.icon;
          return (
            <div key={c.label} style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '12px', padding: '16px 18px' }}>
              <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '6px' }}>{c.label}</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <div style={{ fontSize: '22px', fontWeight: 800, color: c.color }}>{c.value}</div>
                <Icon size={16} color={c.color} style={{ opacity: 0.5 }} />
              </div>
              <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>{c.sub}</div>
            </div>
          );
        })}
      </div>

      {balances.length === 0 ? (
        <div style={{ padding: '64px', textAlign: 'center', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '12px' }}>
          <CheckCircle size={32} color="#15803D" style={{ marginBottom: '12px' }} />
          <div style={{ fontSize: '15px', fontWeight: 700, color: '#15803D' }}>Взаєморозрахунків немає</div>
          <div style={{ fontSize: '13px', color: 'var(--text-muted)', marginTop: '4px' }}>Немає операцій з постачальниками</div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {balances.map(b => {
            const isOpen  = expanded.has(b.supplier_id);
            const isDebt  = b.balance < 0;
            const accentColor = isDebt ? '#EF4444' : '#22C55E';

            return (
              <div key={b.supplier_id} style={{
                background: 'var(--bg-card)',
                border: `1px solid ${isDebt ? '#FCA5A5' : '#86EFAC'}`,
                borderRadius: '12px', overflow: 'hidden',
              }}>
                {/* Header row */}
                <div
                  onClick={() => toggle(b.supplier_id)}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '1fr 160px 160px 160px 36px',
                    padding: '14px 16px', alignItems: 'center', cursor: 'pointer',
                    borderLeft: `4px solid ${accentColor}`,
                    background: isOpen ? 'var(--bg-soft)' : 'transparent',
                  }}
                >
                  <div>
                    <div style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text-primary)' }}>
                      {b.supplier_name}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginTop: '2px' }}>
                      <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                        {b.transactions.length} транзакцій
                      </span>
                      <Link
                        href={`/admin/finance/payables/${b.supplier_id}`}
                        onClick={e => e.stopPropagation()}
                        style={{ fontSize: '11px', fontWeight: 700, color: '#1E3A5F', textDecoration: 'none', background: '#EFF6FF', border: '1px solid #BFDBFE', borderRadius: '5px', padding: '1px 7px' }}>
                        Акт звірки ↗
                      </Link>
                    </div>
                  </div>

                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '2px' }}>Куплено</div>
                    <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)' }}>{fmt(b.total_receipts)} ₴</div>
                  </div>

                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '2px' }}>Оплачено</div>
                    <div style={{ fontSize: '14px', fontWeight: 600, color: '#15803D' }}>{fmt(b.total_payments)} ₴</div>
                  </div>

                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '2px' }}>
                      {isDebt ? 'Борг' : 'Переплата'}
                    </div>
                    <div style={{ fontSize: '16px', fontWeight: 800, color: accentColor }}>
                      {isDebt ? '−' : '+'}{fmt(b.balance)} ₴
                    </div>
                  </div>

                  <span style={{ display: 'flex', justifyContent: 'center', color: 'var(--text-muted)' }}>
                    {isOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                  </span>
                </div>

                {/* Transactions */}
                {isOpen && (
                  <div style={{ borderTop: '1px solid var(--border)' }}>
                    {/* Column headers */}
                    <div style={{
                      display: 'grid', gridTemplateColumns: '100px 140px 1fr 140px',
                      padding: '6px 20px', gap: '8px',
                      fontSize: '10px', fontWeight: 700, color: 'var(--text-muted)',
                      textTransform: 'uppercase', background: 'var(--bg-soft)',
                      borderBottom: '1px solid var(--border)',
                    }}>
                      <span>Дата</span>
                      <span>Документ</span>
                      <span>Опис</span>
                      <span style={{ textAlign: 'right' }}>Сума</span>
                    </div>

                    {/* Running balance */}
                    {(() => {
                      let running = 0;
                      return b.transactions.map((txn, idx) => {
                        running += txn.amount;
                        const isPayment = txn.amount > 0;
                        const link = docLink(txn);

                        return (
                          <div key={idx} style={{
                            display: 'grid', gridTemplateColumns: '100px 140px 1fr 140px',
                            padding: '9px 20px', gap: '8px', alignItems: 'center',
                            borderTop: idx > 0 ? '1px solid var(--border-light)' : 'none',
                            background: isPayment ? 'rgba(34,197,94,0.04)' : 'transparent',
                          }}>
                            <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                              {new Date(txn.business_date).toLocaleDateString('uk-UA', { day: '2-digit', month: '2-digit', year: '2-digit' })}
                            </span>

                            <span>
                              {link && link.href !== '#' ? (
                                <Link href={link.href} onClick={e => e.stopPropagation()} style={{ fontSize: '12px', fontWeight: 700, color: '#1D4ED8', textDecoration: 'none', fontFamily: 'monospace' }}>
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
                            </span>

                            <div style={{ textAlign: 'right' }}>
                              <div style={{ fontSize: '13px', fontWeight: 700, color: isPayment ? '#15803D' : '#DC2626' }}>
                                {isPayment ? '+' : '−'}{fmt(txn.amount)} ₴
                              </div>
                              <div style={{ fontSize: '10px', color: running < 0 ? '#DC2626' : '#15803D', marginTop: '1px' }}>
                                баланс: {running < 0 ? '−' : '+'}{fmt(running)} ₴
                              </div>
                            </div>
                          </div>
                        );
                      });
                    })()}

                    {/* Total */}
                    <div style={{
                      display: 'grid', gridTemplateColumns: '100px 140px 1fr 140px',
                      padding: '8px 20px', gap: '8px',
                      borderTop: '2px solid var(--border)',
                      background: 'var(--bg-soft)',
                    }}>
                      <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-muted)', gridColumn: '1 / 4' }}>
                        Підсумок
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
