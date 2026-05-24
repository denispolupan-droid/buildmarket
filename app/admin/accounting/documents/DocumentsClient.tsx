'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Plus, CheckCircle, XCircle, Clock, FileText, TrendingUp, TrendingDown } from 'lucide-react';

type DocRow = {
  id: string;
  doc_type: string;
  doc_number: string;
  status: 'draft' | 'confirmed' | 'cancelled';
  doc_date: string;
  total_amount: number;
  total_cost: number;
  notes: string | null;
  counterparty: string | null;
  order_id: string | null;
  confirmed_at: string | null;
  cancelled_at: string | null;
  reversal_of: string | null;
  warehouse: { name: string } | null;
  supplier: { name: string } | null;
};

type Warehouse  = { id: number; name: string; warehouse_type: string };
type Supplier   = { id: number; name: string };
type DocType    = { code: string; name: string; direction: string };

const TYPE_LABELS: Record<string, string> = {
  purchase_order:            'Замовлення постачальнику',
  purchase_order_adjustment: 'Коригування замовлення',
  receipt:                   'Прихід товару',
  stock_in:                  'Прихід товару',
  supplier_invoice:          'Рахунок-фактура постачальника',
  supplier_return:           'Повернення постачальнику',
  sale:                      'Продаж',
  return_in:                 'Повернення від покупця',
  return_out:                'Повернення постачальнику',
  write_off:                 'Списання',
  transfer:                  'Переміщення',
  inventory:                 'Інвентаризація',
};

const STATUS_STYLE: Record<string, { label: string; color: string; bg: string; icon: typeof Clock }> = {
  draft:     { label: 'Чернетка',  color: '#B45309', bg: '#FEF3C7', icon: Clock },
  confirmed: { label: 'Проведено', color: '#15803D', bg: '#DCFCE7', icon: CheckCircle },
  cancelled: { label: 'Скасовано', color: '#DC2626', bg: '#FEE2E2', icon: XCircle },
};

const DIR_ICON: Record<string, typeof TrendingUp> = {
  in:   TrendingUp,
  out:  TrendingDown,
  both: FileText,
  none: FileText,
};

export default function DocumentsClient({
  initialDocs, warehouses, suppliers, docTypes,
}: {
  initialDocs: DocRow[];
  warehouses:  Warehouse[];
  suppliers:   Supplier[];
  docTypes:    DocType[];
}) {
  const [docs,       setDocs]       = useState(initialDocs);
  const [typeFilter, setTypeFilter] = useState('');
  const [statFilter, setStatFilter] = useState('');
  const [loading,    setLoading]    = useState<string | null>(null);
  const [error,      setError]      = useState<string | null>(null);

  const filtered = docs.filter(d =>
    (!typeFilter || d.doc_type === typeFilter) &&
    (!statFilter || d.status   === statFilter),
  );

  async function doAction(docId: string, action: 'confirm' | 'cancel') {
    setLoading(docId + action);
    setError(null);
    const res = await fetch('/api/admin/accounting/documents', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, document_id: docId }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error ?? 'Помилка');
    } else {
      const newStatus = action === 'confirm' ? 'confirmed' : 'cancelled';
      setDocs(prev => prev.map(d => d.id === docId ? { ...d, status: newStatus as DocRow['status'] } : d));
    }
    setLoading(null);
  }

  return (
    <div style={{ padding: '28px 32px', maxWidth: '1400px' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <div>
          <h1 style={{ fontSize: '22px', fontWeight: 800, color: 'var(--text-primary)', margin: 0 }}>
            Облік — документи
          </h1>
          <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginTop: '4px' }}>
            Приходи, продажі, повернення, переміщення, списання
          </p>
        </div>
        <Link
          href="/admin/accounting/documents/new"
          style={{
            display: 'inline-flex', alignItems: 'center', gap: '7px',
            height: '38px', padding: '0 18px', borderRadius: '9px',
            background: '#1E3A5F', color: '#fff', fontSize: '13px', fontWeight: 700,
            textDecoration: 'none',
          }}
        >
          <Plus size={15} /> Новий документ
        </Link>
      </div>

      {error && (
        <div style={{ marginBottom: '16px', padding: '10px 14px', borderRadius: '8px', background: '#FEE2E2', color: '#DC2626', fontSize: '13px' }}>
          {error}
        </div>
      )}

      {/* Filters */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '20px', flexWrap: 'wrap' }}>
        <select
          value={typeFilter}
          onChange={e => setTypeFilter(e.target.value)}
          style={{
            height: '34px', padding: '0 12px', borderRadius: '8px', fontSize: '13px', fontWeight: 500,
            border: '1.5px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text-primary)',
            cursor: 'pointer',
          }}
        >
          <option value="">Всі типи</option>
          {docTypes.map(t => <option key={t.code} value={t.code}>{t.name}</option>)}
        </select>

        {(['', 'draft', 'confirmed', 'cancelled'] as const).map(s => (
          <button
            key={s}
            onClick={() => setStatFilter(s)}
            style={{
              height: '34px', padding: '0 14px', borderRadius: '8px', fontSize: '13px', fontWeight: 600,
              border: `1.5px solid ${statFilter === s ? '#1E3A5F' : 'var(--border)'}`,
              background: statFilter === s ? '#1E3A5F' : 'var(--bg-card)',
              color: statFilter === s ? '#fff' : 'var(--text-secondary)',
              cursor: 'pointer',
            }}
          >
            {s === '' ? 'Всі статуси' : STATUS_STYLE[s]?.label ?? s}
          </button>
        ))}

        <span style={{ marginLeft: 'auto', fontSize: '13px', color: 'var(--text-muted)', lineHeight: '34px' }}>
          {filtered.length} документів
        </span>
      </div>

      {/* Table */}
      <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '14px', overflow: 'hidden' }}>
        {/* Table header */}
        <div style={{
          display: 'grid', gridTemplateColumns: '140px 1fr 140px 110px 110px 110px 160px',
          padding: '10px 16px', background: 'var(--bg-soft)',
          borderBottom: '1px solid var(--border)',
          fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)',
          textTransform: 'uppercase', letterSpacing: '0.05em',
        }}>
          <span>Номер</span>
          <span>Контрагент / Примітка</span>
          <span>Склад</span>
          <span style={{ textAlign: 'right' }}>Сума</span>
          <span style={{ textAlign: 'right' }}>Собів.</span>
          <span style={{ textAlign: 'center' }}>Статус</span>
          <span style={{ textAlign: 'right' }}>Дії</span>
        </div>

        {filtered.length === 0 ? (
          <div style={{ padding: '48px', textAlign: 'center', color: 'var(--text-muted)' }}>
            <FileText size={32} strokeWidth={1} style={{ marginBottom: '10px' }} />
            <p>Документів немає</p>
            <p style={{ fontSize: '12px', marginTop: '4px' }}>
              Документи продажу створюються автоматично при відправці замовлень
            </p>
          </div>
        ) : (
          filtered.map((doc, idx) => {
            const st    = STATUS_STYLE[doc.status] ?? STATUS_STYLE.draft;
            const StIcon = st.icon;
            const typeLabel = TYPE_LABELS[doc.doc_type] ?? doc.doc_type;
            const direction = docTypes.find(t => t.code === doc.doc_type)?.direction ?? 'none';
            const DirIcon = DIR_ICON[direction] ?? FileText;
            const dirColor = direction === 'in' ? '#15803D' : direction === 'out' ? '#DC2626' : '#64748B';
            const date = new Date(doc.doc_date).toLocaleDateString('uk-UA', {
              day: '2-digit', month: '2-digit', year: 'numeric',
            });
            const counterparty = doc.supplier?.name ?? doc.counterparty ?? (doc.order_id ? `Замовлення` : '—');
            const margin = doc.total_amount - doc.total_cost;

            return (
              <div
                key={doc.id}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '140px 1fr 140px 110px 110px 110px 160px',
                  padding: '12px 16px', alignItems: 'center',
                  borderBottom: idx < filtered.length - 1 ? '1px solid var(--border-light)' : 'none',
                  background: doc.status === 'cancelled' ? 'var(--bg-soft)' : 'transparent',
                  opacity: doc.status === 'cancelled' ? 0.6 : 1,
                  cursor: 'pointer',
                }}
                onClick={() => window.location.href = `/admin/accounting/documents/${doc.id}`}
              >
                {/* Number + type */}
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                    <DirIcon size={12} color={dirColor} />
                    <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-primary)', fontFamily: 'monospace' }}>
                      {doc.doc_number}
                    </span>
                    {doc.reversal_of && (
                      <span style={{ fontSize: '10px', fontWeight: 700, color: '#DC2626', background: '#FEE2E2', padding: '1px 5px', borderRadius: '4px', letterSpacing: '0.02em' }}>
                        СТОРНО
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>
                    {TYPE_LABELS[doc.doc_type] ?? doc.doc_type} · {date}
                  </div>
                </div>

                {/* Counterparty */}
                <div style={{ paddingRight: '12px' }}>
                  <div style={{ fontSize: '13px', color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {counterparty}
                  </div>
                  {doc.notes && (
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {doc.notes}
                    </div>
                  )}
                </div>

                {/* Warehouse */}
                <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                  {doc.warehouse?.name ?? '—'}
                </div>

                {/* Amount */}
                <div style={{ textAlign: 'right', fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>
                  {doc.total_amount > 0 ? `${doc.total_amount.toFixed(0)} ₴` : '—'}
                </div>

                {/* Cost + margin */}
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                    {doc.total_cost > 0 ? `${doc.total_cost.toFixed(0)} ₴` : '—'}
                  </div>
                  {doc.total_amount > 0 && doc.total_cost > 0 && doc.doc_type === 'sale' && (
                    <div style={{ fontSize: '11px', color: margin >= 0 ? '#15803D' : '#DC2626', fontWeight: 600 }}>
                      {margin >= 0 ? '+' : ''}{margin.toFixed(0)} ₴
                    </div>
                  )}
                </div>

                {/* Status */}
                <div style={{ display: 'flex', justifyContent: 'center' }}>
                  <span style={{
                    display: 'inline-flex', alignItems: 'center', gap: '4px',
                    padding: '3px 9px', borderRadius: '20px', fontSize: '11px', fontWeight: 600,
                    color: st.color, background: st.bg,
                  }}>
                    <StIcon size={11} /> {st.label}
                  </span>
                </div>

                {/* Actions */}
                <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end' }}>
                  {doc.status === 'draft' && (
                    <>
                      <button
                        onClick={() => doAction(doc.id, 'confirm')}
                        disabled={loading === doc.id + 'confirm'}
                        style={{
                          height: '28px', padding: '0 10px', borderRadius: '7px', fontSize: '12px', fontWeight: 600,
                          border: 'none', background: '#15803D', color: '#fff', cursor: 'pointer',
                          opacity: loading === doc.id + 'confirm' ? 0.5 : 1,
                        }}
                      >
                        {loading === doc.id + 'confirm' ? '...' : 'Провести'}
                      </button>
                      <button
                        onClick={() => doAction(doc.id, 'cancel')}
                        disabled={loading === doc.id + 'cancel'}
                        style={{
                          height: '28px', padding: '0 10px', borderRadius: '7px', fontSize: '12px', fontWeight: 600,
                          border: '1.5px solid var(--border)', background: 'transparent',
                          color: 'var(--text-secondary)', cursor: 'pointer',
                          opacity: loading === doc.id + 'cancel' ? 0.5 : 1,
                        }}
                      >
                        Скасувати
                      </button>
                    </>
                  )}
                  {doc.status === 'confirmed' && (
                    <button
                      onClick={() => {
                        const isPO      = doc.doc_type === 'purchase_order';
                        const isReceipt = doc.doc_type === 'receipt' || doc.doc_type === 'stock_in';
                        const isSale    = doc.doc_type === 'sale';
                        const msg = isPO
                          ? `Скасувати замовлення ${doc.doc_number}?\n\n` +
                            `⚠️ Це ЛИШЕ скасує план замовлення.\n` +
                            `Залишки НЕ зміняться — якщо товар уже прийнятий на склад, поверніть його окремо через «Сторно» на документі приходу.`
                          : isReceipt
                          ? `Сторнувати прихід ${doc.doc_number}?\n\n` +
                            `⚠️ Товари будуть ЗНЯТО зі складу (списання FIFO-партій).\n` +
                            `Ця дія незворотна — перевірте, що товар фізично повернуто постачальнику.`
                          : isSale
                          ? `Сторнувати продаж ${doc.doc_number}?\n\n` +
                            `⚠️ Товари будуть ПОВЕРНЕНО на склад.\n` +
                            `Використовуйте тільки для виправлення помилкових документів.`
                          : `Сторнувати документ ${doc.doc_number}? Буде створено зворотній документ.`;
                        if (!confirm(msg)) return;
                        doAction(doc.id, 'cancel');
                      }}
                      disabled={loading === doc.id + 'cancel'}
                      style={{
                        height: '28px', padding: '0 10px', borderRadius: '7px', fontSize: '12px', fontWeight: 600,
                        border: '1.5px solid #FCA5A5', background: '#FEF2F2',
                        color: '#DC2626', cursor: 'pointer',
                        opacity: loading === doc.id + 'cancel' ? 0.5 : 1,
                      }}
                    >
                      Сторно
                    </button>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
