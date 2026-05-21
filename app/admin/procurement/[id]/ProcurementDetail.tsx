'use client';

import { useState, useRef, useEffect } from 'react';
import { ArrowLeft, CheckCircle, Loader2, Package, FileText, Banknote, Truck, Plus, X, Upload, Download, Trash2, Copy, Check } from 'lucide-react';
import Link from 'next/link';

type Line = { id: number; sku: string; name?: string; brand?: string; qty: number; cost_price: number; supplier_id?: number };
type SupplierBank = {
  bank_iban: string | null; bank_name: string | null;
  legal_name: string | null; edrpou: string | null;
  payment_days: number;
};
type PO = {
  id: string; doc_number: string; doc_date: string; procurement_status: string | null;
  expected_date: string | null; supplier_id: number | null; supplier_name: string | null;
  supplier_email: string | null; order_id: string | null; total_cost: number | null;
  notes: string | null; has_receipt: boolean;
  supplier_invoice_number: string | null; supplier_invoice_date: string | null;
  supplier_invoice_amount: number | null;
  supplier_bank: SupplierBank | null;
  lines: Line[];
};

// Спрощений ланцюжок — 3 кроки
const STATUS_STEPS = [
  { key: 'sent',                  label: 'Відправлено постачальнику',  icon: '📤', manual: true  },
  { key: 'confirmed_by_supplier', label: 'Підтверджено постачальником', icon: '✅', manual: true  },
  { key: 'received',              label: 'Отримано на склад',          icon: '📦', manual: false }, // авто через прихід
];

// Маппінг всіх статусів на індекс кроку в прогрес-барі
function statusToStep(status: string): number {
  if (['paid', 'received', 'partially_received'].includes(status)) return 2;
  if (['confirmed_by_supplier', 'invoiced'].includes(status))       return 1;
  if (status === 'sent')                                             return 0;
  return -1;
}

const inp: React.CSSProperties = { height: '36px', padding: '0 10px', border: '1.5px solid var(--border)', borderRadius: '8px', fontSize: '13px', outline: 'none', color: 'var(--text-primary)', background: 'var(--bg-soft)', width: '100%' };
const lbl: React.CSSProperties = { fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', display: 'block', marginBottom: '4px', textTransform: 'uppercase' };

function fmt(n: number) { return n.toLocaleString('uk-UA', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }

export default function ProcurementDetail({ po, chainButton }: { po: PO; chainButton?: React.ReactNode }) {
  const [receiving,    setReceiving]    = useState(false);
  const [receiptNotes, setReceiptNotes] = useState('');
  const [actualQties, setActualQties]  = useState<Record<string, number>>({});

  const [updatingStatus, setUpdatingStatus] = useState(false);
  const [newStatus,      setNewStatus]      = useState(po.procurement_status ?? '');

  const [invoiceNum,    setInvoiceNum]    = useState(po.supplier_invoice_number ?? '');
  const [invoiceDate,   setInvoiceDate]   = useState(po.supplier_invoice_date ?? '');
  const [invoiceAmt,    setInvoiceAmt]    = useState(String(po.supplier_invoice_amount ?? po.total_cost ?? ''));
  const [savingInvoice, setSavingInvoice] = useState(false);
  const [invoiceSaved,  setInvoiceSaved]  = useState(!!po.supplier_invoice_number);
  const [editingInvoice,setEditingInvoice]= useState(!po.supplier_invoice_number);

  const [payAmount,    setPayAmount]    = useState(String(po.supplier_invoice_amount ?? po.total_cost ?? ''));
  const [payDate,      setPayDate]      = useState(new Date().toISOString().slice(0, 10));
  const payTermsDays = po.supplier_bank?.payment_days ?? 0;
  const [payDeferred,  setPayDeferred]  = useState(payTermsDays > 0);
  const [payConfirm,   setPayConfirm]   = useState(false);

  type PayMode = 'transfer' | 'deferred' | 'cash';
  const [payMode,    setPayMode]    = useState<PayMode>(payTermsDays > 0 ? 'deferred' : 'transfer');
  const [copied,     setCopied]     = useState(false);
  const [editingIban,setEditingIban]= useState(false);
  const [ibanDraft,  setIbanDraft]  = useState({ iban: '', legal_name: '', edrpou: '', bank_name: '' });
  const [savingIban, setSavingIban] = useState(false);
  const [deferDate2, setDeferDate2] = useState(() => {
    const d = new Date(); d.setDate(d.getDate() + (payTermsDays || 30));
    return d.toISOString().slice(0, 10);
  });

  function copyPaymentDetails() {
    const lines = [
      `Отримувач: ${po.supplier_bank?.legal_name ?? po.supplier_name}`,
      `IBAN: ${po.supplier_bank?.bank_iban}`,
      po.supplier_bank?.edrpou  ? `ЄДРПОУ: ${po.supplier_bank.edrpou}`   : '',
      po.supplier_bank?.bank_name ? `Банк: ${po.supplier_bank.bank_name}` : '',
      `Призначення: Оплата за замовленням ${po.doc_number} від ${new Date(po.doc_date).toLocaleDateString('uk-UA')}`,
      `Сума: ${Number(payAmount).toFixed(2)} грн`,
    ].filter(Boolean).join('\n');
    navigator.clipboard.writeText(lines);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function saveIban() {
    if (!ibanDraft.iban) return;
    setSavingIban(true);
    try {
      await fetch(`/api/admin/suppliers/${po.supplier_id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          bank_iban:    ibanDraft.iban,
          legal_name:   ibanDraft.legal_name || undefined,
          edrpou:       ibanDraft.edrpou     || undefined,
          bank_name:    ibanDraft.bank_name  || undefined,
        }),
      });
      setSuccess('✅ Реквізити збережено. Оновіть сторінку.');
      setEditingIban(false);
    } catch { setError('Помилка збереження реквізитів'); }
    finally { setSavingIban(false); }
  }
  const [deferDate,   setDeferDate]   = useState(() => {
    const d = new Date(); d.setDate(d.getDate() + (payTermsDays || 14));
    return d.toISOString().slice(0, 10);
  });
  const [paying,      setPaying]      = useState(false);

  // Invoice file upload
  const fileRef = useRef<HTMLInputElement>(null);
  const [invoiceFile,        setInvoiceFile]        = useState<{ url: string | null; name: string | null } | null>(null);
  const [uploadingInvoice,   setUploadingInvoice]   = useState(false);
  const [deletingInvoiceFile,setDeletingInvoiceFile]= useState(false);

  useEffect(() => {
    fetch(`/api/admin/procurement/${po.id}/upload-invoice`)
      .then(r => r.json())
      .then(d => setInvoiceFile({ url: d.url, name: d.name }))
      .catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [po.id]);

  async function handleInvoiceUpload(file: File) {
    setUploadingInvoice(true);
    const fd = new FormData();
    fd.append('file', file);
    const res = await fetch(`/api/admin/procurement/${po.id}/upload-invoice`, { method: 'POST', body: fd });
    const data = await res.json();
    if (res.ok) setInvoiceFile({ url: data.signed_url, name: data.name });
    setUploadingInvoice(false);
  }

  async function handleDeleteInvoiceFile() {
    setDeletingInvoiceFile(true);
    await fetch(`/api/admin/procurement/${po.id}/upload-invoice`, { method: 'DELETE' });
    setInvoiceFile(null);
    setDeletingInvoiceFile(false);
  }

  // Landed cost
  type CostLine = { cost_type: string; description: string; amount: string };
  const COST_TYPES = [
    { value: 'delivery',  label: '🚚 Доставка' },
    { value: 'loading',   label: '📦 Навантаж./розвантаж.' },
    { value: 'customs',   label: '🏛 Мито/брокер' },
    { value: 'packaging', label: '📦 Пакування' },
    { value: 'other',     label: '➕ Інше' },
  ];
  const [lcLines,  setLcLines]  = useState<CostLine[]>([{ cost_type: 'delivery', description: '', amount: '' }]);
  const [lcMethod, setLcMethod] = useState<'by_cost'|'by_qty'|'equal'>('by_cost');
  const [lcSaving, setLcSaving] = useState(false);
  const [lcDone,   setLcDone]   = useState(false);

  function addLcLine() { setLcLines(prev => [...prev, { cost_type: 'delivery', description: '', amount: '' }]); }
  function removeLcLine(i: number) { setLcLines(prev => prev.filter((_, idx) => idx !== i)); }
  function setLcField(i: number, field: keyof CostLine, val: string) {
    setLcLines(prev => prev.map((l, idx) => idx === i ? { ...l, [field]: val } : l));
  }

  async function handleLandedCost() {
    const costs = lcLines.map(l => ({ cost_type: l.cost_type, description: l.description || undefined, amount: parseFloat(l.amount) || 0 })).filter(c => c.amount > 0);
    if (!costs.length) { setError('Вкажіть хоча б одну суму'); return; }
    setLcSaving(true); setError(''); setSuccess('');
    try {
      const res = await fetch(`/api/admin/procurement/${po.id}/landed-cost`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ costs, method: lcMethod }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? 'Помилка'); return; }
      const total = costs.reduce((s, c) => s + c.amount, 0);
      setSuccess(`✅ ${total.toFixed(2)} ₴ розподілено між FIFO партіями методом "${lcMethod}"`);
      setLcDone(true);
    } catch { setError('Мережева помилка'); }
    finally { setLcSaving(false); }
  }

  const [error,   setError]   = useState('');
  const [success, setSuccess] = useState('');

  const currentStepIdx = statusToStep(newStatus || po.procurement_status || '');

  async function handleReceive() {
    setReceiving(true); setError(''); setSuccess('');
    try {
      const res = await fetch(`/api/admin/procurement/${po.id}/receive`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ actualQties: Object.keys(actualQties).length ? actualQties : undefined, notes: receiptNotes }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? 'Помилка'); return; }
      setSuccess('✅ Прихід оформлено! Залишки оновлено (FIFO). Оновіть сторінку.');
    } catch { setError('Мережева помилка'); }
    finally { setReceiving(false); }
  }

  async function handleStatusUpdate(status: string) {
    setUpdatingStatus(true); setError('');
    try {
      const res = await fetch(`/api/admin/procurement/${po.id}/status`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ procurement_status: status }),
      });
      if (!res.ok) { const d = await res.json(); setError(d.error ?? 'Помилка'); return; }
      setNewStatus(status);
      setSuccess(`Статус оновлено: ${STATUS_STEPS.find(s => s.key === status)?.label}`);
    } catch { setError('Мережева помилка'); }
    finally { setUpdatingStatus(false); }
  }

  async function handleSaveInvoice() {
    setSavingInvoice(true); setError('');
    try {
      const res = await fetch(`/api/admin/procurement/${po.id}/status`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          // Не змінюємо procurement_status — просто зберігаємо реквізити рахунку
          supplier_invoice_number: invoiceNum,
          supplier_invoice_date:   invoiceDate,
          supplier_invoice_amount: parseFloat(invoiceAmt) || undefined,
        }),
      });
      if (!res.ok) { const d = await res.json(); setError(d.error ?? 'Помилка'); return; }
      setSuccess('✅ Реквізити рахунку збережено');
      setInvoiceSaved(true);
      setEditingInvoice(false);
    } catch { setError('Мережева помилка'); }
    finally { setSavingInvoice(false); }
  }

  async function handleConfirmWithoutInvoice() {
    setUpdatingStatus(true); setError('');
    try {
      const res = await fetch(`/api/admin/procurement/${po.id}/status`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ procurement_status: 'confirmed_by_supplier' }),
      });
      if (!res.ok) { const d = await res.json(); setError(d.error ?? 'Помилка'); return; }
      setNewStatus('confirmed_by_supplier');
      setSuccess('✅ Підтверджено без рахунку-фактури');
    } catch { setError('Мережева помилка'); }
    finally { setUpdatingStatus(false); }
  }

  async function handlePay() {
    setPaying(true); setError('');
    try {
      const res = await fetch(`/api/admin/procurement/${po.id}/status`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          procurement_status: 'paid',
          payment_amount:     parseFloat(payAmount),
          payment_date:       payDate,
        }),
      });
      if (!res.ok) { const d = await res.json(); setError(d.error ?? 'Помилка'); return; }
      setSuccess('✅ Оплату зафіксовано в леджері');
      setNewStatus('paid');
    } catch { setError('Мережева помилка'); }
    finally { setPaying(false); }
  }

  const activeStatus = newStatus || po.procurement_status || '';

  return (
    <div style={{ padding: '28px 32px', maxWidth: '1300px' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '20px' }}>
        <Link href="/admin/procurement" style={{ display: 'flex', alignItems: 'center', color: 'var(--text-secondary)', textDecoration: 'none' }}><ArrowLeft size={16} /></Link>
        <div style={{ flex: 1 }}>
          <h1 style={{ fontSize: '20px', fontWeight: 800, color: 'var(--text-primary)', margin: 0 }}>{po.doc_number}</h1>
          <div style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
            {po.supplier_name} · {new Date(po.doc_date).toLocaleDateString('uk-UA')}
            {po.expected_date && ` · Очікуємо: ${new Date(po.expected_date).toLocaleDateString('uk-UA')}`}
          </div>
        </div>
        {chainButton}
      </div>

      {/* Progress bar */}
      <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '12px', padding: '16px 20px', marginBottom: '20px' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0' }}>
          {STATUS_STEPS.map((step, i) => {
            const done   = currentStepIdx >= i;
            const active = currentStepIdx === i;
            return (
              <div key={step.key} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', position: 'relative' }}>
                {i > 0 && <div style={{ position: 'absolute', left: '-50%', top: '14px', width: '100%', height: '2px', background: done ? '#1E3A5F' : 'var(--border)', zIndex: 0 }} />}
                <div style={{ width: '28px', height: '28px', borderRadius: '50%', background: done ? '#1E3A5F' : 'var(--bg-soft)', border: `2px solid ${done ? '#1E3A5F' : 'var(--border)'}`, display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1, position: 'relative' }}>
                  {done ? <CheckCircle size={14} color="#fff" /> : <span style={{ fontSize: '10px' }}>{i + 1}</span>}
                </div>
                <div style={{ fontSize: '10px', fontWeight: active ? 700 : 400, color: done ? '#1E3A5F' : 'var(--text-muted)', marginTop: '4px', textAlign: 'center', maxWidth: '80px' }}>
                  {step.icon} {step.label}
                </div>
                {/* Кнопка ручного підтвердження — тільки для manual-кроків */}
                {!done && step.manual && (
                  <button onClick={() => handleStatusUpdate(step.key)} disabled={updatingStatus}
                    style={{ marginTop: '4px', fontSize: '10px', padding: '1px 6px', borderRadius: '4px', border: '1px solid var(--border)', background: 'var(--bg-soft)', cursor: 'pointer', color: 'var(--text-secondary)' }}>
                    ✓ Так
                  </button>
                )}
                {/* Крок "Отримано" — автоматично через прихід */}
                {!done && !step.manual && (
                  <div style={{ marginTop: '4px', fontSize: '9px', color: 'var(--text-muted)', textAlign: 'center' }}>
                    авто
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Badge "Оплачено" — окремо від ланцюжка */}
        {activeStatus === 'paid' && (
          <div style={{ marginTop: '12px', paddingTop: '12px', borderTop: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ fontSize: '12px', fontWeight: 700, color: '#15803D', background: '#F0FDF4', border: '1px solid #BBF7D0', padding: '3px 10px', borderRadius: '20px' }}>
              💳 Оплачено
            </span>
          </div>
        )}
      </div>

      {error   && <div style={{ padding: '10px 14px', background: '#FEF2F2', borderRadius: '8px', color: '#DC2626', fontSize: '13px', marginBottom: '12px' }}>{error}</div>}
      {success && <div style={{ padding: '10px 14px', background: '#F0FDF4', borderRadius: '8px', color: '#15803D', fontSize: '13px', marginBottom: '12px' }}>{success}</div>}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 360px', gap: '20px' }}>
        {/* Left: Lines */}
        <div>
          <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '12px', overflow: 'hidden', marginBottom: '16px' }}>
            <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '7px' }}>
              <Package size={15} /> Товари
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '120px minmax(0,1fr) 100px 120px 120px', padding: '8px 20px', background: 'var(--bg-soft)', fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', columnGap: '24px' }}>
              <span>Артикул</span><span>Найменування</span><span style={{ textAlign: 'right' }}>К-сть</span><span style={{ textAlign: 'right' }}>Ціна</span><span style={{ textAlign: 'right' }}>Сума</span>
            </div>
            {po.lines.map(line => (
              <div key={line.id} style={{ display: 'grid', gridTemplateColumns: '120px minmax(0,1fr) 100px 120px 120px', padding: '11px 20px', alignItems: 'center', borderTop: '1px solid var(--border-light)', columnGap: '24px' }}>
                <span style={{ fontFamily: 'monospace', fontSize: '12px', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{line.sku}</span>
                <div style={{ overflow: 'hidden', minWidth: 0 }}
                  title={line.name && line.brand ? `${line.name}, ${line.brand}` : (line.name || line.sku)}>
                  <div style={{ fontSize: '13px', color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {line.name || '—'}
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', justifyContent: 'flex-end' }}>
                  <span style={{ fontSize: '13px', color: 'var(--text-primary)' }}>{line.qty} шт</span>
                  {!po.has_receipt && (
                    <input type="number" min="0" step="1"
                      placeholder={String(line.qty)}
                      value={actualQties[line.sku] ?? ''}
                      onChange={e => setActualQties(prev => ({ ...prev, [line.sku]: parseFloat(e.target.value) || 0 }))}
                      style={{ ...inp, width: '70px', height: '28px', fontSize: '12px' }} />
                  )}
                </div>
                <span style={{ textAlign: 'right', fontSize: '12px', color: 'var(--text-secondary)' }}>{line.cost_price ? `${fmt(line.cost_price)} ₴` : '—'}</span>
                <span style={{ textAlign: 'right', fontSize: '13px', fontWeight: 600 }}>{line.cost_price ? `${fmt(line.cost_price * line.qty)} ₴` : '—'}</span>
              </div>
            ))}
            <div style={{ padding: '11px 20px', borderTop: '2px solid var(--border)', display: 'flex', justifyContent: 'space-between', fontSize: '14px', fontWeight: 700 }}>
              <span>Всього</span>
              <span>{po.total_cost ? `${fmt(Number(po.total_cost))} ₴` : '—'}</span>
            </div>
          </div>

          {/* Receive block — показуємо поки прихід не оформлено */}
          {!po.has_receipt && (
            <div style={{ background: 'var(--bg-card)', border: '1.5px solid #BFDBFE', borderRadius: '12px', padding: '16px' }}>
              <div style={{ fontSize: '13px', fontWeight: 700, color: '#1E3A5F', marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '7px' }}>
                <Truck size={15} /> Оформити прихід на склад
              </div>
              <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '10px' }}>
                Введіть фактичні кількості якщо відрізняються від замовлення (або залиште порожніми = як замовлено).
              </div>
              <div style={{ marginBottom: '10px' }}>
                <label style={lbl}>Нотатки до приходу</label>
                <input style={inp} value={receiptNotes} onChange={e => setReceiptNotes(e.target.value)} placeholder="Все відповідно, отримано без зауважень" />
              </div>
              <button onClick={handleReceive} disabled={receiving}
                style={{ width: '100%', height: '38px', borderRadius: '8px', border: 'none', background: '#1E3A5F', color: '#fff', fontSize: '13px', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', opacity: receiving ? 0.7 : 1 }}>
                {receiving ? <><Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} />Оформлюємо...</> : <><Package size={14} />Підтвердити прихід → FIFO</>}
              </button>
            </div>
          )}
        </div>

        {/* Right: Actions */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {/* Invoice */}
          <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '12px', padding: '16px' }}>
            <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '7px' }}>
              <FileText size={15} /> Рахунок-фактура
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {invoiceSaved && !editingInvoice ? (
                /* ── Режим перегляду: все заблоковано ── */
                <>
                  <div style={{ padding: '10px 12px', background: 'var(--bg-soft)', borderRadius: '8px', fontSize: '13px', display: 'flex', flexDirection: 'column', gap: '3px' }}>
                    <div><span style={{ color: 'var(--text-muted)', fontSize: '11px' }}>Номер: </span><strong>{invoiceNum}</strong></div>
                    {invoiceDate && <div><span style={{ color: 'var(--text-muted)', fontSize: '11px' }}>Дата: </span><strong>{new Date(invoiceDate).toLocaleDateString('uk-UA')}</strong></div>}
                    {invoiceAmt && <div><span style={{ color: 'var(--text-muted)', fontSize: '11px' }}>Сума: </span><strong>{Number(invoiceAmt).toLocaleString('uk-UA', { minimumFractionDigits: 2 })} ₴</strong></div>}
                  </div>

                  {/* Файл — тільки перегляд/скачування (без видалення) */}
                  {invoiceFile?.url && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 10px', background: '#F0FDF4', borderRadius: '8px', border: '1px solid #BBF7D0' }}>
                      <FileText size={14} color="#15803D" style={{ flexShrink: 0 }} />
                      <span style={{ fontSize: '12px', color: '#15803D', fontWeight: 600, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{invoiceFile.name}</span>
                      <a href={invoiceFile.url} target="_blank" rel="noopener noreferrer"
                        style={{ display: 'flex', padding: '3px', color: '#15803D', flexShrink: 0 }} title="Завантажити">
                        <Download size={13} />
                      </a>
                    </div>
                  )}

                  <button onClick={() => setEditingInvoice(true)}
                    style={{ height: '34px', borderRadius: '8px', border: '1px solid var(--border)', background: 'none', color: 'var(--text-secondary)', fontSize: '12px', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '5px' }}>
                    ✏️ Редагувати
                  </button>
                </>
              ) : (
                /* ── Режим редагування ── */
                <>
                  <div><label style={lbl}>Номер рахунку</label><input style={inp} value={invoiceNum} onChange={e => setInvoiceNum(e.target.value)} placeholder="СФ-2026-001" /></div>
                  <div><label style={lbl}>Дата</label><input style={{ ...inp }} type="date" value={invoiceDate} onChange={e => setInvoiceDate(e.target.value)} /></div>
                  <div><label style={lbl}>Сума</label><input style={inp} type="number" value={invoiceAmt} onChange={e => setInvoiceAmt(e.target.value)} /></div>

                  {/* Файл рахунку — перший перед кнопками */}
                  <div>
                    <label style={lbl}>Файл рахунку (PDF / Excel)</label>
                    {invoiceFile?.url ? (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 10px', background: '#F0FDF4', borderRadius: '8px', border: '1px solid #BBF7D0' }}>
                        <FileText size={14} color="#15803D" style={{ flexShrink: 0 }} />
                        <span style={{ fontSize: '12px', color: '#15803D', fontWeight: 600, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{invoiceFile.name}</span>
                        <a href={invoiceFile.url} target="_blank" rel="noopener noreferrer"
                          style={{ display: 'flex', padding: '3px', color: '#15803D', flexShrink: 0 }} title="Завантажити">
                          <Download size={13} />
                        </a>
                        <button onClick={handleDeleteInvoiceFile} disabled={deletingInvoiceFile}
                          style={{ display: 'flex', padding: '3px', background: 'none', border: 'none', cursor: 'pointer', color: '#EF4444', flexShrink: 0 }} title="Видалити файл">
                          {deletingInvoiceFile ? <Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} /> : <Trash2 size={13} />}
                        </button>
                      </div>
                    ) : (
                      <button onClick={() => fileRef.current?.click()} disabled={uploadingInvoice}
                        style={{ width: '100%', height: '34px', borderRadius: '8px', border: '1.5px dashed var(--border)', background: 'var(--bg-soft)', cursor: 'pointer', fontSize: '12px', color: 'var(--text-muted)', fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
                        {uploadingInvoice ? <><Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} /> Завантаження...</> : <><Upload size={13} /> Прикріпити файл</>}
                      </button>
                    )}
                  </div>

                  {/* Кнопки дій */}
                  <div style={{ display: 'flex', gap: '6px' }}>
                    {invoiceSaved && (
                      <button onClick={() => setEditingInvoice(false)}
                        style={{ height: '34px', padding: '0 12px', borderRadius: '8px', border: '1px solid var(--border)', background: 'none', color: 'var(--text-secondary)', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}>
                        Скасувати
                      </button>
                    )}
                    <button onClick={handleSaveInvoice} disabled={savingInvoice || !invoiceNum}
                      style={{ flex: 1, height: '34px', borderRadius: '8px', border: 'none', background: invoiceNum ? '#EA580C' : '#E2E8F0', color: invoiceNum ? '#fff' : '#94A3B8', fontSize: '12px', fontWeight: 700, cursor: invoiceNum ? 'pointer' : 'default', opacity: savingInvoice ? 0.7 : 1 }}>
                      {savingInvoice ? '...' : '🧾 Зберегти'}
                    </button>
                    <button onClick={handleConfirmWithoutInvoice} disabled={updatingStatus || ['confirmed_by_supplier','received','paid'].includes(activeStatus)}
                      title="Постачальник не виставляє рахунок"
                      style={{ height: '34px', padding: '0 10px', borderRadius: '8px', border: '1.5px solid #94A3B8', background: 'none', color: '#64748B', fontSize: '11px', fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap', opacity: updatingStatus ? 0.6 : 1 }}>
                      ✓ Без рахунку
                    </button>
                  </div>
                </>
              )}

              {/* Статус оплати */}
              {activeStatus === 'paid' && (
                <div style={{ padding: '8px 10px', background: '#F0FDF4', borderRadius: '8px', border: '1px solid #BBF7D0', fontSize: '12px', fontWeight: 700, color: '#15803D', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  💳 Оплачено
                </div>
              )}

              {/* Hidden file input */}
              <input ref={fileRef} type="file" accept=".pdf,.xlsx,.xls,.jpg,.jpeg,.png" style={{ display: 'none' }}
                onChange={e => { const f = e.target.files?.[0]; if (f) handleInvoiceUpload(f); e.target.value = ''; }} />
            </div>
          </div>

          {/* Landed Cost */}
          {po.has_receipt && (
            <div style={{ background: 'var(--bg-card)', border: `1px solid ${lcDone ? '#86EFAC' : 'var(--border)'}`, borderRadius: '12px', padding: '16px' }}>
              <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '7px' }}>
                <Package size={15} /> Додаткові витрати (Landed Cost)
              </div>
              {lcDone ? (
                <div style={{ fontSize: '13px', color: '#15803D', fontWeight: 600 }}>✅ Розподілено по FIFO партіях</div>
              ) : (
                <>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '10px' }}>
                    {lcLines.map((line, i) => (
                      <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: '6px', alignItems: 'center' }}>
                        <select value={line.cost_type} onChange={e => setLcField(i, 'cost_type', e.target.value)}
                          style={{ ...inp, cursor: 'pointer', fontSize: '12px' }}>
                          {COST_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                        </select>
                        <input style={{ ...inp, fontSize: '12px' }} type="number" min="0" step="0.01"
                          placeholder="Сума, ₴" value={line.amount}
                          onChange={e => setLcField(i, 'amount', e.target.value)} />
                        {lcLines.length > 1 && (
                          <button onClick={() => removeLcLine(i)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#EF4444', padding: '0 4px', display: 'flex' }}><X size={14} /></button>
                        )}
                      </div>
                    ))}
                  </div>
                  <button onClick={addLcLine} style={{ fontSize: '12px', color: '#1E3A5F', background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '10px' }}>
                    <Plus size={12} /> Додати рядок
                  </button>
                  <div style={{ marginBottom: '10px' }}>
                    <label style={{ ...lbl, marginBottom: '6px' }}>Метод розподілу</label>
                    <div style={{ display: 'flex', gap: '6px' }}>
                      {[
                        { v: 'by_cost', l: 'За вартістю' },
                        { v: 'by_qty',  l: 'По кількості' },
                        { v: 'equal',   l: 'Порівну' },
                      ].map(m => (
                        <button key={m.v} onClick={() => setLcMethod(m.v as typeof lcMethod)}
                          style={{ flex: 1, height: '30px', borderRadius: '7px', fontSize: '11px', fontWeight: 600, cursor: 'pointer', border: `1.5px solid ${lcMethod === m.v ? '#1E3A5F' : 'var(--border)'}`, background: lcMethod === m.v ? '#1E3A5F' : 'var(--bg-soft)', color: lcMethod === m.v ? '#fff' : 'var(--text-secondary)' }}>
                          {m.l}
                        </button>
                      ))}
                    </div>
                  </div>
                  <button onClick={handleLandedCost} disabled={lcSaving}
                    style={{ width: '100%', height: '34px', borderRadius: '8px', border: 'none', background: '#7C3AED', color: '#fff', fontSize: '12px', fontWeight: 700, cursor: 'pointer', opacity: lcSaving ? 0.7 : 1 }}>
                    {lcSaving ? '...' : '📊 Розподілити витрати по FIFO'}
                  </button>
                </>
              )}
            </div>
          )}

          {/* Payment */}
          <div style={{ background: 'var(--bg-card)', border: `1px solid ${activeStatus === 'paid' ? '#86EFAC' : 'var(--border)'}`, borderRadius: '12px', padding: '16px' }}>
            <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '7px' }}>
              <Banknote size={15} /> Оплата постачальнику
            </div>

            {/* Supplier bank details */}
            {po.supplier_bank?.bank_iban && (
              <div style={{ padding: '8px 12px', background: 'var(--bg-soft)', borderRadius: '8px', marginBottom: '12px', fontSize: '12px', color: 'var(--text-secondary)' }}>
                <div style={{ fontWeight: 600, color: 'var(--text-primary)', marginBottom: '3px' }}>{po.supplier_bank.legal_name ?? po.supplier_name}</div>
                {po.supplier_bank.edrpou && <div>ЄДРПОУ: {po.supplier_bank.edrpou}</div>}
                <div style={{ fontFamily: 'monospace', fontSize: '11px', marginTop: '2px' }}>{po.supplier_bank.bank_iban}</div>
                {po.supplier_bank.bank_name && <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{po.supplier_bank.bank_name}</div>}
              </div>
            )}
            {!po.supplier_bank?.bank_iban && (
              <div style={{ padding: '8px 12px', background: '#FEF3C7', borderRadius: '8px', marginBottom: '12px', fontSize: '12px', color: '#92400E' }}>
                ⚠ Реквізити не заповнені. Додайте IBAN у картці постачальника.
              </div>
            )}

            {activeStatus === 'paid' ? (
              <div style={{ padding: '10px 12px', background: '#F0FDF4', borderRadius: '8px', fontSize: '13px', color: '#15803D', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '6px' }}>
                <CheckCircle size={16} /> Оплачено
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>

                {/* Вибір способу оплати */}
                <div>
                  <label style={lbl}>Спосіб оплати</label>
                  <div style={{ display: 'flex', borderRadius: '8px', overflow: 'hidden', border: '1px solid var(--border)' }}>
                    {([
                      { key: 'transfer', label: '🏦 Рахунок' },
                      { key: 'deferred', label: '📅 Відстрочка' },
                      { key: 'cash',     label: '💵 Готівка' },
                    ] as { key: PayMode; label: string }[]).map((m, i) => (
                      <button key={m.key} onClick={() => setPayMode(m.key)}
                        style={{ flex: 1, height: '34px', fontSize: '11px', fontWeight: 600, cursor: 'pointer', border: 'none', borderLeft: i > 0 ? '1px solid var(--border)' : 'none', background: payMode === m.key ? '#1E3A5F' : 'var(--bg-soft)', color: payMode === m.key ? '#fff' : 'var(--text-secondary)', transition: 'all 0.15s' }}>
                        {m.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* ── РАХУНОК (банківський переказ) ── */}
                {payMode === 'transfer' && (
                  <>
                    {!po.supplier_bank?.bank_iban && !editingIban ? (
                      <div style={{ padding: '12px', background: '#FEF3C7', borderRadius: '8px', fontSize: '12px', color: '#92400E' }}>
                        ⚠ IBAN постачальника не заповнено — без нього неможливо зробити банківський переказ.
                        <button onClick={() => setEditingIban(true)}
                          style={{ display: 'block', marginTop: '8px', height: '30px', padding: '0 12px', borderRadius: '6px', border: 'none', background: '#92400E', color: '#fff', fontSize: '12px', fontWeight: 700, cursor: 'pointer' }}>
                          + Додати реквізити
                        </button>
                      </div>
                    ) : editingIban ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '7px', padding: '12px', background: 'var(--bg-soft)', borderRadius: '8px' }}>
                        <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '4px' }}>Реквізити постачальника</div>
                        <input style={{ ...inp, fontSize: '12px' }} placeholder="IBAN (UA...)" value={ibanDraft.iban} onChange={e => setIbanDraft(p => ({ ...p, iban: e.target.value }))} />
                        <input style={{ ...inp, fontSize: '12px' }} placeholder="Юридична назва" value={ibanDraft.legal_name} onChange={e => setIbanDraft(p => ({ ...p, legal_name: e.target.value }))} />
                        <input style={{ ...inp, fontSize: '12px' }} placeholder="ЄДРПОУ" value={ibanDraft.edrpou} onChange={e => setIbanDraft(p => ({ ...p, edrpou: e.target.value }))} />
                        <input style={{ ...inp, fontSize: '12px' }} placeholder="Назва банку" value={ibanDraft.bank_name} onChange={e => setIbanDraft(p => ({ ...p, bank_name: e.target.value }))} />
                        <div style={{ display: 'flex', gap: '6px', marginTop: '4px' }}>
                          <button onClick={() => setEditingIban(false)} style={{ flex: 1, height: '30px', borderRadius: '6px', border: '1px solid var(--border)', background: 'none', fontSize: '12px', cursor: 'pointer', color: 'var(--text-secondary)', fontWeight: 600 }}>Скасувати</button>
                          <button onClick={saveIban} disabled={savingIban || !ibanDraft.iban}
                            style={{ flex: 2, height: '30px', borderRadius: '6px', border: 'none', background: ibanDraft.iban ? '#1E3A5F' : '#E2E8F0', color: ibanDraft.iban ? '#fff' : '#94A3B8', fontSize: '12px', fontWeight: 700, cursor: ibanDraft.iban ? 'pointer' : 'default' }}>
                            {savingIban ? '...' : '💾 Зберегти реквізити'}
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div style={{ padding: '10px 12px', background: 'var(--bg-soft)', borderRadius: '8px', fontSize: '12px', display: 'flex', flexDirection: 'column', gap: '3px' }}>
                        <div style={{ fontWeight: 700, color: 'var(--text-primary)', marginBottom: '2px' }}>{po.supplier_bank?.legal_name ?? po.supplier_name}</div>
                        {po.supplier_bank?.edrpou  && <div style={{ color: 'var(--text-muted)' }}>ЄДРПОУ: {po.supplier_bank.edrpou}</div>}
                        <div style={{ fontFamily: 'monospace', fontSize: '11px', color: 'var(--text-primary)' }}>{po.supplier_bank?.bank_iban}</div>
                        {po.supplier_bank?.bank_name && <div style={{ color: 'var(--text-muted)' }}>{po.supplier_bank.bank_name}</div>}
                      </div>
                    )}

                    {po.supplier_bank?.bank_iban && !editingIban && (
                      <>
                        <div><label style={lbl}>Сума, ₴</label><input style={inp} type="number" value={payAmount} onChange={e => setPayAmount(e.target.value)} placeholder="0.00" /></div>
                        <div><label style={lbl}>Дата оплати</label><input style={inp} type="date" value={payDate} onChange={e => setPayDate(e.target.value)} /></div>
                        <div style={{ display: 'flex', gap: '6px' }}>
                          <button onClick={copyPaymentDetails}
                            style={{ flex: 1, height: '36px', borderRadius: '8px', border: '1px solid var(--border)', background: copied ? '#F0FDF4' : 'var(--bg-soft)', color: copied ? '#15803D' : 'var(--text-secondary)', fontSize: '12px', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '5px' }}>
                            {copied ? <><Check size={12} /> Скопійовано</> : <><Copy size={12} /> Копіювати реквізити</>}
                          </button>
                          <button onClick={() => { if (!payAmount || parseFloat(payAmount) <= 0) { setError('Вкажіть суму'); return; } setPayConfirm(true); }}
                            disabled={paying || !payAmount || parseFloat(payAmount) <= 0}
                            style={{ flex: 2, height: '36px', borderRadius: '8px', border: 'none', background: !payAmount || parseFloat(payAmount) <= 0 ? '#E2E8F0' : '#15803D', color: !payAmount || parseFloat(payAmount) <= 0 ? '#94A3B8' : '#fff', fontSize: '13px', fontWeight: 700, cursor: !payAmount || parseFloat(payAmount) <= 0 ? 'not-allowed' : 'pointer' }}>
                            💳 Підтвердити переказ
                          </button>
                        </div>
                        <div style={{ fontSize: '11px', color: 'var(--text-muted)', textAlign: 'center' }}>
                          Перекажіть кошти через свій інтернет-банкінг і натисніть "Підтвердити"
                        </div>
                      </>
                    )}
                  </>
                )}

                {/* ── ВІДСТРОЧКА ── */}
                {payMode === 'deferred' && (
                  <>
                    <div><label style={lbl}>Сума, ₴</label><input style={inp} type="number" value={payAmount} onChange={e => setPayAmount(e.target.value)} placeholder="0.00" /></div>
                    <div><label style={lbl}>Оплатити до</label>
                      <input style={inp} type="date" value={deferDate2} min={new Date().toISOString().slice(0, 10)} onChange={e => setDeferDate2(e.target.value)} />
                    </div>
                    <button onClick={() => { if (!payAmount || parseFloat(payAmount) <= 0) { setError('Вкажіть суму'); return; } handleStatusUpdate('confirmed_by_supplier'); setSuccess(`✅ Відстрочку зафіксовано до ${new Date(deferDate2).toLocaleDateString('uk-UA')}`); }}
                      disabled={updatingStatus || !payAmount || parseFloat(payAmount) <= 0}
                      style={{ height: '36px', borderRadius: '8px', border: 'none', background: !payAmount || parseFloat(payAmount) <= 0 ? '#E2E8F0' : '#B45309', color: !payAmount || parseFloat(payAmount) <= 0 ? '#94A3B8' : '#fff', fontSize: '13px', fontWeight: 700, cursor: 'pointer' }}>
                      📅 Зафіксувати відстрочку до {new Date(deferDate2).toLocaleDateString('uk-UA')}
                    </button>
                  </>
                )}

                {/* ── ГОТІВКА ── */}
                {payMode === 'cash' && (
                  <>
                    <div style={{ padding: '10px 12px', background: 'var(--bg-soft)', borderRadius: '8px', fontSize: '12px', color: 'var(--text-secondary)' }}>
                      💵 Оплата готівкою — підходить для постачальників типу "ринок", де розрахунок відбувається при отриманні товару.
                    </div>
                    <div><label style={lbl}>Сума, ₴</label><input style={inp} type="number" value={payAmount} onChange={e => setPayAmount(e.target.value)} placeholder="0.00" /></div>
                    <div><label style={lbl}>Дата оплати</label><input style={inp} type="date" value={payDate} onChange={e => setPayDate(e.target.value)} /></div>
                    <button onClick={() => { if (!payAmount || parseFloat(payAmount) <= 0) { setError('Вкажіть суму'); return; } setPayConfirm(true); }}
                      disabled={paying || !payAmount || parseFloat(payAmount) <= 0}
                      style={{ height: '36px', borderRadius: '8px', border: 'none', background: !payAmount || parseFloat(payAmount) <= 0 ? '#E2E8F0' : '#15803D', color: !payAmount || parseFloat(payAmount) <= 0 ? '#94A3B8' : '#fff', fontSize: '13px', fontWeight: 700, cursor: 'pointer' }}>
                      💵 Підтвердити готівкову оплату
                    </button>
                  </>
                )}

              </div>
            )}
          </div>
        </div>
      </div>
      {/* Діалог підтвердження оплати */}
      {payConfirm && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 3000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: 'var(--bg-card)', borderRadius: '16px', padding: '28px', width: '400px', boxShadow: '0 20px 60px rgba(0,0,0,0.25)' }}>
            <div style={{ fontSize: '16px', fontWeight: 800, color: 'var(--text-primary)', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              💳 Підтвердження оплати
            </div>

            <div style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '12px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--text-muted)' }}>Постачальник:</span>
                <strong>{po.supplier_name}</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--text-muted)' }}>Замовлення:</span>
                <strong>{po.doc_number}</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--text-muted)' }}>Сума:</span>
                <strong style={{ color: '#15803D', fontSize: '15px' }}>{Number(payAmount).toLocaleString('uk-UA', { minimumFractionDigits: 2 })} ₴</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--text-muted)' }}>Дата оплати:</span>
                <strong>{new Date(payDate).toLocaleDateString('uk-UA')}</strong>
              </div>
            </div>

            {!po.supplier_bank?.bank_iban ? (
              <div style={{ padding: '10px 12px', background: '#FEF3C7', borderRadius: '8px', fontSize: '12px', color: '#92400E', marginBottom: '16px' }}>
                ⚠ IBAN постачальника не заповнено. Оплата буде зафіксована як готівкова або через інший канал.<br/>
                <span style={{ fontSize: '11px', marginTop: '3px', display: 'block' }}>Щоб додати реквізити — перейдіть у картку постачальника.</span>
              </div>
            ) : (
              <div style={{ padding: '10px 12px', background: 'var(--bg-soft)', borderRadius: '8px', fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '16px', fontFamily: 'monospace' }}>
                {po.supplier_bank.legal_name && <div style={{ fontFamily: 'sans-serif', fontWeight: 600, marginBottom: '2px' }}>{po.supplier_bank.legal_name}</div>}
                {po.supplier_bank.bank_iban}
              </div>
            )}

            <p style={{ fontSize: '12px', color: '#64748B', marginBottom: '20px' }}>
              Після підтвердження буде зроблено запис у фінансовому леджері та статус замовлення зміниться на «Оплачено».
            </p>

            <div style={{ display: 'flex', gap: '10px' }}>
              <button onClick={() => setPayConfirm(false)}
                style={{ flex: 1, height: '40px', borderRadius: '8px', border: '1px solid var(--border)', background: 'none', cursor: 'pointer', fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)' }}>
                Скасувати
              </button>
              <button onClick={() => { setPayConfirm(false); handlePay(); }}
                disabled={paying}
                style={{ flex: 1, height: '40px', borderRadius: '8px', border: 'none', background: '#15803D', color: '#fff', cursor: 'pointer', fontSize: '14px', fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
                {paying ? '...' : '💳 Підтвердити оплату'}
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}
