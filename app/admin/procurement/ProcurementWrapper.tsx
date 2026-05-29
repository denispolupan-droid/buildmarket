'use client';

import { useState, useMemo, useEffect } from 'react';
import ProcurementList from './ProcurementList';
import { X } from 'lucide-react';

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
  po_status?: string;
};

const STATUS_GROUPS = [
  { key: 'active',   label: 'Активні' },
  { key: 'draft',    label: 'Чернетки' },
  { key: 'pending',  label: 'Очікуємо' },
  { key: 'received', label: 'Отримано' },
  { key: 'closed',   label: 'Завершені' },
  { key: 'all',      label: 'Всі' },
];

const PAYMENT_OPTS = [
  { key: 'all',      label: 'Будь-яка оплата' },
  { key: 'unpaid',   label: 'Не оплачено' },
  { key: 'paid',     label: 'Оплачено' },
  { key: 'deferred', label: 'Відстрочка' },
  { key: 'reversed', label: 'Оплату скасовано' },
];

const EMAIL_OPTS = [
  { key: 'all',      label: 'Всі' },
  { key: 'sent',     label: 'Відправлено' },
  { key: 'not_sent', label: 'Не відправлено' },
];

const RECEIPT_OPTS = [
  { key: 'all',          label: 'Всі' },
  { key: 'received',     label: 'Отримано' },
  { key: 'not_received', label: 'Не отримано' },
];

function matchesStatus(po: PO, status: string): boolean {
  if (status === 'all') return true;
  const isDraft  = po.procurement_status === 'draft';
  const isClosed = po.procurement_status === 'closed';
  if (status === 'active')   return !isClosed;
  if (status === 'draft')    return isDraft;
  if (status === 'pending')  return !po.has_receipt && !isDraft && !isClosed;
  if (status === 'received') return !!po.has_receipt && po.procurement_status !== 'paid' && !po.meta?.is_paid && !isClosed;
  if (status === 'closed')   return isClosed;
  return true;
}

function matchesPayment(po: PO, payment: string): boolean {
  if (payment === 'all') return true;
  if (po.procurement_status === 'draft') return false;
  const isPaid     = po.meta?.is_paid === true || po.procurement_status === 'paid';
  const isReversed = po.meta?.payment_reversed === true;
  const isDeferred = po.meta?.payment_status === 'invoiced' || po.procurement_status === 'invoiced';
  if (payment === 'reversed') return isReversed;
  if (payment === 'paid')     return isPaid && !isReversed;
  if (payment === 'deferred') return isDeferred && !isPaid && !isReversed;
  if (payment === 'unpaid')   return !isPaid && !isReversed && !isDeferred;
  return true;
}

export default function ProcurementWrapper({
  orders,
  initialFilter = 'all',
}: {
  orders: PO[];
  initialFilter?: string;
}) {
  const toStatus = (f: string) =>
    ['draft', 'pending', 'received', 'closed', 'all'].includes(f) ? f : 'active';

  const [supplier, setSupplier] = useState('all');
  const [status,   setStatus]   = useState(toStatus(initialFilter));
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo,   setDateTo]   = useState('');
  const [payment,  setPayment]  = useState('all');
  const [email,    setEmail]    = useState('all');
  const [receipt,  setReceipt]  = useState('all');

  useEffect(() => { setStatus(toStatus(initialFilter)); }, [initialFilter]);

  const uniqueSuppliers = useMemo(() => {
    const seen = new Map<number, string>();
    for (const po of orders) {
      if (po.supplier_id && po.supplier_name) seen.set(po.supplier_id, po.supplier_name);
    }
    return [...seen.entries()].sort((a, b) => a[1].localeCompare(b[1], 'uk'));
  }, [orders]);

  const filtered = useMemo(() => orders.filter(po => {
    if (supplier !== 'all' && String(po.supplier_id) !== supplier) return false;
    if (!matchesStatus(po, status)) return false;
    if (dateFrom && po.doc_date.slice(0, 10) < dateFrom) return false;
    if (dateTo   && po.doc_date.slice(0, 10) > dateTo)   return false;
    if (email === 'sent'     && !po.email_sent_at) return false;
    if (email === 'not_sent' && (po.procurement_status === 'draft' || !!po.email_sent_at)) return false;
    if (receipt === 'received'     && po.receipts.length === 0) return false;
    if (receipt === 'not_received' && (po.receipts.length > 0 || po.procurement_status === 'draft')) return false;
    if (!matchesPayment(po, payment)) return false;
    return true;
  }), [orders, supplier, status, dateFrom, dateTo, email, payment, receipt]);

  const hasFilters = supplier !== 'all' || status !== 'active' || !!dateFrom || !!dateTo || email !== 'all' || payment !== 'all' || receipt !== 'all';

  function reset() {
    setSupplier('all');
    setStatus('active');
    setDateFrom('');
    setDateTo('');
    setEmail('all');
    setPayment('all');
    setReceipt('all');
    history.replaceState(null, '', '/admin/procurement');
  }

  const chip = (active: boolean): React.CSSProperties => ({
    height: '30px', padding: '0 11px', borderRadius: '7px',
    border: `1px solid ${active ? '#1E3A5F' : 'var(--border)'}`,
    background: active ? '#1E3A5F' : 'var(--bg-soft)',
    color: active ? '#fff' : 'var(--text-secondary)',
    fontSize: '12px', fontWeight: active ? 700 : 500,
    cursor: 'pointer', whiteSpace: 'nowrap',
  });

  const selectStyle: React.CSSProperties = {
    height: '30px', padding: '0 8px', borderRadius: '7px',
    border: '1px solid var(--border)', background: 'var(--bg-soft)',
    fontSize: '12px', color: 'var(--text-primary)', cursor: 'pointer',
  };

  const divider = (
    <div style={{ width: '1px', height: '20px', background: 'var(--border)', flexShrink: 0 }} />
  );

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', marginBottom: '12px', padding: '10px 14px', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '10px' }}>

        {/* Постачальник */}
        {uniqueSuppliers.length > 1 && (
          <select value={supplier} onChange={e => setSupplier(e.target.value)} style={{ ...selectStyle, minWidth: '130px' }}>
            <option value="all">Всі постачальники</option>
            {uniqueSuppliers.map(([id, name]) => (
              <option key={id} value={String(id)}>{name}</option>
            ))}
          </select>
        )}

        {/* Статус */}
        <div style={{ display: 'flex', gap: '4px' }}>
          {STATUS_GROUPS.map(s => (
            <button key={s.key} onClick={() => setStatus(s.key)} style={chip(status === s.key)}>
              {s.label}
            </button>
          ))}
        </div>

        {divider}

        {/* Дата */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
            placeholder="Від" style={{ ...selectStyle, width: '130px' }} />
          <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>—</span>
          <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
            placeholder="До" style={{ ...selectStyle, width: '130px' }} />
        </div>

        {divider}

        {/* Оплата */}
        <select value={payment} onChange={e => setPayment(e.target.value)} style={selectStyle}>
          {PAYMENT_OPTS.map(p => <option key={p.key} value={p.key}>{p.label}</option>)}
        </select>

        {/* Email */}
        <div style={{ display: 'flex', gap: '4px' }}>
          {EMAIL_OPTS.map(e => (
            <button key={e.key} onClick={() => setEmail(e.key)} style={chip(email === e.key)}>
              {e.label}
            </button>
          ))}
        </div>

        {divider}

        {/* Прихід */}
        <div style={{ display: 'flex', gap: '4px' }}>
          {RECEIPT_OPTS.map(r => (
            <button key={r.key} onClick={() => setReceipt(r.key)} style={chip(receipt === r.key)}>
              {r.label}
            </button>
          ))}
        </div>

        {/* Лічильник + скинути */}
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '8px' }}>
          {hasFilters && (
            <span style={{ fontSize: '12px', color: 'var(--text-muted)', fontWeight: 600 }}>
              {filtered.length} з {orders.length}
            </span>
          )}
          {hasFilters && (
            <button onClick={reset}
              style={{ display: 'flex', alignItems: 'center', gap: '4px', height: '28px', padding: '0 10px', borderRadius: '6px', border: '1px solid #FCA5A5', background: '#FEF2F2', color: '#DC2626', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}>
              <X size={12} /> Скинути
            </button>
          )}
        </div>
      </div>

      {filtered.length === 0 && hasFilters ? (
        <div style={{ padding: '48px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '13px', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '12px' }}>
          Немає замовлень за поточними фільтрами.
        </div>
      ) : (
        <ProcurementList orders={filtered} />
      )}
    </>
  );
}
