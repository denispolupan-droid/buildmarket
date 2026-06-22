'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';
import { ArrowRight, X } from 'lucide-react';

type Receipt = {
  id: string;
  doc_number: string | null;
  doc_date: string;
  status: string;
  total_cost: number | null;
  landed_cost_total: number | null;
  notes: string | null;
  parent_doc_id: string | null;
  warehouse: { name: string } | null;
  supplier: { name: string; id: number } | null;
};

function fmt(n: number) { return n.toLocaleString('uk-UA', { maximumFractionDigits: 0 }); }

export default function ReceiptsWrapper({ rows }: { rows: Receipt[] }) {
  const [supplier, setSupplier] = useState('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo,   setDateTo]   = useState('');

  const uniqueSuppliers = useMemo(() => {
    const seen = new Map<number, string>();
    for (const r of rows) {
      if (r.supplier?.id && r.supplier?.name) seen.set(r.supplier.id, r.supplier.name);
    }
    return [...seen.entries()].sort((a, b) => a[1].localeCompare(b[1], 'uk'));
  }, [rows]);

  const filtered = useMemo(() => rows.filter(r => {
    if (supplier !== 'all' && String(r.supplier?.id) !== supplier) return false;
    if (dateFrom && r.doc_date.slice(0, 10) < dateFrom) return false;
    if (dateTo   && r.doc_date.slice(0, 10) > dateTo)   return false;
    return true;
  }), [rows, supplier, dateFrom, dateTo]);

  const hasFilters = supplier !== 'all' || !!dateFrom || !!dateTo;

  function reset() { setSupplier('all'); setDateFrom(''); setDateTo(''); }

  const selectStyle: React.CSSProperties = {
    height: '30px', padding: '0 8px', borderRadius: '7px',
    border: '1px solid var(--border)', background: 'var(--bg-soft)',
    fontSize: '12px', color: 'var(--text-primary)', cursor: 'pointer',
  };

  const totalCost   = filtered.reduce((s, r) => s + Number(r.total_cost   ?? 0), 0);
  const totalLanded = filtered.reduce((s, r) => s + Number(r.landed_cost_total ?? 0), 0);

  return (
    <>
      {/* Filters */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', marginBottom: '12px', padding: '10px 14px', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '10px' }}>
        <select value={supplier} onChange={e => setSupplier(e.target.value)} style={{ ...selectStyle, minWidth: '150px' }}>
          <option value="all">Всі постачальники</option>
          {uniqueSuppliers.map(([id, name]) => (
            <option key={id} value={String(id)}>{name}</option>
          ))}
        </select>

        <div style={{ width: '1px', height: '20px', background: 'var(--border)' }} />

        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
            style={{ ...selectStyle, width: '130px' }} />
          <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>—</span>
          <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
            style={{ ...selectStyle, width: '130px' }} />
        </div>

        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '8px' }}>
          {hasFilters && (
            <span style={{ fontSize: '12px', color: 'var(--text-muted)', fontWeight: 600 }}>
              {filtered.length} з {rows.length}
            </span>
          )}
          {hasFilters && (
            <button onClick={reset} style={{ display: 'flex', alignItems: 'center', gap: '4px', height: '28px', padding: '0 10px', borderRadius: '6px', border: '1px solid #FCA5A5', background: '#FEF2F2', color: '#DC2626', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}>
              <X size={12} /> Скинути
            </button>
          )}
        </div>
      </div>

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: '12px', marginBottom: '20px' }}>
        {[
          { label: 'Всього приходів',    value: filtered.length,            suffix: 'шт', color: 'var(--brand-blue)', accent: '#4880B8' },
          { label: 'Сума закупівель',    value: `${fmt(totalCost)} ₴`,     suffix: '',   color: '#16A34A',           accent: '#16A34A' },
          { label: 'Landed Cost всього', value: `${fmt(totalLanded)} ₴`,   suffix: '',   color: '#7C3AED',           accent: '#7C3AED' },
        ].map(s => (
          <div key={s.label} style={{ padding: '14px 18px', borderRadius: '10px', background: 'var(--bg-card)', border: '1px solid var(--border)', borderLeft: `3px solid ${s.accent}` }}>
            <div style={{ fontSize: '22px', fontWeight: 800, color: s.color }}>{s.value} <span style={{ fontSize: '13px', fontWeight: 500 }}>{s.suffix}</span></div>
            <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Table */}
      {filtered.length === 0 ? (
        <div style={{ padding: '48px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '13px', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '12px' }}>
          Немає приходів за поточними фільтрами.
        </div>
      ) : (
        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '12px', overflow: 'hidden' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '130px 110px 150px 1fr 120px 120px 40px', padding: '8px 16px', background: 'var(--bg-soft)', borderBottom: '1px solid var(--border)', fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', columnGap: '16px' }}>
            <span>Документ</span>
            <span>Дата</span>
            <span>Постачальник</span>
            <span>Примітка</span>
            <span style={{ textAlign: 'right' }}>Собівартість</span>
            <span style={{ textAlign: 'right' }}>Landed Cost</span>
            <span />
          </div>
          {filtered.map((r, idx) => {
            const lc = Number(r.landed_cost_total ?? 0);
            return (
              <Link key={r.id} href={`/admin/procurement/receipts/${r.id}`} style={{
                display: 'grid', gridTemplateColumns: '130px 110px 150px 1fr 120px 120px 40px',
                padding: '11px 16px', alignItems: 'center', textDecoration: 'none',
                borderBottom: idx < filtered.length - 1 ? '1px solid var(--border-light)' : 'none',
                columnGap: '16px', cursor: 'pointer',
              }}>
                <div>
                  <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)' }}>{r.doc_number}</div>
                  {r.parent_doc_id && (
                    <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>до замовлення</div>
                  )}
                </div>
                <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                  {new Date(r.doc_date).toLocaleDateString('uk-UA')}
                </span>
                <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {r.supplier?.name ?? '—'}
                </span>
                <span style={{ fontSize: '12px', color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {r.notes || '—'}
                </span>
                <span style={{ textAlign: 'right', fontSize: '13px', fontWeight: 600, color: '#15803D' }}>
                  {r.total_cost ? `${fmt(Number(r.total_cost))} ₴` : '—'}
                </span>
                <span style={{ textAlign: 'right', fontSize: '13px', fontWeight: lc > 0 ? 700 : 400, color: lc > 0 ? '#7C3AED' : 'var(--text-muted)' }}>
                  {lc > 0 ? `+${fmt(lc)} ₴` : '—'}
                </span>
                <div style={{ display: 'flex', justifyContent: 'center', color: 'var(--text-muted)' }}>
                  <ArrowRight size={15} />
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </>
  );
}
