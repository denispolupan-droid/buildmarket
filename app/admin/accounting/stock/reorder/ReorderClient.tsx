'use client';

import { useState } from 'react';
import { ShoppingCart, CheckCircle2 } from 'lucide-react';

type ReorderRow = {
  sku: string;
  name: string;
  brand: string;
  qty_total: number;
  qty_available: number;
  min_reorder_qty: number;
  avg_cost: number;
  ordered_qty: number;
  demand: { orders: number; qty: number } | null;
  warehouse_id: number;
};

function fmt(n: number) {
  return n.toLocaleString('uk-UA', { maximumFractionDigits: 0 });
}

export default function ReorderClient({ rows }: { rows: ReorderRow[] }) {
  const [selected, setSelected] = useState<Set<string>>(new Set());

  function toggleAll() {
    if (selected.size === rows.length) setSelected(new Set());
    else setSelected(new Set(rows.map(r => r.sku)));
  }

  function toggle(sku: string) {
    setSelected(prev => {
      const n = new Set(prev);
      if (n.has(sku)) n.delete(sku); else n.add(sku);
      return n;
    });
  }

  function openPO() {
    const sel = rows.filter(r => selected.has(r.sku));
    if (!sel.length) return;
    const lines = sel.map(r => ({
      sku:        r.sku,
      name:       r.name,
      qty:        Math.max(1, r.min_reorder_qty - r.qty_total),
      cost_price: r.avg_cost > 0 ? r.avg_cost : 0,
      matched:    true,
    }));
    window.dispatchEvent(new CustomEvent('open-po-draft', {
      detail: {
        suppliers: [],
        prefill: { lines, notes: 'Поповнення залишків' },
      },
    }));
  }

  const col = '24px 130px 1fr 90px 90px 90px 100px 140px 36px';

  return (
    <div>
      {/* Toolbar */}
      {selected.size > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px', padding: '10px 14px', background: '#EFF4FF', border: '1px solid #BFDBFE', borderRadius: '10px' }}>
          <span style={{ fontSize: '13px', fontWeight: 600, color: '#1E3A5F' }}>
            Вибрано: {selected.size} позицій
          </span>
          <button
            onClick={openPO}
            style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 14px', borderRadius: '8px', border: 'none', background: '#1E3A5F', color: '#fff', fontSize: '12px', fontWeight: 700, cursor: 'pointer' }}
          >
            <ShoppingCart size={13} /> Створити ЗП
          </button>
          <button
            onClick={() => setSelected(new Set())}
            style={{ fontSize: '12px', color: '#64748B', background: 'none', border: 'none', cursor: 'pointer' }}
          >
            Скасувати
          </button>
        </div>
      )}

      <div className="adm-scroll-x" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '12px', overflow: 'hidden' }}>
        {/* Header */}
        <div style={{ display: 'grid', gridTemplateColumns: col, gap: '8px', padding: '8px 16px', background: 'var(--bg-soft)', borderBottom: '1px solid var(--border)', fontSize: '10px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', alignItems: 'center' }}>
          <input type="checkbox" checked={selected.size === rows.length} onChange={toggleAll} style={{ cursor: 'pointer' }} />
          <span>Артикул</span>
          <span>Назва</span>
          <span style={{ textAlign: 'right' }}>Залишок</span>
          <span style={{ textAlign: 'right' }}>Мінімум</span>
          <span style={{ textAlign: 'right' }}>Замовлено</span>
          <span style={{ textAlign: 'right' }}>Собів.</span>
          <span style={{ textAlign: 'center' }}>Попит покупців</span>
          <span />
        </div>

        {rows.map((row, idx) => {
          const isLast       = idx === rows.length - 1;
          const shortage     = row.min_reorder_qty - row.qty_total;
          const fullyOrdered = row.ordered_qty >= shortage;
          const pct          = Math.min(100, (row.qty_total / row.min_reorder_qty) * 100);
          const isSel        = selected.has(row.sku);

          return (
            <div
              key={row.sku}
              onClick={() => toggle(row.sku)}
              style={{
                display: 'grid', gridTemplateColumns: col, gap: '8px',
                padding: '10px 16px', alignItems: 'center',
                borderBottom: !isLast ? '1px solid var(--border-light)' : 'none',
                background: isSel ? '#EFF6FF' : 'transparent',
                cursor: 'pointer',
                borderLeft: `3px solid ${row.qty_total === 0 ? '#DC2626' : '#F59E0B'}`,
              }}
              onMouseEnter={e => { if (!isSel) (e.currentTarget as HTMLDivElement).style.background = 'var(--bg-soft)'; }}
              onMouseLeave={e => { if (!isSel) (e.currentTarget as HTMLDivElement).style.background = 'transparent'; }}
            >
              <input
                type="checkbox"
                checked={isSel}
                onChange={() => toggle(row.sku)}
                onClick={e => e.stopPropagation()}
                style={{ cursor: 'pointer' }}
              />

              <span style={{ fontFamily: 'monospace', fontSize: '11px', color: 'var(--text-muted)' }}>
                {row.sku}
              </span>

              <div style={{ overflow: 'hidden' }}>
                <div style={{ fontSize: '13px', color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  <span style={{ color: 'var(--text-muted)', marginRight: '4px' }}>{row.brand}</span>
                  {row.name}
                </div>
                {/* Mini progress bar */}
                <div style={{ height: '3px', background: '#E2E8F0', borderRadius: '2px', marginTop: '4px', overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${pct}%`, background: row.qty_total === 0 ? '#DC2626' : '#F59E0B', borderRadius: '2px' }} />
                </div>
              </div>

              <div style={{ textAlign: 'right' }}>
                <span style={{ fontSize: '14px', fontWeight: 800, color: row.qty_total === 0 ? '#DC2626' : '#B45309' }}>
                  {row.qty_total} шт
                </span>
              </div>

              <div style={{ textAlign: 'right', fontSize: '12px', color: 'var(--text-secondary)' }}>
                {row.min_reorder_qty} шт
                <div style={{ fontSize: '10px', color: '#DC2626', fontWeight: 600 }}>
                  −{shortage} шт
                </div>
              </div>

              <div style={{ textAlign: 'right', fontSize: '12px' }}>
                {row.ordered_qty > 0 ? (
                  <span style={{ fontWeight: 700, color: fullyOrdered ? '#15803D' : '#B45309', display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '3px' }}>
                    {fullyOrdered && <CheckCircle2 size={11} />}
                    {row.ordered_qty} шт
                  </span>
                ) : (
                  <span style={{ color: 'var(--text-muted)' }}>—</span>
                )}
              </div>

              <div style={{ textAlign: 'right', fontSize: '12px', color: 'var(--text-secondary)' }}>
                {row.avg_cost > 0 ? `${fmt(row.avg_cost)} ₴` : '—'}
              </div>

              <div style={{ textAlign: 'center' }}>
                {row.demand ? (
                  <div style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'center', gap: '2px' }}>
                    <span style={{ fontSize: '12px', fontWeight: 800, color: '#92400E' }}>
                      🛒 {row.demand.orders} зам.
                    </span>
                    <span style={{ fontSize: '10px', color: '#B45309' }}>
                      {row.demand.qty} шт
                    </span>
                  </div>
                ) : (
                  <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>—</span>
                )}
              </div>

              <button
                onClick={e => { e.stopPropagation(); setSelected(new Set([row.sku])); openPO(); }}
                title="Створити ЗП"
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '28px', height: '28px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--bg-card)', cursor: 'pointer', color: '#1E3A5F' }}
              >
                <ShoppingCart size={13} />
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
