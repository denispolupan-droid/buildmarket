'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ChevronDown, ChevronRight, Loader2, ExternalLink } from 'lucide-react';

type StockRow = {
  sku: string;
  qty_total: number;
  qty_reserved: number;
  qty_available: number;
  avg_cost: number;
  warehouse_id: number;
};

type Batch = {
  id: string;
  initial_qty: number;
  remaining_qty: number;
  cost_price: number;
  received_at: string;
  document_id: string | null;
  doc: { doc_number: string; doc_type: string; doc_date: string } | null;
};

function fmt(n: number) {
  return n.toLocaleString('uk-UA', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function docLink(batch: Batch): string | null {
  if (!batch.document_id) return null;
  const t = batch.doc?.doc_type ?? '';
  if (t === 'receipt' || t === 'stock_in') return `/admin/procurement/receipts/${batch.document_id}`;
  return `/admin/accounting/documents/${batch.document_id}`;
}

export default function OwnStockTable({
  rows,
  nameMap,
  whMap,
}: {
  rows: StockRow[];
  nameMap: Record<string, { brand: string; name: string }>;
  whMap: Record<number, string>;
}) {
  const [expanded,     setExpanded]     = useState<string | null>(null);
  const [batchesCache, setBatchesCache] = useState<Record<string, Batch[]>>({});
  const [loading,      setLoading]      = useState<string | null>(null);

  const col: React.CSSProperties = {
    display: 'grid',
    gridTemplateColumns: '140px 1fr 120px 90px 90px 90px 100px 36px',
  };

  async function toggle(sku: string, warehouseId: number) {
    const key = `${sku}::${warehouseId}`;
    if (expanded === key) { setExpanded(null); return; }
    setExpanded(key);
    if (batchesCache[key]) return;
    setLoading(key);
    try {
      const res = await fetch(`/api/admin/stock/batches?sku=${encodeURIComponent(sku)}&warehouse_id=${warehouseId}`);
      const data = await res.json();
      setBatchesCache(prev => ({ ...prev, [key]: data.batches ?? [] }));
    } catch {
      setBatchesCache(prev => ({ ...prev, [key]: [] }));
    } finally {
      setLoading(null);
    }
  }

  return (
    <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '12px', overflow: 'hidden' }}>
      {/* Table header */}
      <div style={{
        ...col,
        padding: '8px 16px',
        background: 'var(--bg-soft)',
        borderBottom: '1px solid var(--border)',
        fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase',
        alignItems: 'center',
      }}>
        <span>Артикул</span>
        <span>Назва</span>
        <span>Склад</span>
        <span style={{ textAlign: 'right' }}>Всього</span>
        <span style={{ textAlign: 'right' }}>Резерв</span>
        <span style={{ textAlign: 'right' }}>Доступно</span>
        <span style={{ textAlign: 'right' }}>Собівартість</span>
        <span />
      </div>

      {rows.map((row, idx) => {
        const key      = `${row.sku}::${row.warehouse_id}`;
        const isOpen   = expanded === key;
        const isLoading= loading === key;
        const batches  = batchesCache[key] ?? [];
        const p        = nameMap[row.sku];
        const isLast   = idx === rows.length - 1;

        return (
          <div key={key}>
            {/* ── Main row ── */}
            <div
              onClick={() => toggle(row.sku, row.warehouse_id)}
              style={{
                ...col,
                padding: '10px 16px',
                alignItems: 'center',
                borderBottom: (!isLast || isOpen) ? '1px solid var(--border-light)' : 'none',
                cursor: 'pointer',
                background: isOpen ? '#EFF6FF' : 'transparent',
                borderLeft: isOpen ? '3px solid #3B82F6' : '3px solid transparent',
                transition: 'background 0.12s, border-color 0.12s',
              }}
              onMouseEnter={e => { if (!isOpen) (e.currentTarget as HTMLDivElement).style.background = 'var(--bg-soft)'; }}
              onMouseLeave={e => { if (!isOpen) (e.currentTarget as HTMLDivElement).style.background = 'transparent'; }}
            >
              <span style={{ fontFamily: 'monospace', fontSize: '11px', color: isOpen ? '#1D4ED8' : 'var(--text-muted)', fontWeight: isOpen ? 700 : 400 }}>
                {row.sku}
              </span>
              <span style={{ fontSize: '13px', color: 'var(--text-primary)', paddingRight: '16px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: isOpen ? 600 : 400 }}>
                <span style={{ color: 'var(--text-muted)', marginRight: '4px' }}>{p?.brand}</span>{p?.name}
              </span>
              <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>{whMap[row.warehouse_id] ?? '—'}</span>
              <span style={{ textAlign: 'right', fontSize: '13px', fontWeight: 600 }}>{row.qty_total}</span>
              <span style={{ textAlign: 'right', fontSize: '13px', color: '#B45309' }}>
                {row.qty_reserved > 0 ? row.qty_reserved : '—'}
              </span>
              <span style={{ textAlign: 'right', fontSize: '13px', fontWeight: 700, color: row.qty_available > 0 ? '#15803D' : '#DC2626' }}>
                {row.qty_available}
              </span>
              <span style={{ textAlign: 'right', fontSize: '12px', color: 'var(--text-secondary)' }}>
                {row.avg_cost > 0 ? `${fmt(Number(row.avg_cost))} ₴` : '—'}
              </span>
              <span style={{ display: 'flex', justifyContent: 'center', color: isOpen ? '#3B82F6' : 'var(--text-muted)' }}>
                {isLoading
                  ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} />
                  : isOpen
                    ? <ChevronDown size={15} />
                    : <ChevronRight size={15} />}
              </span>
            </div>

            {/* ── Expanded batches panel ── */}
            {isOpen && (
              <div style={{
                borderLeft: '3px solid #3B82F6',
                borderBottom: !isLast ? '1px solid var(--border-light)' : 'none',
                background: '#F0F7FF',
              }}>

                {/* Batch column header */}
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: '160px 90px 90px 120px 130px 1fr',
                  gap: '8px',
                  padding: '6px 16px 6px 20px',
                  fontSize: '10px', fontWeight: 700, color: '#3B82F6',
                  textTransform: 'uppercase', letterSpacing: '0.06em',
                  borderBottom: '1px solid #BFDBFE',
                }}>
                  <span>Дата надходження</span>
                  <span style={{ textAlign: 'right' }}>Прийнято</span>
                  <span style={{ textAlign: 'right' }}>Залишок</span>
                  <span style={{ textAlign: 'right' }}>Ціна/шт (з LC)</span>
                  <span style={{ textAlign: 'right' }}>Вартість залишку</span>
                  <span style={{ paddingLeft: '8px' }}>Документ</span>
                </div>

                {/* No batches */}
                {batches.length === 0 && !isLoading && (
                  <div style={{ padding: '14px 20px', fontSize: '12px', color: '#3B82F6' }}>
                    Партії не знайдено
                  </div>
                )}

                {/* Batch rows */}
                {batches.map((b, bi) => {
                  const link     = docLink(b);
                  const docLabel = b.doc?.doc_number ?? (b.document_id ? b.document_id.slice(0, 8) + '…' : '—');
                  const totalVal = b.remaining_qty * Number(b.cost_price);
                  const soldPct  = b.initial_qty > 0
                    ? Math.round((1 - b.remaining_qty / b.initial_qty) * 100)
                    : 0;

                  return (
                    <div key={b.id} style={{
                      display: 'grid',
                      gridTemplateColumns: '160px 90px 90px 120px 130px 1fr',
                      gap: '8px',
                      padding: '9px 16px 9px 20px',
                      alignItems: 'center',
                      borderTop: bi > 0 ? '1px solid #BFDBFE' : 'none',
                      background: bi % 2 === 0 ? 'transparent' : 'rgba(219,234,254,0.3)',
                    }}>
                      <span style={{ fontSize: '12px', color: '#1E3A5F', fontWeight: 500 }}>
                        {new Date(b.received_at).toLocaleDateString('uk-UA', { day: '2-digit', month: 'short', year: 'numeric' })}
                      </span>

                      <span style={{ textAlign: 'right', fontSize: '12px', color: '#64748B' }}>
                        {b.initial_qty} шт
                        {soldPct > 0 && (
                          <span style={{ display: 'block', fontSize: '10px', color: '#94A3B8' }}>
                            −{soldPct}% продано
                          </span>
                        )}
                      </span>

                      <span style={{
                        textAlign: 'right', fontSize: '14px', fontWeight: 800,
                        color: b.remaining_qty > 0 ? '#15803D' : '#94A3B8',
                      }}>
                        {b.remaining_qty} шт
                      </span>

                      <span style={{ textAlign: 'right', fontSize: '13px', fontWeight: 700, color: '#1E3A5F' }}>
                        {fmt(Number(b.cost_price))} ₴
                      </span>

                      <span style={{ textAlign: 'right', fontSize: '13px', fontWeight: 700, color: '#1E40AF' }}>
                        {fmt(totalVal)} ₴
                      </span>

                      <span style={{ paddingLeft: '8px' }}>
                        {link ? (
                          <Link
                            href={link}
                            onClick={e => e.stopPropagation()}
                            style={{
                              display: 'inline-flex', alignItems: 'center', gap: '5px',
                              fontSize: '12px', fontWeight: 700, color: '#1E3A5F',
                              background: '#fff', border: '1px solid #BFDBFE',
                              padding: '3px 10px', borderRadius: '6px',
                              textDecoration: 'none',
                              boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
                            }}
                          >
                            {docLabel}
                            <ExternalLink size={10} color="#3B82F6" />
                          </Link>
                        ) : (
                          <span style={{ fontSize: '12px', color: '#94A3B8' }}>{docLabel}</span>
                        )}
                      </span>
                    </div>
                  );
                })}

                {/* Total row (only if multiple batches) */}
                {batches.length > 1 && (
                  <div style={{
                    display: 'grid',
                    gridTemplateColumns: '160px 90px 90px 120px 130px 1fr',
                    gap: '8px',
                    padding: '8px 16px 8px 20px',
                    alignItems: 'center',
                    borderTop: '2px solid #93C5FD',
                    background: '#DBEAFE',
                  }}>
                    <span style={{ fontSize: '12px', fontWeight: 700, color: '#1E40AF' }}>
                      {batches.length} {batches.length < 5 ? 'партії' : 'партій'} разом
                    </span>
                    <span />
                    <span style={{ textAlign: 'right', fontSize: '14px', fontWeight: 800, color: '#1E40AF' }}>
                      {batches.reduce((s, b) => s + b.remaining_qty, 0)} шт
                    </span>
                    <span />
                    <span style={{ textAlign: 'right', fontSize: '14px', fontWeight: 800, color: '#1E40AF' }}>
                      {fmt(batches.reduce((s, b) => s + b.remaining_qty * Number(b.cost_price), 0))} ₴
                    </span>
                    <span />
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
      <style>{`@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}
