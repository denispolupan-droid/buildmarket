'use client';

import { useState, useCallback } from 'react';
import Link from 'next/link';
import { ArrowRight, ChevronDown, ChevronUp, Send, Loader2 } from 'lucide-react';

type Receipt = {
  id: string; doc_number: string; doc_date: string;
  status: string; total_cost: number | null; notes: string | null;
};

type PO = {
  id: string; doc_number: string; doc_date: string;
  procurement_status: string | null; expected_date: string | null;
  supplier_name: string | null; order_id: string | null;
  total_amount: number | null; total_cost: number | null;
  notes: string | null; has_receipt: boolean;
  supplier_invoice_number: string | null;
  supplier_invoice_date: string | null;
  supplier_invoice_amount: string | null;
  receipts: Receipt[];
};

// po_status — деталізована статус-машина (P5)
const PO_STATUS_CFG: Record<string, { label: string; color: string; bg: string; emoji: string }> = {
  draft:                  { label: 'Чернетка',              color: '#64748B', bg: '#F8FAFC', emoji: '📝' },
  sent:                   { label: 'Відправлено',           color: '#1E3A5F', bg: '#EFF4FF', emoji: '📤' },
  confirmed_by_supplier:  { label: 'Підтверджено постач.',  color: '#7C3AED', bg: '#F5F3FF', emoji: '✅' },
  partially_received:     { label: 'Частково отримано',     color: '#B45309', bg: '#FEF3C7', emoji: '📦' },
  received:               { label: 'Отримано повністю',     color: '#15803D', bg: '#F0FDF4', emoji: '✅' },
  closed:                 { label: 'Закрито',               color: '#64748B', bg: '#F8FAFC', emoji: '🔒' },
  cancelled:              { label: 'Скасовано',             color: '#DC2626', bg: '#FEF2F2', emoji: '❌' },
  // legacy procurement_status
  invoiced:               { label: 'Рахунок',               color: '#EA580C', bg: '#FFF7ED', emoji: '🧾' },
  paid:                   { label: 'Оплачено',              color: '#15803D', bg: '#F0FDF4', emoji: '💳' },
};
const DEFAULT_STATUS = { label: 'Нове', color: '#1E3A5F', bg: '#EFF4FF', emoji: '🆕' };

function fmt(n: number) { return n.toLocaleString('uk-UA', { maximumFractionDigits: 0 }); }

const COLS = '28px 130px 160px 1fr 110px 110px 130px 80px';

export default function ProcurementList({ orders }: { orders: PO[] }) {
  const [expanded, setExpanded] = useState<Set<string>>(
    orders.length === 1 && orders[0].receipts.length > 0 ? new Set([orders[0].id]) : new Set()
  );
  const [selected,  setSelected]  = useState<Set<string>>(new Set());
  const [sending,   setSending]   = useState<Set<string>>(new Set());
  const [sendResult, setSendResult] = useState<{ ok: number; fails: number } | null>(null);

  function toggle(id: string) {
    setExpanded(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }
  function toggleSelect(id: string) {
    setSelected(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }
  function toggleAll() {
    setSelected(prev => prev.size === orders.length ? new Set() : new Set(orders.map(o => o.id)));
  }

  const sendOrders = useCallback(async (ids: string[]) => {
    setSending(prev => new Set([...prev, ...ids]));
    setSendResult(null);
    try {
      const res  = await fetch('/api/admin/procurement/send', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids }),
      });
      const data = await res.json();
      setSendResult({ ok: data.ok ?? 0, fails: data.fails ?? 0 });
      if (data.ok > 0) setSelected(new Set()); // знімаємо вибір після відправки
    } catch { setSendResult({ ok: 0, fails: ids.length }); }
    finally { setSending(prev => { const n = new Set(prev); ids.forEach(id => n.delete(id)); return n; }); }
  }, []);

  if (orders.length === 0) {
    return (
      <div style={{ padding: '64px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '14px', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '12px' }}>
        Немає відкритих замовлень постачальникам.<br />
        Вони створюються автоматично при підтвердженні замовлень або через «Замовити у постачальника».
      </div>
    );
  }

  return (
    <>
    <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '12px', overflow: 'hidden' }}>

      {/* Bulk action bar */}
      {selected.size > 0 && (
        <div style={{ padding: '10px 16px', background: '#1E3A5F', display: 'flex', alignItems: 'center', gap: '12px' }}>
          <span style={{ fontSize: '13px', color: '#fff', fontWeight: 600 }}>Вибрано: {selected.size}</span>
          <button
            onClick={() => sendOrders([...selected])}
            disabled={sending.size > 0}
            style={{ display: 'flex', alignItems: 'center', gap: '6px', height: '30px', padding: '0 14px', borderRadius: '7px', border: 'none', background: '#15803D', color: '#fff', fontSize: '12px', fontWeight: 700, cursor: 'pointer', opacity: sending.size > 0 ? 0.6 : 1 }}>
            {sending.size > 0 ? <Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} /> : <Send size={13} />}
            Відправити постачальникам
          </button>
          <button onClick={() => setSelected(new Set())} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.5)', cursor: 'pointer', fontSize: '12px' }}>
            Скасувати
          </button>
        </div>
      )}

      {sendResult && (
        <div style={{ padding: '8px 16px', background: sendResult.fails > 0 ? '#FEF3C7' : '#DCFCE7', fontSize: '12px', color: sendResult.fails > 0 ? '#92400E' : '#15803D', display: 'flex', gap: '16px' }}>
          {sendResult.ok > 0 && <span>✅ Відправлено: {sendResult.ok}</span>}
          {sendResult.fails > 0 && <span>⚠️ Помилок: {sendResult.fails} (перевірте email постачальників)</span>}
        </div>
      )}

      {/* Header */}
      <div style={{ display: 'grid', gridTemplateColumns: COLS, padding: '8px 16px', background: 'var(--bg-soft)', borderBottom: '1px solid var(--border)', fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', gap: '8px' }}>
        <input type="checkbox" checked={selected.size === orders.length && orders.length > 0} onChange={toggleAll} style={{ cursor: 'pointer', accentColor: '#4880B8' }} />
        <span>Документ</span><span>Постачальник</span><span>Примітка</span>
        <span style={{ textAlign: 'right' }}>Сума</span>
        <span style={{ textAlign: 'center' }}>Прихід</span>
        <span style={{ textAlign: 'center' }}>Статус</span>
        <span />
      </div>

      {orders.map((po, idx) => {
        // Пріоритет: po_status (новий) → procurement_status (старий) → default
        const statusKey = (po as { po_status?: string }).po_status ?? po.procurement_status ?? '';
        const st = PO_STATUS_CFG[statusKey] ?? DEFAULT_STATUS;
        const hasReceipts = po.receipts.length > 0;
        const isExpanded  = expanded.has(po.id);

        const isSending = sending.has(po.id);

        return (
          <div key={po.id} style={{ borderBottom: idx < orders.length - 1 ? '1px solid var(--border-light)' : 'none' }}>
            {/* PO row */}
            <div style={{ display: 'grid', gridTemplateColumns: COLS, padding: '11px 16px', alignItems: 'center', gap: '8px' }}>
              <input type="checkbox" checked={selected.has(po.id)} onChange={() => toggleSelect(po.id)} style={{ cursor: 'pointer', accentColor: '#4880B8' }} />
              <div>
                <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)' }}>{po.doc_number}</div>
                <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{new Date(po.doc_date).toLocaleDateString('uk-UA')}</div>
              </div>
              <div style={{ fontSize: '13px', color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {po.supplier_name ?? '—'}
              </div>
              <div style={{ fontSize: '12px', color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {po.notes ?? '—'}
                {po.expected_date && <span style={{ marginLeft: '8px', color: 'var(--text-muted)' }}>до {new Date(po.expected_date).toLocaleDateString('uk-UA')}</span>}
              </div>
              <span style={{ textAlign: 'right', fontSize: '13px', fontWeight: 600 }}>
                {po.total_cost ? `${fmt(Number(po.total_cost))} ₴` : '—'}
              </span>
              <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '4px' }}>
                {hasReceipts ? (
                  <button onClick={() => toggle(po.id)}
                    style={{ display: 'flex', alignItems: 'center', gap: '4px', background: 'none', border: 'none', cursor: 'pointer', padding: '2px 6px', borderRadius: '6px', color: '#15803D', fontSize: '11px', fontWeight: 700 }}>
                    ✅ {po.receipts.length} прихід{po.receipts.length > 1 ? 'и' : ''}
                    {isExpanded ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
                  </button>
                ) : (
                  <span style={{ fontSize: '11px', fontWeight: 700, color: '#94A3B8' }}>⏳ Очікуємо</span>
                )}
              </div>
              <div style={{ display: 'flex', justifyContent: 'center' }}>
                <span style={{ padding: '2px 8px', borderRadius: '20px', fontSize: '10px', fontWeight: 700, color: st.color, background: st.bg, whiteSpace: 'nowrap' }}>
                  {st.emoji} {st.label}
                </span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '4px' }}>
                <button
                  onClick={() => sendOrders([po.id])}
                  disabled={isSending}
                  title="Відправити постачальнику"
                  style={{ background: 'none', border: '1px solid var(--border)', borderRadius: '6px', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex', padding: '4px 6px', opacity: isSending ? 0.5 : 1 }}>
                  {isSending ? <Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} /> : <Send size={13} />}
                </button>
                <Link href={`/admin/procurement/${po.id}`}
                  style={{ display: 'flex', alignItems: 'center', color: 'var(--text-muted)', textDecoration: 'none', padding: '4px' }}>
                  <ArrowRight size={16} />
                </Link>
              </div>
            </div>

            {/* Receipts — collapsed by default */}
            {hasReceipts && isExpanded && (
              <div style={{ borderTop: '1px dashed var(--border)' }}>
                {po.receipts.map(receipt => (
                  <Link key={receipt.id} href={`/admin/accounting/documents/${receipt.id}`}
                    style={{ display: 'grid', gridTemplateColumns: '130px 160px 1fr 110px 110px 130px 40px', padding: '8px 16px 8px 28px', alignItems: 'center', textDecoration: 'none', background: 'var(--bg-soft)', borderTop: '1px solid var(--border-light)' }}>
                    <div>
                      <div style={{ fontSize: '12px', fontWeight: 600, color: '#15803D' }}>↳ {receipt.doc_number}</div>
                      <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>{new Date(receipt.doc_date).toLocaleDateString('uk-UA')}</div>
                    </div>
                    <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Прихід товару</span>
                    <span style={{ fontSize: '11px', color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{receipt.notes ?? ''}</span>
                    <span style={{ textAlign: 'right', fontSize: '12px', fontWeight: 600, color: '#15803D' }}>
                      {receipt.total_cost ? `${fmt(Number(receipt.total_cost))} ₴` : '—'}
                    </span>
                    <div style={{ display: 'flex', justifyContent: 'center' }}>
                      <span style={{ fontSize: '10px', fontWeight: 700, color: '#15803D' }}>✅ Проведено</span>
                    </div>
                    <span />
                    <div style={{ display: 'flex', justifyContent: 'center', color: 'var(--text-muted)' }}>
                      <ArrowRight size={13} />
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
    <style>{`@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}`}</style>
    </>
  );
}
