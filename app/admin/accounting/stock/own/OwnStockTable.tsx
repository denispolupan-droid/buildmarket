'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { ChevronDown, ChevronRight, Loader2, ExternalLink, Search, X, History } from 'lucide-react';
import SmartDateInput, { parseSmartDate, isoToDisplay } from '../../../../components/SmartDateInput';

type StockRow = {
  sku: string;
  qty_total: number;
  qty_reserved: number;
  qty_available: number;
  avg_cost: number;
  min_reorder_qty: number | null;
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

type Movement = {
  id: number;
  qty: number;
  cost_price: number;
  sale_price: number | null;
  doc_type: string;
  moved_at: string;
  document_id: string | null;
  order_id: string | null;
  doc: { doc_number: string; doc_type: string; doc_date: string } | null;
};

type Product = { sku: string; name: string; brand: string };

function fmt(n: number) {
  return n.toLocaleString('uk-UA', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtDate(s: string) {
  return new Date(s).toLocaleDateString('uk-UA', { day: '2-digit', month: 'short', year: 'numeric' });
}

function inRange(dateStr: string, from: string, to: string): boolean {
  if (!from && !to) return true;
  const d = new Date(dateStr);
  if (from && d < new Date(from + 'T00:00:00')) return false;
  if (to   && d > new Date(to   + 'T23:59:59')) return false;
  return true;
}

function quickDate(daysAgo: number): string {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  return d.toISOString().slice(0, 10);
}

function todayDate(): string {
  return new Date().toISOString().slice(0, 10);
}

const inputStyle: React.CSSProperties = {
  border: '1px solid #E2E8F0', borderRadius: '5px', padding: '3px 8px',
  fontSize: '12px', color: 'var(--text-primary)', background: 'var(--bg-card)',
  outline: 'none',
};


function DateRangeFilter({
  from, to, accentColor = '#3B82F6',
  onFrom, onTo, onReset,
}: {
  from: string; to: string; accentColor?: string;
  onFrom: (v: string) => void; onTo: (v: string) => void; onReset: () => void;
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 16px 6px 20px', flexWrap: 'wrap', borderBottom: `1px solid ${accentColor}22` }}>
      <span style={{ fontSize: '11px', fontWeight: 700, color: accentColor, whiteSpace: 'nowrap' }}>Фільтр:</span>
      <SmartDateInput value={from} onChange={onFrom} />
      <span style={{ fontSize: '11px', color: '#94A3B8' }}>—</span>
      <SmartDateInput value={to}   onChange={onTo} />
      {(from || to) && (
        <button onClick={onReset} style={{ padding: '2px 8px', fontSize: '11px', fontWeight: 600, cursor: 'pointer', border: '1px solid #CBD5E1', borderRadius: '4px', background: 'transparent', color: '#94A3B8' }}>
          Скинути
        </button>
      )}
    </div>
  );
}

// ── MovementReport ─────────────────────────────────────────────────────────────
function MovementReport({
  sku, warehouseId, productLabel,
}: {
  sku: string;
  warehouseId: number;
  productLabel: string;
}) {
  const [from,    setFrom]    = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
  });
  const [to,      setTo]      = useState(() => new Date().toISOString().slice(0, 10));
  type ReportMovement = Movement & { effective_unit_cost: number };
  const [report,  setReport]  = useState<{ opening_qty: number; opening_cost: number; closing_value: number; movements: ReportMovement[] } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState('');

  const rCol = '140px 160px 150px 70px 70px 80px 110px 110px';

  async function generate() {
    if (!from || !to) { setError('Оберіть обидві дати'); return; }
    setError('');
    setLoading(true);
    try {
      const r = await fetch(
        `/api/admin/stock/movements?sku=${encodeURIComponent(sku)}&warehouse_id=${warehouseId}&date_from=${from}&date_to=${to}`
      );
      const d = await r.json();
      if (d.error) throw new Error(d.error);
      setReport({
        opening_qty:   Number(d.opening_qty   ?? 0),
        opening_cost:  Number(d.opening_cost  ?? 0),
        closing_value: Number(d.closing_value ?? 0),
        movements:     d.movements ?? [],
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Помилка');
    } finally {
      setLoading(false);
    }
  }

  // Build rows with running balance and running cost (using effective_unit_cost which includes LC)
  type ReportRow = Movement & { effective_unit_cost: number; running: number; runningCost: number };
  const rows: ReportRow[] = [];
  if (report) {
    let bal  = report.opening_qty;
    let cost = report.opening_cost;
    for (const m of report.movements) {
      bal  += Number(m.qty);
      cost += Number(m.qty) * (m as ReportMovement).effective_unit_cost;
      rows.push({ ...m, effective_unit_cost: (m as ReportMovement).effective_unit_cost, running: bal, runningCost: cost });
    }
  }

  const totIn  = rows.filter(r => r.qty > 0).reduce((s, r) => s + Number(r.qty), 0);
  const totOut = rows.filter(r => r.qty < 0).reduce((s, r) => s + Math.abs(Number(r.qty)), 0);

  const balanceRow = (label: string, qty: number, cost: number | null, bg: string, color: string) => (
    <div style={{ display: 'grid', gridTemplateColumns: rCol, gap: '8px', padding: '9px 16px 9px 20px', alignItems: 'center', background: bg }}>
      <span />
      <span style={{ fontSize: '12px', fontWeight: 800, color, gridColumn: '2 / 4' }}>{label}</span>
      <span />
      <span />
      <span style={{ textAlign: 'right', fontSize: '14px', fontWeight: 900, color }}>{qty} шт</span>
      <span />
      <span style={{ textAlign: 'right', fontSize: '13px', fontWeight: 900, color }}>
        {cost !== null && cost > 0 ? `${fmt(cost)} ₴` : ''}
      </span>
    </div>
  );

  return (
    <div style={{ background: '#FAFAFA' }}>
      {/* Controls */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 16px 10px 20px', borderBottom: '1px solid #E2E8F0', flexWrap: 'wrap' }}>
        <span style={{ fontSize: '12px', fontWeight: 700, color: '#475569', whiteSpace: 'nowrap' }}>Період звіту:</span>
        <SmartDateInput value={from} onChange={setFrom} style={{ padding: '5px 10px', width: '100px' }} />
        <span style={{ fontSize: '12px', color: '#94A3B8' }}>—</span>
        <SmartDateInput value={to}   onChange={setTo}   style={{ padding: '5px 10px', width: '100px' }} />
        <button
          onClick={generate}
          disabled={loading}
          style={{ padding: '5px 16px', fontSize: '12px', fontWeight: 700, cursor: loading ? 'default' : 'pointer', background: '#1E40AF', color: '#fff', border: 'none', borderRadius: '6px', display: 'flex', alignItems: 'center', gap: '6px', opacity: loading ? 0.7 : 1 }}
        >
          {loading && <Loader2 size={12} style={{ animation: 'spin 1s linear infinite' }} />}
          Сформувати звіт
        </button>
        {report && !loading && (
          <span style={{ fontSize: '11px', color: '#64748B', marginLeft: 'auto' }}>
            {rows.length} операцій · прихід {totIn} шт · розхід {totOut} шт
          </span>
        )}
        {error && <span style={{ fontSize: '12px', color: '#DC2626' }}>{error}</span>}
      </div>

      {/* Empty state */}
      {!report && !loading && (
        <div style={{ padding: '32px 20px', textAlign: 'center', fontSize: '13px', color: '#94A3B8' }}>
          Оберіть період і натисніть «Сформувати звіт»
        </div>
      )}

      {/* Report table */}
      {report && (
        <>
          {/* Column headers */}
          <div style={{ display: 'grid', gridTemplateColumns: rCol, gap: '8px', padding: '6px 16px 6px 20px', fontSize: '10px', fontWeight: 700, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.06em', background: '#F1F5F9', borderBottom: '1px solid #E2E8F0' }}>
            <span>Дата</span>
            <span>Документ</span>
            <span>Тип операції</span>
            <span style={{ textAlign: 'right' }}>Прихід</span>
            <span style={{ textAlign: 'right' }}>Розхід</span>
            <span style={{ textAlign: 'right' }}>Залишок</span>
            <span style={{ textAlign: 'right' }}>Ціна/шт</span>
            <span style={{ textAlign: 'right' }}>Сума</span>
          </div>

          {/* Opening balance */}
          {balanceRow(
            `Залишок на початок (${from ? new Date(from).toLocaleDateString('uk-UA', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'})`,
            report.opening_qty, report.opening_cost > 0 ? report.opening_cost : null, '#1E3A5F', '#fff',
          )}

          {/* No movements */}
          {rows.length === 0 && (
            <div style={{ padding: '20px', textAlign: 'center', fontSize: '13px', color: '#94A3B8', borderTop: '1px solid #E2E8F0' }}>
              За вибраний період рухів не знайдено
            </div>
          )}

          {/* Movement rows */}
          {rows.map((m, mi) => {
            const isIn     = m.qty > 0;
            const absQty   = Math.abs(Number(m.qty));
            const price    = isIn ? Number(m.cost_price) : (m.sale_price != null ? Number(m.sale_price) : Number(m.cost_price));
            const amount   = absQty * price;
            const docLabel = m.doc?.doc_number ?? (m.document_id ? m.document_id.slice(0, 8) + '…' : '—');
            const link     = movDocLink(m);
            const bg       = mi % 2 === 0
              ? (isIn ? 'rgba(220,252,231,0.4)' : 'rgba(254,226,226,0.35)')
              : (isIn ? 'rgba(220,252,231,0.7)' : 'rgba(254,226,226,0.6)');

            return (
              <div key={m.id} style={{ display: 'grid', gridTemplateColumns: rCol, gap: '8px', padding: '8px 16px 8px 20px', alignItems: 'center', borderTop: '1px solid #E2E8F0', background: bg }}>
                <span style={{ fontSize: '12px', color: '#475569', fontWeight: 500 }}>
                  {new Date(m.moved_at).toLocaleDateString('uk-UA', { day: '2-digit', month: '2-digit', year: 'numeric' })}
                </span>

                <span>
                  {link ? (
                    <Link href={link} onClick={e => e.stopPropagation()} style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '12px', fontWeight: 700, color: '#1D4ED8', textDecoration: 'none' }}>
                      {docLabel} <ExternalLink size={9} />
                    </Link>
                  ) : (
                    <span style={{ fontSize: '12px', color: '#94A3B8' }}>{docLabel}</span>
                  )}
                </span>

                <span style={{ fontSize: '12px', color: '#374151' }}>{DOC_LABEL[m.doc_type] ?? m.doc_type}</span>

                <span style={{ textAlign: 'right', fontSize: '13px', fontWeight: 800, color: isIn ? '#15803D' : 'transparent' }}>
                  {isIn ? `+${absQty}` : ''}
                </span>
                <span style={{ textAlign: 'right', fontSize: '13px', fontWeight: 800, color: !isIn ? '#DC2626' : 'transparent' }}>
                  {!isIn ? `−${absQty}` : ''}
                </span>

                <span style={{ textAlign: 'right', fontSize: '13px', fontWeight: 700, color: m.running >= 0 ? '#1E40AF' : '#DC2626' }}>
                  {m.running} шт
                </span>

                <span style={{ textAlign: 'right', fontSize: '12px', color: '#475569' }}>
                  {price > 0 ? `${fmt(price)} ₴` : '—'}
                </span>
                <span style={{ textAlign: 'right', fontSize: '13px', fontWeight: 700, color: isIn ? '#15803D' : '#92400E' }}>
                  {price > 0 ? `${fmt(amount)} ₴` : '—'}
                </span>
              </div>
            );
          })}

          {/* Closing balance — qty from running total, value from stock_batches (includes LC) */}
          {(() => {
            const closingQty = rows.length > 0 ? rows[rows.length - 1].running : report.opening_qty;
            return balanceRow(
              `Залишок на кінець (${to ? new Date(to).toLocaleDateString('uk-UA', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'})`,
              closingQty,
              report.closing_value > 0 ? report.closing_value : null,
              '#14532D', '#fff',
            );
          })()}

          {/* Totals footer */}
          {rows.length > 0 && (() => {
            const inCost  = rows.filter(r => r.qty > 0).reduce((s, r) => s + Math.abs(Number(r.qty)) * Number(r.cost_price), 0);
            const outRev  = rows.filter(r => r.qty < 0 && r.sale_price != null).reduce((s, r) => s + Math.abs(Number(r.qty)) * Number(r.sale_price), 0);
            return (
              <div style={{ background: '#F8FAFC', borderTop: '2px solid #CBD5E1' }}>
                <div style={{ display: 'grid', gridTemplateColumns: rCol, gap: '8px', padding: '7px 16px 7px 20px', alignItems: 'center' }}>
                  <span style={{ fontSize: '11px', fontWeight: 700, color: '#475569', gridColumn: '1 / 4' }}>
                    Оборот за період: {rows.length} операцій
                  </span>
                  <span style={{ textAlign: 'right', fontSize: '13px', fontWeight: 800, color: '#15803D' }}>+{totIn}</span>
                  <span style={{ textAlign: 'right', fontSize: '13px', fontWeight: 800, color: '#DC2626' }}>−{totOut}</span>
                  <span />
                  <span />
                  <span />
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0', borderTop: '1px solid #E2E8F0' }}>
                  <div style={{ padding: '5px 16px 5px 20px', fontSize: '11px', color: '#475569', borderRight: '1px solid #E2E8F0' }}>
                    <span style={{ color: '#94A3B8' }}>Надійшло за собівартістю: </span>
                    <span style={{ fontWeight: 700, color: '#15803D' }}>{inCost > 0 ? `${fmt(inCost)} ₴` : '—'}</span>
                  </div>
                  <div style={{ padding: '5px 16px', fontSize: '11px', color: '#475569' }}>
                    <span style={{ color: '#94A3B8' }}>Продано за ціною продажу: </span>
                    <span style={{ fontWeight: 700, color: '#92400E' }}>{outRev > 0 ? `${fmt(outRev)} ₴` : '—'}</span>
                  </div>
                </div>
              </div>
            );
          })()}
        </>
      )}
    </div>
  );
}

function batchDocLink(b: Batch): string | null {
  if (!b.document_id) return null;
  const t = b.doc?.doc_type ?? '';
  return (t === 'receipt' || t === 'stock_in')
    ? `/admin/procurement/receipts/${b.document_id}`
    : `/admin/accounting/documents/${b.document_id}`;
}

function movDocLink(m: Movement): string | null {
  if (!m.document_id) return null;
  const t = m.doc?.doc_type ?? m.doc_type;
  return (t === 'receipt' || t === 'stock_in')
    ? `/admin/procurement/receipts/${m.document_id}`
    : `/admin/accounting/documents/${m.document_id}`;
}

const DOC_LABEL: Record<string, string> = {
  sale:           'Продаж',
  return_out:     'Повернення постачальнику',
  return_in:      'Повернення від клієнта',
  write_off:      'Списання',
  transfer:       'Переміщення',
  receipt:        'Прихід',
  stock_in:       'Оприбуткування',
  inventory:      'Інвентаризація',
  purchase_order: 'Замовлення',
};

function DocBtn({ label, link }: { label: string; link: string | null }) {
  const style: React.CSSProperties = {
    display: 'inline-flex', alignItems: 'center', gap: '5px',
    fontSize: '12px', fontWeight: 700, color: '#1E3A5F',
    background: '#fff', border: '1px solid #BFDBFE',
    padding: '3px 10px', borderRadius: '6px',
    textDecoration: 'none', boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
  };
  if (!link) return <span style={{ fontSize: '12px', color: '#94A3B8' }}>{label || '—'}</span>;
  return (
    <Link href={link} onClick={e => e.stopPropagation()} style={style}>
      {label}<ExternalLink size={10} color="#3B82F6" />
    </Link>
  );
}

// ── BatchPanel ────────────────────────────────────────────────────────────────
function BatchPanel({ batches, loading }: { batches: Batch[]; loading: boolean }) {
  const bCol = '160px 90px 90px 120px 130px 1fr';

  if (loading) {
    return (
      <div style={{ padding: '14px 20px', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', color: '#3B82F6' }}>
        <Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} /> Завантаження…
      </div>
    );
  }

  if (batches.length === 0) {
    return <div style={{ padding: '14px 20px', fontSize: '12px', color: '#3B82F6' }}>Партії не знайдено</div>;
  }

  return (
    <>
      <div style={{ display: 'grid', gridTemplateColumns: bCol, gap: '8px', padding: '6px 16px 6px 20px', fontSize: '10px', fontWeight: 700, color: '#3B82F6', textTransform: 'uppercase', letterSpacing: '0.06em', borderBottom: '1px solid #BFDBFE' }}>
        <span>Дата надходження</span>
        <span style={{ textAlign: 'right' }}>Прийнято</span>
        <span style={{ textAlign: 'right' }}>Залишок</span>
        <span style={{ textAlign: 'right' }}>Ціна/шт (з LC)</span>
        <span style={{ textAlign: 'right' }}>Вартість залишку</span>
        <span style={{ paddingLeft: '8px' }}>Документ</span>
      </div>

      {batches.map((b, bi) => {
        const soldPct = b.initial_qty > 0 ? Math.round((1 - b.remaining_qty / b.initial_qty) * 100) : 0;
        const totalVal = b.remaining_qty * Number(b.cost_price);
        const docLabel = b.doc?.doc_number ?? (b.document_id ? b.document_id.slice(0, 8) + '…' : '—');

        return (
          <div key={b.id} style={{ display: 'grid', gridTemplateColumns: bCol, gap: '8px', padding: '9px 16px 9px 20px', alignItems: 'center', borderTop: bi > 0 ? '1px solid #BFDBFE' : 'none', background: bi % 2 === 0 ? 'transparent' : 'rgba(219,234,254,0.3)' }}>
            <span style={{ fontSize: '12px', color: '#1E3A5F', fontWeight: 500 }}>{fmtDate(b.received_at)}</span>
            <span style={{ textAlign: 'right', fontSize: '12px', color: '#64748B' }}>
              {b.initial_qty} шт
              {soldPct > 0 && <span style={{ display: 'block', fontSize: '10px', color: '#94A3B8' }}>−{soldPct}% продано</span>}
            </span>
            <span style={{ textAlign: 'right', fontSize: '14px', fontWeight: 800, color: b.remaining_qty > 0 ? '#15803D' : '#94A3B8' }}>
              {b.remaining_qty} шт
            </span>
            <span style={{ textAlign: 'right', fontSize: '13px', fontWeight: 700, color: '#1E3A5F' }}>{fmt(Number(b.cost_price))} ₴</span>
            <span style={{ textAlign: 'right', fontSize: '13px', fontWeight: 700, color: '#1E40AF' }}>{fmt(totalVal)} ₴</span>
            <span style={{ paddingLeft: '8px' }}><DocBtn label={docLabel} link={batchDocLink(b)} /></span>
          </div>
        );
      })}

      {batches.length > 1 && (
        <div style={{ display: 'grid', gridTemplateColumns: bCol, gap: '8px', padding: '8px 16px 8px 20px', alignItems: 'center', borderTop: '2px solid #93C5FD', background: '#DBEAFE' }}>
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
    </>
  );
}


// ── HistoryModal ──────────────────────────────────────────────────────────────
function HistoryModal({
  product, batches, loading, currentBalance, defaultWarehouseId, onClose,
}: {
  product: Product;
  batches: Batch[];
  loading: boolean;
  currentBalance: StockRow | null;
  defaultWarehouseId: number;
  onClose: () => void;
}) {
  const [batchFrom, setBatchFrom] = useState('');
  const [batchTo,   setBatchTo]   = useState('');
  const visibleBatches = batches.filter(b => inRange(b.received_at, batchFrom, batchTo));

  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}
      onClick={onClose}
    >
      <div
        style={{ background: 'var(--bg-card)', borderRadius: '14px', width: '100%', maxWidth: '1100px', maxHeight: '90vh', overflow: 'auto', display: 'flex', flexDirection: 'column' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', padding: '20px 24px 16px', borderBottom: '1px solid var(--border)', position: 'sticky', top: 0, background: 'var(--bg-card)', zIndex: 1 }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
              <History size={16} color="#3B82F6" />
              <span style={{ fontSize: '16px', fontWeight: 800, color: 'var(--text-primary)' }}>
                <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>{product.brand} </span>
                {product.name}
              </span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px', fontSize: '12px', color: 'var(--text-muted)' }}>
              <span style={{ fontFamily: 'monospace' }}>{product.sku}</span>
              {currentBalance ? (
                <span style={{ fontWeight: 700, color: currentBalance.qty_available > 0 ? '#15803D' : '#DC2626' }}>
                  На складі: {currentBalance.qty_available} шт
                </span>
              ) : (
                <span style={{ fontWeight: 700, color: '#DC2626' }}>На складі: 0 шт</span>
              )}
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: '4px', display: 'flex', borderRadius: '6px' }}>
            <X size={18} />
          </button>
        </div>

        {loading ? (
          <div style={{ padding: '48px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px', color: 'var(--text-muted)', fontSize: '14px' }}>
            <Loader2 size={18} style={{ animation: 'spin 1s linear infinite' }} /> Завантаження…
          </div>
        ) : (
          <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: '28px' }}>

            {/* Batches */}
            <div>
              <div style={{ fontSize: '12px', fontWeight: 700, color: '#1D4ED8', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '10px' }}>
                Партії надходження
                <span style={{ fontWeight: 400, color: '#94A3B8', marginLeft: '6px' }}>
                  {(batchFrom || batchTo) ? `${visibleBatches.length} з ${batches.length}` : batches.length}
                </span>
              </div>
              <div style={{ border: '1px solid #BFDBFE', borderRadius: '8px', overflow: 'hidden', background: '#F0F7FF' }}>
                <DateRangeFilter from={batchFrom} to={batchTo} onFrom={setBatchFrom} onTo={setBatchTo} onReset={() => { setBatchFrom(''); setBatchTo(''); }} />
                <BatchPanel batches={visibleBatches} loading={false} />
                {visibleBatches.length === 0 && (
                  <div style={{ padding: '14px 20px', fontSize: '12px', color: '#64748B' }}>
                    {batches.length > 0 ? 'За вибраний період надходжень не знайдено' : 'Надходжень не знайдено'}
                  </div>
                )}
              </div>
            </div>

            {/* Movement report */}
            <div>
              <div style={{ fontSize: '12px', fontWeight: 700, color: '#374151', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '10px' }}>
                Картка руху товару
              </div>
              <div style={{ border: '1px solid var(--border)', borderRadius: '8px', overflow: 'hidden' }}>
                <MovementReport
                  sku={product.sku}
                  warehouseId={defaultWarehouseId}
                  productLabel={`${product.brand} ${product.name}`}
                />
              </div>
            </div>

          </div>
        )}
      </div>
    </div>
  );
}

// ── MinReorderCell ────────────────────────────────────────────────────────────
function MinReorderCell({ sku, warehouseId, value, belowMin }: {
  sku: string; warehouseId: number; value: number | null; belowMin: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [draft,   setDraft]   = useState('');
  const [saving,  setSaving]  = useState(false);

  function startEdit(e: React.MouseEvent) {
    e.stopPropagation();
    setDraft(value != null ? String(value) : '');
    setEditing(true);
  }

  async function save() {
    setSaving(true);
    const qty = draft === '' ? null : Number(draft);
    await fetch('/api/admin/stock/min-reorder', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sku, warehouse_id: warehouseId, min_reorder_qty: isNaN(qty as number) ? null : qty }),
    }).catch(() => {});
    setSaving(false);
    setEditing(false);
    // Оновити буде при наступному рефреші — для live update потрібен роутер
  }

  if (editing) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '4px' }} onClick={e => e.stopPropagation()}>
        <input
          autoFocus
          type="number" min="0" step="1"
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') save(); if (e.key === 'Escape') setEditing(false); }}
          onBlur={save}
          style={{ width: '52px', padding: '2px 4px', fontSize: '12px', border: '1.5px solid #3B82F6', borderRadius: '4px', outline: 'none', textAlign: 'right' }}
        />
        {saving && <Loader2 size={11} style={{ animation: 'spin 1s linear infinite', flexShrink: 0 }} />}
      </div>
    );
  }

  return (
    <div
      onClick={startEdit}
      title="Клікніть щоб встановити мінімальний залишок"
      style={{ textAlign: 'right', cursor: 'text', fontSize: '12px', fontWeight: value != null ? 700 : 400, color: belowMin ? '#DC2626' : value != null ? '#B45309' : 'var(--text-muted)' }}
    >
      {value != null ? `${value} шт` : <span style={{ fontSize: '10px' }}>встан.</span>}
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────
export default function OwnStockTable({
  rows, nameMap, whMap, allProducts, defaultWarehouseId,
}: {
  rows: StockRow[];
  nameMap: Record<string, { brand: string; name: string }>;
  whMap: Record<number, string>;
  allProducts: Product[];
  defaultWarehouseId: number;
}) {
  const [expanded,     setExpanded]     = useState<string | null>(null);
  const [batchesCache, setBatchesCache] = useState<Record<string, Batch[]>>({});
  const [loading,      setLoading]      = useState<string | null>(null);
  const [tabs,         setTabs]         = useState<Record<string, 'in' | 'out'>>({});

  const [query,        setQuery]        = useState('');
  const [histProd,     setHistProd]     = useState<Product | null>(null);
  const [histBatches,  setHistBatches]  = useState<Batch[]>([]);
  const [histLoading,  setHistLoading]  = useState(false);

  const col: React.CSSProperties = {
    display: 'grid',
    gridTemplateColumns: '140px 1fr 120px 90px 90px 90px 100px 80px 36px',
  };

  const searchResults = query.length >= 2
    ? allProducts
        .filter(p =>
          p.sku.toLowerCase().includes(query.toLowerCase()) ||
          `${p.brand} ${p.name}`.toLowerCase().includes(query.toLowerCase()),
        )
        .slice(0, 8)
    : [];

  async function fetchBatches(key: string, sku: string, wid: number) {
    if (batchesCache[key] !== undefined) return;
    setLoading(key);
    try {
      const r = await fetch(`/api/admin/stock/batches?sku=${encodeURIComponent(sku)}&warehouse_id=${wid}`);
      const d = await r.json();
      setBatchesCache(prev => ({ ...prev, [key]: d.batches ?? [] }));
    } catch {
      setBatchesCache(prev => ({ ...prev, [key]: [] }));
    } finally {
      setLoading(null);
    }
  }

  async function toggle(sku: string, wid: number) {
    const key = `${sku}::${wid}`;
    if (expanded === key) { setExpanded(null); return; }
    setExpanded(key);
    if ((tabs[key] ?? 'in') === 'in') await fetchBatches(key, sku, wid);
  }

  function switchTab(key: string, tab: 'in' | 'out', sku: string, wid: number) {
    setTabs(prev => ({ ...prev, [key]: tab }));
    if (tab === 'in') fetchBatches(key, sku, wid);
  }

  async function openHistory(prod: Product) {
    setQuery('');
    setHistProd(prod);
    setHistBatches([]);
    setHistLoading(true);
    try {
      const br = await fetch(`/api/admin/stock/batches?sku=${encodeURIComponent(prod.sku)}&warehouse_id=${defaultWarehouseId}&include_empty=true`);
      const bd = await br.json();
      setHistBatches(bd.batches ?? []);
    } finally {
      setHistLoading(false);
    }
  }

  async function handleSelect(prod: Product) {
    const inTable = rows.find(r => r.sku === prod.sku);
    if (inTable) {
      setQuery('');
      const key = `${inTable.sku}::${inTable.warehouse_id}`;
      setExpanded(key);
      await fetchBatches(key, inTable.sku, inTable.warehouse_id);
    } else {
      await openHistory(prod);
    }
  }

  return (
    <>
      {/* ── Search bar ─────────────────────────────────────────────────── */}
      <div style={{ position: 'relative', marginBottom: '16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 14px', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '8px' }}>
          <Search size={14} color="var(--text-muted)" style={{ flexShrink: 0 }} />
          <input
            type="text"
            placeholder="Знайти товар по артикулу або назві (включно з нульовим залишком)…"
            value={query}
            onChange={e => setQuery(e.target.value)}
            style={{ flex: 1, border: 'none', outline: 'none', fontSize: '13px', background: 'transparent', color: 'var(--text-primary)' }}
          />
          {query && (
            <button onClick={() => setQuery('')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 0, display: 'flex' }}>
              <X size={14} />
            </button>
          )}
        </div>

        {searchResults.length > 0 && (
          <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '8px', boxShadow: '0 4px 16px rgba(0,0,0,0.12)', zIndex: 50, marginTop: '4px', overflow: 'hidden' }}>
            {searchResults.map((p, i) => {
              const inStock = rows.some(r => r.sku === p.sku);
              return (
                <div
                  key={p.sku}
                  onClick={() => handleSelect(p)}
                  style={{ padding: '8px 14px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '10px', borderTop: i > 0 ? '1px solid var(--border-light)' : 'none', fontSize: '13px' }}
                  onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-soft)')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                >
                  <span style={{ fontFamily: 'monospace', fontSize: '11px', color: 'var(--text-muted)', minWidth: '80px', flexShrink: 0 }}>{p.sku}</span>
                  <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    <span style={{ color: 'var(--text-muted)' }}>{p.brand} </span>
                    <span style={{ color: 'var(--text-primary)' }}>{p.name}</span>
                  </span>
                  {inStock
                    ? <span style={{ fontSize: '11px', fontWeight: 700, color: '#15803D', background: '#DCFCE7', padding: '2px 8px', borderRadius: '4px', flexShrink: 0 }}>є на складі</span>
                    : <span style={{ fontSize: '11px', fontWeight: 700, color: '#92400E', background: '#FEF3C7', padding: '2px 8px', borderRadius: '4px', flexShrink: 0 }}>нульовий залишок</span>
                  }
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Table ──────────────────────────────────────────────────────── */}
      <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '12px', overflow: 'hidden' }}>
        <div style={{ ...col, padding: '8px 16px', background: 'var(--bg-soft)', borderBottom: '1px solid var(--border)', fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', alignItems: 'center' }}>
          <span>Артикул</span>
          <span>Назва</span>
          <span>Склад</span>
          <span style={{ textAlign: 'right' }}>Всього</span>
          <span style={{ textAlign: 'right' }}>Резерв</span>
          <span style={{ textAlign: 'right' }}>Доступно</span>
          <span style={{ textAlign: 'right' }}>Собівартість</span>
          <span style={{ textAlign: 'right' }}>Мін.</span>
          <span />
        </div>

        {rows.map((row, idx) => {
          const key      = `${row.sku}::${row.warehouse_id}`;
          const isOpen   = expanded === key;
          const isLoad   = loading === key;
          const tab      = tabs[key] ?? 'in';
          const batches  = batchesCache[key] ?? [];
          const p        = nameMap[row.sku];
          const isLast   = idx === rows.length - 1;

          return (
            <div key={key}>
              {/* Main row */}
              <div
                onClick={() => toggle(row.sku, row.warehouse_id)}
                style={{
                  ...col, padding: '10px 16px', alignItems: 'center',
                  borderBottom: (!isLast || isOpen) ? '1px solid var(--border-light)' : 'none',
                  cursor: 'pointer',
                  background: isOpen ? '#EFF6FF' : 'transparent',
                  borderLeft: isOpen ? '3px solid #3B82F6' : '3px solid transparent',
                  transition: 'background 0.12s, border-color 0.12s',
                }}
                onMouseEnter={e => { if (!isOpen) (e.currentTarget as HTMLDivElement).style.background = 'var(--bg-soft)'; }}
                onMouseLeave={e => { if (!isOpen) (e.currentTarget as HTMLDivElement).style.background = 'transparent'; }}
              >
                <span style={{ fontFamily: 'monospace', fontSize: '11px', color: isOpen ? '#1D4ED8' : 'var(--text-muted)', fontWeight: isOpen ? 700 : 400 }}>{row.sku}</span>
                <span style={{ fontSize: '13px', color: 'var(--text-primary)', paddingRight: '16px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: isOpen ? 600 : 400 }}>
                  <span style={{ color: 'var(--text-muted)', marginRight: '4px' }}>{p?.brand}</span>{p?.name}
                </span>
                <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>{whMap[row.warehouse_id] ?? '—'}</span>
                <span style={{ textAlign: 'right', fontSize: '13px', fontWeight: 600 }}>{row.qty_total}</span>
                <span style={{ textAlign: 'right', fontSize: '13px', color: '#B45309' }}>{row.qty_reserved > 0 ? row.qty_reserved : '—'}</span>
                <span style={{ textAlign: 'right', fontSize: '13px', fontWeight: 700, color: row.qty_available > 0 ? '#15803D' : '#DC2626' }}>{row.qty_available}</span>
                <span style={{ textAlign: 'right', fontSize: '12px', color: 'var(--text-secondary)' }}>
                  {row.avg_cost > 0 ? `${fmt(Number(row.avg_cost))} ₴` : '—'}
                </span>
                <MinReorderCell sku={row.sku} warehouseId={row.warehouse_id} value={row.min_reorder_qty} belowMin={row.qty_total <= (row.min_reorder_qty ?? Infinity) && row.min_reorder_qty != null} />
                <span style={{ display: 'flex', justifyContent: 'center', color: isOpen ? '#3B82F6' : 'var(--text-muted)' }}>
                  {isLoad
                    ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} />
                    : isOpen ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
                </span>
              </div>

              {/* Expanded panel */}
              {isOpen && (
                <div style={{ borderLeft: '3px solid #3B82F6', borderBottom: !isLast ? '1px solid var(--border-light)' : 'none' }}>

                  {/* Tabs */}
                  <div style={{ display: 'flex', background: '#EFF6FF', borderBottom: '1px solid #BFDBFE' }}>
                    {(['in', 'out'] as const).map(t => {
                      const active = tab === t;
                      const label  = t === 'in' ? 'Надходження' : 'Рух за період';
                      const count  = t === 'in' && batches.length > 0 ? ` (${batches.length})` : '';
                      return (
                        <button
                          key={t}
                          onClick={e => { e.stopPropagation(); switchTab(key, t, row.sku, row.warehouse_id); }}
                          style={{
                            padding: '6px 18px', fontSize: '12px', fontWeight: 700, border: 'none', cursor: 'pointer',
                            borderRight: '1px solid #BFDBFE',
                            background: active ? (t === 'in' ? '#3B82F6' : '#1E40AF') : 'transparent',
                            color: active ? '#fff' : (t === 'in' ? '#3B82F6' : '#1E40AF'),
                          }}
                        >
                          {label}{count}
                        </button>
                      );
                    })}
                  </div>

                  {/* Tab content */}
                  <div style={{ background: tab === 'in' ? '#F0F7FF' : '#FAFAFA' }}>
                    {tab === 'in' && <BatchPanel batches={batches} loading={isLoad} />}
                    {tab === 'out' && (
                      <MovementReport
                        sku={row.sku}
                        warehouseId={row.warehouse_id}
                        productLabel={`${p?.brand ?? ''} ${p?.name ?? row.sku}`}
                      />
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })}

        <style>{`@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}`}</style>
      </div>

      {/* ── History modal ───────────────────────────────────────────────── */}
      {histProd && (
        <HistoryModal
          product={histProd}
          batches={histBatches}
          loading={histLoading}
          currentBalance={rows.find(r => r.sku === histProd.sku) ?? null}
          defaultWarehouseId={defaultWarehouseId}
          onClose={() => setHistProd(null)}
        />
      )}
    </>
  );
}
