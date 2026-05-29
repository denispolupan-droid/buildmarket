'use client';

import { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowRight, ChevronDown, ChevronUp, Send, Loader2, X, Mail, Trash2, Copy } from 'lucide-react';

type Receipt = {
  id: string; doc_number: string; doc_date: string;
  status: string; total_cost: number | null; notes: string | null;
};

type PO = {
  id: string; doc_number: string; doc_date: string;
  procurement_status: string | null; expected_date: string | null;
  email_sent_at: string | null;
  supplier_id: number | null; supplier_name: string | null; supplier_email: string | null;
  order_id: string | null;
  total_amount: number | null; total_cost: number | null;
  notes: string | null; has_receipt: boolean;
  supplier_invoice_number: string | null;
  supplier_invoice_date: string | null;
  supplier_invoice_amount: string | null;
  meta?: Record<string, unknown> | null;
  receipts: Receipt[];
};

// po_status — деталізована статус-машина (P5)
const PO_STATUS_CFG: Record<string, { label: string; color: string; bg: string; emoji: string }> = {
  draft:                  { label: 'Чернетка',              color: '#64748B', bg: '#F8FAFC', emoji: '📝' },
  ordered:                { label: 'Проведено',             color: '#1E3A5F', bg: '#EFF4FF', emoji: '✅' },
  sent:                   { label: 'Відправлено',           color: '#1E3A5F', bg: '#EFF4FF', emoji: '📤' },
  confirmed_by_supplier:  { label: 'Підтверджено постач.',  color: '#7C3AED', bg: '#F5F3FF', emoji: '✅' },
  partially_received:     { label: 'Частково отримано',     color: '#B45309', bg: '#FEF3C7', emoji: '📦' },
  received:               { label: 'Отримано повністю',     color: '#15803D', bg: '#F0FDF4', emoji: '✅' },
  closed:                 { label: 'Закрито',               color: '#64748B', bg: '#F8FAFC', emoji: '🔒' },
  cancelled:              { label: 'Скасовано',             color: '#DC2626', bg: '#FEF2F2', emoji: '❌' },
  // legacy procurement_status
  invoiced:               { label: 'Рахунок',               color: '#EA580C', bg: '#FFF7ED', emoji: '🧾' },
  paid:                   { label: 'Оплачено',              color: '#15803D', bg: '#F0FDF4', emoji: '✅' },
};
const DEFAULT_STATUS = { label: 'Нове', color: '#1E3A5F', bg: '#EFF4FF', emoji: '🆕' };

function fmt(n: number) { return n.toLocaleString('uk-UA', { maximumFractionDigits: 0 }); }

function payIcon(meta?: Record<string, unknown> | null): string {
  const mode = meta?.payment_mode;
  if (mode === 'cash')     return '💵';
  if (mode === 'transfer') return '🏦';
  if (mode === 'deferred') return '📅';
  return '✅';
}

const COLS = '28px 130px 155px 1fr 90px 110px 100px 115px 115px 75px';

export default function ProcurementList({ orders }: { orders: PO[] }) {
  const router = useRouter();

  const [expanded, setExpanded] = useState<Set<string>>(
    orders.length === 1 && orders[0].receipts.length > 0 ? new Set([orders[0].id]) : new Set()
  );
  const [selected,     setSelected]     = useState<Set<string>>(new Set());
  const [sending,      setSending]      = useState<Set<string>>(new Set());
  const [sendResult,   setSendResult]   = useState<{ ok: number; fails: number } | null>(null);
  const [sendConfirm,  setSendConfirm]  = useState<{ po: PO; email: string } | null>(null);
  const [openingDraft,  setOpeningDraft]  = useState<string | null>(null);
  const [copyingDraft,  setCopyingDraft]  = useState<string | null>(null);
  const [deletingDraft, setDeletingDraft] = useState<string | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<PO | null>(null);

  function openPo(po: PO) {
    router.push(`/admin/procurement/${po.id}`);
  }

  // Черга підтверджень відправки — по одному постачальнику
  // (один запис = всі замовлення одного постачальника → один лист)
  type ContactEntry = { name: string; email: string; note: string };
  type QueueItem = { pos: PO[]; supplierName: string; email: string; contacts: ContactEntry[] };
  const [sendQueue,       setSendQueue]       = useState<QueueItem[]>([]);
  const [sendQueueResult, setSendQueueResult] = useState<{ ok: number; skipped: number; draftsExcluded?: number } | null>(null);
  const [sendingCurrent,  setSendingCurrent]  = useState(false);
  const [loadingContacts, setLoadingContacts] = useState(false);

  async function startSendQueue(ids: string[]) {
    const selected   = orders.filter(po => ids.includes(po.id));
    const sendable   = selected.filter(po => po.procurement_status !== 'draft');
    const draftCount = selected.length - sendable.length;

    if (!sendable.length) {
      alert(`Неможливо відправити: всі вибрані замовлення є чернетками.\nСпочатку проведіть замовлення.`);
      return;
    }

    // Групуємо по supplier_id
    const supplierGroups = new Map<number, PO[]>();
    for (const po of sendable) {
      const sid = po.supplier_id ?? 0;
      if (!supplierGroups.has(sid)) supplierGroups.set(sid, []);
      supplierGroups.get(sid)!.push(po);
    }

    // Завантажуємо contacts для кожного унікального постачальника
    setLoadingContacts(true);
    const supplierIds = [...supplierGroups.keys()].filter(Boolean) as number[];
    const contactsMap = new Map<number, ContactEntry[]>();
    await Promise.all(supplierIds.map(async sid => {
      try {
        const res = await fetch(`/api/admin/suppliers/${sid}`);
        if (res.ok) {
          const data = await res.json();
          contactsMap.set(sid, data.contacts ?? []);
        }
      } catch { /* ігноруємо */ }
    }));
    setLoadingContacts(false);

    // Один запис черги на постачальника
    const items: QueueItem[] = [...supplierGroups.entries()].map(([sid, pos]) => {
      const contacts = contactsMap.get(sid) ?? [];
      const email    = contacts[0]?.email || pos[0].supplier_email || '';
      return { pos, supplierName: pos[0].supplier_name ?? '—', email, contacts };
    });
    setSendQueue(items);
    setSendQueueResult({ ok: 0, skipped: 0, draftsExcluded: draftCount });
  }

  async function confirmCurrentSend() {
    const item = sendQueue[0];
    if (!item) return;
    setSendingCurrent(true);
    try {
      // Всі замовлення цього постачальника — одним викликом → один лист
      await fetch('/api/admin/procurement/send', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: item.pos.map(po => po.id), overrideEmail: item.email }),
      });
      const remaining = sendQueue.slice(1);
      setSendQueue(remaining);
      setSendQueueResult(prev => ({ ...prev, ok: (prev?.ok ?? 0) + 1, skipped: prev?.skipped ?? 0 }));
      if (remaining.length === 0) setSelected(new Set());
    } finally { setSendingCurrent(false); }
  }

  function skipCurrentSend() {
    const remaining = sendQueue.slice(1);
    setSendQueue(remaining);
    setSendQueueResult(prev => ({ ...prev, ok: prev?.ok ?? 0, skipped: (prev?.skipped ?? 0) + 1 }));
  }

  async function deleteDraft(po: PO) {
    setDeletingDraft(po.id);
    try {
      const res = await fetch(`/api/admin/procurement/${po.id}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) {
        alert(`Помилка видалення: ${data.error ?? 'невідома помилка'}`);
        return;
      }
      window.location.reload();
    } finally {
      setDeletingDraft(null);
      setDeleteConfirm(null);
    }
  }

  async function copyOrderToNewDraft(po: PO) {
    setCopyingDraft(po.id);
    try {
      const res  = await fetch(`/api/admin/procurement/${po.id}`);
      const data = await res.json();
      window.dispatchEvent(new CustomEvent('open-po-draft', {
        detail: {
          suppliers: data.suppliers ?? [{ id: po.supplier_id, name: po.supplier_name, email: po.supplier_email }],
          prefill: {
            // NO dbId → creates a brand-new draft
            supplierId:   data.supplier_id ?? po.supplier_id,
            expectedDate: '',
            notes:        data.notes ? `Копія: ${data.notes}` : '',
            lines:        data.lines ?? [],
          },
        },
      }));
    } finally {
      setCopyingDraft(null);
    }
  }

  async function openDraftInModal(po: PO) {
    setOpeningDraft(po.id);
    try {
      const res  = await fetch(`/api/admin/procurement/${po.id}`);
      const data = await res.json();
      window.dispatchEvent(new CustomEvent('open-po-draft', {
        detail: {
          suppliers: data.suppliers ?? [{ id: po.supplier_id, name: po.supplier_name, email: po.supplier_email }],
          prefill: {
            dbId:         po.id,
            supplierId:   data.supplier_id ?? po.supplier_id,
            expectedDate: data.expected_date ?? '',
            notes:        data.notes ?? '',
            lines:        data.lines ?? [],
          },
        },
      }));
    } finally {
      setOpeningDraft(null);
    }
  }

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
            onClick={() => startSendQueue([...selected])}
            disabled={sending.size > 0}
            style={{ display: 'flex', alignItems: 'center', gap: '6px', height: '30px', padding: '0 14px', borderRadius: '7px', border: 'none', background: '#15803D', color: '#fff', fontSize: '12px', fontWeight: 700, cursor: 'pointer', opacity: sending.size > 0 ? 0.6 : 1 }}>
            <Send size={13} />
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
      <div style={{ display: 'grid', gridTemplateColumns: COLS, padding: '9px 16px', background: 'var(--bg-soft)', borderBottom: '2px solid var(--border)', fontSize: '11px', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.04em', gap: '8px' }}>
        <input type="checkbox" checked={selected.size === orders.length && orders.length > 0} onChange={toggleAll} style={{ cursor: 'pointer', accentColor: '#4880B8' }} />
        <span>Документ</span><span>Постачальник</span><span>Примітка</span>
        <span style={{ textAlign: 'right' }}>Сума</span>
        <span style={{ textAlign: 'center' }}>Прихід</span>
        <span style={{ textAlign: 'center' }}>Статус</span>
        <span style={{ textAlign: 'center' }}>Email</span>
        <span style={{ textAlign: 'center' }}>Оплата</span>
        <span />
      </div>

      {orders.map((po, idx) => {
        // Пріоритет: po_status (новий) → procurement_status (старий) → default
        const statusKey = (po as { po_status?: string }).po_status ?? po.procurement_status ?? '';
        const hasReceipts = po.receipts.length > 0;
        const isExpanded  = expanded.has(po.id);

        return (
          <div key={po.id} style={{ borderBottom: idx < orders.length - 1 ? '1px solid var(--border-light)' : 'none' }}>
            {/* PO row */}
            <div style={{ display: 'grid', gridTemplateColumns: COLS, padding: '11px 16px', alignItems: 'center', gap: '8px' }}>
              <input type="checkbox" checked={selected.has(po.id)} onChange={() => toggleSelect(po.id)} style={{ cursor: 'pointer', accentColor: '#4880B8' }} />
              <div
                style={{ cursor: statusKey !== 'draft' ? 'pointer' : 'default' }}
                onClick={() => statusKey !== 'draft' && openPo(po)}
              >
                <div style={{ fontSize: '13px', fontWeight: 700, color: statusKey !== 'draft' ? '#1E3A5F' : 'var(--text-primary)', textDecoration: statusKey !== 'draft' ? 'underline' : 'none', textDecorationStyle: 'dotted', textUnderlineOffset: '2px' }}>{po.doc_number}</div>
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
                {statusKey === 'draft' ? (
                  <span style={{ fontSize: '11px', color: '#CBD5E1' }}>—</span>
                ) : hasReceipts ? (
                  <button onClick={() => toggle(po.id)}
                    style={{ display: 'flex', alignItems: 'center', gap: '4px', background: 'none', border: 'none', cursor: 'pointer', padding: '2px 6px', borderRadius: '6px', color: '#15803D', fontSize: '11px', fontWeight: 700 }}>
                    ✅ {po.receipts.length} прихід{po.receipts.length > 1 ? 'и' : ''}
                    {isExpanded ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
                  </button>
                ) : (
                  <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)' }}>⏳ Очікуємо</span>
                )}
              </div>
              {/* Статус: Проведено / Чернетка */}
              <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
                {statusKey === 'draft' ? (
                  <span style={{ padding: '2px 8px', borderRadius: '20px', fontSize: '10px', fontWeight: 700, color: '#64748B', background: '#F1F5F9', whiteSpace: 'nowrap' }}>
                    📝 Чернетка
                  </span>
                ) : (
                  <span style={{ padding: '2px 8px', borderRadius: '20px', fontSize: '10px', fontWeight: 700, color: '#15803D', background: '#F0FDF4', whiteSpace: 'nowrap' }}>
                    ✅ Проведено
                  </span>
                )}
              </div>
              {/* Email: Відправлено / Не відправлено */}
              <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
                {statusKey !== 'draft' && (
                  po.email_sent_at ? (
                    <span style={{ padding: '2px 8px', borderRadius: '20px', fontSize: '10px', fontWeight: 700, color: '#1E3A5F', background: '#EFF4FF', whiteSpace: 'nowrap' }}>
                      📤 Відправлено
                    </span>
                  ) : (
                    <span style={{ padding: '2px 8px', borderRadius: '20px', fontSize: '10px', fontWeight: 700, color: '#B45309', background: '#FEF3C7', whiteSpace: 'nowrap' }}>
                      ✉ Не відправлено
                    </span>
                  )
                )}
              </div>
              {/* Оплата */}
              <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
                {statusKey !== 'draft' && (() => {
                  const isPaid     = po.meta?.is_paid === true || po.procurement_status === 'paid';
                  const isInvoiced = po.meta?.payment_status === 'invoiced' || po.procurement_status === 'invoiced';
                  if (isPaid) return (
                    <span style={{ padding: '2px 8px', borderRadius: '20px', fontSize: '10px', fontWeight: 700, color: '#15803D', background: '#F0FDF4', whiteSpace: 'nowrap' }}>
                      {payIcon(po.meta)} Оплачено
                    </span>
                  );
                  if (isInvoiced) {
                    const deferDate = po.meta?.payment_defer_date as string | undefined;
                    const overdue = deferDate && deferDate < new Date().toISOString().slice(0, 10);
                    return (
                      <span style={{ padding: '2px 8px', borderRadius: '20px', fontSize: '10px', fontWeight: 700, color: overdue ? '#DC2626' : '#B45309', background: overdue ? '#FEF2F2' : '#FEF3C7', whiteSpace: 'nowrap' }}>
                        {overdue ? '⚠ Відстрочка' : '📅 Відстрочка'}
                      </span>
                    );
                  }
                  return (
                    <span style={{ padding: '2px 8px', borderRadius: '20px', fontSize: '10px', fontWeight: 700, color: '#DC2626', background: '#FEF2F2', whiteSpace: 'nowrap' }}>
                      ⏳ Не оплачено
                    </span>
                  );
                })()}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '4px' }}>
                {statusKey !== 'draft' && (
                  <button
                    onClick={() => startSendQueue([po.id])}
                    title="Відправити постачальнику"
                    style={{ background: 'none', border: '1px solid var(--border)', borderRadius: '6px', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex', padding: '4px 6px' }}>
                    <Send size={13} />
                  </button>
                )}
                {/* Copy button — available for all orders */}
                <button
                  onClick={() => copyOrderToNewDraft(po)}
                  disabled={copyingDraft === po.id}
                  title="Копіювати в нове замовлення"
                  style={{ background: 'none', border: '1px solid var(--border)', borderRadius: '6px', cursor: copyingDraft === po.id ? 'default' : 'pointer', color: 'var(--text-muted)', display: 'flex', padding: '4px 6px', opacity: copyingDraft === po.id ? 0.5 : 1 }}>
                  {copyingDraft === po.id ? <Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} /> : <Copy size={13} />}
                </button>
                {statusKey === 'draft' ? (
                  <>
                    <button
                      onClick={() => setDeleteConfirm(po)}
                      title="Видалити чернетку"
                      style={{ background: 'none', border: '1px solid #FCA5A5', borderRadius: '6px', cursor: 'pointer', color: '#EF4444', display: 'flex', padding: '4px 6px' }}>
                      <Trash2 size={13} />
                    </button>
                    <button
                      onClick={() => openDraftInModal(po)}
                      disabled={openingDraft === po.id}
                      title="Відкрити чернетку для редагування"
                      style={{ background: 'none', border: '1px solid var(--border)', borderRadius: '6px', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex', padding: '4px', opacity: openingDraft === po.id ? 0.5 : 1 }}>
                      {openingDraft === po.id ? <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} /> : <ArrowRight size={16} />}
                    </button>
                  </>
                ) : (
                  <button
                    onClick={() => openPo(po)}
                    title="Відкрити замовлення"
                    style={{ display: 'flex', alignItems: 'center', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: '4px' }}>
                    <ArrowRight size={16} />
                  </button>
                )}
              </div>
            </div>

            {/* Receipts — collapsed by default */}
            {hasReceipts && isExpanded && (
              <div style={{ borderTop: '1px dashed var(--border)' }}>
                {po.receipts.map(receipt => (
                  <Link key={receipt.id} href={`/admin/procurement/receipts/${receipt.id}`}
                    style={{ display: 'grid', gridTemplateColumns: '130px 155px 1fr 90px 110px 100px 115px 115px 75px', padding: '8px 16px 8px 28px', alignItems: 'center', gap: '8px', textDecoration: 'none', background: 'var(--bg-soft)', borderTop: '1px solid var(--border-light)' }}>
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
                    <span /><span /><span />
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
    {/* Діалог підтвердження видалення чернетки */}
    {deleteConfirm && (
      <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ background: 'var(--bg-card)', borderRadius: '16px', padding: '28px', width: '380px', boxShadow: '0 20px 60px rgba(0,0,0,0.25)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
            <Trash2 size={20} color="#EF4444" />
            <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 800, color: 'var(--text-primary)' }}>
              Видалити чернетку?
            </h3>
          </div>
          <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '8px' }}>
            <strong>{deleteConfirm.doc_number}</strong> · {deleteConfirm.supplier_name ?? '—'}
          </p>
          <p style={{ fontSize: '12px', color: '#B45309', background: '#FEF3C7', padding: '8px 12px', borderRadius: '8px', marginBottom: '20px' }}>
            Видалення незворотне. Чернетку буде повністю видалено.
          </p>
          <div style={{ display: 'flex', gap: '10px' }}>
            <button
              onClick={() => setDeleteConfirm(null)}
              style={{ flex: 1, height: '40px', borderRadius: '8px', border: '1px solid var(--border)', background: 'none', cursor: 'pointer', fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)' }}>
              Скасувати
            </button>
            <button
              onClick={() => deleteDraft(deleteConfirm)}
              disabled={deletingDraft === deleteConfirm.id}
              style={{ flex: 1, height: '40px', borderRadius: '8px', border: 'none', background: '#EF4444', color: '#fff', cursor: 'pointer', fontSize: '14px', fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
              {deletingDraft === deleteConfirm.id ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <Trash2 size={14} />}
              Видалити
            </button>
          </div>
        </div>
      </div>
    )}

    {/* Черга підтверджень відправки */}
    {sendQueue.length > 0 && (() => {
      const item    = sendQueue[0];
      const total   = (sendQueueResult?.ok ?? 0) + (sendQueueResult?.skipped ?? 0) + sendQueue.length;
      const current = (sendQueueResult?.ok ?? 0) + (sendQueueResult?.skipped ?? 0) + 1;
      const multiPO = item.pos.length > 1;
      return (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: 'var(--bg-card)', borderRadius: '16px', padding: '28px', width: '460px', boxShadow: '0 20px 60px rgba(0,0,0,0.25)' }}>

            {/* Прогрес по постачальниках */}
            {total > 1 && (
              <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '12px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Постачальник {current} з {total}
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
              <div>
                <h3 style={{ margin: '0 0 3px', fontSize: '16px', fontWeight: 800, color: 'var(--text-primary)' }}>
                  Відправити постачальнику
                </h3>
                <div style={{ fontSize: '13px', color: 'var(--text-secondary)', fontWeight: 600 }}>
                  {item.supplierName}
                </div>
              </div>
              <button onClick={() => { setSendQueue([]); setSendQueueResult(null); }}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex', padding: '2px' }}>
                <X size={18} />
              </button>
            </div>

            {/* Список замовлень у цьому листі */}
            <div style={{ marginBottom: '12px', padding: '10px 12px', background: multiPO ? '#EFF4FF' : 'var(--bg-soft)', borderRadius: '8px', border: `1px solid ${multiPO ? '#BFDBFE' : 'var(--border)'}` }}>
              {multiPO ? (
                <>
                  <div style={{ fontSize: '11px', fontWeight: 700, color: '#1E3A5F', marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '5px' }}>
                    <Send size={11} /> 1 лист · {item.pos.length} замовлення
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px' }}>
                    {item.pos.map(po => (
                      <span key={po.id} style={{ fontSize: '12px', fontWeight: 600, color: '#1E3A5F', background: '#fff', padding: '2px 8px', borderRadius: '5px', border: '1px solid #BFDBFE' }}>
                        {po.doc_number}
                      </span>
                    ))}
                  </div>
                </>
              ) : (
                <div style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
                  Замовлення: <strong>{item.pos[0].doc_number}</strong>
                  {item.pos[0].total_cost && <span style={{ color: 'var(--text-muted)', marginLeft: '8px' }}>{fmt(Number(item.pos[0].total_cost))} ₴</span>}
                </div>
              )}
            </div>

            {/* Контакти постачальника */}
            {item.contacts.length > 0 && (
              <div style={{ marginBottom: '12px' }}>
                <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '6px' }}>
                  Контакти постачальника
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                  {item.contacts.map((c, ci) => {
                    const isSelected = item.email === c.email;
                    return (
                      <button key={ci} type="button"
                        onClick={() => setSendQueue(prev => prev.map((it, i) => i === 0 ? { ...it, email: c.email } : it))}
                        style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '7px 10px', borderRadius: '7px', cursor: 'pointer', textAlign: 'left', border: `1.5px solid ${isSelected ? '#1E3A5F' : 'var(--border)'}`, background: isSelected ? '#EFF4FF' : 'var(--bg-soft)' }}
                      >
                        <div style={{ width: '16px', height: '16px', borderRadius: '50%', flexShrink: 0, border: `2px solid ${isSelected ? '#1E3A5F' : '#CBD5E1'}`, background: isSelected ? '#1E3A5F' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          {isSelected && <div style={{ width: '5px', height: '5px', borderRadius: '50%', background: '#fff' }} />}
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-primary)' }}>{c.name || c.email}</div>
                          {c.name && <div style={{ fontSize: '11px', color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.email}{c.note ? ` · ${c.note}` : ''}</div>}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            <div style={{ marginBottom: '6px', fontSize: '12px', fontWeight: 700, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '5px', textTransform: 'uppercase' }}>
              <Mail size={12} /> {item.contacts.length > 0 ? 'Або інший email' : 'Email отримувача'}
            </div>
            <input
              value={item.email}
              onChange={e => setSendQueue(prev => prev.map((it, i) => i === 0 ? { ...it, email: e.target.value } : it))}
              placeholder="email@supplier.com"
              style={{ width: '100%', padding: '9px 12px', borderRadius: '8px', border: `1.5px solid ${item.email ? 'var(--border)' : '#FCA5A5'}`, fontSize: '14px', color: 'var(--text-primary)', background: 'var(--bg-soft)', boxSizing: 'border-box', outline: 'none', marginBottom: '6px' }}
            />
            {item.contacts.length === 0 && !item.pos[0].supplier_email && (
              <div style={{ fontSize: '11px', color: '#B45309', background: '#FEF3C7', padding: '6px 10px', borderRadius: '6px', marginBottom: '4px' }}>
                ⚠ Контакти не додано — додайте їх у картці постачальника
              </div>
            )}

            <div style={{ display: 'flex', gap: '8px', marginTop: '20px' }}>
              <button onClick={skipCurrentSend}
                style={{ flex: 1, height: '40px', borderRadius: '8px', border: '1px solid var(--border)', background: 'none', cursor: 'pointer', fontSize: '13px', fontWeight: 600, color: 'var(--text-muted)' }}>
                {sendQueue.length > 1 ? 'Пропустити →' : 'Скасувати'}
              </button>
              <button
                onClick={confirmCurrentSend}
                disabled={sendingCurrent || !item.email.includes('@')}
                style={{ flex: 2, height: '40px', borderRadius: '8px', border: 'none', background: item.email.includes('@') ? '#1E3A5F' : '#94A3B8', color: '#fff', cursor: item.email.includes('@') ? 'pointer' : 'not-allowed', fontSize: '14px', fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '7px' }}>
                {sendingCurrent ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <Send size={14} />}
                {sendQueue.length > 1 ? 'Відправити та далі →' : multiPO ? `Відправити ${item.pos.length} замовлення` : 'Відправити'}
              </button>
            </div>
          </div>
        </div>
      );
    })()}

    {/* Підсумок відправки */}
    {sendQueue.length === 0 && sendQueueResult && (sendQueueResult.ok > 0 || sendQueueResult.skipped > 0) && (
      <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.3)', zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ background: 'var(--bg-card)', borderRadius: '16px', padding: '28px', width: '360px', boxShadow: '0 20px 60px rgba(0,0,0,0.25)', textAlign: 'center' }}>
          <div style={{ fontSize: '32px', marginBottom: '12px' }}>{sendQueueResult.ok > 0 ? '✅' : '⚠️'}</div>
          <h3 style={{ margin: '0 0 8px', fontSize: '16px', fontWeight: 800 }}>Результат відправки</h3>
          {sendQueueResult.ok > 0 && <p style={{ margin: '0 0 4px', fontSize: '14px', color: '#15803D' }}>✓ Відправлено постачальникам: {sendQueueResult.ok}</p>}
          {sendQueueResult.skipped > 0 && <p style={{ margin: '0 0 4px', fontSize: '14px', color: '#B45309' }}>→ Пропущено: {sendQueueResult.skipped}</p>}
          {(sendQueueResult.draftsExcluded ?? 0) > 0 && (
            <p style={{ margin: '4px 0 0', fontSize: '13px', color: '#64748B', background: '#F1F5F9', padding: '6px 10px', borderRadius: '6px' }}>
              📝 Чернетки не відправлено: {sendQueueResult.draftsExcluded}<br/>
              <span style={{ fontSize: '11px' }}>Спочатку проведіть замовлення</span>
            </p>
          )}
          <button onClick={() => setSendQueueResult(null)}
            style={{ marginTop: '20px', height: '38px', padding: '0 24px', borderRadius: '8px', border: 'none', background: '#1E3A5F', color: '#fff', fontSize: '14px', fontWeight: 700, cursor: 'pointer' }}>
            Закрити
          </button>
        </div>
      </div>
    )}

    <style>{`@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}`}</style>
</>
  );
}
