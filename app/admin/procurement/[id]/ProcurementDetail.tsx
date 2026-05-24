'use client';

import { useState, useRef, useEffect } from 'react';
import { ArrowLeft, CheckCircle, Loader2, Package, FileText, Banknote, Truck, Plus, X, Upload, Download, Trash2, Copy, Check } from 'lucide-react';
import Link from 'next/link';

type Line = { id: number; sku: string; name?: string; brand?: string; qty: number; cost_price: number; supplier_id?: number; adj_delta?: number; effective_qty?: number; is_adj_new?: boolean };
type SupplierBank = {
  bank_iban: string | null; bank_name: string | null;
  legal_name: string | null; edrpou: string | null;
  payment_days: number;
};
type PO = {
  id: string; doc_number: string; doc_date: string; procurement_status: string | null;
  expected_date: string | null; supplier_id: number | null; supplier_name: string | null;
  supplier_email: string | null; order_id: string | null; total_cost: number | null;
  notes: string | null; has_receipt: boolean; receipt_id?: string | null; receipt_doc_number?: string | null; lc_done?: boolean;
  lc_lines?: { id: string; cost_type: string; description: string | null; amount: number; distributed: boolean }[];
  supplier_invoice_number: string | null; supplier_invoice_date: string | null;
  supplier_invoice_amount: number | null;
  supplier_bank: SupplierBank | null;
  lines: Line[];
  meta?: Record<string, unknown> | null;
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
  const [receiving,     setReceiving]     = useState(false);
  const [receiptNotes,  setReceiptNotes]  = useState('');
  const [actualQties,   setActualQties]   = useState<Record<string, number>>({});
  const [actualPrices,  setActualPrices]  = useState<Record<string, number>>({});
  const [importingFile, setImportingFile] = useState(false);
  const receiptFileRef = useRef<HTMLInputElement>(null);

  const [updatingStatus, setUpdatingStatus] = useState(false);
  const [newStatus,      setNewStatus]      = useState(po.procurement_status ?? '');

  const [invoiceNum,    setInvoiceNum]    = useState(po.supplier_invoice_number ?? '');
  const [invoiceDate,   setInvoiceDate]   = useState(po.supplier_invoice_date ?? '');
  const [invoiceAmt,    setInvoiceAmt]    = useState(String(po.supplier_invoice_amount ?? po.total_cost ?? ''));
  const [savingInvoice, setSavingInvoice] = useState(false);
  // noInvoice=true якщо постачальник підтвердив без рахунку (статус confirmed/received/paid і номер рахунку відсутній)
  const _hasInvoice          = !!po.supplier_invoice_number;
  const _isNoInvoiceConfirmed = !_hasInvoice && ['confirmed_by_supplier','invoiced','received','paid'].includes(po.procurement_status ?? '');
  const [noInvoice,     setNoInvoice]     = useState(_isNoInvoiceConfirmed);
  const [invoiceSaved,  setInvoiceSaved]  = useState(_hasInvoice || _isNoInvoiceConfirmed);
  const [editingInvoice,setEditingInvoice]= useState(!_hasInvoice && !_isNoInvoiceConfirmed);

  const [payAmount,    setPayAmount]    = useState(String(po.supplier_invoice_amount ?? po.total_cost ?? ''));
  const [payDate,      setPayDate]      = useState(new Date().toISOString().slice(0, 10));
  const payTermsDays = po.supplier_bank?.payment_days ?? 0;
  const [payDeferred,  setPayDeferred]  = useState(payTermsDays > 0);
  const [payConfirm,   setPayConfirm]   = useState(false);

  type PayMode = 'transfer' | 'deferred' | 'cash';
  const savedPayMode = (po.meta?.payment_mode as PayMode | undefined);
  const [payMode,       setPayMode]       = useState<PayMode>(
    savedPayMode ?? (payTermsDays > 0 ? 'deferred' : 'transfer')
  );
  const [copied,        setCopied]        = useState(false);
  const [copyingOrder,  setCopyingOrder]  = useState(false);

  function copyToNewDraft() {
    setCopyingOrder(true);
    try {
      window.dispatchEvent(new CustomEvent('open-po-draft', {
        detail: {
          suppliers: [{ id: po.supplier_id, name: po.supplier_name, email: po.supplier_email }],
          prefill: {
            // No dbId → creates a brand-new draft
            supplierId:   po.supplier_id,
            expectedDate: '',
            notes:        po.notes ? `Копія: ${po.notes}` : '',
            lines:        po.lines.map(l => ({ sku: l.sku, name: `${l.brand ?? ''} ${l.name ?? ''}`.trim(), qty: l.qty, cost_price: l.cost_price, matched: true })),
          },
        },
      }));
    } finally {
      setTimeout(() => setCopyingOrder(false), 800);
    }
  }
  const [editingIban,   setEditingIban]   = useState(false);
  const [ibanDraft,     setIbanDraft]     = useState({ iban: '', legal_name: '', edrpou: '', bank_name: '' });
  const [savingIban,    setSavingIban]    = useState(false);
  // Вважаємо оплату збереженою якщо: статус paid/invoiced/received АБО є збережений режим в meta
  const _paymentAlreadySet = ['paid', 'invoiced', 'received'].includes(po.procurement_status ?? '')
    || !!po.meta?.payment_mode;
  const [paymentSaved,  setPaymentSaved]  = useState(_paymentAlreadySet);
  const [editingPayment,setEditingPayment]= useState(!_paymentAlreadySet);
  const [deferDate2, setDeferDate2] = useState(() => {
    if (po.meta?.payment_defer_date) return po.meta.payment_defer_date as string;
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
  const [lcLines,     setLcLines]     = useState<CostLine[]>([{ cost_type: 'delivery', description: '', amount: '' }]);
  const [lcMethod,    setLcMethod]    = useState<'by_cost'|'by_qty'|'equal'>('by_cost');
  const [lcSaving,    setLcSaving]    = useState(false);
  const [lcDone,      setLcDone]      = useState(po.lc_done ?? false);
  const [showLcModal, setShowLcModal] = useState(false); // показується одразу після приходу

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

  // Зберігає landed cost одразу після приходу і перезавантажує сторінку
  async function handleLandedCostAndClose() {
    const costs = lcLines
      .map(l => ({ cost_type: l.cost_type, description: l.description || undefined, amount: parseFloat(l.amount) || 0 }))
      .filter(c => c.amount > 0);
    if (!costs.length) { window.location.reload(); return; }
    setLcSaving(true);
    try {
      const res = await fetch(`/api/admin/procurement/${po.id}/landed-cost`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ costs, method: lcMethod }),
      });
      if (!res.ok) {
        const d = await res.json();
        setError(d.error ?? 'Помилка розподілу витрат');
        return;
      }
    } catch { setError('Мережева помилка'); }
    finally { setLcSaving(false); }
    window.location.reload();
  }

  const [error,   setError]   = useState('');
  const [success, setSuccess] = useState('');

  const currentStepIdx = statusToStep(newStatus || po.procurement_status || '');

  async function handleReceive() {
    setReceiving(true); setError(''); setSuccess('');
    try {
      const res = await fetch(`/api/admin/procurement/${po.id}/receive`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          actualQties:  Object.keys(actualQties).length  ? actualQties  : undefined,
          actualPrices: Object.keys(actualPrices).length ? actualPrices : undefined,
          notes:        receiptNotes,
        }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? 'Помилка'); return; }
      // Замість перезавантаження — пропонуємо додати доп. витрати
      setShowLcModal(true);
    } catch { setError('Мережева помилка'); }
    finally { setReceiving(false); }
  }

  async function handleImportReceipt(file: File) {
    setImportingFile(true); setError('');
    try {
      const XLSX = await import('xlsx');
      const buf = await file.arrayBuffer();
      const wb  = XLSX.read(buf, { type: 'array' });
      const ws  = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json<Record<string, string | number>>(ws, { defval: '' }) as Record<string, string | number>[];

      const qties:  Record<string, number> = {};
      const prices: Record<string, number> = {};

      for (const row of rows) {
        // Автодетект колонок SKU, кількість, ціна
        const keys = Object.keys(row).map(k => k.toLowerCase().replace(/[\s_]/g, ''));
        const skuKey   = Object.keys(row).find((_, i) => ['sku','артикул','код','article'].includes(keys[i]));
        const qtyKey   = Object.keys(row).find((_, i) => ['qty','кількість','кол','количество','count'].includes(keys[i]));
        const priceKey = Object.keys(row).find((_, i) => ['ціна','price','цена','cost'].includes(keys[i]));

        const sku = skuKey ? String(row[skuKey]).trim() : '';
        if (!sku) continue;

        // Перевіряємо чи є цей SKU в замовленні
        const line = po.lines.find(l => l.sku === sku);
        if (!line) continue;

        if (qtyKey)   { const q = parseFloat(String(row[qtyKey]).replace(',','.')); if (q >= 0) qties[sku]  = q; }
        if (priceKey) { const p = parseFloat(String(row[priceKey]).replace(',','.')); if (p > 0) prices[sku] = p; }
      }

      if (Object.keys(qties).length === 0 && Object.keys(prices).length === 0) {
        setError('Не знайдено відповідних даних. Перевірте формат файлу (колонки: Артикул, Кількість, Ціна)');
        return;
      }

      setActualQties(prev => ({ ...prev, ...qties }));
      setActualPrices(prev => ({ ...prev, ...prices }));
      setSuccess(`✅ Імпортовано: ${Object.keys(qties).length} кількостей, ${Object.keys(prices).length} цін`);
    } catch (e) {
      setError('Помилка читання файлу: ' + (e instanceof Error ? e.message : String(e)));
    } finally { setImportingFile(false); }
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
      setNoInvoice(true);
      setInvoiceSaved(true);
      setEditingInvoice(false);
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
      setPaymentSaved(true);
      setEditingPayment(false);
    } catch { setError('Мережева помилка'); }
    finally { setPaying(false); }
  }

  const activeStatus = newStatus || po.procurement_status || '';

  // Попередній розрахунок LC для заголовка таблиці й підказки
  const lcTotal = (po.lc_lines ?? []).filter(l => l.distributed).reduce((s, l) => s + Number(l.amount), 0);
  const hasLC   = lcTotal > 0;

  return (
    <div style={{ padding: '28px 32px' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '20px' }}>
        <Link href="/admin/procurement" prefetch={false} style={{ display: 'flex', alignItems: 'center', color: 'var(--text-secondary)', textDecoration: 'none' }}><ArrowLeft size={16} /></Link>
        <div style={{ flex: 1 }}>
          <h1 style={{ fontSize: '20px', fontWeight: 800, color: 'var(--text-primary)', margin: 0 }}>{po.doc_number}</h1>
          <div style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
            {po.supplier_name} · {new Date(po.doc_date).toLocaleDateString('uk-UA')}
            {po.expected_date && ` · Очікуємо: ${new Date(po.expected_date).toLocaleDateString('uk-UA')}`}
          </div>
        </div>
        {chainButton}
        {po.receipt_id && (
          <Link href={`/admin/procurement/receipts/${po.receipt_id}`} prefetch={false}
            style={{ fontSize: '12px', color: '#15803D', textDecoration: 'none', background: '#F0FDF4', padding: '4px 12px', borderRadius: '6px', fontWeight: 600, border: '1px solid #BBF7D0', flexShrink: 0 }}>
            ↓ {po.receipt_doc_number ?? 'Прихідний ордер'}
          </Link>
        )}
        <button
          onClick={copyToNewDraft}
          disabled={copyingOrder}
          title="Копіювати в нове замовлення"
          style={{ display: 'flex', alignItems: 'center', gap: '6px', height: '34px', padding: '0 14px', borderRadius: '8px', border: '1px solid var(--border)', background: 'none', cursor: 'pointer', fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)', transition: 'all 0.15s', opacity: copyingOrder ? 0.6 : 1 }}>
          {copyingOrder ? <Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} /> : <Copy size={13} />}
          Копіювати
        </button>
        <Link href="/admin/procurement" prefetch={false} title="Закрити документ"
          style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '34px', height: '34px', borderRadius: '8px', border: '1px solid var(--border)', background: 'none', color: 'var(--text-secondary)', textDecoration: 'none', flexShrink: 0, transition: 'all 0.15s' }}>
          <X size={15} />
        </Link>
      </div>

      {/* Progress bar */}
      <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '12px', padding: '16px 20px', marginBottom: '20px' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0' }}>
          {STATUS_STEPS.map((step, i) => {
            const done   = currentStepIdx >= i;
            const active = currentStepIdx === i;
            return (
              <div key={step.key} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', position: 'relative' }}>
                {i > 0 && <div style={{ position: 'absolute', left: '-50%', top: '14px', width: '100%', height: '2px', background: done ? 'var(--brand-blue)' : 'var(--border)', zIndex: 0 }} />}
                <div style={{ width: '28px', height: '28px', borderRadius: '50%', background: done ? 'var(--brand-blue)' : 'var(--bg-soft)', border: `2px solid ${done ? 'var(--brand-blue)' : 'var(--border)'}`, display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1, position: 'relative' }}>
                  {done ? <CheckCircle size={14} color="#fff" /> : <span style={{ fontSize: '10px', color: 'var(--text-secondary)' }}>{i + 1}</span>}
                </div>
                <div style={{ fontSize: '10px', fontWeight: active ? 700 : 400, color: done ? 'var(--brand-blue)' : 'var(--text-muted)', marginTop: '4px', textAlign: 'center', maxWidth: '80px' }}>
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
            {/* Заголовок таблиці
                has_receipt=false : Арт | Назва | Замовл. | Отримано | Ціна факт. | Ціна PO | Різниця | Сума  = 8 cols
                has_receipt=true  : Арт | Назва | Замовл. | Ціна PO | Сума                              = 5 cols
            */}
            <div style={{ display: 'grid', gridTemplateColumns: po.has_receipt ? '110px minmax(0,1fr) 80px 110px 100px' : '110px minmax(0,1fr) 60px 75px 90px 90px 60px 90px', padding: '8px 16px', background: 'var(--bg-soft)', fontSize: '11px', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.04em', gap: '8px', borderBottom: '1px solid var(--border)' }}>
              <span>Артикул</span>
              <span>Найменування</span>
              <span style={{ textAlign: 'right' }}>Замовлено</span>
              {!po.has_receipt && <span style={{ textAlign: 'right', color: '#1E3A5F' }}>Отримано ↓</span>}
              {!po.has_receipt && <span style={{ textAlign: 'right', color: '#1E3A5F' }}>Ціна факт. ↓</span>}
              <span style={{ textAlign: 'right' }}>Ціна PO</span>
              {!po.has_receipt && <span style={{ textAlign: 'right' }}>Різниця</span>}
              <span style={{ textAlign: 'right' }}>{po.has_receipt && hasLC ? 'Сума *' : 'Сума'}</span>
            </div>

            {po.lines.map(line => {
              const actualQty   = actualQties[line.sku];
              const actualPrice = actualPrices[line.sku];
              // effQty = кількість з урахуванням коригування (для нових adj-позицій = adj_delta)
              const effQty      = line.effective_qty ?? line.qty;
              const diff        = actualQty !== undefined ? actualQty - effQty : 0;
              const diffColor   = diff < 0 ? '#EF4444' : diff > 0 ? '#15803D' : 'var(--text-muted)';
              const displayPrice = actualPrice ?? line.cost_price ?? 0;
              const displayQty   = actualQty ?? effQty;   // використовуємо effQty, не line.qty

              const isNew = line.is_adj_new;
              return (
                <div key={line.id} style={{ display: 'grid', gridTemplateColumns: po.has_receipt ? '110px minmax(0,1fr) 80px 110px 100px' : '110px minmax(0,1fr) 60px 75px 90px 90px 60px 90px', padding: '9px 16px', alignItems: 'center', borderTop: '1px solid var(--border-light)', gap: '8px', background: isNew ? 'rgba(21,128,61,0.05)' : diff < 0 ? '#FFF5F5' : 'transparent' }}>
                  <span style={{ fontFamily: 'monospace', fontSize: '11px', color: 'var(--text-primary)', fontWeight: 600 }}>{line.sku}</span>
                  <div style={{ overflow: 'hidden', minWidth: 0 }} title={`${line.brand ?? ''} ${line.name ?? ''}`}>
                    <div style={{ fontSize: '12px', color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {line.name || '—'}
                    </div>
                    {line.brand && <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '1px' }}>{line.brand}</div>}
                  </div>

                  {/* Замовлено (з коригуванням) */}
                  <div style={{ textAlign: 'right' }}>
                    {isNew ? (
                      // Позиція додана через коригування — показуємо тільки ефективну кількість
                      <div style={{ fontSize: '11px', fontWeight: 700, color: '#15803D', background: '#F0FDF4', padding: '2px 6px', borderRadius: '4px', display: 'inline-block' }}>
                        +{line.adj_delta} додано
                      </div>
                    ) : (line.adj_delta ?? 0) !== 0 ? (
                      // Є коригування: показуємо оригінал → ефективна
                      <>
                        <div style={{ fontSize: '13px', fontWeight: 600 }}>
                          {line.qty} шт
                        </div>
                        <div style={{ fontSize: '10px', color: (line.adj_delta ?? 0) < 0 ? '#EF4444' : '#15803D', whiteSpace: 'nowrap' }}>
                          → {line.effective_qty ?? line.qty} ({line.adj_delta! > 0 ? '+' : ''}{line.adj_delta})
                        </div>
                      </>
                    ) : (
                      // Без коригувань — звичайна кількість
                      <div style={{ fontSize: '13px', fontWeight: 600 }}>
                        {line.qty} шт
                      </div>
                    )}
                  </div>

                  {/* Отримано (input) */}
                  {!po.has_receipt && (
                    <input type="number" min="0" step="1"
                      placeholder={String(line.effective_qty ?? line.qty)}
                      value={actualQties[line.sku] ?? ''}
                      onChange={e => setActualQties(prev => ({ ...prev, [line.sku]: parseFloat(e.target.value) }))}
                      style={{ textAlign: 'right', height: '24px', fontSize: '12px', padding: '0 6px', border: `1.5px solid ${diff < 0 ? '#EF4444' : 'var(--border)'}`, borderRadius: '6px', outline: 'none', width: '100%', background: 'var(--bg-soft)', color: 'var(--text-primary)' }} />
                  )}

                  {/* Ціна фактична (input) */}
                  {!po.has_receipt && (
                    <input type="number" min="0" step="0.01"
                      placeholder={line.cost_price ? String(line.cost_price) : '0'}
                      value={actualPrices[line.sku] ?? ''}
                      onChange={e => setActualPrices(prev => ({ ...prev, [line.sku]: parseFloat(e.target.value) }))}
                      style={{ textAlign: 'right', height: '24px', fontSize: '12px', padding: '0 6px', border: '1.5px solid var(--border)', borderRadius: '6px', outline: 'none', width: '100%', background: 'var(--bg-soft)', color: 'var(--text-primary)' }} />
                  )}

                  {/* Ціна PO */}
                  <span style={{ textAlign: 'right', fontSize: '12px', color: 'var(--text-muted)' }}>
                    {line.cost_price ? `${fmt(line.cost_price)} ₴` : '—'}
                  </span>

                  {/* Різниця */}
                  {!po.has_receipt && (
                    <span style={{ textAlign: 'right', fontSize: '12px', fontWeight: 600, color: diffColor }}>
                      {actualQty !== undefined ? (diff > 0 ? `+${diff}` : diff === 0 ? '✓' : String(diff)) : '—'}
                    </span>
                  )}

                  {/* Сума */}
                  <span style={{ textAlign: 'right', fontSize: '12px', fontWeight: 600 }}>
                    {displayPrice > 0 ? (
                      effQty === 0 ? (
                        // Позиція знята коригуванням — 0 з перекресленим оригіналом
                        <span style={{ color: '#94A3B8' }}>
                          <span style={{ textDecoration: 'line-through', fontSize: '10px', marginRight: '3px' }}>
                            {fmt(displayPrice * line.qty)} ₴
                          </span>
                          0 ₴
                        </span>
                      ) : (
                        `${fmt(displayPrice * displayQty)} ₴`
                      )
                    ) : '—'}
                  </span>
                </div>
              );
            })}
            {(() => {
              const originalTotal = Number(po.total_cost ?? 0);
              const adjustedTotal = po.lines.reduce((s, l) => {
                const effQty = l.effective_qty ?? l.qty;
                return s + effQty * (l.cost_price ?? 0);
              }, 0);
              const lcTotal = (po.lc_lines ?? [])
                .filter(l => l.distributed)
                .reduce((s, l) => s + Number(l.amount), 0);
              const hasAdj   = po.lines.some(l => (l.adj_delta ?? 0) !== 0);
              const hasLC    = lcTotal > 0;
              const adjDiff  = adjustedTotal - originalTotal;
              const grandTotal = adjustedTotal + lcTotal;

              return (
                <div style={{ padding: '11px 20px', borderTop: '2px solid var(--border)', background: hasAdj || hasLC ? 'var(--bg-soft)' : undefined }}>
                  {(hasAdj || hasLC) ? (
                    <>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: 'var(--text-muted)', marginBottom: '3px' }}>
                        <span>До коригування</span>
                        <span>{fmt(originalTotal)} ₴</span>
                      </div>
                      {hasAdj && (
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: 'var(--text-muted)', marginBottom: '3px' }}>
                          <span>З урахуванням к-к</span>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            {adjDiff !== 0 && <span style={{ color: adjDiff < 0 ? '#EF4444' : '#15803D', fontWeight: 600 }}>{adjDiff > 0 ? '+' : ''}{fmt(adjDiff)} ₴</span>}
                            <span>{fmt(adjustedTotal)} ₴</span>
                          </div>
                        </div>
                      )}
                      {hasLC && (
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: 'var(--text-muted)', marginBottom: '3px' }}>
                          <span>Доп. витрати (Landed Cost)</span>
                          <span style={{ color: '#7C3AED', fontWeight: 600 }}>+{fmt(lcTotal)} ₴</span>
                        </div>
                      )}
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '14px', fontWeight: 800, color: 'var(--text-primary)', borderTop: '1px solid var(--border)', paddingTop: '6px', marginTop: '4px' }}>
                        <span>Загальна сума</span>
                        <span>{fmt(grandTotal)} ₴</span>
                      </div>
                    </>
                  ) : (
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '14px', fontWeight: 700 }}>
                      <span>Всього</span>
                      <span>{fmt(originalTotal)} ₴</span>
                    </div>
                  )}
                </div>
              );
            })()}
            {/* Примітка про Landed Cost */}
            {po.has_receipt && hasLC && (
              <div style={{ padding: '8px 16px', borderTop: '1px solid #EDE9FE', background: '#F5F3FF', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', color: '#7C3AED' }}>
                <span style={{ fontSize: '13px' }}>ℹ</span>
                <span>* Ціни в таблиці — базові (без урахування доп. витрат). Landed Cost <strong>{fmt(lcTotal)} ₴</strong> вже розподілено по FIFO-партіях і включено в собівартість товарів.</span>
              </div>
            )}
          </div>

          {/* Receive block */}
          {!po.has_receipt && (
            <div style={{ background: 'var(--bg-card)', border: '2px solid #BFDBFE', borderRadius: '12px', padding: '16px' }}>
              <div style={{ fontSize: '13px', fontWeight: 800, color: '#1E3A5F', marginBottom: '12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: '7px' }}><Truck size={15} /> Оформлення приходу</span>
                <button onClick={() => receiptFileRef.current?.click()} disabled={importingFile}
                  style={{ display: 'flex', alignItems: 'center', gap: '5px', height: '28px', padding: '0 10px', borderRadius: '6px', border: '1px solid #BFDBFE', background: '#EFF4FF', color: '#1E3A5F', fontSize: '11px', fontWeight: 700, cursor: 'pointer' }}>
                  {importingFile ? <Loader2 size={11} style={{ animation: 'spin 1s linear infinite' }} /> : <Upload size={11} />}
                  Імпорт з Excel
                </button>
                <input ref={receiptFileRef} type="file" accept=".xlsx,.xls,.csv" style={{ display: 'none' }}
                  onChange={e => { const f = e.target.files?.[0]; if (f) handleImportReceipt(f); e.target.value = ''; }} />
              </div>

              <div style={{ fontSize: '12px', color: '#1E3A5F', background: '#EFF4FF', padding: '8px 12px', borderRadius: '8px', marginBottom: '12px' }}>
                📋 Заповніть <strong>"Отримано"</strong> і <strong>"Ціна факт."</strong> у таблиці вище якщо є розходження. Порожнє = як в замовленні.
              </div>

              {Object.keys(actualQties).some(sku => actualQties[sku] !== po.lines.find(l => l.sku === sku)?.qty) && (
                <div style={{ marginBottom: '10px', padding: '8px 12px', background: '#FEF3C7', borderRadius: '8px', fontSize: '12px', color: '#92400E' }}>
                  ⚠ Є розходження по {Object.keys(actualQties).filter(sku => actualQties[sku] !== po.lines.find(l => l.sku === sku)?.qty).length} позиціях
                </div>
              )}

              <div style={{ marginBottom: '10px' }}>
                <label style={lbl}>Нотатки до приходу</label>
                <input style={inp} value={receiptNotes} onChange={e => setReceiptNotes(e.target.value)} placeholder="Все відповідно, отримано без зауважень" />
              </div>

              <button onClick={handleReceive} disabled={receiving}
                style={{ width: '100%', height: '40px', borderRadius: '8px', border: 'none', background: '#1E3A5F', color: '#fff', fontSize: '13px', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', opacity: receiving ? 0.7 : 1 }}>
                {receiving ? <><Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} />Оформлюємо...</> : <><Package size={14} />Оформити прихід на склад (FIFO)</>}
              </button>
            </div>
          )}
        </div>

        {/* Right: Actions */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>


          {/* Invoice — компактний після приходу */}
          <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '12px', padding: po.has_receipt ? '12px 16px' : '16px' }}>
            <div style={{ fontSize: po.has_receipt ? '12px' : '13px', fontWeight: 700, color: po.has_receipt ? 'var(--text-muted)' : 'var(--text-primary)', marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '7px' }}>
              <FileText size={14} /> Рахунок-фактура
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {invoiceSaved && !editingInvoice ? (
                /* ── Режим перегляду: все заблоковано ── */
                <>
                  {noInvoice ? (
                    /* Підтверджено без рахунку */
                    <div style={{ padding: '10px 14px', background: 'var(--bg-soft)', borderRadius: '8px', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ fontSize: '16px' }}>✓</span>
                      <span style={{ fontSize: '13px', color: 'var(--text-muted)', fontWeight: 500 }}>
                        Постачальник не виставляє рахунок-фактуру
                      </span>
                    </div>
                  ) : (
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
                    </>
                  )}

                  <button onClick={() => { setEditingInvoice(true); setNoInvoice(false); }}
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
                        style={{ width: '100%', height: '38px', borderRadius: '8px', border: 'none', background: uploadingInvoice ? '#CBD5E1' : '#EA580C', cursor: uploadingInvoice ? 'default' : 'pointer', fontSize: '12px', color: '#fff', fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', boxShadow: uploadingInvoice ? 'none' : '0 2px 8px rgba(234,88,12,0.35)', transition: 'background 0.15s' }}>
                        {uploadingInvoice ? <><Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} /> Завантаження...</> : <><Upload size={14} /> Завантажити рахунок</>}
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

          {/* Payment */}
          <div style={{ background: 'var(--bg-card)', border: `1px solid ${activeStatus === 'paid' ? '#86EFAC' : 'var(--border)'}`, borderRadius: '12px', padding: '12px 16px' }}>
            <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '7px' }}>
              <Banknote size={14} /> Оплата постачальнику
            </div>

            {/* Supplier bank details — тільки для банківського переказу */}
            {payMode === 'transfer' && po.supplier_bank?.bank_iban && (
              <div style={{ padding: '8px 12px', background: 'var(--bg-soft)', borderRadius: '8px', marginBottom: '12px', fontSize: '12px', color: 'var(--text-secondary)' }}>
                <div style={{ fontWeight: 600, color: 'var(--text-primary)', marginBottom: '3px' }}>{po.supplier_bank.legal_name ?? po.supplier_name}</div>
                {po.supplier_bank.edrpou && <div>ЄДРПОУ: {po.supplier_bank.edrpou}</div>}
                <div style={{ fontFamily: 'monospace', fontSize: '11px', marginTop: '2px' }}>{po.supplier_bank.bank_iban}</div>
                {po.supplier_bank.bank_name && <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{po.supplier_bank.bank_name}</div>}
              </div>
            )}
            {!po.supplier_bank?.bank_iban && payMode === 'transfer' && (
              <div style={{ padding: '8px 12px', background: '#FEF3C7', borderRadius: '8px', marginBottom: '12px', fontSize: '12px', color: '#92400E' }}>
                ⚠ Реквізити не заповнені. Додайте IBAN у картці постачальника.
              </div>
            )}

            {activeStatus === 'paid' ? (
              <div style={{ padding: '10px 12px', background: '#F0FDF4', borderRadius: '8px', fontSize: '13px', color: '#15803D', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '6px' }}>
                <CheckCircle size={16} /> Оплачено
              </div>
            ) : paymentSaved && !editingPayment ? (
              /* ── Режим перегляду оплати ── */
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <div style={{ padding: '10px 12px', background: 'var(--bg-soft)', borderRadius: '8px', fontSize: '13px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <div><span style={{ color: 'var(--text-muted)', fontSize: '11px' }}>Спосіб: </span>
                    <strong>{payMode === 'transfer' ? '🏦 Банківський переказ' : payMode === 'deferred' ? '📅 Відстрочка' : '💵 Готівка'}</strong>
                  </div>
                  {payAmount && <div><span style={{ color: 'var(--text-muted)', fontSize: '11px' }}>Сума: </span>
                    <strong style={{ color: '#15803D' }}>{Number(payAmount).toLocaleString('uk-UA', { minimumFractionDigits: 2 })} ₴</strong>
                  </div>}
                  {payMode === 'deferred'
                    ? <div><span style={{ color: 'var(--text-muted)', fontSize: '11px' }}>Оплатити до: </span><strong>{new Date(deferDate2).toLocaleDateString('uk-UA')}</strong></div>
                    : payDate && <div><span style={{ color: 'var(--text-muted)', fontSize: '11px' }}>Дата оплати: </span><strong>{new Date(payDate).toLocaleDateString('uk-UA')}</strong></div>
                  }
                </div>
                <button onClick={() => setEditingPayment(true)}
                  style={{ height: '32px', borderRadius: '8px', border: '1px solid var(--border)', background: 'none', color: 'var(--text-secondary)', fontSize: '12px', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '5px' }}>
                  ✏️ Редагувати
                </button>
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
                    <button onClick={async () => {
                        if (!payAmount || parseFloat(payAmount) <= 0) { setError('Вкажіть суму'); return; }
                        setUpdatingStatus(true); setError('');
                        try {
                          const res = await fetch(`/api/admin/procurement/${po.id}/status`, {
                            method: 'PATCH', headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                              procurement_status:      'invoiced',
                              supplier_invoice_amount: parseFloat(payAmount),
                              payment_defer_date:      deferDate2,
                              payment_mode:            'deferred',
                            }),
                          });
                          if (res.ok) {
                            setSuccess(`✅ Відстрочку зафіксовано до ${new Date(deferDate2).toLocaleDateString('uk-UA')}`);
                            setPaymentSaved(true);
                            setEditingPayment(false);
                          }
                          setNewStatus('invoiced');
                        } catch { setError('Помилка'); }
                        finally { setUpdatingStatus(false); }
                      }}
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

              {/* Кнопка "Скасувати" при редагуванні */}
              {paymentSaved && editingPayment && (
                <button onClick={() => setEditingPayment(false)}
                  style={{ height: '32px', borderRadius: '8px', border: '1px solid var(--border)', background: 'none', color: 'var(--text-muted)', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}>
                  Скасувати редагування
                </button>
              )}

              </div>
            )}
          </div>

          {/* ── Landed Cost — третім, після рахунку та оплати ── */}
          {po.has_receipt && (
            <div style={{ background: 'var(--bg-card)', border: `2px solid ${lcDone ? '#86EFAC' : '#DDD6FE'}`, borderRadius: '12px', padding: '16px' }}>
              <div style={{ fontSize: '13px', fontWeight: 800, color: lcDone ? '#15803D' : '#7C3AED', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '7px' }}>
                <Package size={15} /> Додаткові витрати (Landed Cost)
                <span style={{ fontSize: '11px', fontWeight: 400, color: 'var(--text-muted)', marginLeft: 'auto' }}>розподіл по FIFO</span>
              </div>
              {/* Вже розподілені витрати */}
              {lcDone && (po.lc_lines ?? []).length > 0 && (() => {
                const distributed = (po.lc_lines ?? []).filter(l => l.distributed);
                const total = distributed.reduce((s, l) => s + Number(l.amount), 0);
                const COST_LABELS: Record<string, string> = {
                  delivery: '🚚 Доставка', loading: '📦 Навант./розвант.',
                  customs: '🏛 Мито/брокер', packaging: '📦 Пакування', other: '➕ Інше',
                };
                return (
                  <div style={{ marginBottom: '12px', padding: '10px 12px', background: '#F0FDF4', borderRadius: '8px', border: '1px solid #BBF7D0' }}>
                    <div style={{ fontSize: '11px', fontWeight: 700, color: '#15803D', textTransform: 'uppercase', marginBottom: '8px' }}>
                      ✅ Вже розподілено по FIFO:
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      {distributed.map(l => (
                        <div key={l.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px' }}>
                          <span style={{ color: 'var(--text-secondary)' }}>
                            {COST_LABELS[l.cost_type] ?? l.cost_type}
                            {l.description && ` · ${l.description}`}
                          </span>
                          <span style={{ fontWeight: 700, color: '#7C3AED' }}>+{total === 0 ? '—' : Number(l.amount).toLocaleString('uk-UA', { minimumFractionDigits: 2 })} ₴</span>
                        </div>
                      ))}
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', fontWeight: 800, borderTop: '1px solid #BBF7D0', paddingTop: '6px', marginTop: '6px', color: '#7C3AED' }}>
                      <span>Разом Landed Cost:</span>
                      <span>+{total.toLocaleString('uk-UA', { minimumFractionDigits: 2 })} ₴</span>
                    </div>
                  </div>
                );
              })()}

              {/* Форма для нових витрат */}
              <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '8px' }}>
                {lcDone ? '+ Додати ще витрати:' : 'Ввести витрати:'}
              </div>
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
                  <button onClick={addLcLine} style={{ fontSize: '12px', color: '#7C3AED', background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px', fontWeight: 600, marginBottom: '8px' }}>
                    <Plus size={12} /> Додати рядок
                  </button>
                  <div style={{ marginBottom: '8px' }}>
                    <label style={{ ...lbl, marginBottom: '4px' }}>Метод розподілу</label>
                    <div style={{ display: 'flex', gap: '4px' }}>
                      {(['by_cost','by_qty','equal'] as const).map(m => (
                        <button key={m} onClick={() => setLcMethod(m)}
                          style={{ flex: 1, height: '28px', borderRadius: '6px', fontSize: '11px', fontWeight: 600, cursor: 'pointer', border: `1px solid ${lcMethod === m ? '#7C3AED' : 'var(--border)'}`, background: lcMethod === m ? '#F5F3FF' : 'var(--bg-soft)', color: lcMethod === m ? '#7C3AED' : 'var(--text-muted)' }}>
                          {m === 'by_cost' ? 'За вартістю' : m === 'by_qty' ? 'По кількості' : 'Порівну'}
                        </button>
                      ))}
                    </div>
                  </div>
                  <button onClick={handleLandedCost} disabled={lcSaving}
                    style={{ width: '100%', height: '36px', borderRadius: '8px', border: 'none', background: '#7C3AED', color: '#fff', fontSize: '13px', fontWeight: 700, cursor: 'pointer', opacity: lcSaving ? 0.7 : 1 }}>
                    {lcSaving ? '...' : lcDone ? '➕ Додати ще витрати по FIFO' : '📊 Розподілити витрати по FIFO'}
                  </button>
              </>
            </div>
          )}

        </div>
      </div>
      {/* ─── Модаль доп. витрат після оформлення приходу ─── */}
      {showLcModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 3000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}>
          <div style={{ background: 'var(--bg-card)', borderRadius: '16px', width: '100%', maxWidth: '520px', boxShadow: '0 24px 80px rgba(0,0,0,0.3)', display: 'flex', flexDirection: 'column', maxHeight: '90vh' }}>

            {/* Header */}
            <div style={{ padding: '20px 24px 16px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
              <div style={{ fontSize: '20px', marginBottom: '4px' }}>✅</div>
              <div style={{ fontSize: '16px', fontWeight: 800, color: 'var(--text-primary)', marginBottom: '4px' }}>
                Прихід оформлено успішно!
              </div>
              <div style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
                Бажаєте додати додаткові витрати (доставка, мито, розвантаження) для розподілу по FIFO?
              </div>
            </div>

            {/* Body */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '16px 24px', display: 'flex', flexDirection: 'column', gap: '10px' }}>

              {/* Рядки витрат */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {lcLines.map((line, i) => (
                  <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 130px auto', gap: '6px', alignItems: 'center' }}>
                    <select value={line.cost_type} onChange={e => setLcField(i, 'cost_type', e.target.value)}
                      style={{ ...inp, cursor: 'pointer', fontSize: '13px' }}>
                      {COST_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                    </select>
                    <div style={{ position: 'relative' }}>
                      <input style={{ ...inp, fontSize: '13px', paddingRight: '24px' }}
                        type="number" min="0" step="0.01"
                        placeholder="Сума, ₴"
                        value={line.amount}
                        onChange={e => setLcField(i, 'amount', e.target.value)} />
                      <span style={{ position: 'absolute', right: '8px', top: '50%', transform: 'translateY(-50%)', fontSize: '11px', color: 'var(--text-muted)', pointerEvents: 'none' }}>₴</span>
                    </div>
                    {lcLines.length > 1 ? (
                      <button onClick={() => removeLcLine(i)}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#EF4444', padding: '0 4px', display: 'flex' }}>
                        <X size={15} />
                      </button>
                    ) : <span style={{ width: '23px' }} />}
                  </div>
                ))}
              </div>

              <button onClick={addLcLine}
                style={{ fontSize: '12px', color: '#7C3AED', background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px', fontWeight: 600, alignSelf: 'flex-start' }}>
                <Plus size={12} /> Додати рядок
              </button>

              {/* Метод розподілу */}
              <div>
                <label style={{ ...lbl, marginBottom: '5px' }}>Метод розподілу по FIFO</label>
                <div style={{ display: 'flex', gap: '6px' }}>
                  {(['by_cost','by_qty','equal'] as const).map(m => (
                    <button key={m} onClick={() => setLcMethod(m)}
                      style={{ flex: 1, height: '32px', borderRadius: '7px', fontSize: '12px', fontWeight: 600, cursor: 'pointer', border: `1.5px solid ${lcMethod === m ? '#7C3AED' : 'var(--border)'}`, background: lcMethod === m ? '#F5F3FF' : 'var(--bg-soft)', color: lcMethod === m ? '#7C3AED' : 'var(--text-muted)' }}>
                      {m === 'by_cost' ? '💰 За вартістю' : m === 'by_qty' ? '📦 По к-сті' : '⚖ Порівну'}
                    </button>
                  ))}
                </div>
              </div>

              {error && (
                <div style={{ padding: '8px 12px', background: '#FEF2F2', borderRadius: '8px', fontSize: '12px', color: '#DC2626' }}>{error}</div>
              )}
            </div>

            {/* Footer */}
            <div style={{ padding: '14px 24px', borderTop: '1px solid var(--border)', display: 'flex', gap: '8px', flexShrink: 0 }}>
              <button
                onClick={() => { setShowLcModal(false); window.location.reload(); }}
                style={{ flex: 1, height: '40px', borderRadius: '8px', border: '1.5px solid var(--border)', background: 'none', cursor: 'pointer', fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary)' }}>
                Пропустити
              </button>
              <button
                onClick={handleLandedCostAndClose}
                disabled={lcSaving}
                style={{ flex: 2, height: '40px', borderRadius: '8px', border: 'none', background: '#7C3AED', color: '#fff', cursor: 'pointer', fontSize: '13px', fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '7px', opacity: lcSaving ? 0.7 : 1 }}>
                {lcSaving
                  ? <><Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> Розподіляємо...</>
                  : <><Package size={14} /> Розподілити та закрити</>}
              </button>
            </div>
          </div>
        </div>
      )}

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
