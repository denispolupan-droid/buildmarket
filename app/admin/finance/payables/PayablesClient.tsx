'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';
import { ChevronDown, ChevronRight, AlertTriangle, Clock, CheckCircle } from 'lucide-react';

export type PayablePO = {
  id:                  string;
  doc_number:          string;
  doc_date:            string;
  supplier_id:         number;
  supplier_name:       string;
  procurement_status:  string;
  total_cost:          number;
  paid_amount:         number;        // з money_entries
  outstanding:         number;        // total_cost - paid_amount
  payment_defer_date:  string | null; // з meta
  days_overdue:        number;        // >0 = прострочено, <0 = ще не наступило
};

export type SupplierGroup = {
  supplier_id:   number;
  supplier_name: string;
  total_outstanding: number;
  overdue:       number;
  pos:           PayablePO[];
};

const STATUS_CFG: Record<string, { label: string; color: string; bg: string }> = {
  sent:                  { label: 'Відправлено',   color: '#1D4ED8', bg: '#EFF6FF' },
  confirmed_by_supplier: { label: 'Підтверджено',  color: '#7C3AED', bg: '#F5F3FF' },
  partially_received:    { label: 'Частк. прихід', color: '#B45309', bg: '#FEF3C7' },
  received:              { label: 'Отримано',      color: '#15803D', bg: '#F0FDF4' },
  invoiced:              { label: 'Відстрочка',    color: '#EA580C', bg: '#FFF7ED' },
};

function fmt(n: number) {
  return n.toLocaleString('uk-UA', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function daysLabel(days: number): { text: string; color: string; bg: string; icon: React.ReactNode } {
  if (days > 0)  return { text: `Прострочено ${days} дн.`,  color: '#DC2626', bg: '#FEF2F2', icon: <AlertTriangle size={11} /> };
  if (days === 0) return { text: 'Сьогодні',               color: '#EA580C', bg: '#FFF7ED', icon: <Clock size={11} /> };
  return { text: `Через ${Math.abs(days)} дн.`,             color: '#15803D', bg: '#F0FDF4', icon: <Clock size={11} /> };
}

type Props = { groups: SupplierGroup[] };

export default function PayablesClient({ groups }: Props) {
  const [filter,   setFilter]   = useState<'all' | 'overdue' | 'soon'>('all');
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const [search,   setSearch]   = useState('');

  function toggle(id: number) {
    setExpanded(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  const today = new Date().toISOString().slice(0, 10);

  const filtered = useMemo(() => {
    return groups
      .filter(g => {
        if (search) {
          const q = search.toLowerCase();
          if (!g.supplier_name.toLowerCase().includes(q) &&
              !g.pos.some(p => p.doc_number.toLowerCase().includes(q))) return false;
        }
        if (filter === 'overdue') return g.overdue > 0;
        if (filter === 'soon') {
          return g.pos.some(p => {
            if (!p.payment_defer_date) return false;
            return p.days_overdue >= -7 && p.days_overdue <= 0;
          });
        }
        return true;
      });
  }, [groups, filter, search]);

  const totalOutstanding = filtered.reduce((s, g) => s + g.total_outstanding, 0);
  const totalOverdue     = filtered.reduce((s, g) => s + g.overdue, 0);
  const totalSuppliers   = filtered.length;
  const totalPOs         = filtered.reduce((s, g) => s + g.pos.length, 0);

  return (
    <>
      {/* ── Summary cards ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px', marginBottom: '20px' }}>
        {[
          { label: 'Всього до сплати',    value: `${fmt(totalOutstanding)} ₴`, color: '#1E3A5F', sub: `${totalPOs} замовлень` },
          { label: 'Прострочено',         value: totalOverdue > 0 ? `${fmt(totalOverdue)} ₴` : '—', color: totalOverdue > 0 ? '#DC2626' : '#15803D', sub: totalOverdue > 0 ? 'потребує оплати' : 'прострочень немає' },
          { label: 'Постачальників',      value: String(totalSuppliers), color: '#7C3AED', sub: 'з відкритою заборгованістю' },
          { label: 'Відстрочок',          value: String(filtered.reduce((s, g) => s + g.pos.filter(p => p.procurement_status === 'invoiced').length, 0)), color: '#EA580C', sub: 'по договору' },
        ].map(c => (
          <div key={c.label} style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '12px', padding: '16px 18px' }}>
            <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '6px' }}>{c.label}</div>
            <div style={{ fontSize: '22px', fontWeight: 800, color: c.color }}>{c.value}</div>
            <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>{c.sub}</div>
          </div>
        ))}
      </div>

      {/* ── Filters ── */}
      <div style={{ display: 'flex', gap: '10px', alignItems: 'center', marginBottom: '16px' }}>
        <div style={{ display: 'flex', borderRadius: '8px', overflow: 'hidden', border: '1px solid var(--border)' }}>
          {([
            { key: 'all',     label: 'Всі' },
            { key: 'overdue', label: '⚠ Прострочені' },
            { key: 'soon',    label: '⏰ До 7 днів' },
          ] as const).map((f, i) => (
            <button key={f.key} onClick={() => setFilter(f.key)} style={{
              height: '34px', padding: '0 14px', fontSize: '12px', fontWeight: 600,
              cursor: 'pointer', border: 'none',
              borderLeft: i > 0 ? '1px solid var(--border)' : 'none',
              background: filter === f.key ? '#1E3A5F' : 'var(--bg-soft)',
              color:      filter === f.key ? '#fff'    : 'var(--text-secondary)',
            }}>{f.label}</button>
          ))}
        </div>
        <input type="text" placeholder="Пошук постачальника або номера…" value={search}
          onChange={e => setSearch(e.target.value)}
          style={{ height: '34px', padding: '0 10px', borderRadius: '8px', border: '1px solid var(--border)',
            background: 'var(--bg-card)', fontSize: '13px', color: 'var(--text-primary)', outline: 'none',
            width: '280px', marginLeft: 'auto' }} />
      </div>

      {/* ── Grouped table ── */}
      {filtered.length === 0 ? (
        <div style={{ padding: '64px', textAlign: 'center', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '12px' }}>
          <CheckCircle size={32} color="#15803D" style={{ marginBottom: '12px' }} />
          <div style={{ fontSize: '15px', fontWeight: 700, color: '#15803D' }}>Заборгованостей немає</div>
          <div style={{ fontSize: '13px', color: 'var(--text-muted)', marginTop: '4px' }}>Всі замовлення оплачені</div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {filtered.map(g => {
            const isOpen = expanded.has(g.supplier_id);
            return (
              <div key={g.supplier_id} style={{ background: 'var(--bg-card)', border: `1px solid ${g.overdue > 0 ? '#FCA5A5' : 'var(--border)'}`, borderRadius: '12px', overflow: 'hidden' }}>

                {/* Supplier row */}
                <div
                  onClick={() => toggle(g.supplier_id)}
                  style={{
                    display: 'grid', gridTemplateColumns: '1fr 160px 140px 140px 36px',
                    padding: '14px 16px', alignItems: 'center', cursor: 'pointer',
                    background: isOpen ? 'var(--bg-soft)' : 'transparent',
                    borderLeft: `4px solid ${g.overdue > 0 ? '#EF4444' : '#1E3A5F'}`,
                  }}
                >
                  <div>
                    <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)' }}>{g.supplier_name}</div>
                    <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>
                      {g.pos.length} {g.pos.length === 1 ? 'замовлення' : 'замовлень'}
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    {g.overdue > 0 && (
                      <div style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '11px', fontWeight: 700, color: '#DC2626', background: '#FEF2F2', padding: '2px 8px', borderRadius: '20px', marginBottom: '4px' }}>
                        <AlertTriangle size={10} /> {fmt(g.overdue)} ₴ прострочено
                      </div>
                    )}
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '2px' }}>До сплати</div>
                    <div style={{ fontSize: '16px', fontWeight: 800, color: '#1E3A5F' }}>{fmt(g.total_outstanding)} ₴</div>
                  </div>
                  <div />
                  <span style={{ display: 'flex', justifyContent: 'center', color: 'var(--text-muted)' }}>
                    {isOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                  </span>
                </div>

                {/* PO rows */}
                {isOpen && (
                  <div style={{ borderTop: '1px solid var(--border)' }}>
                    {/* Column header */}
                    <div style={{
                      display: 'grid', gridTemplateColumns: '130px 100px 1fr 120px 120px 140px',
                      padding: '6px 16px 6px 20px', gap: '8px',
                      fontSize: '10px', fontWeight: 700, color: 'var(--text-muted)',
                      textTransform: 'uppercase', background: 'var(--bg-soft)',
                      borderBottom: '1px solid var(--border)',
                    }}>
                      <span>Замовлення</span>
                      <span>Дата</span>
                      <span>Статус</span>
                      <span style={{ textAlign: 'right' }}>Сума PO</span>
                      <span style={{ textAlign: 'right' }}>Залишок</span>
                      <span style={{ textAlign: 'right' }}>Оплатити до</span>
                    </div>

                    {g.pos.map((po, idx) => {
                      const cfg = STATUS_CFG[po.procurement_status] ?? { label: po.procurement_status, color: '#64748B', bg: '#F8FAFC' };
                      const hasDefer = !!po.payment_defer_date;
                      const dl = hasDefer ? daysLabel(po.days_overdue) : null;

                      return (
                        <div key={po.id} style={{
                          display: 'grid', gridTemplateColumns: '130px 100px 1fr 120px 120px 140px',
                          padding: '10px 16px 10px 20px', alignItems: 'center', gap: '8px',
                          borderTop: idx > 0 ? '1px solid var(--border-light)' : 'none',
                          background: po.days_overdue > 0 ? 'rgba(254,226,226,0.3)' : 'transparent',
                        }}>
                          <Link href={`/admin/procurement/${po.id}`} style={{
                            fontSize: '13px', fontWeight: 700, color: '#1D4ED8', textDecoration: 'none',
                            fontFamily: 'monospace',
                          }}>
                            {po.doc_number}
                          </Link>

                          <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                            {new Date(po.doc_date).toLocaleDateString('uk-UA', { day: '2-digit', month: '2-digit', year: '2-digit' })}
                          </span>

                          <span style={{
                            display: 'inline-flex', alignItems: 'center', width: 'fit-content',
                            fontSize: '11px', fontWeight: 600, padding: '2px 8px', borderRadius: '20px',
                            color: cfg.color, background: cfg.bg,
                          }}>
                            {cfg.label}
                          </span>

                          <span style={{ textAlign: 'right', fontSize: '13px', color: 'var(--text-secondary)' }}>
                            {fmt(po.total_cost)} ₴
                          </span>

                          <span style={{ textAlign: 'right', fontSize: '14px', fontWeight: 800, color: '#1E3A5F' }}>
                            {fmt(po.outstanding)} ₴
                          </span>

                          <div style={{ textAlign: 'right', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '3px' }}>
                            {dl ? (
                              <>
                                <div style={{
                                  display: 'inline-flex', alignItems: 'center', gap: '4px',
                                  fontSize: '11px', fontWeight: 700,
                                  color: dl.color, background: dl.bg,
                                  padding: '3px 8px', borderRadius: '20px',
                                }}>
                                  {dl.icon} {dl.text}
                                </div>
                                {po.payment_defer_date && (
                                  <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 500 }}>
                                    {new Date(po.payment_defer_date).toLocaleDateString('uk-UA', { day: '2-digit', month: '2-digit', year: '2-digit' })}
                                  </span>
                                )}
                              </>
                            ) : (
                              <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                                {po.procurement_status === 'received' ? 'Очікує оплати' : '—'}
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })}

                    {/* Supplier total */}
                    {g.pos.length > 1 && (
                      <div style={{
                        display: 'grid', gridTemplateColumns: '130px 100px 1fr 120px 120px 140px',
                        padding: '8px 16px 8px 20px', gap: '8px',
                        borderTop: '2px solid var(--border)',
                        background: 'var(--bg-soft)',
                      }}>
                        <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-muted)', gridColumn: '1 / 5' }}>
                          Разом по {g.supplier_name}
                        </span>
                        <span style={{ textAlign: 'right', fontSize: '14px', fontWeight: 800, color: '#1E3A5F' }}>
                          {fmt(g.total_outstanding)} ₴
                        </span>
                        <span />
                      </div>
                    )}
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
