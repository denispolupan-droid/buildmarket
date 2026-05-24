'use client';

import { useState } from 'react';
import { X, GitBranch, Loader2, ExternalLink } from 'lucide-react';
import Link from 'next/link';

type ChainData = {
  po: { id: string; doc_number: string; doc_type: string; doc_date: string; status: string; total_cost: number | null; procurement_status: string | null; notes: string | null };
  children:    { id: string; doc_number: string; doc_type: string; doc_date: string; status: string; total_cost: number | null; notes: string | null; landed_cost_total: number | null }[];
  adjustments: { id: string; doc_number: string; doc_type: string; doc_date: string; status: string; notes: string | null }[];
  adjLines:    { document_id: string; sku: string; qty: number; cost_price: number | null }[];
  payments:    { id: string; txn_id: string; amount: number; business_date: string; description: string | null; account_type: string }[];
  landedCosts: { id: string; cost_type: string; description: string | null; amount: number; distributed: boolean; document_id: string }[];
  batches:     { id: string; sku: string; initial_qty: number; cost_price: number; received_at: string }[];
  relatedDocs: { id: string; doc_number: string; doc_type: string; doc_date: string; total_amount: number | null; total_cost: number | null }[];
};

function fmt(n: number) { return n.toLocaleString('uk-UA', { maximumFractionDigits: 0 }); }
function fmtDate(s: string) { return new Date(s).toLocaleDateString('uk-UA'); }

const COST_TYPE_LABELS: Record<string, string> = {
  delivery: '🚚 Доставка', loading: '📦 Навантаж.', customs: '🏛 Мито',
  packaging: '📦 Пакування', broker: '🏛 Брокер', other: '➕ Інше',
};
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
    if (data) return;
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

  const totalLandedCost = data?.landedCosts.reduce((s, l) => s + l.amount, 0) ?? 0;

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
                  {/* PO */}
                  <TimelineNode
                    icon={data.po.status === 'cancelled' ? '🚫' : '📋'}
                    title={
                      data.po.status === 'cancelled'
                        ? `${data.po.doc_number} — Замовлення постачальнику`
                        : `${data.po.doc_number} — Замовлення постачальнику`
                    }
                    sub={`${fmtDate(data.po.doc_date)}${data.po.notes ? ` · ${data.po.notes}` : ''}${data.po.status === 'cancelled' ? ' · Скасовано' : ''}`}
                    amount={data.po.total_cost ? `${fmt(Number(data.po.total_cost))} ₴` : undefined}
                    amountColor={data.po.status === 'cancelled' ? '#9CA3AF' : '#374151'}
                    href={data.po.status !== 'cancelled' ? `/admin/procurement/${data.po.id}` : undefined}
                    cancelled={data.po.status === 'cancelled'}
                  >
                    {/* Payments */}
                    {data.payments.filter(p => ['bank','cash','acquiring'].includes(p.account_type) && p.amount < 0).map(p => (
                      <TimelineNode key={p.id} icon="💳"
                        title={`Оплата постачальнику`}
                        sub={`${fmtDate(p.business_date)} · ${ACCOUNT_LABELS[p.account_type] ?? p.account_type}`}
                        amount={`−${fmt(Math.abs(p.amount))} ₴`} amountColor="#DC2626"
                      />
                    ))}

                    {/* Expense entries (logistics, etc.) */}
                    {data.payments.filter(p => ['logistics','loading','customs','opex'].includes(p.account_type) && p.amount > 0).map(p => (
                      <TimelineNode key={p.id} icon={COST_TYPE_LABELS[p.account_type]?.split(' ')[0] ?? '💼'}
                        title={p.description ?? ACCOUNT_LABELS[p.account_type]}
                        sub={fmtDate(p.business_date)}
                        amount={`−${fmt(p.amount)} ₴`} amountColor="#B45309"
                      />
                    ))}

                    {/* Коригування */}
                    {data.adjustments?.map(adj => {
                      const lines = data.adjLines.filter(l => l.document_id === adj.id);
                      return (
                        <TimelineNode key={adj.id}
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
                    })}

                    {/* Child documents (receipts) */}
                    {data.children.map(child => (
                      <TimelineNode key={child.id}
                        icon="📥" title={`${child.doc_number} — ${DOC_TYPE_LABELS[child.doc_type] ?? child.doc_type}`}
                        sub={`${fmtDate(child.doc_date)}${child.notes ? ` · ${child.notes}` : ''}`}
                        amount={child.total_cost ? `${fmt(Number(child.total_cost))} ₴` : undefined}
                        amountColor="#15803D"
                        href={`/admin/procurement/receipts/${child.id}`}
                      >
                        {/* Landed costs for this receipt */}
                        {data.landedCosts.filter(l => l.document_id === child.id).map(l => (
                          <TimelineNode key={l.id}
                            icon={COST_TYPE_LABELS[l.cost_type]?.split(' ')[0] ?? '💼'}
                            title={l.description ?? COST_TYPE_LABELS[l.cost_type] ?? l.cost_type}
                            sub={`Landed cost · розподілено по FIFO`}
                            amount={`+${fmt(l.amount)} ₴`} amountColor="#7C3AED"
                          />
                        ))}

                        {/* FIFO batches */}
                        {data.batches.filter(b => b.sku).length > 0 && (
                          <TimelineNode
                            icon="📊" title={`FIFO партії: ${data.batches.filter(b => true).length} SKU`}
                            sub={`Залишки оновлено · собівартість розподілено`}
                          />
                        )}
                      </TimelineNode>
                    ))}

                    {/* Related sale documents */}
                    {data.relatedDocs.filter(d => d.doc_type === 'sale').map(d => (
                      <TimelineNode key={d.id}
                        icon="📤" title={`${d.doc_number} — Продаж`}
                        sub={fmtDate(d.doc_date)}
                        amount={d.total_amount ? `${fmt(Number(d.total_amount))} ₴` : undefined}
                        amountColor="#15803D"
                      />
                    ))}
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
