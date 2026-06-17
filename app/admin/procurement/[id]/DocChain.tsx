'use client';

import { useState } from 'react';
import { X, GitBranch, Loader2, ExternalLink } from 'lucide-react';
import Link from 'next/link';

type LandedCostLine = { document_id: string; cost_type: string; description: string | null; amount: number };

type ChainData = {
  po: { id: string; doc_number: string; doc_type: string; doc_date: string; status: string; total_cost: number | null; procurement_status: string | null; notes: string | null };
  customerOrder: { id: string; order_number: number; status: string; total_price: number | null; created_at: string; contact: string | null; company: string | null } | null;
  children:     { id: string; doc_number: string; doc_type: string; doc_date: string; status: string; total_cost: number | null; notes: string | null }[];
  adjustments:  { id: string; doc_number: string; doc_type: string; doc_date: string; status: string; notes: string | null }[];
  adjLines:     { document_id: string; sku: string; qty: number; cost_price: number | null }[];
  payments:     { id: string; txn_id: string; amount: number; business_date: string; description: string | null; account_type: string; doc_type: string }[];
  batches:      { id: string; sku: string; initial_qty: number; cost_price: number; received_at: string }[];
  relatedDocs:  { id: string; doc_number: string; doc_type: string; doc_date: string; total_amount: number | null; total_cost: number | null; order_id: string | null }[];
  landedCosts:  LandedCostLine[];
};

function fmt(n: number) { return n.toLocaleString('uk-UA', { maximumFractionDigits: 0 }); }
function fmtDate(s: string) { return new Date(s).toLocaleDateString('uk-UA'); }

const ACCOUNT_LABELS: Record<string, string> = {
  bank: '🏦 Банк', cash: '💵 Готівка', acquiring: '💳 Еквайринг',
  logistics: '🚚 Логістика', loading: '📦 Навантаж.', customs: '🏛 Мито', opex: '💼 Витрати',
};
const DOC_TYPE_LABELS: Record<string, string> = {
  purchase_order: '📋 Замовлення постачальнику',
  receipt: '📥 Прихід товару',
  stock_in: '📥 Прихід товару',
  sale: '📤 Продаж',
};

function TimelineNode({ icon, title, sub, amount, amountColor = '#374151', href, cancelled = false, children: kids }: {
  icon: string; title: string; sub?: string; amount?: string; amountColor?: string;
  href?: string; cancelled?: boolean; children?: React.ReactNode;
}) {
  return (
    <div style={{ display: 'flex', gap: '14px', position: 'relative', opacity: cancelled ? 0.55 : 1 }}>
      {/* Line */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flexShrink: 0, width: '32px' }}>
        <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: cancelled ? '#F3F4F6' : 'var(--bg-soft)', border: `2px solid ${cancelled ? '#D1D5DB' : 'var(--border)'}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '14px', flexShrink: 0 }}>
          {icon}
        </div>
        {kids && <div style={{ width: '2px', flex: 1, background: 'var(--border)', marginTop: '4px', minHeight: '20px' }} />}
      </div>
      {/* Content */}
      <div style={{ flex: 1, paddingBottom: kids ? '12px' : '0', minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: sub || kids ? '4px' : '0', flexWrap: 'wrap' }}>
          {href ? (
            <Link href={href} style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '4px' }}>
              {title} <ExternalLink size={11} color="var(--text-muted)" />
            </Link>
          ) : (
            <span style={{ fontSize: '13px', fontWeight: 600, color: cancelled ? 'var(--text-muted)' : 'var(--text-primary)', textDecoration: cancelled ? 'line-through' : 'none' }}>{title}</span>
          )}
          {cancelled && (
            <span style={{ fontSize: '10px', fontWeight: 700, color: '#DC2626', background: '#FEE2E2', padding: '1px 6px', borderRadius: '4px' }}>
              Скасовано
            </span>
          )}
          {amount && <span style={{ fontSize: '13px', fontWeight: 700, color: amountColor, marginLeft: 'auto' }}>{amount}</span>}
        </div>
        {sub && <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: kids ? '8px' : '0' }}>{sub}</div>}
        {kids && <div style={{ paddingLeft: '0' }}>{kids}</div>}
      </div>
    </div>
  );
}

export default function DocChain({ poId }: { poId: string }) {
  const [open,    setOpen]    = useState(false);
  const [data,    setData]    = useState<ChainData | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleOpen() {
    setOpen(true);
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/procurement/${poId}/chain`);
      const json = await res.json();
      setData(json);
    } catch { /* silent */ }
    finally { setLoading(false); }
  }

  const totalPaid = data?.payments.filter(p => p.amount < 0 && ['bank','cash','acquiring'].includes(p.account_type))
    .reduce((s, p) => s + Math.abs(p.amount), 0) ?? 0;

  return (
    <>
      <button onClick={handleOpen}
        style={{ display: 'flex', alignItems: 'center', gap: '6px', height: '34px', padding: '0 14px', borderRadius: '8px', border: '1.5px solid var(--border)', background: 'var(--bg-soft)', color: 'var(--text-secondary)', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}>
        <GitBranch size={14} /> Ланцюжок
      </button>

      {open && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 1000, display: 'flex' }}
          onClick={e => { if (e.target === e.currentTarget) setOpen(false); }}>
          <div style={{ flex: 1, background: 'rgba(15,23,42,0.4)' }} onClick={() => setOpen(false)} />
          <div style={{ width: '480px', background: 'var(--bg-card)', height: '100%', overflowY: 'auto', boxShadow: '-8px 0 40px rgba(0,0,0,0.2)', display: 'flex', flexDirection: 'column' }}>

            {/* Header */}
            <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', position: 'sticky', top: 0, background: 'var(--bg-card)', zIndex: 10 }}>
              <div>
                <div style={{ fontSize: '15px', fontWeight: 800, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <GitBranch size={16} color="#1E3A5F" /> Ланцюжок документів
                </div>
                {data && <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>{data.po.doc_number}</div>}
              </div>
              <button onClick={() => setOpen(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex' }}><X size={20} /></button>
            </div>

            <div style={{ flex: 1, padding: '24px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
              {loading && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', color: 'var(--text-muted)', fontSize: '13px' }}>
                  <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} /> Завантаження...
                </div>
              )}

              {data && (
                <>
                  {/* Замовлення покупця — якщо PO пов'язаний із customer order */}
                  {data.customerOrder && (
                    <TimelineNode
                      icon="🛒"
                      title={`Замовлення покупця #${data.customerOrder.order_number}`}
                      sub={`${fmtDate(data.customerOrder.created_at)}${data.customerOrder.company ? ` · ${data.customerOrder.company}` : data.customerOrder.contact ? ` · ${data.customerOrder.contact}` : ''}`}
                      amount={data.customerOrder.total_price ? `${fmt(Number(data.customerOrder.total_price))} ₴` : undefined}
                      amountColor="#1E3A5F"
                      href={`/admin?expand=${data.customerOrder.id}`}
                    />
                  )}

                  {/* PO */}
                  <TimelineNode
                    icon={data.po.status === 'cancelled' ? '🚫' : '📋'}
                    title={`${data.po.doc_number} — Замовлення постачальнику`}
                    sub={`${fmtDate(data.po.doc_date)}${data.po.notes ? ` · ${data.po.notes}` : ''}${data.po.status === 'cancelled' ? ' · Скасовано' : ''}`}
                    amount={data.po.total_cost ? `${fmt(Number(data.po.total_cost))} ₴` : undefined}
                    amountColor={data.po.status === 'cancelled' ? '#9CA3AF' : '#374151'}
                    href={data.po.status !== 'cancelled' ? `/admin/procurement/${data.po.id}` : undefined}
                    cancelled={data.po.status === 'cancelled'}
                  >
                    {/* Всі дочірні події — відсортовані хронологічно */}
                    {(() => {
                      type ChainEvent =
                        | { kind: 'payment';     sortKey: string; data: ChainData['payments'][0] }
                        | { kind: 'expense';     sortKey: string; data: ChainData['payments'][0] }
                        | { kind: 'adjustment';  sortKey: string; data: ChainData['adjustments'][0] }
                        | { kind: 'receipt';     sortKey: string; data: ChainData['children'][0] }
                        | { kind: 'sale';        sortKey: string; data: ChainData['relatedDocs'][0] };

                      const events: ChainEvent[] = [
                        ...data.payments
                          .filter(p => ['bank','cash','acquiring'].includes(p.account_type))
                          .map(p => ({ kind: 'payment'  as const, sortKey: p.business_date, data: p })),
                        ...data.payments
                          .filter(p => ['logistics','loading','customs','opex'].includes(p.account_type) && p.amount > 0)
                          .map(p => ({ kind: 'expense'  as const, sortKey: p.business_date, data: p })),
                        ...(data.adjustments ?? [])
                          .map(a => ({ kind: 'adjustment' as const, sortKey: a.doc_date, data: a })),
                        ...data.children
                          .map(c => ({ kind: 'receipt'  as const, sortKey: c.doc_date, data: c })),
                        ...data.relatedDocs.filter(d => d.doc_type === 'sale')
                          .map(d => ({ kind: 'sale'     as const, sortKey: d.doc_date, data: d })),
                      ].sort((a, b) => a.sortKey < b.sortKey ? -1 : a.sortKey > b.sortKey ? 1 : 0);

                      const LC_ICONS: Record<string, string> = {
                        delivery: '🚚', loading: '📦', customs: '🏛', packaging: '📦', broker: '🏛', other: '➕',
                      };

                      return events.map((ev, idx) => {
                        if (ev.kind === 'payment') {
                          const p = ev.data;
                          const isReversal = p.doc_type === 'supplier_payment_reversal';
                          const icon = p.account_type === 'cash' ? '💵' : p.account_type === 'bank' ? '🏦' : '💳';
                          return (
                            <TimelineNode key={`pay-${idx}`}
                              icon={isReversal ? '↩️' : icon}
                              title={isReversal ? 'Скасування оплати' : 'Оплата постачальнику'}
                              sub={`${fmtDate(p.business_date)} · ${ACCOUNT_LABELS[p.account_type] ?? p.account_type}`}
                              amount={isReversal ? `+${fmt(Math.abs(p.amount))} ₴` : `−${fmt(Math.abs(p.amount))} ₴`}
                              amountColor={isReversal ? '#B45309' : '#DC2626'}
                              cancelled={isReversal}
                            />
                          );
                        }
                        if (ev.kind === 'expense') {
                          const p = ev.data;
                          return (
                            <TimelineNode key={`exp-${idx}`}
                              icon={({ logistics: '🚚', loading: '📦', customs: '🏛', opex: '💼' } as Record<string,string>)[p.account_type] ?? '💼'}
                              title={p.description ?? ACCOUNT_LABELS[p.account_type]}
                              sub={fmtDate(p.business_date)}
                              amount={`−${fmt(p.amount)} ₴`} amountColor="#B45309"
                            />
                          );
                        }
                        if (ev.kind === 'adjustment') {
                          const adj = ev.data;
                          const lines = data.adjLines.filter(l => l.document_id === adj.id);
                          return (
                            <TimelineNode key={`adj-${idx}`}
                              icon="✏️"
                              title={`${adj.doc_number} — Коригування замовлення`}
                              sub={`${fmtDate(adj.doc_date)}${adj.notes ? ` · ${adj.notes}` : ''}`}
                              href={`/admin/accounting/documents/${adj.id}`}
                            >
                              {lines.length > 0 && (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', padding: '4px 0' }}>
                                  {lines.map(l => (
                                    <div key={l.sku} style={{ fontSize: '11px', color: l.qty < 0 ? '#EF4444' : '#15803D', display: 'flex', gap: '6px' }}>
                                      <span style={{ fontFamily: 'monospace' }}>{l.sku}</span>
                                      <span>{l.qty > 0 ? `+${l.qty}` : l.qty} шт</span>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </TimelineNode>
                          );
                        }
                        if (ev.kind === 'receipt') {
                          const child = ev.data;
                          const childLC = (data.landedCosts ?? []).filter(lc => lc.document_id === child.id);
                          const lcTotal = childLC.reduce((s, lc) => s + Number(lc.amount), 0);
                          const goodsCost = child.total_cost ? Number(child.total_cost) - lcTotal : null;
                          return (
                            <TimelineNode key={`rec-${idx}`}
                              icon="📥" title={`${child.doc_number} — ${DOC_TYPE_LABELS[child.doc_type] ?? child.doc_type}`}
                              sub={`${fmtDate(child.doc_date)}${child.notes ? ` · ${child.notes}` : ''}`}
                              amount={goodsCost !== null ? `${fmt(goodsCost)} ₴` : undefined}
                              amountColor="#15803D"
                              href={`/admin/procurement/receipts/${child.id}`}
                            >
                              {childLC.map((lc, i) => (
                                <TimelineNode key={i}
                                  icon={LC_ICONS[lc.cost_type] ?? '➕'}
                                  title={lc.description || `Додаткові витрати: ${lc.cost_type}`}
                                  sub="Landed Cost · розподілено по собівартості"
                                  amount={`+${fmt(Number(lc.amount))} ₴`}
                                  amountColor="#7C3AED"
                                />
                              ))}
                              {lcTotal > 0 && (
                                <div style={{ marginTop: '6px', padding: '6px 10px', background: '#F5F3FF', borderRadius: '7px', display: 'flex', justifyContent: 'space-between', fontSize: '12px' }}>
                                  <span style={{ color: '#6B21A8', fontWeight: 600 }}>Разом з витратами:</span>
                                  <span style={{ color: '#6B21A8', fontWeight: 800 }}>{fmt(Number(child.total_cost))} ₴</span>
                                </div>
                              )}
                              {data.batches.filter(b => b.sku).length > 0 && (
                                <TimelineNode
                                  icon="📊" title={`FIFO партії: ${data.batches.length} SKU`}
                                  sub="Залишки оновлено · собівартість розподілено"
                                />
                              )}
                            </TimelineNode>
                          );
                        }
                        if (ev.kind === 'sale') {
                          const d = ev.data;
                          const saleHref = d.order_id
                            ? `/admin?expand=${d.order_id}`
                            : `/admin/accounting/documents/${d.id}`;
                          return (
                            <TimelineNode key={`sale-${idx}`}
                              icon="📤" title={`${d.doc_number} — Продаж`}
                              sub={fmtDate(d.doc_date)}
                              amount={d.total_amount ? `${fmt(Number(d.total_amount))} ₴` : undefined}
                              amountColor="#15803D"
                              href={saleHref}
                            />
                          );
                        }
                        return null;
                      });
                    })()}
                  </TimelineNode>

                </>
              )}
            </div>
          </div>
        </div>
      )}
      <style>{`@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}`}</style>
    </>
  );
}
