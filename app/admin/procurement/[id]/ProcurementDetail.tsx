'use client';

import { useState, useRef, useEffect } from 'react';
import { showToast } from '../../../../lib/toast';
import { ArrowLeft, CheckCircle, Loader2, Package, FileText, Banknote, X, Upload, Download, Trash2, Copy, Check, MoreHorizontal, Printer, Send, Mail } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

type Line = { id: number; sku: string; name?: string; brand?: string; qty: number; cost_price: number; supplier_id?: number; adj_delta?: number; effective_qty?: number; is_adj_new?: boolean };
type ContactEntry = { name: string; email: string; note?: string };
type SupplierBank = {
  bank_iban: string | null; bank_name: string | null;
  legal_name: string | null; edrpou: string | null;
  payment_days: number;
};
type PO = {
  id: string; doc_number: string; doc_date: string; procurement_status: string | null;
  status?: string | null;
  email_sent_at?: string | null;
  expected_date: string | null; supplier_id: number | null; supplier_name: string | null;
  supplier_email: string | null; order_id: string | null; total_cost: number | null;
  notes: string | null; has_receipt: boolean; receipt_id?: string | null; receipt_doc_number?: string | null;
  supplier_invoice_number: string | null; supplier_invoice_date: string | null;
  supplier_invoice_amount: number | null;
  supplier_bank: SupplierBank | null;
  warehouse_id?: number | null;
  lines: Line[];
  meta?: Record<string, unknown> | null;
  draft_receipt_id?: string | null;
  draft_receipt_lines?: { sku: string; qty: number; cost_price: number; price: number }[];
};

// 4 кроки хронології PO
const STATUS_STEPS = [
  { key: 'ordered',               label: 'Проведено',                  icon: '📋' },
  { key: 'sent',                  label: 'Відправлено постачальнику',   icon: '📤' },
  { key: 'confirmed_by_supplier', label: 'Очікуємо підтвердження',     icon: '⏳' },
  { key: 'received',              label: 'Товар отримано',              icon: '📦' },
];

// Маппінг всіх статусів на індекс кроку в прогрес-барі
function statusToStep(status: string): number {
  if (['received', 'partially_received'].includes(status))    return 3;
  if (status === 'confirmed_by_supplier')                     return 2;
  if (status === 'sent')                                      return 1;
  return 0; // 'ordered', '', null, 'paid', 'invoiced' → "Проведено"
}

const inp: React.CSSProperties = { height: '36px', padding: '0 10px', border: '1.5px solid var(--border)', borderRadius: '8px', fontSize: '13px', outline: 'none', color: 'var(--text-primary)', background: 'var(--bg-soft)', width: '100%' };
const lbl: React.CSSProperties = { fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', display: 'block', marginBottom: '4px', textTransform: 'uppercase' };

function fmt(n: number) { return n.toLocaleString('uk-UA', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }

type CustomerOrder = { order_number: number; contact: string | null; company: string | null; status: string; total_price: number | null } | null;
type ActivityEvent = { icon: string; label: string; detail?: string; date: string | null; isDatetime: boolean };
type PaymentHistoryEntry = { created_at: string; amount: number; payment_mode: string | null; doc_type: string };

export default function ProcurementDetail({ po, chainButton, adjustmentButton, onClose, compact, customerOrder, events, paymentHistory, totalPaid }: { po: PO; chainButton?: React.ReactNode; adjustmentButton?: React.ReactNode; onClose?: () => void; compact?: boolean; customerOrder?: CustomerOrder; events?: ActivityEvent[]; paymentHistory?: PaymentHistoryEntry[]; totalPaid?: number }) {
  const router = useRouter();

  function goToList() {
    router.refresh();
    router.push('/admin/procurement');
  }

  // Extract invoice number and date from 1C-style filename, e.g.
  // "Реализация товаров и услуг № ХТАП0617011 от 17 июня 2026.XLS"
  function extractInvoiceMeta(file: File): { number: string; date: string } {
    const baseName = file.name.replace(/\.\w+$/, '');
    const numMatch = baseName.match(/№\s*(\S+)/);
    const invoiceNumber = numMatch ? numMatch[1] : '';
    const RU_MONTHS: Record<string, string> = {
      'янв': '01', 'фев': '02', 'мар': '03', 'апр': '04', 'май': '05', 'мая': '05',
      'июн': '06', 'июл': '07', 'авг': '08', 'сен': '09', 'окт': '10', 'ноя': '11', 'дек': '12',
      'січ': '01', 'лют': '02', 'бер': '03', 'кві': '04', 'тра': '05',
      'чер': '06', 'лип': '07', 'сер': '08', 'вер': '09', 'жов': '10', 'лис': '11', 'гру': '12',
    };
    const dateMatch = baseName.match(/(\d{1,2})\s+([а-яёА-ЯЁіїєІЇЄ]+)\s+(\d{4})/i);
    let invoiceDate = '';
    if (dateMatch) {
      const day = dateMatch[1].padStart(2, '0');
      const monthWord = dateMatch[2].toLowerCase().slice(0, 3);
      const year = dateMatch[3];
      const monthNum = RU_MONTHS[monthWord];
      if (monthNum) invoiceDate = `${year}-${monthNum}-${day}`;
    }
    return { number: invoiceNumber, date: invoiceDate };
  }


  const [updatingStatus, setUpdatingStatus] = useState(false);
  // Статус доставки — не включає стани оплати ('paid'/'invoiced')
  const _deliveryStatus = ['paid', 'invoiced'].includes(po.procurement_status ?? '')
    ? ((po.meta?.pre_payment_status as string) ?? '')
    : (po.procurement_status ?? '');
  const [newStatus, setNewStatus] = useState(_deliveryStatus);

  // Оплата — окремий стан, не впливає на прогрес-бар доставки
  const [isPaid,      setIsPaid]      = useState(po.procurement_status === 'paid'     || po.meta?.is_paid === true);
  const [isInvoiced,  setIsInvoiced]  = useState(po.procurement_status === 'invoiced' || po.meta?.payment_status === 'invoiced');

  const [expectedDate,     setExpectedDate]     = useState(po.expected_date ?? '');
  const [editingExpDate,   setEditingExpDate]   = useState(false);
  const [savingExpDate,    setSavingExpDate]    = useState(false);

  const [invoiceNum,    setInvoiceNum]    = useState(po.supplier_invoice_number ?? '');
  const [invoiceDate,   setInvoiceDate]   = useState(po.supplier_invoice_date ?? '');
  const [invoiceAmt,    setInvoiceAmt]    = useState(String(po.supplier_invoice_amount ?? po.total_cost ?? ''));
  const [savingInvoice, setSavingInvoice] = useState(false);
  // noInvoice=true якщо постачальник підтвердив без рахунку (статус confirmed/received/paid і номер рахунку відсутній)
  const _hasInvoice          = !!po.supplier_invoice_number;
  const _hasInvoiceFile      = !!(po.meta?.invoice_file_path);
  const _isNoInvoiceConfirmed = !_hasInvoice && !_hasInvoiceFile && ['confirmed_by_supplier','invoiced','received','paid'].includes(po.procurement_status ?? '');
  const [noInvoice,     setNoInvoice]     = useState(_isNoInvoiceConfirmed);
  const [invoiceSaved,  setInvoiceSaved]  = useState(_hasInvoice || _isNoInvoiceConfirmed);
  const [editingInvoice,setEditingInvoice]= useState(!_hasInvoice && !_isNoInvoiceConfirmed);

  const [payAmount,    setPayAmount]    = useState(String(po.supplier_invoice_amount ?? po.total_cost ?? ''));
  const [payDate,      setPayDate]      = useState(new Date().toISOString().slice(0, 10));
  const payTermsDays = po.supplier_bank?.payment_days ?? 0;

  type PayMode = 'transfer' | 'deferred' | 'cash';
  const savedPayMode = (po.meta?.payment_mode as PayMode | undefined);
  function payIcon(mode: PayMode | undefined) {
    if (mode === 'cash')     return '💵';
    if (mode === 'transfer') return '🏦';
    if (mode === 'deferred') return '📅';
    return '💳'; // fallback для старих записів без meta.payment_mode
  }
  const [payMode,       setPayMode]       = useState<PayMode>(
    savedPayMode ?? (payTermsDays > 0 ? 'deferred' : 'transfer')
  );
  const [copied,        setCopied]        = useState(false);
  const [copyingOrder,    setCopyingOrder]    = useState(false);
  const [showActionsMenu, setShowActionsMenu] = useState(false);
  const actionsMenuRef = useRef<HTMLDivElement>(null);

  const [showSendModal,        setShowSendModal]        = useState(false);
  const [sendEmail,            setSendEmail]            = useState(po.supplier_email ?? '');
  const [sendingMail,          setSendingMail]          = useState(false);
  const [sendContacts,         setSendContacts]         = useState<ContactEntry[]>([]);
  const [sendContactsLoading,  setSendContactsLoading]  = useState(false);

  const [showCancelModal, setShowCancelModal] = useState(false);
  const [cancelReason,    setCancelReason]    = useState('');
  const [cancelling,      setCancelling]      = useState(false);

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
  async function handleSendToSupplier() {
    if (!sendEmail.includes('@')) { showToast('Вкажіть коректний email', 'error'); return; }
    setSendingMail(true);
    try {
      const res = await fetch('/api/admin/procurement/send', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: [po.id], overrideEmail: sendEmail }),
      });
      const data = await res.json();
      if (!res.ok) { showToast(data.error ?? 'Помилка відправки', 'error'); return; }
      showToast('✅ Замовлення відправлено постачальнику', 'success');
      setNewStatus('sent');
      setShowSendModal(false);
    } catch { showToast('Мережева помилка', 'error'); }
    finally { setSendingMail(false); }
  }

  async function handleCancel() {
    setCancelling(true);
    try {
      const res = await fetch(`/api/admin/procurement/${po.id}/status`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ procurement_status: 'cancelled', cancel_reason: cancelReason || undefined }),
      });
      if (!res.ok) { const d = await res.json(); showToast(d.error ?? 'Помилка скасування', 'error'); return; }
      setShowCancelModal(false);
      window.location.reload();
    } catch { showToast('Мережева помилка', 'error'); }
    finally { setCancelling(false); }
  }

  const [editingIban,   setEditingIban]   = useState(false);
  const [ibanDraft,     setIbanDraft]     = useState({ iban: '', legal_name: '', edrpou: '', bank_name: '' });
  const [savingIban,    setSavingIban]    = useState(false);
  // Вважаємо оплату збереженою якщо: є факт оплати або відстрочка
  const _paymentAlreadySet = ['paid', 'invoiced'].includes(po.procurement_status ?? '')
    || po.meta?.is_paid === true || po.meta?.payment_status === 'invoiced'
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
      showToast('✅ Реквізити збережено', 'success');
      setEditingIban(false);
    } catch { showToast('Помилка збереження реквізитів', 'error'); }
    finally { setSavingIban(false); }
  }
  const [deferDate,   setDeferDate]   = useState(() => {
    const d = new Date(); d.setDate(d.getDate() + (payTermsDays || 14));
    return d.toISOString().slice(0, 10);
  });
  const [showReverseModal, setShowReverseModal] = useState(false);
  const [reverseReason,    setReverseReason]    = useState('');
  const [reversing,        setReversing]        = useState(false);

  const [showAddPayment, setShowAddPayment] = useState(false);
  const [addPayAmount,   setAddPayAmount]   = useState(String(po.supplier_invoice_amount ?? po.total_cost ?? ''));
  const [addPayMode,     setAddPayMode]     = useState<'transfer' | 'cash'>('transfer');
  const [addPayDate,     setAddPayDate]     = useState(new Date().toISOString().slice(0, 10));
  const [addingPayment,  setAddingPayment]  = useState(false);

  const invoiceAmount      = Number(po.supplier_invoice_amount ?? po.total_cost ?? 0);
  const effectiveTotalPaid = totalPaid ?? 0;
  const remaining          = Math.max(0, invoiceAmount - effectiveTotalPaid);

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

  useEffect(() => {
    if (!showActionsMenu) return;
    function handleClickOutside(e: MouseEvent) {
      if (actionsMenuRef.current && !actionsMenuRef.current.contains(e.target as Node)) {
        setShowActionsMenu(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showActionsMenu]);

  async function openSendModal() {
    if (sendContactsLoading) return;
    setSendContactsLoading(true);
    setSendContacts([]);
    setSendEmail(po.supplier_email ?? '');
    try {
      if (po.supplier_id) {
        const d = await fetch(`/api/admin/suppliers/${po.supplier_id}`).then(r => r.json());
        const contacts: ContactEntry[] = d.contacts ?? [];
        setSendContacts(contacts);
        const first = contacts.find(c => c.email?.includes('@'));
        if (first) setSendEmail(first.email);
      }
    } catch {}
    setSendContactsLoading(false);
    setShowSendModal(true);
  }

  async function handleInvoiceUpload(file: File) {
    setUploadingInvoice(true);
    const fd = new FormData();
    fd.append('file', file);
    const res = await fetch(`/api/admin/procurement/${po.id}/upload-invoice`, { method: 'POST', body: fd });
    const data = await res.json();
    if (res.ok) {
      setInvoiceFile({ url: data.signed_url, name: data.name });
      const meta = extractInvoiceMeta(file);
      if (meta.number && !invoiceNum) setInvoiceNum(meta.number);
      if (meta.date && !invoiceDate) setInvoiceDate(meta.date);
    }
    setUploadingInvoice(false);
  }

  async function handleDeleteInvoiceFile() {
    setDeletingInvoiceFile(true);
    await fetch(`/api/admin/procurement/${po.id}/upload-invoice`, { method: 'DELETE' });
    setInvoiceFile(null);
    setDeletingInvoiceFile(false);
  }


  const currentStepIdx = Math.max(
    statusToStep(newStatus || po.procurement_status || ''),
    po.has_receipt ? 3 : -1,
    po.email_sent_at ? 1 : -1,
  );

  function handleReceive() {
    const draftBySkuMap = new Map((po.draft_receipt_lines ?? []).map(dl => [dl.sku, dl]));
    const eventLines = po.lines.map(l => {
      const dl = draftBySkuMap.get(l.sku);
      return {
        sku:         l.sku,
        name:        `${l.brand ?? ''} ${l.name ?? ''}`.trim(),
        qty:         dl ? dl.qty          : (l.effective_qty ?? l.qty),
        cost_price:  dl ? dl.cost_price   : l.cost_price,
        sale_price:  dl ? (dl.price ?? 0) : 0,
        is_bonus:    false,
        matched:     true,
        ordered_qty: l.effective_qty ?? l.qty,
      };
    });
    window.dispatchEvent(new CustomEvent('open-po-receipt-draft', {
      detail: {
        poId:              po.id,
        poDocNumber:       po.doc_number,
        supplierId:        po.supplier_id,
        warehouseId:       po.warehouse_id ?? null,
        supplierInvNum:    po.supplier_invoice_number ?? '',
        supplierInvDate:   po.supplier_invoice_date  ?? '',
        supplierInvAmount: po.supplier_invoice_amount ?? '',
        draftReceiptId:    po.draft_receipt_id ?? null,
        lines:             eventLines,
      },
    }));
  }

  async function handleStatusUpdate(status: string) {
    setUpdatingStatus(true);
    try {
      const res = await fetch(`/api/admin/procurement/${po.id}/status`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ procurement_status: status }),
      });
      if (!res.ok) { const d = await res.json(); showToast(d.error ?? 'Помилка', 'error'); return; }
      setNewStatus(status);
      showToast(`Статус оновлено: ${STATUS_STEPS.find(s => s.key === status)?.label}`, 'success');
    } catch { showToast('Мережева помилка', 'error'); }
    finally { setUpdatingStatus(false); }
  }

  async function handleSaveInvoice() {
    setSavingInvoice(true);
    try {
      const res = await fetch(`/api/admin/procurement/${po.id}/status`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          procurement_status:      'confirmed_by_supplier',
          supplier_invoice_number: invoiceNum,
          supplier_invoice_date:   invoiceDate,
          supplier_invoice_amount: parseFloat(invoiceAmt) || undefined,
        }),
      });
      if (!res.ok) { const d = await res.json(); showToast(d.error ?? 'Помилка', 'error'); return; }
      setNewStatus('confirmed_by_supplier');
      showToast('✅ Рахунок збережено — статус змінено на «Рахунок отримано»', 'success');
      setInvoiceSaved(true);
      setEditingInvoice(false);
    } catch { showToast('Мережева помилка', 'error'); }
    finally { setSavingInvoice(false); }
  }

  async function handleConfirmWithoutInvoice() {
    setUpdatingStatus(true);
    try {
      const res = await fetch(`/api/admin/procurement/${po.id}/status`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ procurement_status: 'confirmed_by_supplier' }),
      });
      if (!res.ok) { const d = await res.json(); showToast(d.error ?? 'Помилка', 'error'); return; }
      setNewStatus('confirmed_by_supplier');
      showToast('✅ Підтверджено без рахунку-фактури', 'success');
      setNoInvoice(true);
      setInvoiceSaved(true);
      setEditingInvoice(false);
    } catch { showToast('Мережева помилка', 'error'); }
    finally { setUpdatingStatus(false); }
  }


  async function handleReversePayment() {
    setReversing(true);
    try {
      const res = await fetch(`/api/admin/procurement/${po.id}/reverse-payment`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: reverseReason.trim() || undefined }),
      });
      if (!res.ok) { const d = await res.json(); showToast(d.error ?? 'Помилка скасування оплати', 'error'); return; }
      setIsPaid(false);
      setIsInvoiced(false);
      setPaymentSaved(false);
      setEditingPayment(true);
      setShowReverseModal(false);
      setReverseReason('');
      showToast('✅ Оплату скасовано. Компенсуюча проводка проведена.', 'success');
    } catch { showToast('Мережева помилка', 'error'); }
    finally { setReversing(false); }
  }

  async function handleAddPayment() {
    if (!addPayAmount || parseFloat(addPayAmount) <= 0) { showToast('Вкажіть суму', 'error'); return; }
    setAddingPayment(true);
    try {
      const res = await fetch(`/api/admin/procurement/${po.id}/add-payment`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount: parseFloat(addPayAmount), payment_mode: addPayMode, payment_date: addPayDate }),
      });
      if (!res.ok) { const d = await res.json(); showToast(d.error ?? 'Помилка', 'error'); return; }
      const data = await res.json();
      showToast(`✅ Оплату ${Number(addPayAmount).toLocaleString('uk-UA', { minimumFractionDigits: 2 })} ₴ додано`, 'success');
      setShowAddPayment(false);
      if (data.is_fully_paid) setIsPaid(true);
      window.location.reload();
    } catch { showToast('Мережева помилка', 'error'); }
    finally { setAddingPayment(false); }
  }

  function payModeLabel(mode: string | null) {
    if (mode === 'cash')     return '💵 Готівка';
    if (mode === 'transfer') return '🏦 Переказ';
    if (mode === 'deferred') return '📅 Відстрочка';
    return '💳';
  }

  const activeStatus = newStatus; // 'paid'/'invoiced' відфільтровані при ініціалізації

  const isCancelled = po.status === 'cancelled';

  return (
    <div style={{ padding: compact ? '16px 20px' : '28px 32px' }}>

      {/* Банер "Скасовано" */}
      {isCancelled && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '12px 18px', marginBottom: '20px', background: '#FEF2F2', border: '1.5px solid #FCA5A5', borderRadius: '10px' }}>
          <span style={{ fontSize: '20px' }}>🚫</span>
          <div>
            <div style={{ fontSize: '14px', fontWeight: 700, color: '#DC2626' }}>Замовлення скасовано</div>
            <div style={{ fontSize: '12px', color: '#EF4444', marginTop: '2px' }}>
              Цей документ анульовано і більше не активний. Перегляд доступний лише для ознайомлення з історією.
            </div>
            {typeof po.meta?.cancel_reason === 'string' && (
              <div style={{ fontSize: '12px', color: '#DC2626', marginTop: '6px', fontStyle: 'italic' }}>
                Причина: {po.meta.cancel_reason}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '20px', flexWrap: 'wrap', rowGap: '6px' }}>
        {/* ← назад — Link або callback; у compact-drawer прихований (є окрема панель керування) */}
        {!compact && (
          <button onClick={onClose ?? goToList} style={{ display: 'flex', alignItems: 'center', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', padding: 0 }}>
            <ArrowLeft size={16} />
          </button>
        )}
        <div style={{ flex: 1 }}>
          <h1 style={{ fontSize: '20px', fontWeight: 800, color: 'var(--text-primary)', margin: 0 }}>{po.doc_number}</h1>
          <div style={{ fontSize: '13px', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '4px' }}>
            <span>{po.supplier_name} · {new Date(po.doc_date).toLocaleDateString('uk-UA')}</span>
            {!isCancelled && (editingExpDate ? (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                <span>· Очікуємо:</span>
                <input
                  type="date"
                  autoFocus
                  min="2020-01-01"
                  max="2099-12-31"
                  value={expectedDate}
                  onChange={e => setExpectedDate(e.target.value)}
                  onBlur={async () => {
                    setEditingExpDate(false);
                    const year = expectedDate ? new Date(expectedDate).getFullYear() : 0;
                    const valid = expectedDate && year >= 2020 && year <= 2099;
                    if (!valid || expectedDate === (po.expected_date ?? '')) {
                      setExpectedDate(po.expected_date ?? '');
                      return;
                    }
                    setSavingExpDate(true);
                    await fetch(`/api/admin/procurement/${po.id}/status`, {
                      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ expected_date: expectedDate }),
                    }).catch(() => {});
                    setSavingExpDate(false);
                  }}
                  onKeyDown={e => { if (e.key === 'Escape') { setExpectedDate(po.expected_date ?? ''); setEditingExpDate(false); } }}
                  style={{ height: '22px', padding: '0 6px', border: '1.5px solid var(--brand-blue)', borderRadius: '6px', fontSize: '12px', color: 'var(--text-primary)', background: 'var(--bg-soft)', outline: 'none' }}
                />
              </span>
            ) : (
              <button
                onClick={() => setEditingExpDate(true)}
                title="Змінити дату очікування"
                style={{ background: 'none', border: 'none', padding: '1px 5px', borderRadius: '5px', cursor: 'pointer', fontSize: '13px', color: savingExpDate ? 'var(--text-muted)' : '#1E3A5F', fontWeight: 500, textDecoration: 'underline dotted', textUnderlineOffset: '2px' }}>
                {savingExpDate ? '...' : expectedDate ? `· Очікуємо: ${new Date(expectedDate).toLocaleDateString('uk-UA')}` : '· + дата поставки'}
              </button>
            ))}
            {isCancelled && expectedDate && (
              <span>· Очікуємо: {new Date(expectedDate).toLocaleDateString('uk-UA')}</span>
            )}
          </div>
        </div>
        {/* 1. Відправити постачальнику */}
        {!isCancelled && (
          <button
            onClick={openSendModal}
            disabled={sendContactsLoading}
            title="Відправити замовлення постачальнику"
            style={{ display: 'flex', alignItems: 'center', gap: '6px', height: '34px', padding: '0 14px', borderRadius: '8px', border: `1.5px solid ${po.email_sent_at ? '#86EFAC' : 'var(--border)'}`, background: po.email_sent_at ? '#F0FDF4' : 'var(--bg-soft)', color: po.email_sent_at ? '#15803D' : 'var(--text-secondary)', fontSize: '12px', fontWeight: 600, cursor: sendContactsLoading ? 'default' : 'pointer', flexShrink: 0, opacity: sendContactsLoading ? 0.7 : 1 }}>
            {sendContactsLoading ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <Send size={14} />}
            {po.email_sent_at ? '✅ Відправлено' : 'Відправити'}
          </button>
        )}
        {/* 2. Коригування */}
        {adjustmentButton}
        {/* 3. Прийняти товар / Чернетка приходу */}
        {!compact && !po.has_receipt && !isCancelled && (
          <button
            onClick={handleReceive}
            style={{ display: 'flex', alignItems: 'center', gap: '6px', height: '34px', padding: '0 16px', borderRadius: '8px', border: po.draft_receipt_id ? '1.5px solid #1E3A5F' : 'none', background: po.draft_receipt_id ? 'transparent' : '#1E3A5F', color: po.draft_receipt_id ? '#1E3A5F' : '#fff', fontSize: '13px', fontWeight: 700, cursor: 'pointer', flexShrink: 0 }}>
            {po.draft_receipt_id
              ? <><FileText size={14} /> Чернетка приходу</>
              : <><Package size={14} /> Прийняти товар</>
            }
          </button>
        )}
        {/* 4. Ланцюжок */}
        {chainButton}
        {/* ⋯ меню рідкісних дій */}
        <div ref={actionsMenuRef} style={{ position: 'relative' }}>
          <button
            onClick={() => setShowActionsMenu(v => !v)}
            title="Дії"
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '34px', height: '34px', borderRadius: '8px', border: '1px solid var(--border)', background: showActionsMenu ? 'var(--bg-soft)' : 'none', cursor: 'pointer', color: 'var(--text-secondary)', flexShrink: 0, transition: 'all 0.15s' }}>
            <MoreHorizontal size={16} />
          </button>
          {showActionsMenu && (
            <div style={{ position: 'absolute', top: '38px', right: 0, background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '10px', boxShadow: '0 4px 16px rgba(0,0,0,0.10)', minWidth: '220px', zIndex: 100, padding: '4px 0', overflow: 'hidden' }}>
              <button
                onClick={() => { setShowActionsMenu(false); window.print(); }}
                style={{ display: 'flex', alignItems: 'center', gap: '10px', width: '100%', padding: '9px 14px', background: 'none', border: 'none', cursor: 'pointer', fontSize: '13px', color: 'var(--text-primary)', textAlign: 'left' }}>
                <Printer size={14} style={{ color: 'var(--text-muted)' }} />
                Друк / Зберегти PDF
              </button>
              <div style={{ height: '1px', background: 'var(--border)', margin: '4px 0' }} />
              <button
                onClick={() => { setShowActionsMenu(false); copyToNewDraft(); }}
                disabled={copyingOrder}
                style={{ display: 'flex', alignItems: 'center', gap: '10px', width: '100%', padding: '9px 14px', background: 'none', border: 'none', cursor: 'pointer', fontSize: '13px', color: 'var(--text-primary)', textAlign: 'left', opacity: copyingOrder ? 0.6 : 1 }}>
                {copyingOrder ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <Copy size={14} style={{ color: 'var(--text-muted)' }} />}
                Копіювати як нове замовлення
              </button>
              {!po.has_receipt && !isCancelled && (
                <>
                  <div style={{ height: '1px', background: 'var(--border)', margin: '4px 0' }} />
                  <button
                    onClick={() => { setShowActionsMenu(false); setShowCancelModal(true); }}
                    style={{ display: 'flex', alignItems: 'center', gap: '10px', width: '100%', padding: '9px 14px', background: 'none', border: 'none', cursor: 'pointer', fontSize: '13px', color: '#DC2626', textAlign: 'left' }}>
                    <X size={14} style={{ color: '#DC2626' }} />
                    Скасувати замовлення
                  </button>
                </>
              )}
              {isPaid && !isCancelled && (
                <>
                  <div style={{ height: '1px', background: 'var(--border)', margin: '4px 0' }} />
                  <button
                    onClick={() => { setShowActionsMenu(false); setShowReverseModal(true); }}
                    style={{ display: 'flex', alignItems: 'center', gap: '10px', width: '100%', padding: '9px 14px', background: 'none', border: 'none', cursor: 'pointer', fontSize: '13px', color: '#DC2626', textAlign: 'left' }}>
                    <X size={14} style={{ color: '#DC2626' }} />
                    Скасувати оплату (Admin)
                  </button>
                </>
              )}
            </div>
          )}
        </div>
        {/* ✕ закрити — тільки на повній сторінці; у drawer є своя панель */}
        {!compact && (
          <button onClick={onClose ?? goToList} title="Закрити документ"
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '34px', height: '34px', borderRadius: '8px', border: '1px solid var(--border)', background: 'none', color: 'var(--text-secondary)', cursor: 'pointer', flexShrink: 0 }}>
            <X size={15} />
          </button>
        )}
      </div>

      {/* Progress bar */}
      <div style={{ background: 'var(--bg-card)', border: `1px solid ${isCancelled ? '#FCA5A5' : 'var(--border)'}`, borderRadius: '12px', padding: '16px 20px', marginBottom: '20px' }}>
        {isCancelled ? (
          /* ── Скасований стан: замість кроків — повідомлення ── */
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{ width: '28px', height: '28px', borderRadius: '50%', background: '#FEE2E2', border: '2px solid #FCA5A5', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <span style={{ fontSize: '14px' }}>🚫</span>
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: '13px', fontWeight: 700, color: '#DC2626' }}>Замовлення анульовано</div>
              <div style={{ fontSize: '11px', color: '#EF4444', marginTop: '2px' }}>
                Документ скасовано і більше не активний. Жодних дій недоступно.
              </div>
            </div>
            <span style={{ fontSize: '12px', fontWeight: 700, color: '#DC2626', background: '#FEE2E2', border: '1px solid #FCA5A5', padding: '3px 10px', borderRadius: '20px', flexShrink: 0 }}>
              🚫 Анульовано
            </span>
          </div>
        ) : (
          <>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0' }}>
              {STATUS_STEPS.map((step, i) => {
                const done   = currentStepIdx >= i;
                const active = currentStepIdx === i;
                // Динамічний підпис для кроку "Підтверджено"
                const stepLabel = step.key === 'confirmed_by_supplier' && done
                  ? (noInvoice
                      ? 'Підтверджено без рахунку'
                      : invoiceSaved
                        ? 'Підтверджено, рахунок отримано'
                        : step.label)
                  : step.label;
                return (
                  <div key={step.key} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', position: 'relative' }}>
                    {i > 0 && <div style={{ position: 'absolute', left: '-50%', top: '14px', width: '100%', height: '2px', background: done ? 'var(--brand-blue)' : 'var(--border)', zIndex: 0 }} />}
                    <div style={{ width: '28px', height: '28px', borderRadius: '50%', background: done ? 'var(--brand-blue)' : 'var(--bg-soft)', border: `2px solid ${done ? 'var(--brand-blue)' : 'var(--border)'}`, display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1, position: 'relative' }}>
                      {done ? <CheckCircle size={14} color="#fff" /> : <span style={{ fontSize: '10px', color: 'var(--text-secondary)' }}>{i + 1}</span>}
                    </div>
                    <div style={{ fontSize: '10px', fontWeight: active ? 700 : 400, color: done ? 'var(--brand-blue)' : 'var(--text-muted)', marginTop: '4px', textAlign: 'center', maxWidth: '90px' }}>
                      {step.icon} {stepLabel}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Badge оплати — окремо від ланцюжка доставки */}
            {(isPaid || isInvoiced) && (
              <div style={{ marginTop: '12px', paddingTop: '12px', borderTop: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                {isPaid && (
                  <span style={{ fontSize: '12px', fontWeight: 700, color: '#15803D', background: '#F0FDF4', border: '1px solid #BBF7D0', padding: '3px 10px', borderRadius: '20px' }}>
                    {payIcon(savedPayMode)} Оплачено
                  </span>
                )}
                {isInvoiced && !isPaid && (() => {
                  const deferDate = po.meta?.payment_defer_date as string | undefined;
                  const overdue = deferDate && deferDate < new Date().toISOString().slice(0, 10);
                  return (
                    <span style={{ fontSize: '12px', fontWeight: 700, color: overdue ? '#DC2626' : '#92400E', background: overdue ? '#FEF2F2' : '#FFFBEB', border: `1px solid ${overdue ? '#FCA5A5' : '#FDE68A'}`, padding: '3px 10px', borderRadius: '20px' }}>
                      {overdue ? '⚠ Відстрочка прострочена' : '📅 Відстрочення — не оплачено'}
                      {deferDate && <span style={{ fontWeight: 400, marginLeft: '6px' }}>до {new Date(deferDate).toLocaleDateString('uk-UA')}</span>}
                    </span>
                  );
                })()}
              </div>
            )}
          </>
        )}
      </div>


      <div style={{ display: 'grid', gridTemplateColumns: compact ? '1fr' : '1fr 360px', gap: '20px' }}>
        {/* Left: Lines */}
        <div>
          <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '12px', overflow: 'hidden', marginBottom: '16px' }}>
            <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '7px' }}>
              <Package size={15} /> Товари
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '110px minmax(0,1fr) 80px 110px 100px', padding: '8px 16px', background: 'var(--bg-soft)', fontSize: '11px', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.04em', gap: '8px', borderBottom: '1px solid var(--border)' }}>
              <span>Артикул</span>
              <span>Найменування</span>
              <span style={{ textAlign: 'right' }}>Замовлено</span>
              <span style={{ textAlign: 'right' }}>Ціна закупівлі</span>
              <span style={{ textAlign: 'right' }}>Сума</span>
            </div>

            {po.lines.map(line => {
              // effQty = кількість з урахуванням коригування (для нових adj-позицій = adj_delta)
              const effQty      = line.effective_qty ?? line.qty;
              const displayPrice = line.cost_price ?? 0;
              const displayQty   = effQty;

              const isNew = line.is_adj_new;
              return (
                <div key={line.id} style={{ display: 'grid', gridTemplateColumns: '110px minmax(0,1fr) 80px 110px 100px', padding: '9px 16px', alignItems: 'center', borderTop: '1px solid var(--border-light)', gap: '8px', background: isNew ? 'rgba(21,128,61,0.05)' : 'transparent' }}>
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

                  {/* Ціна PO */}
                  <span style={{ textAlign: 'right', fontSize: '12px', color: 'var(--text-muted)' }}>
                    {line.cost_price ? `${fmt(line.cost_price)} ₴` : '—'}
                  </span>

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
              const hasAdj  = po.lines.some(l => (l.adj_delta ?? 0) !== 0);
              const adjDiff = adjustedTotal - originalTotal;

              return (
                <div style={{ padding: '11px 20px', borderTop: '2px solid var(--border)', background: hasAdj ? 'var(--bg-soft)' : undefined }}>
                  {hasAdj ? (
                    <>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: 'var(--text-muted)', marginBottom: '3px' }}>
                        <span>До коригування</span>
                        <span>{fmt(originalTotal)} ₴</span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: 'var(--text-muted)', marginBottom: '3px' }}>
                        <span>З урахуванням к-к</span>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          {adjDiff !== 0 && <span style={{ color: adjDiff < 0 ? '#EF4444' : '#15803D', fontWeight: 600 }}>{adjDiff > 0 ? '+' : ''}{fmt(adjDiff)} ₴</span>}
                          <span>{fmt(adjustedTotal)} ₴</span>
                        </div>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '14px', fontWeight: 800, color: 'var(--text-primary)', borderTop: '1px solid var(--border)', paddingTop: '6px', marginTop: '4px' }}>
                        <span>Загальна сума</span>
                        <span>{fmt(adjustedTotal)} ₴</span>
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
          </div>

        </div>

        {/* Right: Actions */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>


          {/* Рахунок + Оплата — об'єднаний блок */}
          <div style={{ background: 'var(--bg-card)', border: `1px solid ${isPaid ? '#86EFAC' : 'var(--border)'}`, borderRadius: '12px', padding: po.has_receipt ? '12px 16px' : '16px' }}>
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

                  {!isCancelled && (
                    <button onClick={() => { setEditingInvoice(true); setNoInvoice(false); }}
                      style={{ height: '34px', borderRadius: '8px', border: '1px solid var(--border)', background: 'none', color: 'var(--text-secondary)', fontSize: '12px', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '5px' }}>
                      ✏️ Редагувати
                    </button>
                  )}
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
                      <button onClick={() => {
                        setEditingInvoice(false);
                        setInvoiceNum(po.supplier_invoice_number ?? '');
                        setInvoiceDate(po.supplier_invoice_date ?? '');
                        setInvoiceAmt(String(po.supplier_invoice_amount ?? po.total_cost ?? ''));
                        setNoInvoice(_isNoInvoiceConfirmed);
                      }}
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

              {/* Hidden file input */}
              <input ref={fileRef} type="file" accept=".pdf,.xlsx,.xls,.jpg,.jpeg,.png" style={{ display: 'none' }}
                onChange={e => { const f = e.target.files?.[0]; if (f) handleInvoiceUpload(f); e.target.value = ''; }} />
            </div>

            {/* Роздільник між рахунком і оплатою */}
            <div style={{ height: '1px', background: 'var(--border)', margin: '14px -16px' }} />

            <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '7px' }}>
              <Banknote size={14} /> Оплата постачальнику
            </div>


            {isPaid && !editingPayment ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <div style={{ padding: '10px 12px', background: '#F0FDF4', borderRadius: '8px', fontSize: '13px', color: '#15803D', fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}><CheckCircle size={16} /> Повністю оплачено</span>
                  {effectiveTotalPaid > 0 && <span style={{ fontSize: '12px', fontWeight: 700 }}>{effectiveTotalPaid.toLocaleString('uk-UA', { minimumFractionDigits: 2 })} ₴</span>}
                </div>

                {/* Список оплат */}
                {paymentHistory && paymentHistory.length > 0 && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                    {paymentHistory.map((p, i) => (
                      <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '5px 10px', background: 'var(--bg-soft)', borderRadius: '6px', fontSize: '12px' }}>
                        <span style={{ color: 'var(--text-secondary)' }}>
                          {payModeLabel(p.payment_mode)} · {new Date(p.created_at).toLocaleDateString('uk-UA')}
                        </span>
                        <span style={{ fontWeight: 700, color: '#15803D' }}>{p.amount.toLocaleString('uk-UA', { minimumFractionDigits: 2 })} ₴</span>
                      </div>
                    ))}
                  </div>
                )}

                {/* Додати ще оплату */}
                {!isCancelled && !showAddPayment && (
                  <button onClick={() => setShowAddPayment(true)}
                    style={{ height: '30px', borderRadius: '8px', border: '1px solid var(--border)', background: 'none', color: 'var(--text-secondary)', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}>
                    + Додати ще оплату
                  </button>
                )}
                {showAddPayment && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', padding: '10px 12px', background: 'var(--bg-soft)', borderRadius: '8px' }}>
                    <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Нова оплата</div>
                    <div style={{ display: 'flex', borderRadius: '7px', overflow: 'hidden', border: '1px solid var(--border)' }}>
                      {([{ key: 'transfer', label: '🏦 Рахунок' }, { key: 'cash', label: '💵 Готівка' }] as { key: typeof addPayMode; label: string }[]).map((m, i) => (
                        <button key={m.key} onClick={() => setAddPayMode(m.key)}
                          style={{ flex: 1, height: '32px', fontSize: '11px', fontWeight: 600, cursor: 'pointer', border: 'none', borderLeft: i > 0 ? '1px solid var(--border)' : 'none', background: addPayMode === m.key ? '#1E3A5F' : 'var(--bg-card)', color: addPayMode === m.key ? '#fff' : 'var(--text-secondary)' }}>
                          {m.label}
                        </button>
                      ))}
                    </div>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <div style={{ flex: 1 }}>
                        <label style={lbl}>Сума, ₴</label>
                        <input style={inp} type="number" value={addPayAmount} onChange={e => setAddPayAmount(e.target.value)} placeholder="0.00" />
                      </div>
                      <div style={{ flex: 1 }}>
                        <label style={lbl}>Дата</label>
                        <input style={inp} type="date" value={addPayDate} onChange={e => setAddPayDate(e.target.value)} />
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: '6px' }}>
                      <button onClick={() => setShowAddPayment(false)}
                        style={{ flex: 1, height: '32px', borderRadius: '7px', border: '1px solid var(--border)', background: 'none', color: 'var(--text-secondary)', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}>
                        Скасувати
                      </button>
                      <button onClick={handleAddPayment} disabled={addingPayment || !addPayAmount || parseFloat(addPayAmount) <= 0}
                        style={{ flex: 2, height: '32px', borderRadius: '7px', border: 'none', background: '#15803D', color: '#fff', fontSize: '12px', fontWeight: 700, cursor: 'pointer' }}>
                        {addingPayment ? '...' : '💳 Провести'}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ) : paymentSaved && !editingPayment ? (
              /* ── Режим перегляду оплати ── */
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {/* Часткова оплата: прогрес */}
                {paymentHistory && paymentHistory.length > 0 && invoiceAmount > 0 && (
                  <div style={{ padding: '8px 12px', background: '#FFFBEB', borderRadius: '8px', fontSize: '12px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: 'var(--text-muted)' }}>Оплачено</span>
                      <span style={{ fontWeight: 700, color: '#15803D' }}>{effectiveTotalPaid.toLocaleString('uk-UA', { minimumFractionDigits: 2 })} ₴</span>
                    </div>
                    {remaining > 0 && (
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ color: 'var(--text-muted)' }}>Залишилось</span>
                        <span style={{ fontWeight: 700, color: '#DC2626' }}>{remaining.toLocaleString('uk-UA', { minimumFractionDigits: 2 })} ₴</span>
                      </div>
                    )}
                    <div style={{ marginTop: '4px', height: '4px', background: '#E5E7EB', borderRadius: '2px', overflow: 'hidden' }}>
                      <div style={{ height: '100%', background: remaining > 0 ? '#F59E0B' : '#15803D', borderRadius: '2px', width: `${Math.min(100, (effectiveTotalPaid / invoiceAmount) * 100)}%`, transition: 'width 0.3s' }} />
                    </div>
                  </div>
                )}
                {isInvoiced && (
                  <div style={{ padding: '10px 12px', background: 'var(--bg-soft)', borderRadius: '8px', fontSize: '13px' }}>
                    <div><span style={{ color: 'var(--text-muted)', fontSize: '11px' }}>Спосіб: </span><strong>📅 Відстрочка</strong></div>
                    <div><span style={{ color: 'var(--text-muted)', fontSize: '11px' }}>Оплатити до: </span><strong>{new Date(deferDate2).toLocaleDateString('uk-UA')}</strong></div>
                  </div>
                )}
                {/* Список платежів */}
                {paymentHistory && paymentHistory.length > 1 && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                    {paymentHistory.map((p, i) => (
                      <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '4px 10px', background: 'var(--bg-soft)', borderRadius: '6px', fontSize: '11px' }}>
                        <span style={{ color: 'var(--text-secondary)' }}>{payModeLabel(p.payment_mode)} · {new Date(p.created_at).toLocaleDateString('uk-UA')}</span>
                        <span style={{ fontWeight: 700, color: '#15803D' }}>{p.amount.toLocaleString('uk-UA', { minimumFractionDigits: 2 })} ₴</span>
                      </div>
                    ))}
                  </div>
                )}
                {!isCancelled && (
                  <div style={{ display: 'flex', gap: '6px' }}>
                    <button onClick={() => setEditingPayment(true)}
                      style={{ flex: 1, height: '32px', borderRadius: '8px', border: '1px solid var(--border)', background: 'none', color: 'var(--text-secondary)', fontSize: '12px', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '5px' }}>
                      ✏️ Редагувати
                    </button>
                    {remaining > 0 && !showAddPayment && (
                      <button onClick={() => setShowAddPayment(true)}
                        style={{ flex: 1, height: '32px', borderRadius: '8px', border: 'none', background: '#15803D', color: '#fff', fontSize: '12px', fontWeight: 700, cursor: 'pointer' }}>
                        + Ще оплату
                      </button>
                    )}
                  </div>
                )}
                {showAddPayment && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', padding: '10px 12px', background: 'var(--bg-soft)', borderRadius: '8px' }}>
                    <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Нова оплата</div>
                    <div style={{ display: 'flex', borderRadius: '7px', overflow: 'hidden', border: '1px solid var(--border)' }}>
                      {([{ key: 'transfer', label: '🏦 Рахунок' }, { key: 'cash', label: '💵 Готівка' }] as { key: typeof addPayMode; label: string }[]).map((m, i) => (
                        <button key={m.key} onClick={() => setAddPayMode(m.key)}
                          style={{ flex: 1, height: '32px', fontSize: '11px', fontWeight: 600, cursor: 'pointer', border: 'none', borderLeft: i > 0 ? '1px solid var(--border)' : 'none', background: addPayMode === m.key ? '#1E3A5F' : 'var(--bg-card)', color: addPayMode === m.key ? '#fff' : 'var(--text-secondary)' }}>
                          {m.label}
                        </button>
                      ))}
                    </div>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <div style={{ flex: 1 }}><label style={lbl}>Сума, ₴</label><input style={inp} type="number" value={addPayAmount} onChange={e => setAddPayAmount(e.target.value)} placeholder="0.00" /></div>
                      <div style={{ flex: 1 }}><label style={lbl}>Дата</label><input style={inp} type="date" value={addPayDate} onChange={e => setAddPayDate(e.target.value)} /></div>
                    </div>
                    <div style={{ display: 'flex', gap: '6px' }}>
                      <button onClick={() => setShowAddPayment(false)} style={{ flex: 1, height: '32px', borderRadius: '7px', border: '1px solid var(--border)', background: 'none', color: 'var(--text-secondary)', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}>Скасувати</button>
                      <button onClick={handleAddPayment} disabled={addingPayment || !addPayAmount || parseFloat(addPayAmount) <= 0}
                        style={{ flex: 2, height: '32px', borderRadius: '7px', border: 'none', background: '#15803D', color: '#fff', fontSize: '12px', fontWeight: 700, cursor: 'pointer' }}>
                        {addingPayment ? '...' : '💳 Провести'}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>

                {/* Раніше проведені оплати */}
                {paymentHistory && paymentHistory.length > 0 && (
                  <div style={{ padding: '8px 12px', background: 'var(--bg-soft)', borderRadius: '8px', fontSize: '12px', display: 'flex', flexDirection: 'column', gap: '3px' }}>
                    {paymentHistory.map((p, i) => (
                      <div key={i} style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ color: 'var(--text-secondary)' }}>{payModeLabel(p.payment_mode)} · {new Date(p.created_at).toLocaleDateString('uk-UA')}</span>
                        <span style={{ fontWeight: 700, color: '#15803D' }}>{p.amount.toLocaleString('uk-UA', { minimumFractionDigits: 2 })} ₴</span>
                      </div>
                    ))}
                    {remaining > 0 && invoiceAmount > 0 && (
                      <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: '4px', borderTop: '1px solid var(--border-light)', marginTop: '2px' }}>
                        <span style={{ color: '#DC2626', fontWeight: 600 }}>Залишилось оплатити</span>
                        <span style={{ fontWeight: 700, color: '#DC2626' }}>{remaining.toLocaleString('uk-UA', { minimumFractionDigits: 2 })} ₴</span>
                      </div>
                    )}
                  </div>
                )}

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
                      <button onClick={copyPaymentDetails}
                        style={{ width: '100%', height: '34px', borderRadius: '8px', border: `1px solid ${copied ? '#86EFAC' : 'var(--border)'}`, background: copied ? '#F0FDF4' : 'var(--bg-soft)', color: copied ? '#15803D' : 'var(--text-secondary)', fontSize: '13px', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
                        {copied ? <><Check size={13} /> Реквізити скопійовано</> : <><Copy size={13} /> Копіювати реквізити</>}
                      </button>
                    )}
                    {/* Форма оплати — через новий flow */}
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <div style={{ flex: 1 }}><label style={lbl}>Сума, ₴</label><input style={inp} type="number" value={addPayAmount} onChange={e => setAddPayAmount(e.target.value)} placeholder="0.00" /></div>
                      <div style={{ flex: 1 }}><label style={lbl}>Дата оплати</label><input style={inp} type="date" value={addPayDate} onChange={e => setAddPayDate(e.target.value)} /></div>
                    </div>
                    <button onClick={() => { setAddPayMode('transfer'); handleAddPayment(); }}
                      disabled={addingPayment || !addPayAmount || parseFloat(addPayAmount) <= 0}
                      style={{ width: '100%', height: '42px', borderRadius: '8px', border: 'none', background: !addPayAmount || parseFloat(addPayAmount) <= 0 ? '#E2E8F0' : '#15803D', color: !addPayAmount || parseFloat(addPayAmount) <= 0 ? '#94A3B8' : '#fff', fontSize: '14px', fontWeight: 700, cursor: 'pointer' }}>
                      {addingPayment ? '...' : '💳 Підтвердити переказ'}
                    </button>
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
                        if (!payAmount || parseFloat(payAmount) <= 0) { showToast('Вкажіть суму', 'error'); return; }
                        setUpdatingStatus(true);
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
                            showToast(`✅ Відстрочку зафіксовано до ${new Date(deferDate2).toLocaleDateString('uk-UA')}`, 'success');
                            setIsInvoiced(true);  // прогрес-бар доставки не змінюється
                            setPaymentSaved(true);
                            setEditingPayment(false);
                          }
                        } catch { showToast('Помилка', 'error'); }
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
                      💵 Оплата готівкою
                    </div>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <div style={{ flex: 1 }}><label style={lbl}>Сума, ₴</label><input style={inp} type="number" value={addPayAmount} onChange={e => setAddPayAmount(e.target.value)} placeholder="0.00" /></div>
                      <div style={{ flex: 1 }}><label style={lbl}>Дата оплати</label><input style={inp} type="date" value={addPayDate} onChange={e => setAddPayDate(e.target.value)} /></div>
                    </div>
                    <button onClick={() => { setAddPayMode('cash'); handleAddPayment(); }}
                      disabled={addingPayment || !addPayAmount || parseFloat(addPayAmount) <= 0}
                      style={{ height: '36px', borderRadius: '8px', border: 'none', background: !addPayAmount || parseFloat(addPayAmount) <= 0 ? '#E2E8F0' : '#15803D', color: !addPayAmount || parseFloat(addPayAmount) <= 0 ? '#94A3B8' : '#fff', fontSize: '13px', fontWeight: 700, cursor: 'pointer' }}>
                      {addingPayment ? '...' : '💵 Підтвердити готівкову оплату'}
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

          {/* Замовлення клієнта */}
          {customerOrder && (
            <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '12px', padding: '12px 16px' }}>
              <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                🛒 Замовлення клієнта
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '13px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                  <a href={`/admin/orders/${po.order_id}`} style={{ fontWeight: 700, color: '#1E3A5F', textDecoration: 'underline dotted', textUnderlineOffset: '2px' }}>
                    #{customerOrder.order_number}
                  </a>
                  <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                    {customerOrder.total_price != null ? `${Number(customerOrder.total_price).toLocaleString('uk-UA', { maximumFractionDigits: 0 })} ₴` : ''}
                  </span>
                </div>
                {(customerOrder.company || customerOrder.contact) && (
                  <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                    {customerOrder.company || customerOrder.contact}
                  </div>
                )}
                <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>
                  Статус: {customerOrder.status}
                </div>
              </div>
            </div>
          )}

          {/* Журнал подій */}
          {events && events.length > 0 && (
            <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '12px', padding: '14px 16px' }}>
              <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '12px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                Журнал подій
              </div>
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                {events.map((ev, i) => (
                  <div key={i} style={{ display: 'flex', gap: '10px' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flexShrink: 0 }}>
                      <div style={{ width: '26px', height: '26px', borderRadius: '50%', background: 'var(--bg-soft)', border: '1.5px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '13px', flexShrink: 0 }}>
                        {ev.icon}
                      </div>
                      {i < events.length - 1 && (
                        <div style={{ width: '1.5px', flex: 1, minHeight: '10px', margin: '3px 0', background: 'var(--border)' }} />
                      )}
                    </div>
                    <div style={{ paddingBottom: i < events.length - 1 ? '12px' : '0', paddingTop: '3px', flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-primary)', lineHeight: 1.3 }}>{ev.label}</div>
                      {ev.detail && (
                        <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '1px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ev.detail}</div>
                      )}
                      {ev.date && (
                        <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginTop: '2px' }}>
                          {ev.isDatetime
                            ? new Date(ev.date).toLocaleString('uk-UA', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
                            : new Date(ev.date).toLocaleDateString('uk-UA', { day: '2-digit', month: '2-digit', year: 'numeric' })}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

        </div>
      </div>


      {/* Модалка відправки постачальнику */}
      {showSendModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 3000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: 'var(--bg-card)', borderRadius: '16px', padding: '28px', width: '460px', boxShadow: '0 20px 60px rgba(0,0,0,0.25)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
              <div>
                <h3 style={{ margin: '0 0 3px', fontSize: '16px', fontWeight: 800, color: 'var(--text-primary)' }}>
                  Відправити постачальнику
                </h3>
                <div style={{ fontSize: '13px', color: 'var(--text-secondary)', fontWeight: 600 }}>
                  {po.supplier_name}
                </div>
              </div>
              <button onClick={() => setShowSendModal(false)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex', padding: '2px' }}>
                <X size={18} />
              </button>
            </div>

            {/* Замовлення */}
            <div style={{ marginBottom: '12px', padding: '10px 12px', background: 'var(--bg-soft)', borderRadius: '8px', border: '1px solid var(--border)', fontSize: '13px', color: 'var(--text-secondary)' }}>
              Замовлення: <strong>{po.doc_number}</strong>
              {po.total_cost && <span style={{ color: 'var(--text-muted)', marginLeft: '8px' }}>{fmt(Number(po.total_cost))} ₴</span>}
            </div>

            {/* Контакти постачальника */}
            {sendContacts.length > 0 && (
              <div style={{ marginBottom: '12px' }}>
                <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '6px' }}>
                  Контакти постачальника
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                  {sendContacts.map((c, ci) => {
                    const isSelected = sendEmail === c.email;
                    return (
                      <button key={ci} type="button"
                        onClick={() => setSendEmail(c.email)}
                        style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '7px 10px', borderRadius: '7px', cursor: 'pointer', textAlign: 'left', border: `1.5px solid ${isSelected ? '#1E3A5F' : 'var(--border)'}`, background: isSelected ? '#EFF4FF' : 'var(--bg-soft)' }}>
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

            {/* Email input */}
            <div style={{ marginBottom: '6px', fontSize: '12px', fontWeight: 700, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '5px', textTransform: 'uppercase' }}>
              <Mail size={12} /> {sendContacts.length > 0 ? 'Або інший email' : 'Email отримувача'}
            </div>
            <input
              value={sendEmail}
              onChange={e => setSendEmail(e.target.value)}
              placeholder="email@supplier.com"
              style={{ width: '100%', padding: '9px 12px', borderRadius: '8px', border: `1.5px solid ${sendEmail.includes('@') ? 'var(--border)' : '#FCA5A5'}`, fontSize: '14px', color: 'var(--text-primary)', background: 'var(--bg-soft)', boxSizing: 'border-box', outline: 'none', marginBottom: '6px' }}
            />
            {sendContacts.length === 0 && !po.supplier_email && (
              <div style={{ fontSize: '11px', color: '#B45309', background: '#FEF3C7', padding: '6px 10px', borderRadius: '6px', marginBottom: '4px' }}>
                ⚠ Контакти не додано — додайте їх у картці постачальника
              </div>
            )}

            <div style={{ display: 'flex', gap: '10px', marginTop: '20px' }}>
              <button
                onClick={() => setShowSendModal(false)}
                style={{ flex: 1, height: '40px', borderRadius: '8px', border: '1px solid var(--border)', background: 'none', cursor: 'pointer', fontSize: '13px', fontWeight: 600, color: 'var(--text-muted)' }}>
                Скасувати
              </button>
              <button
                onClick={handleSendToSupplier}
                disabled={sendingMail || !sendEmail.includes('@')}
                style={{ flex: 2, height: '40px', borderRadius: '8px', border: 'none', background: sendEmail.includes('@') ? '#1E3A5F' : '#94A3B8', color: '#fff', cursor: sendEmail.includes('@') ? 'pointer' : 'not-allowed', fontSize: '14px', fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '7px', opacity: sendingMail ? 0.7 : 1 }}>
                {sendingMail ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <Send size={14} />}
                Відправити
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Модалка скасування замовлення */}
      {showCancelModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 3000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: 'var(--bg-card)', borderRadius: '16px', padding: '28px', width: '420px', boxShadow: '0 20px 60px rgba(0,0,0,0.25)' }}>
            <div style={{ fontSize: '16px', fontWeight: 800, color: '#DC2626', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              🚫 Скасувати замовлення?
            </div>
            <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '16px' }}>
              <strong>{po.doc_number}</strong> · {po.supplier_name}<br />
              <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Цю дію не можна відмінити. Замовлення буде анульовано.</span>
            </p>
            <div style={{ marginBottom: '16px' }}>
              <label style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', display: 'block', marginBottom: '4px', textTransform: 'uppercase' }}>
                Причина скасування (необов&apos;язково)
              </label>
              <textarea
                value={cancelReason}
                onChange={e => setCancelReason(e.target.value)}
                placeholder="Наприклад: постачальник не може виконати замовлення"
                rows={3}
                style={{ width: '100%', padding: '9px 12px', borderRadius: '8px', border: '1.5px solid var(--border)', fontSize: '13px', color: 'var(--text-primary)', background: 'var(--bg-soft)', boxSizing: 'border-box', outline: 'none', resize: 'vertical', fontFamily: 'inherit' }}
              />
            </div>
            <div style={{ display: 'flex', gap: '10px' }}>
              <button
                onClick={() => { setShowCancelModal(false); setCancelReason(''); }}
                style={{ flex: 1, height: '40px', borderRadius: '8px', border: '1px solid var(--border)', background: 'none', cursor: 'pointer', fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)' }}>
                Назад
              </button>
              <button
                onClick={handleCancel}
                disabled={cancelling}
                style={{ flex: 1, height: '40px', borderRadius: '8px', border: 'none', background: '#DC2626', color: '#fff', cursor: cancelling ? 'default' : 'pointer', fontSize: '14px', fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '7px', opacity: cancelling ? 0.7 : 1 }}>
                {cancelling ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> : null}
                Скасувати замовлення
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Модалка скасування оплати */}
      {showReverseModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 3000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: 'var(--bg-card)', borderRadius: '16px', padding: '28px', width: '420px', boxShadow: '0 20px 60px rgba(0,0,0,0.25)' }}>
            <div style={{ fontSize: '16px', fontWeight: 800, color: '#DC2626', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              🚫 Скасувати оплату?
            </div>
            <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '8px' }}>
              <strong>{po.doc_number}</strong> · {po.supplier_name}
            </p>
            <div style={{ padding: '10px 12px', background: '#FEF3C7', borderRadius: '8px', fontSize: '12px', color: '#92400E', marginBottom: '16px' }}>
              ⚠ Буде проведено компенсуючу проводку в леджері. Дія тільки для адміністратора.
            </div>
            <div style={{ marginBottom: '16px' }}>
              <label style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', display: 'block', marginBottom: '4px', textTransform: 'uppercase' }}>
                Причина скасування (необов&apos;язково)
              </label>
              <input
                value={reverseReason}
                onChange={e => setReverseReason(e.target.value)}
                placeholder="Наприклад: помилкова оплата"
                style={{ width: '100%', padding: '9px 12px', borderRadius: '8px', border: '1.5px solid var(--border)', fontSize: '13px', color: 'var(--text-primary)', background: 'var(--bg-soft)', boxSizing: 'border-box', outline: 'none' }}
              />
            </div>
            <div style={{ display: 'flex', gap: '10px' }}>
              <button onClick={() => { setShowReverseModal(false); setReverseReason(''); }}
                style={{ flex: 1, height: '40px', borderRadius: '8px', border: '1px solid var(--border)', background: 'none', cursor: 'pointer', fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)' }}>
                Назад
              </button>
              <button onClick={handleReversePayment} disabled={reversing}
                style={{ flex: 1, height: '40px', borderRadius: '8px', border: 'none', background: '#DC2626', color: '#fff', cursor: reversing ? 'default' : 'pointer', fontSize: '14px', fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', opacity: reversing ? 0.7 : 1 }}>
                {reversing ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> : null}
                Скасувати оплату
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}
