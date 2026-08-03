'use client';

import { useState, useEffect, useRef, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { MapPin, CreditCard, Phone, Building2, Package, Hash, Truck, RefreshCw, Pencil, Trash2, Plus, X, Check, TrendingUp, ChevronDown, ChevronUp, Search, Printer, ShoppingCart, Mail, Send, Copy, ClipboardList, MoreHorizontal, Save } from 'lucide-react';
import type { OrderFulfillmentInfo } from '../../lib/accounting/dropship';
import type { FulfillmentSource } from '../../lib/accounting/fulfillment';

type EnrichedFulfillmentSource = FulfillmentSource & {
  available_own: number;
  supplier_in_stock: boolean;
};

type FulfillmentData = OrderFulfillmentInfo & {
  plan?: { items: EnrichedFulfillmentSource[]; has_own: boolean; has_dropship: boolean; unresolved: string[] };
  reservations?: { sku: string; qty: number; warehouse_id: number; reservation_status: string }[];
  /** Факт з леджера (є, коли проведена ≥1 РН): виручка/COGS/комісія/доставка за проводками */
  fact?: { revenue: number; cogs: number; commission: number; delivery: number; posted_docs: number } | null;
  /** Серверна оцінка комісії МП (брекети Rozetka / категорійні ставки Prom) для непроведених */
  commission_estimate?: number | null;
};
import CreateTTNModal from '../components/admin/CreateTTNModal';
import { getSupabaseBrowser } from '../../lib/supabase-browser';
import { showConfirm } from '../../lib/confirm';
import { showToast } from '../../lib/toast';
import SmartDateInput from '../components/SmartDateInput';
import InvoiceMessengerButtons from '../components/InvoiceMessengerButtons';
import InvoiceOptionsModal from '../components/admin/InvoiceOptionsModal';
import ReturnOrderModal from '../components/admin/ReturnOrderModal';
import { rozetkaStatusLabel, isRozetkaAhead } from '../../lib/rozetka-status';
import RozetkaDeliveryTtnModal from '../components/admin/RozetkaDeliveryTtnModal';

type OrderItem = { sku: string; name: string; brand: string; qty: number; price: number; is_bonus?: boolean; supplier_sku?: string };

type PromCommissionItem = {
  sku: string; item_total: number; commission_pct: number; commission_amt: number; category_slug: string | null;
};
type PromCommissionData = {
  total_commission: number; net_revenue: number; plan: string; items: PromCommissionItem[];
};

type RozetkaCommissionItem = {
  sku: string; item_total: number; commission_pct: number; commission_amt: number; category_slug: string | null;
};
type RozetkaCommissionData = {
  total_commission: number; net_revenue: number; items: RozetkaCommissionItem[];
};

type Order = {
  id: string;
  order_number: number;
  created_at: string;
  status: string;
  internal_note?: string | null;
  flags?: string[] | null;
  total_price: number;
  company: string | null;
  contact: string;
  phone: string;
  email: string;
  delivery_type: string;
  delivery_subtype: string | null;
  delivery_address: string | null;
  delivery_city_ref: string | null;
  delivery_city_name: string | null;
  delivery_warehouse_ref: string | null;
  payment_type: string;
  comment: string | null;
  tracking_number: string | null;
  carrier_accepted_at: string | null;
  carrier_status_text: string | null;
  carrier_status_synced_at: string | null;
  payment_confirmed:  boolean;
  amount_paid:        number;
  callback_done:      boolean;
  invoice_as_company: boolean | null;
  invoice_options:    Record<string, boolean> | null;
  supplier_sent_at:   string | null;
  channel_code:       string | null;
  prom_order_id:      string | number | null;
  rozetka_order_id:   string | number | null;
  customer_id:        string | null;
  price_type:         string | null;
  discount_pct:       number | null;
  discount_amount:    number | null;
  shipping_supplier_id: number | null;
  mp_refund_status:   string | null;
  fulfillment_mode:   string | null;
  confirmed_at:       string | null;
  shipped_at:         string | null;
  delivered_at:       string | null;
  cancelled_at:       string | null;
  status_history:     { status: string; at: string; by: string }[] | null;
  payment_due_date:   string | null;
  items: OrderItem[];
  prom_data:          ({ _commission?: PromCommissionData } & Record<string, unknown>) | null;
  rozetka_data:       ({ _commission?: RozetkaCommissionData } & Record<string, unknown>) | null;
};

const CHANNEL_LABEL: Record<string, { label: string; color: string; bg: string }> = {
  website:  { label: 'Магазин',  color: 'var(--brand-blue)', bg: '#EFF4FF' },
  b2b:      { label: 'Опт',      color: '#6B21A8', bg: '#FAF5FF' },
  dropship: { label: 'Дроп',     color: '#0E7490', bg: '#ECFEFF' },
  retail:   { label: 'Роздріб',  color: '#B45309', bg: '#FEF3C7' },
  phone:    { label: 'Телефон',  color: 'var(--text-primary)', bg: '#F3F4F6' },
  prom:     { label: 'Prom',     color: '#C2410C', bg: '#FFF7ED' },
  rozetka:  { label: 'Rozetka',  color: '#15803D', bg: '#DCFCE7' },
};

const STATUSES = [
  { value: 'new',            label: 'Нове',            color: 'var(--brand-blue)', bg: '#EFF4FF' },
  { value: 'pending_payment',label: 'Очікує оплату',   color: '#64748B', bg: '#F1F5F9' },
  { value: 'confirmed',      label: 'Підтверджено',    color: '#15803D', bg: '#DCFCE7' },
  { value: 'awaiting_stock', label: 'Очікуємо товар',  color: '#7C3AED', bg: '#F5F3FF' },
  { value: 'picking',        label: 'Збирається',      color: '#0E7490', bg: '#ECFEFF' },
  { value: 'shipped',        label: 'Відправлено',     color: '#B45309', bg: '#FEF3C7' },
  { value: 'delivered',      label: 'Доставлено',      color: '#15803D', bg: '#DCFCE7' },
  { value: 'cancelled',      label: 'Скасовано',       color: '#DC2626', bg: '#FEE2E2' },
];

const DELIVERY_LABEL: Record<string, string> = {
  nova: 'Нова Пошта', nova_poshta: 'Нова Пошта', kharkiv: 'Харків і область', pickup: 'Самовивіз',
  // Точки видачі Rozetka: накладна оформлюється власним API Rozetka, не НП
  rozetka_delivery: 'Rozetka Доставка',
};

const PAYMENT_LABEL: Record<string, string> = {
  invoice: 'Безготівковий', cod: 'Оплата при отриманні', card: 'Картка онлайн',
};

const STATUS_RANK: Record<string, number> = {
  new: 0, confirmed: 1, awaiting_stock: 2, picking: 3, shipped: 4, delivered: 5,
};

/**
 * Знімок статусу в кабінеті Rozetka — його оновлює крон синку замовлень.
 * Наш статус змінюється тільки штатним роутом (резерви, документи), тож плашка
 * лише показує, що менеджер уже зробив у кабінеті, і нічого не перемикає.
 */
function rozetkaCabinet(order: Order): { label: string; ahead: boolean; at: string | null } | null {
  if (order.channel_code !== 'rozetka') return null;
  const raw = order.rozetka_data?.status;
  const id = typeof raw === 'number' ? raw : null;
  const label = rozetkaStatusLabel(id);
  if (!label) return null;
  const seen = order.rozetka_data?._status_synced_at;
  return { label, ahead: isRozetkaAhead(id, order.status), at: typeof seen === 'string' ? seen : null };
}

// Читабельний формат телефону: +380 (95) 172-76-41. Для tel: використовуємо сирий номер.
function formatPhone(raw: string): string {
  const d = (raw || '').replace(/\D/g, '');
  const parts = (op: string, a: string, b: string, c: string) => `+380 (${op}) ${a}-${b}-${c}`;
  if (d.length === 12 && d.startsWith('380')) return parts(d.slice(3, 5), d.slice(5, 8), d.slice(8, 10), d.slice(10, 12));
  if (d.length === 10 && d.startsWith('0'))   return parts(d.slice(1, 3), d.slice(3, 6), d.slice(6, 8), d.slice(8, 10));
  return raw;
}

interface AdminOrdersProps {
  initialOrders: Order[];
  currentPage?: number;
  totalPages?: number;
  userRole?: string;
  hasRecentReceipts?: boolean;
  expandOrderId?: string;
  dateFrom?: string;
  dateTo?: string;
  statusCounts?: Record<string, number>;
  currentStatus?: string;
  sortBy?: string;
  sortDir?: string;
  promCommissionPct?: number;
  rozetkaCommissionPct?: number;
  initialSaleDocs?: Record<string, { id: string; number: string }[]>;
  initialReturnDocs?: Record<string, { id: string; number: string }[]>;
  initialShippedQty?: Record<string, Record<string, number>>;
}

export default function AdminOrders({
  initialOrders, currentPage = 1, totalPages = 1, userRole = 'admin',
  hasRecentReceipts = false, expandOrderId, dateFrom, dateTo,
  statusCounts = {}, currentStatus = '',
  sortBy = 'created_at', sortDir = 'desc',
  promCommissionPct = 3,
  rozetkaCommissionPct = 15,
  initialSaleDocs = {}, initialReturnDocs = {}, initialShippedQty = {},
}: AdminOrdersProps) {
  const isAdmin = userRole === 'admin';
  const router = useRouter();
  const [orders, setOrders]         = useState<Order[]>(initialOrders);
  // Sync when server re-renders with new sort/filter
  useEffect(() => { setOrders(initialOrders); }, [initialOrders]);

  // Список постачальників для вибору фактичного постачальника відвантаження
  const [suppliersList, setSuppliersList] = useState<{ id: number; name: string }[]>([]);
  useEffect(() => {
    fetch('/api/admin/suppliers')
      .then(r => (r.ok ? r.json() : []))
      .then((rows: { id: number; name: string }[]) =>
        setSuppliersList(Array.isArray(rows) ? rows.map(s => ({ id: s.id, name: s.name })) : []))
      .catch(() => setSuppliersList([]));
  }, []);

  // Модал повернення від покупця
  const [returnFor, setReturnFor] = useState<{ id: string; number: number } | null>(null);

  const PRICE_TYPE_LABELS: Record<string, string> = { retail: 'Роздріб', wholesale: 'Опт', drop: 'Дроп' };

  async function changePriceType(orderId: string, priceType: string) {
    const ok = await showConfirm(
      `Перерахувати всі позиції за тарифом «${PRICE_TYPE_LABELS[priceType] ?? priceType}»? Ціни та суму замовлення буде змінено.`,
    );
    if (!ok) return;
    try {
      const res = await fetch(`/api/admin/orders/${orderId}/reprice`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ price_type: priceType }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setOrders(prev => prev.map(o => o.id === orderId
          ? { ...o, price_type: priceType, items: data.items ?? o.items, total_price: data.total_price ?? o.total_price }
          : o));
        showToast(`Тип цін: ${PRICE_TYPE_LABELS[priceType]} · нова сума ${Number(data.total_price).toFixed(2)} ₴`, 'success');
      } else {
        showToast(data.error ?? 'Помилка перерахунку', 'error');
      }
    } catch {
      showToast('Мережева помилка', 'error');
    }
  }

  // Ручна знижка по замовленню — зашивається в построчну ціну (Варіант A).
  // mode 'pct' — відсоток, 'amount' — сума грн (сервер переведе у %). 0 знімає знижку.
  async function applyDiscount(orderId: string, mode: 'pct' | 'amount', value: number) {
    const clean = Number(value);
    if (Number.isNaN(clean) || clean < 0) { showToast('Некоректне значення знижки', 'error'); return; }
    const label = mode === 'pct' ? `${clean}%` : `${clean.toFixed(2)} ₴`;
    const ok = clean === 0
      ? await showConfirm('Прибрати знижку і повернути повні ціни?')
      : await showConfirm(`Застосувати знижку ${label}? Ціни всіх позицій буде знижено.`);
    if (!ok) return;
    try {
      const res = await fetch(`/api/admin/orders/${orderId}/discount`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(mode === 'pct' ? { pct: clean } : { amount: clean }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setOrders(prev => prev.map(o => o.id === orderId
          ? { ...o, items: data.items ?? o.items, total_price: data.total_price ?? o.total_price, discount_pct: data.discount_pct ?? 0, discount_amount: data.discount_amount ?? 0 }
          : o));
        showToast(
          data.discount_pct > 0
            ? `Знижка ${data.discount_pct}% (−${Number(data.discount_amount).toFixed(2)} ₴) · сума ${Number(data.total_price).toFixed(2)} ₴`
            : 'Знижку прибрано',
          'success',
        );
      } else {
        showToast(data.error ?? 'Помилка знижки', 'error');
      }
    } catch {
      showToast('Мережева помилка', 'error');
    }
  }

  async function setShippingSupplier(orderId: string, supplierId: number | null) {
    const res = await fetch(`/api/admin/orders/${orderId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ shipping_supplier_id: supplierId }),
    });
    if (res.ok) {
      setOrders(prev => prev.map(o => o.id === orderId ? { ...o, shipping_supplier_id: supplierId } : o));
      showToast(supplierId ? 'Постачальника відвантаження збережено' : 'Постачальника відвантаження скинуто');
    } else {
      showToast('Не вдалося зберегти постачальника', 'error');
    }
  }

  const [channelFilter, setChannelFilter] = useState('');
  // «Уже оброблені в кабінеті» — замовлення, які на Rozetka рухнули далі, ніж у нас
  const [cabinetAheadOnly, setCabinetAheadOnly] = useState(false);
  const [search, setSearch]         = useState('');
  const [loading, setLoading]       = useState<string | null>(null);
  const [ttnValues, setTtnValues] = useState<Record<string, string>>(
    Object.fromEntries(initialOrders.map(o => [o.id, o.tracking_number ?? '']))
  );
  const [ttnSaving,      setTtnSaving]      = useState<string | null>(null);
  const [ttnDeleting,    setTtnDeleting]    = useState<string | null>(null);
  const [registryAdding, setRegistryAdding] = useState<string | null>(null);
  const [registryAdded,  setRegistryAdded]  = useState<Set<string>>(new Set());
  const [registryBulkLoading, setRegistryBulkLoading] = useState(false);
  const [invoiceCfg,     setInvoiceCfg]     = useState<Order | null>(null);
  type ContactEntry = { name: string; email: string; note?: string };
  type SupplierQItem = { orderId: string; orderNumber: number; supplierName: string; supplierId: number | null; email: string; contacts: ContactEntry[]; comment: string };
  const [supplierQueue,        setSupplierQueue]        = useState<SupplierQItem[] | null>(null);
  const [supplierQueueIdx,     setSupplierQueueIdx]     = useState(0);
  const [supplierQueueLoading, setSupplierQueueLoading] = useState(false);
  const [supplierQueueSending, setSupplierQueueSending] = useState(false);
  const [supplierQueueDone,    setSupplierQueueDone]    = useState(false);
  // Масова відправка: замовлення згруповані по постачальнику → один лист на постачальника
  type BulkGroup = { supplierId: number | null; supplierName: string; orderNumbers: number[]; email: string; contacts: ContactEntry[] };
  type BulkResult = { supplierName: string; emailed: boolean; orderNumbers: number[] };
  const [bulkGroups,   setBulkGroups]   = useState<BulkGroup[] | null>(null);
  const [bulkOrderIds, setBulkOrderIds] = useState<string[]>([]);
  const [bulkComment,  setBulkComment]  = useState('');
  const [bulkSending,  setBulkSending]  = useState(false);
  const [bulkResults,  setBulkResults]  = useState<BulkResult[] | null>(null);
  // Відправники (основний + додаткові) — вибір «від кого» слати постачальнику
  const [senders,      setSenders]      = useState<{ name: string; email: string }[]>([]);
  const [chosenSender, setChosenSender] = useState('');
  useEffect(() => {
    fetch('/api/admin/procurement/senders')
      .then(r => r.json())
      .then(d => { const list = d.senders ?? []; setSenders(list); if (list[0]) setChosenSender(list[0].email); })
      .catch(() => {});
  }, []);
  const [ttnModalOrder,  setTtnModalOrder]  = useState<Order | null>(null);
  const [rzTtnModal,     setRzTtnModal]     = useState<Order | null>(null);
  const [syncing,        setSyncing]        = useState(false);
  const [syncResult,     setSyncResult]     = useState<{ updated: number; accepted?: number; checked: number } | null>(null);
  const [creatingPo,     setCreatingPo]     = useState<string | null>(null);

  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [flashId,    setFlashId]    = useState<string | null>(null);
  const [sourceOverrides, setSourceOverrides] = useState<Record<string, Record<string, 'own' | 'dropship'>>>({});
  const [shipping,      setShipping]      = useState<string | null>(null);
  const [saleDocMap,    setSaleDocMap]    = useState<Record<string, { id: string; number: string }[]>>(initialSaleDocs);
  const [shippedQtyMap, setShippedQtyMap] = useState<Record<string, Record<string, number>>>(initialShippedQty);
  type ShipModalItem = { sku: string; name: string; brand: string; orderQty: number; shippedQty: number; shipQty: number };
  const [shipModal, setShipModal] = useState<{ orderId: string; items: ShipModalItem[]; ttn: string; isProm: boolean } | null>(null);
  const [editDeliveryId,   setEditDeliveryId]   = useState<string | null>(null);
  const [editDeliveryForm, setEditDeliveryForm] = useState<{ type: string; subtype: string; cityName: string; address: string }>({ type: '', subtype: '', cityName: '', address: '' });
  const [savingDelivery,   setSavingDelivery]   = useState(false);
  const [editPaymentTypeId,    setEditPaymentTypeId]    = useState<string | null>(null);
  const [editPaymentTypeValue, setEditPaymentTypeValue] = useState('');
  const [savingPaymentType,    setSavingPaymentType]    = useState(false);
  const [reserving, setReserving] = useState<string | null>(null);
  const [selectedMode, setSelectedMode] = useState<Record<string, 'supplier' | 'own' | 'mixed'>>({});
  const [confirming, setConfirming] = useState<string | null>(null);
  const [confirmErrors, setConfirmErrors] = useState<Record<string, { error: string; insufficient?: { sku: string; requested: number; available: number }[] }>>({});
  const [copiedSku, setCopiedSku] = useState<string | null>(null);

  // Edit order items
  const [editingId,   setEditingId]   = useState<string | null>(null);
  const [editItems,   setEditItems]   = useState<OrderItem[]>([]);
  const [editSaving,  setEditSaving]  = useState(false);
  const [addName,     setAddName]     = useState('');
  const [addQty,      setAddQty]      = useState(1);
  const [addPrice,    setAddPrice]    = useState('');
  const [addSku,      setAddSku]      = useState('');
  const [prodSearch,  setProdSearch]  = useState('');
  const [prodResults, setProdResults] = useState<{sku:string;name:string;brand:string;price:number}[]>([]);
  const [prodOpen,    setProdOpen]    = useState(false);
  const prodRef = useRef<HTMLDivElement>(null);

  // Часткові оплати
  type OrderPayment = { id: string; amount: number; payment_mode: string; payment_date: string; note: string | null; reversed: boolean; created_at: string; created_by: string | null };
  const [orderPayments,    setOrderPayments]    = useState<Record<string, OrderPayment[]>>({});
  const [payFormOpen,      setPayFormOpen]      = useState<Record<string, boolean>>({});
  const [payFormAmount,    setPayFormAmount]    = useState<Record<string, string>>({});
  const [payFormMode,      setPayFormMode]      = useState<Record<string, string>>({});
  const [payFormDate,      setPayFormDate]      = useState<Record<string, string>>({});
  const [payFormNote,      setPayFormNote]      = useState<Record<string, string>>({});
  const [discInput,        setDiscInput]        = useState<Record<string, string>>({});
  const [discMode,         setDiscMode]         = useState<Record<string, 'pct' | 'amount'>>({});
  const [priceBlockOpen,   setPriceBlockOpen]   = useState<Record<string, boolean>>({});
  const [finLogOpen,       setFinLogOpen]       = useState<Record<string, boolean>>({});
  const [statusEditOpen,   setStatusEditOpen]   = useState<Record<string, boolean>>({});
  const [itemsExpanded,    setItemsExpanded]    = useState<Record<string, boolean>>({});
  // Позиція свайпу стрічки карток (Клієнт/Оплата) на мобілці — для стрілок ‹ / ›
  const [cardSwipe,        setCardSwipe]        = useState<Record<string, 'start' | 'mid' | 'end'>>({});
  const [itemImages,       setItemImages]       = useState<Record<string, Record<string, string | null>>>({});
  const [payFormSaving,    setPayFormSaving]    = useState<Record<string, boolean>>({});
  const [payRemoving,      setPayRemoving]      = useState<string | null>(null);

  async function loadPayments(orderId: string) {
    const res = await fetch(`/api/admin/orders/${orderId}/payments`);
    if (!res.ok) return;
    const data = await res.json();
    setOrderPayments(prev => ({ ...prev, [orderId]: data }));
  }

  async function addPayment(order: Order) {
    const amount = parseFloat(payFormAmount[order.id] ?? '');
    if (!amount || amount <= 0) return;
    setPayFormSaving(prev => ({ ...prev, [order.id]: true }));
    const res = await fetch(`/api/admin/orders/${order.id}/payments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        amount,
        payment_mode: payFormMode[order.id] ?? 'cash',
        payment_date: payFormDate[order.id] ?? new Date().toISOString().slice(0, 10),
        note: payFormNote[order.id] || null,
      }),
    });
    const data = await res.json();
    if (res.ok) {
      setOrders(prev => prev.map(o => o.id === order.id
        ? { ...o, amount_paid: data.amount_paid, payment_confirmed: data.is_fully_paid }
        : o,
      ));
      setOrderPayments(prev => ({ ...prev, [order.id]: [...(prev[order.id] ?? []), data.payment] }));
      setPayFormOpen(prev => ({ ...prev, [order.id]: false }));
      setPayFormAmount(prev => ({ ...prev, [order.id]: '' }));
      setPayFormNote(prev => ({ ...prev, [order.id]: '' }));
    }
    setPayFormSaving(prev => ({ ...prev, [order.id]: false }));
  }

  async function reversePayment(order: Order, paymentId: string) {
    if (!confirm('Скасувати цей платіж?')) return;
    setPayRemoving(paymentId);
    const res = await fetch(`/api/admin/orders/${order.id}/payments/${paymentId}`, { method: 'DELETE' });
    const data = await res.json();
    if (res.ok) {
      setOrders(prev => prev.map(o => o.id === order.id
        ? { ...o, amount_paid: data.amount_paid, payment_confirmed: data.is_fully_paid }
        : o,
      ));
      setOrderPayments(prev => ({
        ...prev,
        [order.id]: (prev[order.id] ?? []).map(p => p.id === paymentId ? { ...p, reversed: true } : p),
      }));
    }
    setPayRemoving(null);
  }

  // Fulfillment / margin info
  const [fulfillmentData,    setFulfillmentData]    = useState<Record<string, FulfillmentData>>({});
  const [fulfillmentOpen,    setFulfillmentOpen]    = useState<Set<string>>(new Set());
  const [fulfillmentLoading, setFulfillmentLoading] = useState<Set<string>>(new Set());

  // PO-звязки для кожного замовлення
  type LinkedPO = { id: string; doc_number: string; doc_date: string; expected_date: string | null; created_at: string; procurement_status: string | null; total_cost: number | null; supplier: { name: string } | null };
  type LinkedReceipt = { id: string; doc_number: string; doc_date: string; created_at: string; total_cost: number | null; parent_doc_id: string };
  type ReceiptLine   = { document_id: string; sku: string; qty_actual: number | null; qty: number };
  const [linkedPOs,       setLinkedPOs]       = useState<Record<string, LinkedPO[]>>({});
  const [linkedReceipts,  setLinkedReceipts]  = useState<Record<string, LinkedReceipt[]>>({});
  const [receiptLines,    setReceiptLines]    = useState<Record<string, ReceiptLine[]>>({});

  async function loadLinkedPOs(orderId: string) {
    if (linkedPOs[orderId]) return;
    try {
      const res = await fetch(`/api/admin/orders/${orderId}/purchase-orders`);
      const data = await res.json();
      setLinkedPOs(prev => ({ ...prev, [orderId]: data.pos ?? [] }));
      setLinkedReceipts(prev => ({ ...prev, [orderId]: data.receipts ?? [] }));
      setReceiptLines(prev => ({ ...prev, [orderId]: data.receiptLines ?? [] }));
    } catch { /* silent */ }
  }

  async function loadFulfillment(orderId: string) {
    if (fulfillmentData[orderId]) return;
    setFulfillmentLoading(prev => new Set([...prev, orderId]));
    try {
      const res = await fetch(`/api/admin/orders/${orderId}/fulfillment`);
      const data = await res.json();
      setFulfillmentData(prev => ({ ...prev, [orderId]: data }));
    } finally {
      setFulfillmentLoading(prev => { const s = new Set(prev); s.delete(orderId); return s; });
    }
  }

  async function toggleFulfillment(orderId: string) {
    if (fulfillmentOpen.has(orderId)) {
      setFulfillmentOpen(prev => { const s = new Set(prev); s.delete(orderId); return s; });
      return;
    }
    setFulfillmentOpen(prev => new Set([...prev, orderId]));
    await loadFulfillment(orderId);
  }

  async function confirmOrder(orderId: string) {
    const mode = selectedMode[orderId] ?? 'supplier';
    setConfirming(orderId);
    setConfirmErrors(prev => { const n = { ...prev }; delete n[orderId]; return n; });
    try {
      const res = await fetch(`/api/admin/orders/${orderId}/confirm`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fulfillment_mode: mode }),
      });
      const data = await res.json();
      if (res.ok) {
        setOrders(prev => prev.map(o => o.id === orderId
          ? { ...o, status: data.status, fulfillment_mode: data.fulfillment_mode }
          : o));
        setFulfillmentData(prev => { const n = { ...prev }; delete n[orderId]; return n; });
        loadFulfillment(orderId);
        router.refresh();
      } else {
        setConfirmErrors(prev => ({ ...prev, [orderId]: { error: data?.error ?? 'Помилка підтвердження', insufficient: data?.insufficient } }));
      }
    } catch (err) {
      console.error('[confirmOrder] fetch failed:', err);
      setConfirmErrors(prev => ({ ...prev, [orderId]: { error: 'Помилка мережі' } }));
    } finally {
      setConfirming(null);
    }
  }

  // Спільне: підтягуємо дані постачальника (email + контакти) для кожного замовлення.
  async function fetchSupplierQItems(orderIds: string[]): Promise<SupplierQItem[]> {
    return Promise.all(orderIds.map(async (oid) => {
      const order = orders.find(o => o.id === oid);
      try {
        const d = await fetch(`/api/admin/orders/${oid}/supplier-order`).then(r => r.json());
        const supplierId: number | null = d.supplier_id ?? null;
        let contacts: ContactEntry[] = [];
        if (supplierId) {
          try {
            const sd = await fetch(`/api/admin/suppliers/${supplierId}`).then(r => r.json());
            contacts = sd.contacts ?? [];
          } catch { /* silent */ }
        }
        const firstContact = contacts.find(c => c.email?.includes('@'));
        const email = firstContact?.email || d.supplier_email || '';
        return { orderId: oid, orderNumber: order?.order_number ?? 0, supplierName: d.supplier_name ?? '—', supplierId, email, contacts, comment: '' };
      } catch {
        return { orderId: oid, orderNumber: order?.order_number ?? 0, supplierName: '—', supplierId: null, email: '', contacts: [], comment: '' };
      }
    }));
  }

  async function confirmMissingTtn(orderIds: string[]): Promise<boolean> {
    const missingTtn = orderIds.some(oid => !orders.find(o => o.id === oid)?.tracking_number);
    if (!missingTtn) return true;
    return showConfirm('ТТН не створена для цього замовлення. Все одно відправити постачальнику?');
  }

  // Поштучна відправка — модалка веде по одному замовленню (вибір контакту, коментар).
  async function startSupplierSend(orderIds: string[]) {
    if (!(await confirmMissingTtn(orderIds))) return;
    setSupplierQueueLoading(true);
    setSupplierQueueDone(false);
    const items = await fetchSupplierQItems(orderIds);
    setSupplierQueueLoading(false);
    setSupplierQueue(items);
    setSupplierQueueIdx(0);
  }

  // Масова відправка — один лист на постачальника (замовлення згруповані).
  async function startBulkSupplierSend(orderIds: string[]) {
    if (!(await confirmMissingTtn(orderIds))) return;
    setSupplierQueueLoading(true);
    const items = await fetchSupplierQItems(orderIds);
    setSupplierQueueLoading(false);

    const groupMap = new Map<string, BulkGroup>();
    for (const it of items) {
      const key = it.supplierId != null ? `s${it.supplierId}` : `n:${it.supplierName}`;
      if (!groupMap.has(key)) {
        groupMap.set(key, { supplierId: it.supplierId, supplierName: it.supplierName, orderNumbers: [], email: it.email, contacts: it.contacts });
      }
      const g = groupMap.get(key)!;
      g.orderNumbers.push(it.orderNumber);
      if (!g.email && it.email) g.email = it.email;
      if (g.contacts.length === 0 && it.contacts.length > 0) g.contacts = it.contacts;
    }
    const groups = [...groupMap.values()].map(g => ({ ...g, orderNumbers: [...new Set(g.orderNumbers)].sort((a, b) => a - b) }));
    setBulkGroups(groups);
    setBulkOrderIds(orderIds);
    setBulkComment('');
    setBulkResults(null);
  }

  async function sendBulkSuppliers() {
    if (!bulkGroups) return;
    setBulkSending(true);
    try {
      const emailOverrides: Record<string, string> = {};
      for (const g of bulkGroups) {
        if (g.supplierId != null && g.email.includes('@')) emailOverrides[String(g.supplierId)] = g.email.trim();
      }
      const res = await fetch('/api/admin/supplier-orders/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderIds: bulkOrderIds, comment: bulkComment || undefined, senderEmail: chosenSender || undefined, emailOverrides }),
      });
      const data = await res.json();
      const results: BulkResult[] = (data.results ?? []).map((r: { supplier_name: string; emailed: boolean; order_numbers: number[] }) =>
        ({ supplierName: r.supplier_name, emailed: r.emailed, orderNumbers: r.order_numbers ?? [] }));
      setBulkResults(results);
      const sentIds: string[] = data.sent_order_ids ?? [];
      if (sentIds.length) {
        const sentAt = new Date().toISOString();
        setOrders(prev => prev.map(o => sentIds.includes(o.id) ? { ...o, supplier_sent_at: sentAt } : o));
      }
    } catch {
      setBulkResults([{ supplierName: '—', emailed: false, orderNumbers: [] }]);
    } finally {
      setBulkSending(false);
    }
  }

  function advanceSupplierQueue() {
    if (!supplierQueue) return;
    const next = supplierQueueIdx + 1;
    if (next >= supplierQueue.length) { setSupplierQueue(null); }
    else { setSupplierQueueIdx(next); setSupplierQueueDone(false); }
  }

  async function sendCurrentSupplier() {
    if (!supplierQueue) return;
    const item = supplierQueue[supplierQueueIdx];
    setSupplierQueueSending(true);
    try {
      await fetch(`/api/admin/orders/${item.orderId}/supplier-order`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ overrideEmail: item.email || undefined, comment: item.comment || undefined, senderEmail: chosenSender || undefined }),
      });
      const sentAt = new Date().toISOString();
      setOrders(prev => prev.map(o => o.id === item.orderId ? { ...o, supplier_sent_at: sentAt } : o));
      setSupplierQueueDone(true);
      setTimeout(() => advanceSupplierQueue(), 1400);
    } catch {
      advanceSupplierQueue();
    } finally {
      setSupplierQueueSending(false);
    }
  }

  async function refreshFulfillment(orderId: string) {
    setFulfillmentLoading(prev => new Set([...prev, orderId]));
    try {
      const res = await fetch(`/api/admin/orders/${orderId}/fulfillment`);
      const data = await res.json();
      setFulfillmentData(prev => ({ ...prev, [orderId]: data }));
    } finally {
      setFulfillmentLoading(prev => { const s = new Set(prev); s.delete(orderId); return s; });
    }
  }

  async function reserveOrder(orderId: string) {
    const fi = fulfillmentData[orderId];
    if (!fi?.plan) return;
    setReserving(orderId);
    try {
      const overrides = sourceOverrides[orderId] ?? {};
      const ownItems = fi.plan.items
        .filter(src => (overrides[src.sku] ?? src.fulfillment_type) === 'own')
        .map(src => ({ sku: src.sku, warehouse_id: src.warehouse_id, qty: src.qty }));
      if (ownItems.length === 0) return;
      await fetch(`/api/admin/orders/${orderId}/reserve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: ownItems }),
      });
      await refreshFulfillment(orderId);
    } finally {
      setReserving(null);
    }
  }

  // Merge orders
  const [selectedIds,    setSelectedIds]    = useState<Set<string>>(new Set());
  const [mergeModal,     setMergeModal]     = useState<Parameters<typeof CreateTTNModal>[0]['order'] | null>(null);

  // Auto-load fulfillment data when order is expanded
  useEffect(() => {
    if (expandedId) loadFulfillment(expandedId);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expandedId]);

  // Статистика клієнта (скільки замовлень + сума) — при розкритті
  const [custStats, setCustStats] = useState<Record<string, { count: number; total: number }>>({});
  useEffect(() => {
    if (!expandedId || custStats[expandedId]) return;
    (async () => {
      try {
        const res = await fetch(`/api/admin/orders/${expandedId}/customer-orders`);
        if (res.ok) { const d = await res.json(); setCustStats(prev => ({ ...prev, [expandedId]: { count: d.count ?? 0, total: d.total ?? 0 } })); }
      } catch { /* ignore */ }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expandedId]);

  // Мініатюри фото товарів — підвантажуємо шляхи з products по SKU при розкритті
  useEffect(() => {
    if (!expandedId || itemImages[expandedId]) return;
    const ord = orders.find(o => o.id === expandedId);
    const skus = ((ord?.items ?? []) as OrderItem[]).map(i => i.sku).filter(Boolean);
    if (skus.length === 0) return;
    (async () => {
      const sb = getSupabaseBrowser();
      const { data } = await sb.from('products').select('sku, image').in('sku', skus);
      const map: Record<string, string | null> = {};
      (data ?? []).forEach((p: { sku: string; image: string | null }) => { map[p.sku] = p.image; });
      setItemImages(prev => ({ ...prev, [expandedId]: map }));
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expandedId]);

  // Відкриваємо замовлення з пропу expandOrderId (передається через ?expand= з page.tsx)
  useEffect(() => {
    if (expandOrderId) {
      setExpandedId(expandOrderId);
      loadLinkedPOs(expandOrderId);
      loadFulfillment(expandOrderId);
      setTimeout(() => {
        document.getElementById(`order-${expandOrderId}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 600);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expandOrderId]);

  // Pre-load current registry TTNs so button shows correct state on mount
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/admin/registers');
        const data = await res.json();
        const sheets = data.sheets ?? [];
        if (sheets.length === 0) return;
        const ref = sheets[0].Ref;
        const res2 = await fetch(`/api/admin/registers?ref=${ref}`);
        const data2 = await res2.json();
        const ttns: string[] = (data2.ttns ?? []).map((t: { ttn: string }) => t.ttn);
        if (ttns.length > 0) setRegistryAdded(new Set(ttns));
      } catch { /* silent */ }
    })();
   
  }, []);

  async function openSupplierPO(order: Order) {
    setCreatingPo(order.id);
    try {
      // Fetch suppliers + fulfillment prices in parallel
      const [suppliers, fi] = await Promise.all([
        fetch('/api/admin/suppliers').then(r => r.json()),
        fulfillmentData[order.id]
          ? Promise.resolve(fulfillmentData[order.id])
          : fetch(`/api/admin/orders/${order.id}/fulfillment`).then(r => r.json()),
      ]);

      // Build cost-price map from fulfillment data
      const costMap: Record<string, number> = {};
      for (const group of fi?.by_supplier ?? []) {
        for (const item of group.items ?? []) {
          if (item.sku && item.cost_price > 0) costMap[item.sku] = item.cost_price;
        }
      }

      const lines = order.items.map(i => ({
        sku: i.sku,
        name: i.brand ? `${i.brand} ${i.name}` : i.name,
        qty: i.qty,
        cost_price: costMap[i.sku] ?? 0,
        matched: !!costMap[i.sku],
      }));

      window.dispatchEvent(new CustomEvent('open-po-draft', {
        detail: {
          suppliers,
          prefill: {
            lines,
            notes:   `Замовлення покупця №${order.order_number}`,
            orderId: order.id,
          },
        },
      }));
    } finally {
      setCreatingPo(null);
    }
  }

  const SYNC_KEY = 'lastDeliverySync';
  const SYNC_INTERVAL_MS = 4 * 60 * 60 * 1000; // 4 години

  async function syncDeliveryStatus() {
    setSyncing(true);
    setSyncResult(null);
    try {
      const res = await fetch('/api/admin/sync-delivery-status', { method: 'POST' });
      const data = await res.json();
      setSyncResult(data);
      if (data.updated > 0 || data.accepted > 0) {
        router.refresh();
      }
      localStorage.setItem(SYNC_KEY, Date.now().toString());
    } catch {
      // silent fail — не заважаємо роботі
    }
    setSyncing(false);
  }

  useEffect(() => {
    const last = parseInt(localStorage.getItem(SYNC_KEY) ?? '0', 10);
    if (Date.now() - last > SYNC_INTERVAL_MS) {
      syncDeliveryStatus();
    }
  }, []);

  // Скасування Rozetka-замовлення вимагає причини (статус 13 «Скасовано
  // адміністратором» продавцю недоступний) — перехоплюємо і питаємо менеджера.
  const [rozCancelFor, setRozCancelFor] = useState<string | null>(null);

  async function changeStatus(id: string, status: string, rozetkaCancelReason?: number) {
    const order = orders.find(o => o.id === id);
    if (status === 'cancelled' && order?.channel_code === 'rozetka' && order.rozetka_order_id && rozetkaCancelReason === undefined) {
      setRozCancelFor(id); // відкриваємо вибір причини; PATCH піде після вибору
      return;
    }
    setLoading(id + status);
    const res = await fetch(`/api/admin/orders/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status, ...(rozetkaCancelReason !== undefined ? { rozetka_cancel_reason: rozetkaCancelReason } : {}) }),
    });
    if (res.ok) {
      setOrders(prev => prev.map(o => o.id === id ? { ...o, status } : o));
    }
    setLoading(null);
  }

  function openEditDelivery(order: Order) {
    setEditDeliveryForm({
      type:     order.delivery_type ?? 'nova',
      subtype:  order.delivery_subtype ?? 'warehouse',
      cityName: order.delivery_city_name ?? '',
      address:  order.delivery_address ?? '',
    });
    setEditDeliveryId(order.id);
  }

  async function saveDelivery(orderId: string) {
    setSavingDelivery(true);
    const f = editDeliveryForm;
    const body: Record<string, unknown> = {
      delivery_type:    f.type,
      delivery_subtype: f.type === 'nova' ? f.subtype : null,
      delivery_city_name: f.type === 'nova' ? f.cityName || null : null,
      delivery_address:   f.type === 'nova' ? f.address || null : (f.type === 'kharkiv' ? f.address || null : null),
    };
    const res = await fetch(`/api/admin/orders/${orderId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (res.ok) {
      setOrders(prev => prev.map(o => o.id === orderId ? {
        ...o,
        delivery_type:    f.type,
        delivery_subtype: f.type === 'nova' ? f.subtype : null,
        delivery_city_name: f.type === 'nova' ? f.cityName || null : null,
        delivery_address:   f.address || null,
      } : o));
      setEditDeliveryId(null);
    }
    setSavingDelivery(false);
  }

  async function savePaymentType(orderId: string, newType: string) {
    setSavingPaymentType(true);
    const res = await fetch(`/api/admin/orders/${orderId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ payment_type: newType }),
    });
    if (res.ok) {
      const data = await res.json().catch(() => ({}));
      setOrders(prev => prev.map(o => o.id === orderId ? {
        ...o,
        payment_type: newType,
        payment_due_date: newType === 'deferred' ? (data.payment_due_date ?? o.payment_due_date) : null,
      } : o));
      setEditPaymentTypeId(null);
    }
    setSavingPaymentType(false);
  }

  async function autoShipDropship(orderId: string) {
    const res = await fetch(`/api/admin/orders/${orderId}/ship`, { method: 'POST' });
    const data = await res.json();
    if (res.ok) {
      if (data.fully_shipped) {
        setOrders(prev => prev.map(o => o.id === orderId ? { ...o, status: 'shipped' } : o));
      }
      if (data.sale_doc_id) {
        setSaleDocMap(prev => ({
          ...prev,
          [orderId]: [...(prev[orderId] ?? []), { id: data.sale_doc_id, number: data.sale_doc_number ?? '' }],
        }));
        if (data.shipped_items) {
          setShippedQtyMap(prev => {
            const cur = { ...(prev[orderId] ?? {}) };
            for (const it of data.shipped_items as { sku: string; qty: number }[]) cur[it.sku] = (cur[it.sku] ?? 0) + it.qty;
            return { ...prev, [orderId]: cur };
          });
        }
        showToast(`Відвантажено · ${data.sale_doc_number ?? 'ВН створено'}`, 'success', 5000);
      } else {
        showToast('Відвантажено', 'success');
      }
    } else {
      showToast(data.error ?? 'Помилка відвантаження', 'error');
    }
  }

  function shipOrder(orderId: string) {
    const order = orders.find(o => o.id === orderId);
    if (!order) return;
    const shippedQty = shippedQtyMap[orderId] ?? {};
    const modalItems = (order.items as OrderItem[]).map(item => ({
      sku:        item.sku,
      name:       item.name,
      brand:      (item as OrderItem & { brand?: string }).brand ?? '',
      orderQty:   item.qty,
      shippedQty: shippedQty[item.sku] ?? 0,
      shipQty:    Math.max(0, item.qty - (shippedQty[item.sku] ?? 0)),
    })).filter(i => i.shipQty > 0);
    if (modalItems.length === 0) {
      showToast('Всі позиції вже відвантажені', 'info');
      return;
    }
    setShipModal({
      orderId,
      items:  modalItems,
      ttn:    order.tracking_number ?? '',
      isProm: order.channel_code === 'prom',
    });
  }

  async function executeShip(orderId: string, items: { sku: string; shipQty: number }[], ttn?: string) {
    setShipModal(null);
    setShipping(orderId);
    try {
      const res = await fetch(`/api/admin/orders/${orderId}/ship`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: items.map(i => ({ sku: i.sku, qty: i.shipQty })),
          ...(ttn ? { ttn } : {}),
        }),
      });
      const data = await res.json();
      if (res.ok) {
        if (data.fully_shipped) {
          setOrders(prev => prev.map(o => o.id === orderId ? { ...o, status: data.status } : o));
          setExpandedId(null);
          setFlashId(orderId);
          setTimeout(() => setFlashId(null), 1800);
        }
        if (data.sale_doc_id) {
          setSaleDocMap(prev => ({
            ...prev,
            [orderId]: [...(prev[orderId] ?? []), { id: data.sale_doc_id, number: data.sale_doc_number ?? '' }],
          }));
        }
        if (data.shipped_items) {
          setShippedQtyMap(prev => {
            const cur = { ...(prev[orderId] ?? {}) };
            for (const it of data.shipped_items as { sku: string; qty: number }[]) cur[it.sku] = (cur[it.sku] ?? 0) + it.qty;
            return { ...prev, [orderId]: cur };
          });
        }
        showToast(
          data.fully_shipped
            ? `✅ Відвантажено · ${data.sale_doc_number}`
            : `📦 Частково відвантажено · ${data.sale_doc_number}`,
          'success', 6000,
        );
      } else {
        showToast(data.error ?? 'Помилка відвантаження', 'error');
      }
    } finally {
      setShipping(null);
    }
  }

  // Product search for add-item
  useEffect(() => {
    if (prodSearch.length < 2) { setProdResults([]); return; }
    const t = setTimeout(async () => {
      const sb = getSupabaseBrowser();
      const { data } = await sb.from('products')
        .select('sku, name, brand, stock:product_stock(price_unit)')
        .or(`name.ilike.%${prodSearch}%,sku.ilike.%${prodSearch}%`)
        .limit(6);
      setProdResults((data ?? []).map((p: { sku: string; name: string; brand: string; stock: { price_unit: number }[] | null }) => ({
        sku: p.sku, name: p.name, brand: p.brand,
        price: p.stock?.[0]?.price_unit ?? 0,
      })));
      setProdOpen(true);
    }, 300);
    return () => clearTimeout(t);
  }, [prodSearch]);

  useEffect(() => {
    function h(e: MouseEvent) {
      if (prodRef.current && !prodRef.current.contains(e.target as Node)) setProdOpen(false);
    }
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  function startEdit(order: Order) {
    setEditingId(order.id);
    setEditItems(order.items.map(i => ({ ...i })));
    setAddName(''); setAddQty(1); setAddPrice(''); setAddSku(''); setProdSearch('');
  }

  async function saveEdit(orderId: string) {
    setEditSaving(true);
    const total = editItems.reduce((s, i) => s + i.price * i.qty, 0);
    await fetch(`/api/admin/orders/${orderId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items: editItems, total_price: total }),
    });
    setOrders(prev => prev.map(o => o.id === orderId ? { ...o, items: editItems, total_price: total } : o));
    setEditingId(null);
    setEditSaving(false);
  }

  function addItem() {
    if (!addName.trim() || addQty < 1) return;
    setEditItems(prev => [
      ...prev,
      { sku: addSku || `MANUAL-${Date.now()}`, name: addName.trim(), brand: '', qty: addQty, price: parseFloat(addPrice) || 0 },
    ]);
    setAddName(''); setAddQty(1); setAddPrice(''); setAddSku(''); setProdSearch('');
  }

  function toggleSelect(id: string) {
    setSelectedIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  /**
   * Накладна створена — одразу віддаємо номер у кабінет Rozetka.
   *
   * Раніше ТТН їхала туди лише в момент «Відправити», тож між створенням
   * накладної й відправкою кабінет про посилку не знав нічого: живий випадок
   * 03.08 — два об'єднані замовлення отримали спільний номер, а в кабінеті
   * обидва так і висіли «Обробляється менеджером» без ТТН.
   *
   * Помилку показуємо, а не ховаємо в консоль: якщо номер не пішов, менеджер
   * має дізнатися про це зараз, а не з претензії покупця.
   */
  async function pushTtnToRozetka(ids: string[]) {
    const targets = orders.filter(o => ids.includes(o.id) && o.channel_code === 'rozetka' && o.rozetka_order_id);
    if (!targets.length) return;
    const failures = (await Promise.all(targets.map(async o => {
      try {
        const res = await fetch(`/api/admin/orders/${o.id}/push-rozetka-ttn`, { method: 'POST' });
        const data = await res.json().catch(() => ({}));
        return res.ok && !data.error ? null : `№${o.order_number}: ${data.error ?? res.status}`;
      } catch (err) {
        return `№${o.order_number}: ${err instanceof Error ? err.message : 'збій мережі'}`;
      }
    }))).filter(Boolean) as string[];

    if (failures.length) showToast(`ТТН не передано в Rozetka — ${failures.join('; ')}`, 'error');
    else showToast(targets.length > 1 ? `ТТН передано в Rozetka (${targets.length} замовлення)` : 'ТТН передано в Rozetka', 'success');
  }

  /**
   * Що робиться після створення накладної — однаково для одного замовлення і
   * для об'єднаної посилки.
   *
   * Раніше цей хвіст існував лише в гілці одиночного замовлення, а об'єднання
   * його не мало зовсім. Через це два об'єднані замовлення на постачальника
   * (03.08, №26081001 і №26081002) лишилися в «Підтверджено» замість того, щоб
   * відвантажитись самі, як робить будь-яке одиночне замовлення в тому ж режимі.
   *
   * Порядок важливий: у режимі «постачальник» відвантаження саме пушить статус
   * і ТТН у маркетплейс, тож окремий пуш там був би другим поспіль — і Rozetka
   * відповіла б на нього відмовою переходу.
   */
  async function finishTtnFlow(ids: string[]) {
    const targets = orders.filter(o => ids.includes(o.id));
    const pushOnly: string[] = [];

    for (const o of targets) {
      if (o.fulfillment_mode === 'supplier') {
        await autoShipDropship(o.id);   // всередині — і статус, і пуш у маркетплейс
      } else {
        pushOnly.push(o.id);
      }
    }

    const rozetkaIds = pushOnly.filter(id => {
      const o = targets.find(t => t.id === id);
      // Точки видачі виключені: накладну там виписує сама Rozetka своїм API,
      // тож пушити їй же цей номер назад немає сенсу.
      return o?.channel_code === 'rozetka' && o.status !== 'new'
        && o.delivery_type !== 'rozetka_delivery';
    });
    if (rozetkaIds.length) await pushTtnToRozetka(rozetkaIds);

    for (const id of pushOnly) {
      const o = targets.find(t => t.id === id);
      if (o?.channel_code !== 'prom' || o.status === 'new') continue;
      try {
        const res = await fetch(`/api/admin/orders/${id}/push-prom-ttn`, { method: 'POST' });
        const d = await res.json().catch(() => ({}));
        showToast(d.ok ? 'ТТН надіслано на Prom' : `Prom TTN: ${d.error ?? 'помилка'}`, d.ok ? 'success' : 'error');
      } catch {
        showToast('Не вдалося надіслати ТТН на Prom', 'error');
      }
    }
  }

  function openMergeModal() {
    const sel = orders.filter(o => selectedIds.has(o.id));
    if (sel.length < 2) return;
    const primary = sel[0];
    const mergedItems = sel.flatMap(o => o.items);
    const totalPrice = sel.reduce((s, o) => s + o.total_price, 0);
    const totalQty   = sel.reduce((s, o) => s + o.items.reduce((sq, i) => sq + i.qty, 0), 0);
    setMergeModal({
      id: primary.id,
      mergedIds: sel.map(o => o.id),
      contact: primary.contact,
      phone: primary.phone,
      total_price: totalPrice,
      payment_type: primary.payment_type,
      total_qty: totalQty,
      items: mergedItems.map(i => ({ sku: i.sku, qty: i.qty, name: i.name })),
      delivery_city_ref: primary.delivery_city_ref,
      delivery_city_name: primary.delivery_city_name,
      delivery_warehouse_ref: primary.delivery_warehouse_ref,
      delivery_subtype: primary.delivery_subtype,
      delivery_address: primary.delivery_address,
    });
  }

  async function toggleFlag(id: string, field: 'payment_confirmed' | 'callback_done' | 'invoice_as_company', value: boolean) {
    await fetch(`/api/admin/orders/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ [field]: value }),
    });
    setOrders(prev => prev.map(o => o.id === id ? { ...o, [field]: value } : o));
  }

  // Швидкі прапорці замовлення (Терміново / Проблемний) — зберігаються в orders.flags
  async function toggleOrderFlag(id: string, flag: string) {
    const cur = orders.find(o => o.id === id)?.flags ?? [];
    const next = cur.includes(flag) ? cur.filter(f => f !== flag) : [...cur, flag];
    setOrders(prev => prev.map(o => o.id === id ? { ...o, flags: next } : o));
    await fetch(`/api/admin/orders/${id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ flags: next }),
    });
  }

  // ── Відмова від посилки (НП) ────────────────────────────────────────────────
  // Скасоване замовлення з "Відмова від отримання" у статусі перевізника = посилка
  // їде назад. Рішення менеджера зберігаємо у flags: return_received (забрав) /
  // return_abandoned (не забираю — коли повернення дорожче за товар).
  // Ознака «посилка десь є і з нею треба щось робити»: замовлення скасоване, але
  // перевізник ВЖЕ прийняв відправлення (carrier_accepted_at). Джерело скасування
  // неважливе — відмова на пошті, скасування покупцем у кабінеті МП чи наше рішення:
  // фізично посилка їде назад у будь-якому разі. Раніше тут шукали слово «відмова»
  // в статусі НП — і кейс #26071023 (скасування прийшло з кабінету Rozetka, а текст
  // НП завмер на «Прибув у відділення») не підсвічувався взагалі.
  const isReturnPending = (o: Order) => o.status === 'cancelled' && !!o.carrier_accepted_at;
  const returnState = (o: Order): 'received' | 'abandoned' | null =>
    (o.flags ?? []).includes('return_received') ? 'received'
    : (o.flags ?? []).includes('return_abandoned') ? 'abandoned'
    : null;
  async function setReturnState(id: string, state: 'received' | 'abandoned' | null) {
    const cur = orders.find(o => o.id === id)?.flags ?? [];
    const base = cur.filter(f => f !== 'return_received' && f !== 'return_abandoned');
    const next = state ? [...base, `return_${state}`] : base;
    setOrders(prev => prev.map(o => o.id === id ? { ...o, flags: next } : o));
    await fetch(`/api/admin/orders/${id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ flags: next }),
    });
  }

  // Внутрішня нотатка менеджера — зберігаємо по blur
  const [noteSaving, setNoteSaving] = useState<string | null>(null);
  async function saveInternalNote(id: string, note: string) {
    setNoteSaving(id);
    await fetch(`/api/admin/orders/${id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ internal_note: note }),
    });
    setOrders(prev => prev.map(o => o.id === id ? { ...o, internal_note: note || null } : o));
    setNoteSaving(null);
  }

  async function saveTTN(id: string) {
    setTtnSaving(id);
    const res = await fetch(`/api/admin/orders/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tracking_number: ttnValues[id] || null }),
    });
    if (res.ok) {
      setOrders(prev => prev.map(o => o.id === id ? { ...o, tracking_number: ttnValues[id] || null } : o));
      // Той самий хвіст, що й після створення накладної: номер, введений руками,
      // нічим не гірший за згенерований. Тут теж був перекіс — Rozetka чекала
      // status === 'shipped', тобто ТТН, вписана в підтверджене замовлення,
      // у кабінет не йшла зовсім.
      if (ttnValues[id]) await finishTtnFlow([id]);
    }
    setTtnSaving(null);
  }

  async function addToRegistry(orderId: string, ttn: string) {
    if (registryAdded.has(ttn)) return;
    setRegistryAdding(orderId);
    try {
      const res = await fetch('/api/admin/registers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ttnNumber: ttn, registerRef: null }),
      });
      if (res.ok) {
        setRegistryAdded(prev => new Set([...prev, ttn]));
      } else {
        const data = await res.json();
        alert(data.error ?? 'Помилка додавання в реєстр');
      }
    } catch { alert('Мережева помилка'); }
    finally { setRegistryAdding(null); }
  }

  // Групове додавання виділених замовлень у реєстр НП (по їх ТТН, які ще не в реєстрі).
  // Створюємо ОКРЕМИЙ НОВИЙ реєстр під цю партію: перший POST з registerRef:null створює
  // реєстр і повертає ref, який протягуємо на решту (інакше кожен POST плодив би свій реєстр).
  // НЕ переused існуючий sheets[0] — він може бути вже роздрукований/закритий, і НП відхилить
  // вставку («Реєстр вже роздруковано»).
  async function bulkAddToRegistry() {
    const sel = orders.filter(o => selectedIds.has(o.id) && o.tracking_number && !registryAdded.has(o.tracking_number));
    if (sel.length === 0) return;
    setRegistryBulkLoading(true);

    let ref: string | null = null;
    const added: string[] = [];
    const errors: string[] = [];
    for (const o of sel) {
      try {
        const res = await fetch('/api/admin/registers', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ttnNumber: o.tracking_number, registerRef: ref }),
        });
        const data: { ref?: string; error?: string } = await res.json().catch(() => ({}));
        if (res.ok) {
          added.push(o.tracking_number!);
          if (!ref && data.ref) ref = data.ref; // перший успішний створив реєстр — решту в нього
        } else {
          errors.push(`#${o.order_number}: ${data.error ?? res.status}`);
        }
      } catch { errors.push(`#${o.order_number}: мережа`); }
    }
    if (added.length) setRegistryAdded(prev => new Set([...prev, ...added]));
    setRegistryBulkLoading(false);
    if (errors.length) alert(`Додано в реєстр: ${added.length}. Не вдалося: ${errors.length}\n${errors.join('\n')}`);
    else showToast(`Додано в реєстр: ${added.length}`);
  }

  async function deleteTTN(id: string) {
    if (!confirm('Видалити ТТН з бази та з кабінету Нової Пошти?')) return;
    setTtnDeleting(id);
    try {
      const res = await fetch(`/api/admin/orders/${id}/ttn`, { method: 'DELETE' });
      const data = await res.json();
      if (res.ok) {
        setOrders(prev => prev.map(o => o.id === id ? { ...o, tracking_number: null } : o));
        setTtnValues(prev => { const n = { ...prev }; delete n[id]; return n; });
        if (data.np_error) alert(`ТТН видалено з бази, але помилка в НП: ${data.np_error}`);
      } else {
        alert(`Помилка: ${data.error}`);
      }
    } finally {
      setTtnDeleting(null);
    }
  }

  const q = search.trim().toLowerCase();
  /**
   * Об'єднані замовлення — ті, що їдуть однією посилкою. Окремої колонки в базі
   * немає й не треба: ознака об'єднання — це і є спільна накладна, її прописує
   * модалка створення ТТН усім вибраним замовленням. Без цієї підказки два
   * однакові номери в довгому списку оком не зловиш, і легко відвантажити одне
   * з двох, а друге забути.
   */
  const mergedByTtn = useMemo(() => {
    const byTtn = new Map<string, number[]>();
    for (const o of orders) {
      if (!o.tracking_number) continue;
      const a = byTtn.get(o.tracking_number) ?? [];
      a.push(o.order_number);
      byTtn.set(o.tracking_number, a);
    }
    for (const [ttn, nums] of byTtn) if (nums.length < 2) byTtn.delete(ttn);
    return byTtn;
  }, [orders]);

  const filtered = orders.filter(o => {
    if (channelFilter && (o.channel_code ?? 'website') !== channelFilter) return false;
    if (cabinetAheadOnly && !rozetkaCabinet(o)?.ahead) return false;
    if (q) {
      const num = String(o.order_number);
      const contact = (o.contact ?? '').toLowerCase();
      const phone = (o.phone ?? '').replace(/\D/g, '');
      const company = (o.company ?? '').toLowerCase();
      const ttn = (o.tracking_number ?? '').toLowerCase();
      if (!num.includes(q) && !contact.includes(q) && !phone.includes(q.replace(/\D/g, '')) && !company.includes(q) && !ttn.includes(q)) return false;
    }
    return true;
  });

  return (
    <>
      {/* Merge bar */}
      {selectedIds.size >= 1 && (
        <div style={{
          position: 'sticky', top: '80px', zIndex: 50,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '12px 20px', marginBottom: '16px',
          background: 'linear-gradient(135deg, #0F1729 0%, #1A3456 100%)', borderRadius: '12px',
          boxShadow: '0 4px 20px rgba(15,23,41,0.45)',
        }}>
          <span style={{ fontSize: '14px', fontWeight: 600, color: '#fff' }}>
            Вибрано замовлень: {selectedIds.size} · Сума: {orders.filter(o => selectedIds.has(o.id)).reduce((s, o) => s + o.total_price, 0).toFixed(2)} грн
          </span>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
            {/* Bulk status change */}
            <select

              defaultValue=""
              onChange={async e => {
                const newStatus = e.target.value;
                if (!newStatus) return;
                e.target.value = '';
                const ids = [...selectedIds];
                await Promise.allSettled(ids.map(id => fetch(`/api/admin/orders/${id}`, {
                  method: 'PATCH', headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ status: newStatus }),
                })));
                setSelectedIds(new Set());
                router.refresh();
              }}
              style={{ height: '34px', padding: '0 10px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.3)', background: 'rgba(255,255,255,0.12)', color: '#fff', fontSize: '13px', cursor: 'pointer' }}>
              <option value="" disabled style={{ color: '#000' }}>Змінити статус...</option>
              {STATUSES.filter(s => s.value).map(s => (
                <option key={s.value} value={s.value} style={{ color: '#000' }}>{s.label}</option>
              ))}
            </select>
            {(() => {
              const sel = orders.filter(o => selectedIds.has(o.id));
              const supplierSel = sel.filter(o => o.fulfillment_mode === 'supplier' || o.fulfillment_mode === 'mixed' || (o.status === 'new' && (o.fulfillment_mode == null || o.fulfillment_mode === 'supplier')));
              if (supplierSel.length === 0) return null;
              const unsentCount = supplierSel.filter(o => !o.supplier_sent_at).length;
              const ids = supplierSel.map(o => o.id);
              return (
                <>
                  <button
                    onClick={() => startSupplierSend(ids)}
                    disabled={supplierQueueLoading}
                    style={{ height: '34px', padding: '0 16px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.3)', background: 'rgba(255,255,255,0.15)', color: '#fff', fontSize: '13px', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', opacity: supplierQueueLoading ? 0.6 : 1 }}>
                    {supplierQueueLoading ? '⏳' : '📧'} Надіслати постачальнику{unsentCount > 0 ? ` (${unsentCount} нових)` : ''}
                  </button>
                  {supplierSel.length > 1 && (
                    <button
                      onClick={() => startBulkSupplierSend(ids)}
                      disabled={supplierQueueLoading}
                      title="Один лист на постачальника з усіма його замовленнями"
                      style={{ height: '34px', padding: '0 16px', borderRadius: '8px', border: 'none', background: 'linear-gradient(135deg, #0EA5E9 0%, #2563EB 100%)', color: '#fff', fontSize: '13px', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', opacity: supplierQueueLoading ? 0.6 : 1 }}>
                      📨 Відправити всі одразу
                    </button>
                  )}
                </>
              );
            })()}
            <button onClick={openMergeModal} style={{
              height: '34px', padding: '0 16px', borderRadius: '8px',
              border: 'none', background: 'var(--bg-card)', color: 'var(--brand-blue)',
              fontSize: '13px', fontWeight: 700, cursor: 'pointer',
              display: 'flex', alignItems: 'center', gap: '6px',
            }}>
              <Truck size={14} /> Об&apos;єднати в ТТН
            </button>
            {(() => {
              const addable = orders.filter(o => selectedIds.has(o.id) && o.tracking_number && !registryAdded.has(o.tracking_number));
              const selCount = orders.filter(o => selectedIds.has(o.id)).length;
              if (addable.length === 0) return null;
              return (
                <button onClick={bulkAddToRegistry} disabled={registryBulkLoading} style={{
                  height: '34px', padding: '0 16px', borderRadius: '8px',
                  border: '1px solid rgba(255,255,255,0.3)', background: 'rgba(255,255,255,0.15)',
                  color: '#fff', fontSize: '13px', fontWeight: 600, cursor: 'pointer',
                  display: 'flex', alignItems: 'center', gap: '6px', opacity: registryBulkLoading ? 0.6 : 1,
                }}>
                  <Send size={14} /> {registryBulkLoading ? 'Додаю…' : `Додати в реєстр${addable.length !== selCount ? ` (${addable.length})` : ''}`}
                </button>
              );
            })()}
            {/* Скасувати — в кінці, виділено червоним */}
            <button onClick={() => setSelectedIds(new Set())} style={{
              height: '34px', padding: '0 16px', borderRadius: '8px',
              border: '1px solid #FCA5A5', background: 'rgba(239,68,68,0.15)',
              color: '#FCA5A5', fontSize: '13px', fontWeight: 600, cursor: 'pointer',
            }}>✕ Скасувати</button>
          </div>
        </div>
      )}

      {/* Register panel */}

      {/* Filters + search */}
      <div style={{ marginBottom: '20px', display: 'flex', flexDirection: 'column', gap: '10px' }}>

        {/* Row 1: Channel filter + sync */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
            {[
              { value: '',         label: 'Всі канали' },
              { value: 'website',  label: 'Магазин' },
              { value: 'b2b',      label: 'Опт' },
              { value: 'dropship', label: 'Дроп' },
              { value: 'retail',   label: 'Роздріб' },
              { value: 'phone',    label: 'Телефон' },
              { value: 'prom',     label: 'Prom' },
              { value: 'rozetka',  label: 'Rozetka' },
            ].map(ch => {
              const active = channelFilter === ch.value;
              const cfg = ch.value ? CHANNEL_LABEL[ch.value] : null;
              return (
                <button
                  key={ch.value}
                  onClick={() => setChannelFilter(ch.value)}
                  style={{
                    height: '30px', padding: '0 12px', borderRadius: '20px', fontSize: '12px', fontWeight: 600,
                    border: `1.5px solid ${active ? (cfg?.color ?? '#1E3A5F') : 'var(--border)'}`,
                    background: active ? (cfg?.bg ?? '#EFF4FF') : 'var(--bg-card)',
                    color: active ? (cfg?.color ?? '#1E3A5F') : 'var(--text-secondary)',
                    cursor: 'pointer', transition: 'all 0.15s',
                  }}
                >
                  {ch.label}
                  <span style={{ marginLeft: '4px', fontSize: '10px', opacity: 0.7 }}>
                    {orders.filter(o => !ch.value || (o.channel_code ?? 'website') === ch.value).length}
                  </span>
                </button>
              );
            })}
            {(() => {
              // Кнопка з'являється тільки коли є що показувати — інакше вона
              // просто займає місце в і без того щільній панелі фільтрів.
              const n = orders.filter(o => rozetkaCabinet(o)?.ahead).length;
              if (!n && !cabinetAheadOnly) return null;
              return (
                <button
                  onClick={() => setCabinetAheadOnly(v => !v)}
                  title="Замовлення, які в кабінеті Rozetka вже рухнули далі, ніж у нас"
                  style={{
                    height: '30px', padding: '0 12px', borderRadius: '20px', fontSize: '12px', fontWeight: 600,
                    border: `1.5px solid ${cabinetAheadOnly ? '#15803D' : 'var(--border)'}`,
                    background: cabinetAheadOnly ? '#DCFCE7' : 'var(--bg-card)',
                    color: cabinetAheadOnly ? '#15803D' : 'var(--text-secondary)',
                    cursor: 'pointer', transition: 'all 0.15s',
                  }}
                >
                  Оброблені в кабінеті
                  <span style={{ marginLeft: '4px', fontSize: '10px', opacity: 0.7 }}>{n}</span>
                </button>
              );
            })()}
          </div>
          <div className="oc-toolbar-actions" style={{ display: 'flex', alignItems: 'center', gap: '10px', flexShrink: 0 }}>
            <a
              href={`/api/admin/orders/export?${(() => { const p = new URLSearchParams(); if (currentStatus) p.set('status', currentStatus); if (dateFrom) p.set('dateFrom', dateFrom); if (dateTo) p.set('dateTo', dateTo); return p.toString(); })()}`}
              download
              style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', height: '32px', padding: '0 14px', borderRadius: '8px', textDecoration: 'none', fontSize: '13px', fontWeight: 500, background: '#F0FDF4', color: '#15803D', border: '1px solid #BBF7D0' }}
            >
              ↓ Excel
            </a>
            <Link href="/admin/dispatch" style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', height: '32px', padding: '0 14px', borderRadius: '8px', textDecoration: 'none', fontSize: '13px', fontWeight: 500, background: '#EFF6FF', color: '#1D4ED8', border: '1px solid #BFDBFE' }}>
              <Send size={13} /> Реєстр НП
            </Link>
            {syncResult && (
              <span style={{ fontSize: '12px', color: (syncResult.updated > 0 || (syncResult.accepted ?? 0) > 0) ? '#15803D' : 'var(--text-secondary)' }}>
                {syncResult.updated > 0 || (syncResult.accepted ?? 0) > 0
                  ? `✓ Доставлено: ${syncResult.updated}, прийнято НП: ${syncResult.accepted ?? 0} з ${syncResult.checked}`
                  : `Перевірено: ${syncResult.checked}, змін немає`}
              </span>
            )}
            <button
              onClick={syncDeliveryStatus}
              disabled={syncing}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: '6px',
                height: '32px', padding: '0 12px', borderRadius: '8px',
                border: '1.5px solid var(--border)', background: 'var(--bg-card)',
                fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary)',
                cursor: syncing ? 'wait' : 'pointer', opacity: syncing ? 0.6 : 1,
              }}
            >
              <RefreshCw size={13} style={{ animation: syncing ? 'spin 1s linear infinite' : 'none' }} />
              {syncing ? 'Синхронізую...' : 'Синхронізувати НП'}
            </button>
          </div>
        </div>

        {/* Row 2: Date filter */}
        {(() => {
          const today = new Date().toISOString().slice(0, 10);
          const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);
          const monthStart = `${today.slice(0, 7)}-01`;

          function applyDate(from: string, to: string) {
            const params = new URLSearchParams(window.location.search);
            params.set('dateFrom', from);
            params.set('dateTo', to);
            params.delete('page');
            router.push(`/admin?${params.toString()}`);
          }
          function clearDate() {
            const params = new URLSearchParams(window.location.search);
            params.delete('dateFrom');
            params.delete('dateTo');
            params.delete('page');
            router.push(`/admin?${params.toString()}`);
          }

          const hasDateFilter = !!(dateFrom || dateTo);
          const inpStyle: React.CSSProperties = { height: '32px', padding: '0 8px', border: '1.5px solid var(--border)', borderRadius: '7px', fontSize: '12px', outline: 'none', background: 'var(--bg-card)', color: 'var(--text-primary)' };

          return (
            <div className="oc-filter-dates" style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
              {/* Quick presets */}
              {[
                { label: 'Сьогодні', from: today,      to: today },
                { label: '7 днів',   from: weekAgo,    to: today },
                { label: 'Місяць',   from: monthStart,  to: today },
              ].map(p => {
                const active = dateFrom === p.from && dateTo === p.to;
                return (
                  <button key={p.label} onClick={() => applyDate(p.from, p.to)}
                    style={{ height: '32px', padding: '0 12px', borderRadius: '7px', border: `1.5px solid ${active ? '#1E3A5F' : 'var(--border)'}`, background: active ? '#1E3A5F' : 'var(--bg-card)', color: active ? '#fff' : 'var(--text-secondary)', fontSize: '12px', fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' }}>
                    {p.label}
                  </button>
                );
              })}
              <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                <SmartDateInput
                  value={dateFrom ?? ''}
                  onChange={v => applyDate(v, dateTo ?? today)}
                  style={{ height: '32px', ...inpStyle }}
                />
                <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>—</span>
                <SmartDateInput
                  value={dateTo ?? ''}
                  onChange={v => applyDate(dateFrom ?? monthStart, v)}
                  style={{ height: '32px', ...inpStyle }}
                />
              </div>
              {hasDateFilter && (
                <button onClick={clearDate}
                  style={{ height: '32px', padding: '0 10px', borderRadius: '7px', border: '1px solid #FCA5A5', background: '#FEF2F2', color: '#DC2626', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}>
                  ✕ Скинути дату
                </button>
              )}
            </div>
          );
        })()}

        {/* Row 3: Search */}
        <div className="oc-filter-search" style={{ position: 'relative' }}>
          <Search size={14} color="#94A3B8" style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} />
          <input
            placeholder="№ замовлення, ФІО, телефон, ТТН..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{
              width: '100%', height: '34px', paddingLeft: '32px', paddingRight: search ? '30px' : '10px',
              border: '1.5px solid var(--border)', borderRadius: '8px', fontSize: '13px',
              outline: 'none', boxSizing: 'border-box', background: 'var(--bg-card)', color: 'var(--text-primary)',
            }}
          />
          {search && (
            <button
              onClick={() => setSearch('')}
              style={{ position: 'absolute', right: '8px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 0, display: 'flex' }}
            >
              <X size={13} />
            </button>
          )}
        </div>

        {/* Result count when filtering */}
        {(q || channelFilter) && (
          <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
            Знайдено: <strong>{filtered.length}</strong> замовлень
          </div>
        )}
      </div>

      {/* Awaiting stock alert — показується тільки якщо сьогодні провели прихід */}
      {(() => {
        const awaitingCount = orders.filter(o => o.status === 'awaiting_stock').length;
        if (!awaitingCount || !hasRecentReceipts) return null;
        const isFiltered = channelFilter === '' && !q;
        return (
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '9px 14px', marginBottom: '10px', borderRadius: '10px',
            background: '#F5F3FF', border: '1.5px solid #DDD6FE',
            animation: 'awaiting-banner-pulse 3s ease-in-out infinite',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '14px' }}>⏳</span>
              <span style={{ fontSize: '13px', fontWeight: 700, color: '#6D28D9' }}>
                {awaitingCount} {awaitingCount === 1 ? 'замовлення очікує товар' : 'замовлень очікують товар'}
              </span>
              <span style={{ fontSize: '12px', color: '#7C3AED' }}>— перевірте надходження товару</span>
            </div>
            {isFiltered ? (
              <button
                onClick={() => setChannelFilter('')}
                style={{ height: '28px', padding: '0 12px', borderRadius: '6px', border: '1.5px solid #A78BFA', background: '#EDE9FE', color: '#6D28D9', fontSize: '12px', fontWeight: 700, cursor: 'pointer' }}
              >
                Показати →
              </button>
            ) : (
              <button
                onClick={() => { setChannelFilter(''); setSearch(''); }}
                style={{ height: '28px', padding: '0 12px', borderRadius: '6px', border: '1.5px solid #A78BFA', background: '#EDE9FE', color: '#6D28D9', fontSize: '12px', fontWeight: 700, cursor: 'pointer' }}
              >
                Скинути фільтри →
              </button>
            )}
          </div>
        );
      })()}

      {/* Table header */}
      {filtered.length > 0 && (
        <div className="oc-hide-m" style={{
          display: 'flex', alignItems: 'center', gap: '10px',
          padding: '5px 15px', marginBottom: '2px',
          fontSize: '10px', fontWeight: 700, color: 'var(--text-muted)',
          textTransform: 'uppercase', letterSpacing: '0.06em',
          borderBottom: '1px solid var(--border-light)',
        }}>
          {/* Select all */}
          <div
            onClick={() => {
              const allIds = filtered.map(o => o.id);
              const allSelected = allIds.every(id => selectedIds.has(id));
              setSelectedIds(allSelected ? new Set() : new Set(allIds));
            }}
            title={filtered.every(o => selectedIds.has(o.id)) ? 'Зняти всі' : 'Вибрати всі'}
            style={{ width: '16px', height: '16px', borderRadius: '4px', flexShrink: 0, cursor: 'pointer', border: `2px solid ${filtered.length > 0 && filtered.every(o => selectedIds.has(o.id)) ? '#3DBFB8' : 'var(--border)'}`, background: filtered.length > 0 && filtered.every(o => selectedIds.has(o.id)) ? '#3DBFB8' : 'var(--bg-card)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            {filtered.length > 0 && filtered.every(o => selectedIds.has(o.id)) && <Check size={9} color="#fff" strokeWidth={3} />}
          </div>
          {/* Sortable columns */}
          {[
            { key: 'order_number', label: '№',    width: '70px',  align: 'left'  },
            { key: 'created_at',   label: 'Дата',  width: '90px',  align: 'left'  },
          ].map(col => {
            const active = sortBy === col.key;
            const nextDir = active && sortDir === 'desc' ? 'asc' : 'desc';
            return (
              <button key={col.key}
                onClick={() => {
                  const p = new URLSearchParams(window.location.search);
                  p.set('sortBy', col.key); p.set('sortDir', nextDir); p.delete('page');
                  router.push(`/admin?${p.toString()}`);
                }}
                style={{ width: col.width, flexShrink: 0, background: 'none', border: 'none', cursor: 'pointer', textAlign: col.align as 'left', display: 'flex', alignItems: 'center', gap: '3px', fontSize: '10px', fontWeight: 700, color: active ? '#1E3A5F' : 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', padding: 0 }}>
                {col.label}
                <span style={{ fontSize: '9px' }}>{active ? (sortDir === 'desc' ? '↓' : '↑') : '⇅'}</span>
              </button>
            );
          })}
          <span style={{ flex: '0 1 calc(50% - 230px)', minWidth: 0 }}>Клієнт / Товар</span>
          <span style={{ flex: 1, minWidth: '100px', overflow: 'hidden', whiteSpace: 'nowrap' }}>Доставка</span>
          <span style={{ width: '104px', flexShrink: 0, overflow: 'hidden', whiteSpace: 'nowrap' }}>Статус</span>
          <span style={{ width: '64px', flexShrink: 0, overflow: 'hidden', whiteSpace: 'nowrap' }}>Канал</span>
          <span style={{ width: '64px', flexShrink: 0, overflow: 'hidden', whiteSpace: 'nowrap' }}>Відпр.</span>
          <span style={{ width: '46px', flexShrink: 0, overflow: 'hidden', whiteSpace: 'nowrap' }}>Опл.</span>
          <span style={{ width: '34px', flexShrink: 0, textAlign: 'center', overflow: 'hidden', whiteSpace: 'nowrap' }}>Дзв.</span>
          {/* Sortable: Сума */}
          {(() => {
            const active = sortBy === 'total_price';
            const nextDir = active && sortDir === 'desc' ? 'asc' : 'desc';
            return (
              <button onClick={() => { const p = new URLSearchParams(window.location.search); p.set('sortBy', 'total_price'); p.set('sortDir', nextDir); p.delete('page'); router.push(`/admin?${p.toString()}`); }}
                style={{ width: '84px', flexShrink: 0, background: 'none', border: 'none', cursor: 'pointer', textAlign: 'right', display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '3px', fontSize: '10px', fontWeight: 700, color: active ? '#1E3A5F' : 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', padding: 0 }}>
                <span style={{ fontSize: '9px' }}>{active ? (sortDir === 'desc' ? '↓' : '↑') : '⇅'}</span>
                Сума
              </button>
            );
          })()}
          <div style={{ width: '14px', flexShrink: 0 }} />
        </div>
      )}

      {filtered.length === 0 ? (
        <div style={{
          background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '14px',
          padding: '40px 32px', textAlign: 'center', color: 'var(--text-muted)',
        }}>
          <Package size={36} strokeWidth={1} style={{ marginBottom: '10px', opacity: 0.4 }} />
          <p style={{ marginBottom: '16px', fontSize: '14px' }}>
            {currentStatus
              ? `Немає замовлень зі статусом «${currentStatus === 'ready_to_ship' ? 'До відправки' : (STATUSES.find(s => s.value === currentStatus)?.label ?? currentStatus)}»`
              : 'Замовлень немає'}
          </p>
          {/* Банер з підказкою про інші статуси */}
          {currentStatus && Object.keys(statusCounts).length > 0 && (() => {
            const others = STATUSES.filter(s => s.value && s.value !== currentStatus && (statusCounts[s.value] ?? 0) > 0);
            if (!others.length) return null;
            return (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', justifyContent: 'center', marginTop: '8px' }}>
                <span style={{ fontSize: '13px', color: 'var(--text-secondary)', alignSelf: 'center' }}>Є замовлення в:</span>
                {others.map(s => (
                  <a key={s.value} href={`/admin?status=${s.value}${dateFrom ? `&dateFrom=${dateFrom}` : ''}${dateTo ? `&dateTo=${dateTo}` : ''}`}
                    style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', height: '30px', padding: '0 12px', borderRadius: '8px', background: s.bg, color: s.color, fontSize: '13px', fontWeight: 700, textDecoration: 'none', border: `1px solid ${s.color}22` }}>
                    {s.label} <span style={{ background: s.color, color: '#fff', borderRadius: '10px', padding: '0 6px', fontSize: '11px' }}>{statusCounts[s.value]}</span>
                  </a>
                ))}
              </div>
            );
          })()}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {filtered.map(order => {
            const isExpanded = expandedId === order.id;
            let status = STATUSES.find(s => s.value === order.status) ?? STATUSES[0];
            // Косметика Варіанту 3: shipped без приймання НП = «Готово до відправки»
            // (ТТН створена, товар ще на складі); після приймання перевізником —
            // «Відправлено». На облік не впливає — лише мітка статусу.
            if (order.status === 'shipped' && !order.carrier_accepted_at) {
              status = { ...status, label: 'До відправки', color: '#B45309', bg: '#FEF3C7' };
            }
            const date = new Date(order.created_at).toLocaleString('uk-UA', {
              day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
            });
            const delivery = DELIVERY_LABEL[order.delivery_type] ?? order.delivery_type;
            const subtype = order.delivery_subtype === 'courier' ? ' — кур\'єр' : order.delivery_subtype === 'warehouse' ? ' — відділення' : '';
            const isCod = order.payment_type === 'cod';
            const paymentConfirmed = order.payment_confirmed ?? false;
            const noCallback = order.comment?.includes('Не передзвонювати') ?? false;
            const callbackDone = order.callback_done ?? false;
            const isDropship = order.channel_code === 'dropship';
            const channel = CHANNEL_LABEL[order.channel_code ?? 'website'] ?? CHANNEL_LABEL.website;
            const isUnpaidInvoice = !paymentConfirmed && order.payment_type !== 'cod'
              && !['delivered', 'cancelled'].includes(order.status);
            const isFlashing = flashId === order.id;

            const isCancelled = order.status === 'cancelled';
            // Rozetka Smart: безкоштовна доставка для покупця, компенсацію (12/18/30 грн)
            // списують з нас. Будь-яке редагування складу замовлення знімає Smart безповоротно.
            const isSmart = order.channel_code === 'rozetka' && Boolean(order.rozetka_data?.is_smart);

            return (
              <div key={order.id} id={`order-${order.id}`} style={{
                background: isFlashing ? '#F0FDF4' : isUnpaidInvoice ? '#FFFBF0' : 'var(--bg-card)',
                border: `1px solid ${isFlashing ? '#86EFAC' : isExpanded ? 'var(--brand-blue)' : isUnpaidInvoice ? '#FCD34D' : 'var(--border-light)'}`,
                borderRadius: '14px', overflow: 'hidden',
                boxShadow: isExpanded ? '0 6px 20px rgba(16,24,40,0.12)' : isFlashing ? '0 0 0 3px #BBF7D0' : '0 1px 2px rgba(16,24,40,0.04), 0 1px 3px rgba(16,24,40,0.06)',
                opacity: expandedId && !isExpanded ? 0.35 : 1,
                transition: 'box-shadow 0.3s, border-color 0.3s, opacity 0.15s, background 0.3s',
              }}>

                {/* ── Compact row ── */}
                <div
                  className="order-compact-row"
                  onClick={() => { const next = isExpanded ? null : order.id; setExpandedId(next); if (next) { loadFulfillment(next); loadLinkedPOs(next); loadPayments(next); } }}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '10px',
                    padding: '12px 16px', cursor: 'pointer',
                    background: isExpanded
                      ? (isUnpaidInvoice ? '#FEF9EC' : 'var(--bg-soft)')
                      : (isUnpaidInvoice ? '#FFFBF0' : 'var(--bg-card)'),
                  }}
                >
                  <div
                    onClick={e => { e.stopPropagation(); toggleSelect(order.id); }}
                    style={{
                      width: '16px', height: '16px', borderRadius: '4px', flexShrink: 0, cursor: 'pointer',
                      border: `2px solid ${selectedIds.has(order.id) ? '#3DBFB8' : 'var(--border)'}`,
                      background: selectedIds.has(order.id) ? '#3DBFB8' : 'var(--bg-card)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}
                  >
                    {selectedIds.has(order.id) && <Check size={9} color="#fff" strokeWidth={3} />}
                  </div>

                  {/* № */}
                  <span className="oc-num" style={{ width: '70px', flexShrink: 0, fontSize: '13px', fontWeight: 800, color: 'var(--text-primary)' }}>#{order.order_number}</span>

                  {/* Дата */}
                  <span className="oc-hide-m" style={{ width: '90px', flexShrink: 0, fontSize: '11px', color: 'var(--text-muted)' }}>{date}</span>

                  {/* Клієнт / Товар */}
                  <div className="oc-cust" style={{ flex: '0 1 calc(50% - 230px)', minWidth: 0, overflow: 'hidden' }}>
                    <div style={{ fontSize: '13px', color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {(order.flags ?? []).includes('urgent') && (
                        <span title="Терміново" style={{ display: 'inline-flex', alignItems: 'center', fontSize: '10px', fontWeight: 700, color: '#B91C1C', background: '#FEE2E2', border: '1px solid #FCA5A5', borderRadius: '5px', padding: '0 4px', marginRight: '5px', verticalAlign: 'middle' }}>⚡</span>
                      )}
                      {(order.flags ?? []).includes('problem') && (
                        <span title="Проблемний" style={{ display: 'inline-flex', alignItems: 'center', fontSize: '10px', fontWeight: 700, color: '#B45309', background: '#FEF3C7', border: '1px solid #FCD34D', borderRadius: '5px', padding: '0 4px', marginRight: '5px', verticalAlign: 'middle' }}>⚠</span>
                      )}
                      {order.mp_refund_status && (
                        <span title={`Покупець відкрив повернення — ${order.mp_refund_status}`} style={{ display: 'inline-flex', alignItems: 'center', fontSize: '10px', fontWeight: 700, color: '#B91C1C', background: '#FEE2E2', border: '1px solid #FCA5A5', borderRadius: '5px', padding: '0 4px', marginRight: '5px', verticalAlign: 'middle' }}>↩ повернення</span>
                      )}
                      {isReturnPending(order) && (() => {
                        const rs = returnState(order);
                        const s = rs === 'received'
                          ? { t: '↩ забрано', c: '#15803D', bg: '#F0FDF4', b: '#BBF7D0', title: 'Повернення забрано з пошти' }
                          : rs === 'abandoned'
                          ? { t: '↩ залишено', c: '#64748B', bg: '#F8FAFC', b: '#E2E8F0', title: 'Вирішено не забирати (повернення дорожче за товар)' }
                          : { t: '↩ Повернення · забрати?', c: '#C2410C', bg: '#FFF7ED', b: '#FDBA74', title: `Замовлення скасоване, але посилку вже прийняла НП — вона їде назад${order.carrier_status_text ? ` (зараз: «${order.carrier_status_text}»)` : ''}. Відкрийте замовлення і вирішіть: забрати з пошти чи залишити.` };
                        return <span title={s.title} style={{ display: 'inline-flex', alignItems: 'center', fontSize: '10px', fontWeight: 700, color: s.c, background: s.bg, border: `1px solid ${s.b}`, borderRadius: '5px', padding: '0 4px', marginRight: '5px', verticalAlign: 'middle' }}>{s.t}</span>;
                      })()}
                      {isSmart && (
                        <span title="Rozetka Smart — безкоштовна доставка для покупця, компенсація списується з нас. НЕ редагуйте склад замовлення: будь-яка зміна знімає Smart безповоротно." style={{ display: 'inline-flex', alignItems: 'center', fontSize: '10px', fontWeight: 800, color: '#713F12', background: '#FDE047', border: '1px solid #FACC15', borderRadius: '5px', padding: '0 4px', marginRight: '5px', verticalAlign: 'middle' }}>SMART</span>
                      )}
                      {(() => {
                        // Однією посилкою з іншими замовленнями — спільна накладна.
                        const group = order.tracking_number ? mergedByTtn.get(order.tracking_number) : undefined;
                        if (!group) return null;
                        const others = group.filter((n: number) => n !== order.order_number);
                        return (
                          <span
                            title={`Одна посилка на ${group.length} замовлення — спільна ТТН ${order.tracking_number}. Разом із №${others.join(', №')}. Відвантажувати треба всі, інакше частина залишиться висіти.`}
                            style={{ display: 'inline-flex', alignItems: 'center', fontSize: '10px', fontWeight: 700, color: '#5B21B6', background: '#F5F3FF', border: '1px solid #C4B5FD', borderRadius: '5px', padding: '0 4px', marginRight: '5px', verticalAlign: 'middle' }}>
                            ⛓ з №{others.join(', №')}
                          </span>
                        );
                      })()}
                      {order.company
                        ? <><span style={{ fontWeight: 600 }}>{order.company}</span><span style={{ color: 'var(--text-muted)' }}> · {order.contact}</span></>
                        : <span style={{ fontWeight: 600 }}>{order.contact}</span>}
                      {order.phone && <span style={{ fontSize: '11px', fontWeight: 400, color: 'var(--text-muted)', marginLeft: '6px' }}>{order.phone}</span>}
                    </div>
                    {order.items[0] && (
                      <div style={{ fontSize: '11px', color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginTop: '1px' }}>
                        {order.items[0].is_bonus && <span style={{ marginRight: '4px' }}>🎁</span>}
                        {order.items[0].brand ? `${order.items[0].brand} ` : ''}{order.items[0].name}
                        <span style={{ marginLeft: '4px', color: 'var(--text-muted)' }}>×{order.items[0].qty}</span>
                        {order.items.length > 1 && <span style={{ marginLeft: '4px', color: 'var(--text-muted)' }}>+{order.items.length - 1}</span>}
                        {order.items.some(i => i.is_bonus) && <span style={{ marginLeft: '6px', fontSize: '10px', color: '#15803D', fontWeight: 600, background: '#F0FDF4', padding: '0 5px', borderRadius: '4px' }}>🎁 бонус</span>}
                      </div>
                    )}
                  </div>

                  {/* Доставка */}
                  <span className="oc-hide-m" style={{ flex: 1, minWidth: '100px', fontSize: '12px', color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {order.delivery_type === 'pickup' ? 'Самовивіз'
                      : order.delivery_city_name
                        ? `${order.delivery_city_name}${order.delivery_subtype === 'courier' ? ' · кур.' : ''}${order.delivery_address ? ` · ${order.delivery_address}` : ''}`
                        : (order.delivery_address ?? delivery)}
                  </span>

                  {/* Статус */}
                  <div className="oc-status" style={{ width: '118px', flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: '2px', overflow: 'hidden' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px', maxWidth: '100%' }}>
                    <span
                      className={order.status === 'awaiting_stock' ? 'status-awaiting-pulse' : undefined}
                      style={{ fontSize: '11px', fontWeight: 600, padding: '2px 8px', borderRadius: '20px', color: status.color, background: status.bg, display: 'inline-flex', alignItems: 'center', maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {status.label}
                    </span>
                    {order.status === 'shipped' && order.tracking_number && !order.carrier_status_text && (
                      <span
                        title={order.carrier_accepted_at ? 'Прийнято Новою Поштою' : 'Очікує приймання Новою Поштою'}
                        style={{ fontSize: '12px', flexShrink: 0, color: order.carrier_accepted_at ? '#15803D' : '#B45309' }}>
                        {order.carrier_accepted_at ? '✓' : '⏳'}
                      </span>
                    )}
                    {order.status === 'shipped' && order.shipped_at && (() => {
                      const days = Math.floor((Date.now() - new Date(order.shipped_at).getTime()) / 86400000);
                      if (days < 7) return null;
                      return (
                        <span title={`Відправлено ${days} дн тому — довго висить. Перевірте доставку та завершіть замовлення («Доставлено»), інакше продаж не проведеться.`}
                          style={{ fontSize: '10px', fontWeight: 700, flexShrink: 0, padding: '1px 5px', borderRadius: '10px', color: '#B91C1C', background: '#FEF2F2', border: '1px solid #FCA5A5', whiteSpace: 'nowrap' }}>
                          ⚠ {days}д
                        </span>
                      );
                    })()}
                    </div>
                    {order.status === 'shipped' && order.carrier_status_text && (
                      <span title={order.carrier_status_synced_at ? `${order.carrier_status_text} · оновлено ${new Date(order.carrier_status_synced_at).toLocaleString('uk-UA', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}` : order.carrier_status_text}
                        style={{ display: 'inline-flex', alignItems: 'center', gap: '3px', maxWidth: '100%', fontSize: '10px', fontWeight: 500, color: order.carrier_accepted_at ? '#15803D' : '#B45309', overflow: 'hidden', whiteSpace: 'nowrap', lineHeight: 1.2 }}>
                        <Truck size={10} style={{ flexShrink: 0 }} />
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{order.carrier_status_text}</span>
                      </span>
                    )}
                  </div>

                  {/* Канал */}
                  <div className="oc-hide-m" style={{ width: '64px', flexShrink: 0, display: 'flex', alignItems: 'center', overflow: 'hidden' }}>
                    <span style={{ fontSize: '11px', fontWeight: 700, padding: '1px 6px', borderRadius: '20px', color: channel.color, background: channel.bg, whiteSpace: 'nowrap', display: 'inline-flex', alignItems: 'center' }}>
                      {channel.label}
                    </span>
                  </div>

                  {/* Відправка */}
                  <div className="oc-hide-m" style={{ width: '64px', flexShrink: 0, display: 'flex', alignItems: 'center', gap: '4px' }}>
                    {order.fulfillment_mode && (
                      <span
                        title={order.fulfillment_mode === 'own' ? 'Відправка зі складу' : order.fulfillment_mode === 'supplier' ? 'Відправка через постачальника' : 'Змішана відправка'}
                        style={{ fontSize: '11px', fontWeight: 600, padding: '2px 8px', borderRadius: '999px',
                          color:      order.fulfillment_mode === 'own' ? '#15803D' : order.fulfillment_mode === 'supplier' ? 'var(--brand-blue)' : '#7C3AED',
                          background: order.fulfillment_mode === 'own' ? '#DCFCE7' : order.fulfillment_mode === 'supplier' ? '#EAF1F8' : '#EDE9FE' }}>
                        {order.fulfillment_mode === 'own' ? 'Склад' : order.fulfillment_mode === 'mixed' ? 'Mix' : 'Пост.'}
                      </span>
                    )}
                    {order.supplier_sent_at && (
                      <span title={`Надіслано постачальнику ${new Date(order.supplier_sent_at).toLocaleString('uk-UA', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}`}
                        style={{ display: 'inline-flex', alignItems: 'center', color: '#15803D', flexShrink: 0 }}>
                        <Check size={13} strokeWidth={3} />
                      </span>
                    )}
                  </div>

                  {/* Оплата */}
                  <div className="oc-hide-m" style={{ width: '46px', flexShrink: 0, display: 'flex', alignItems: 'center' }}>
                    {(() => {
                      const label = order.payment_type === 'cod' ? 'НП'
                        : order.payment_type === 'card' ? 'Кар.'
                        : order.payment_type === 'prepaid' ? 'Пре.'
                        : order.payment_type === 'cash' ? 'Гот.'
                        : order.payment_type === 'deferred' ? 'Відст.'
                        : 'Рах.';
                      // Зелений = оплата підтверджена (передоплата/безнал/картка). НП платить при отриманні.
                      const paid = order.payment_confirmed && order.payment_type !== 'cod';
                      return (
                        <span title={paid ? 'Оплачено' : undefined} style={{ fontSize: '11px', padding: '2px 6px', borderRadius: '20px', background: paid ? '#DCFCE7' : 'var(--border-light)', color: paid ? '#15803D' : 'var(--text-secondary)', display: 'inline-flex', alignItems: 'center' }}>
                          {label}
                        </span>
                      );
                    })()}
                  </div>

                  {/* Дзвінок */}
                  <div className="oc-hide-m" style={{ width: '34px', flexShrink: 0, textAlign: 'center' }}>
                    {!isDropship && (
                      <span style={{ fontSize: '11px', padding: '2px 5px', borderRadius: '20px', display: 'inline-block',
                        background: noCallback || callbackDone ? '#DCFCE7' : '#FEF3C7',
                        color: noCallback || callbackDone ? '#15803D' : '#B45309' }}>
                        {noCallback ? '✓' : callbackDone ? '✓📞' : '📞'}
                      </span>
                    )}
                  </div>

                  {/* Сума */}
                  <span style={{ width: '84px', flexShrink: 0, fontSize: '13px', fontWeight: 800, color: 'var(--brand-blue)', textAlign: 'right' }}>
                    {order.total_price.toFixed(0)} ₴
                  </span>
                  {isExpanded
                    ? <ChevronUp size={14} color="#94A3B8" style={{ flexShrink: 0 }} />
                    : <ChevronDown size={14} color="#94A3B8" style={{ flexShrink: 0 }} />
                  }
                </div>

                {/* Верхній прогрес-бар статусів прибрано — унизу є таймлайн «Історія замовлення» */}

                {/* ── Expanded panel ── */}
                {isExpanded && (
                  <>
                  {/* Банер відкритого повернення з маркетплейсу (orders.mp_refund_status,
                      ставить/гасить cron-вотчер marketplace-returns-watch) */}
                  {order.mp_refund_status && (
                    <div style={{ borderTop: '1px solid var(--border-light)', background: '#FEF2F2', padding: '10px 16px', fontSize: '13px', color: '#B91C1C', lineHeight: 1.5 }}>
                      <span style={{ fontWeight: 700 }}>↩ Покупець відкрив повернення на маркетплейсі — статус: {order.mp_refund_status}.</span>{' '}
                      <span>Прийміть товар і оформіть «↩ Повернення» в цій картці — це сторнує виручку, COGS і комісію.</span>
                    </div>
                  )}
                  {/* Банер повернення посилки: замовлення скасоване, але НП уже прийняла
                      відправлення — воно їде назад. Менеджер вирішує, забирати з пошти
                      чи ні (коли зворотна доставка дорожча за товар) */}
                  {isReturnPending(order) && (() => {
                    const rs = returnState(order);
                    return (
                      <div style={{ borderTop: '1px solid var(--border-light)', background: rs ? 'var(--bg-soft)' : '#FFF7ED', padding: '10px 16px', fontSize: '13px', color: rs ? 'var(--text-secondary)' : '#9A3412', lineHeight: 1.6 }}>
                        <span style={{ fontWeight: 700 }}>↩ Замовлення скасоване, а посилка вже в дорозі назад</span>
                        {order.tracking_number && <span> · ТТН {order.tracking_number}</span>}
                        {order.carrier_status_text && <span> · НП: «{order.carrier_status_text}»</span>}
                        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginTop: '8px', flexWrap: 'wrap' }}>
                          {rs === null && <>
                            <span>Посилка повертається на відділення. Вирішіть:</span>
                            <button onClick={() => setReturnState(order.id, 'received')}
                              style={{ height: '30px', padding: '0 12px', borderRadius: '7px', border: '1.5px solid #BBF7D0', background: '#F0FDF4', color: '#15803D', fontSize: '12.5px', fontWeight: 700, cursor: 'pointer' }}>
                              ✓ Забрав з пошти
                            </button>
                            <button onClick={() => setReturnState(order.id, 'abandoned')}
                              title="Коли зворотна доставка дорожча за товар — дешевше залишити посилку на пошті"
                              style={{ height: '30px', padding: '0 12px', borderRadius: '7px', border: '1.5px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text-secondary)', fontSize: '12.5px', fontWeight: 700, cursor: 'pointer' }}>
                              ✗ Не забираю
                            </button>
                          </>}
                          {rs === 'received' && <>
                            <span style={{ color: '#15803D', fontWeight: 600 }}>✓ Повернення забрано з пошти.</span>
                            <span style={{ color: 'var(--text-muted)', fontSize: '12px' }}>Якщо товар був закуплений — не забудьте оприбуткувати його на склад (Закупівля → Прихід).</span>
                            <button onClick={() => setReturnState(order.id, null)} style={{ height: '26px', padding: '0 10px', borderRadius: '6px', border: '1px solid var(--border)', background: 'none', color: 'var(--text-muted)', fontSize: '11.5px', cursor: 'pointer' }}>скасувати рішення</button>
                          </>}
                          {rs === 'abandoned' && <>
                            <span style={{ fontWeight: 600 }}>✗ Вирішено не забирати (повернення дорожче за товар).</span>
                            <button onClick={() => setReturnState(order.id, null)} style={{ height: '26px', padding: '0 10px', borderRadius: '6px', border: '1px solid var(--border)', background: 'none', color: 'var(--text-muted)', fontSize: '11.5px', cursor: 'pointer' }}>скасувати рішення</button>
                          </>}
                        </div>
                      </div>
                    );
                  })()}
                  {/* Попередження Rozetka Smart: редагування складу замовлення знімає Smart безповоротно */}
                  {isSmart && !isCancelled && (
                    <div style={{ borderTop: '1px solid var(--border-light)', background: '#FEFCE8', padding: '10px 16px', fontSize: '13px', color: '#713F12', lineHeight: 1.5 }}>
                      <span style={{ fontWeight: 700 }}>⚡ Замовлення Rozetka Smart.</span>{' '}
                      <span>Не змінюйте кількість і склад позицій — будь-яке редагування знімає Smart безповоротно (покупець втратить безкоштовну доставку). Компенсація доставки ({order.total_price < 400 ? 12 : order.total_price < 700 ? 18 : 30} ₴) буде проведена автоматично при доставці.</span>
                    </div>
                  )}
                  {/* Шапка розгорнутого замовлення — новий дизайн */}
                  <div className="oc-expand-header" style={{ borderTop: '1px solid var(--border-light)', background: 'var(--bg-soft)', padding: '16px 14px 14px', display: 'flex', alignItems: 'flex-start', gap: '14px' }}>
                    {/* main-part — дзеркалить основну область сітки (Клієнт | Оплата) */}
                    <div className="oc-main-part" style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'flex-start', gap: '14px' }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: '20px', fontWeight: 800, letterSpacing: '-0.02em', color: 'var(--text-primary)' }}>Замовлення #{order.order_number}</div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '7px', marginTop: '9px', flexWrap: 'wrap' }}>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', height: '26px', padding: '0 10px', borderRadius: '8px', fontSize: '12px', fontWeight: 700, whiteSpace: 'nowrap',
                          color: paymentConfirmed ? '#15803D' : '#B45309', background: paymentConfirmed ? '#DCFCE7' : '#FEF3C7' }}>
                          <CreditCard size={12} />{paymentConfirmed ? 'Оплачено' : isCod ? 'Накладений платіж' : 'Очікує оплату'}
                        </span>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', height: '26px', padding: '0 10px', borderRadius: '8px', fontSize: '12px', fontWeight: 700, color: channel.color, background: channel.bg, whiteSpace: 'nowrap' }}>
                          <ShoppingCart size={12} />{channel.label}
                        </span>
                        {(order.channel_code === 'rozetka' && order.rozetka_order_id) && (
                          <button onClick={() => { navigator.clipboard.writeText(String(order.rozetka_order_id)); showToast('Номер Rozetka скопійовано'); }}
                            title="Скопіювати номер замовлення Rozetka"
                            style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', height: '26px', padding: '0 10px', borderRadius: '8px', fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)', background: 'var(--bg-card)', border: '1px solid var(--border-light)', whiteSpace: 'nowrap', cursor: 'pointer', fontVariantNumeric: 'tabular-nums' }}>
                            №{order.rozetka_order_id} <Copy size={12} />
                          </button>
                        )}
                        {(order.channel_code === 'prom' && order.prom_order_id) && (
                          <button onClick={() => { navigator.clipboard.writeText(String(order.prom_order_id)); showToast('Номер Prom скопійовано'); }}
                            title="Скопіювати номер замовлення Prom"
                            style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', height: '26px', padding: '0 10px', borderRadius: '8px', fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)', background: 'var(--bg-card)', border: '1px solid var(--border-light)', whiteSpace: 'nowrap', cursor: 'pointer', fontVariantNumeric: 'tabular-nums' }}>
                            №{order.prom_order_id} <Copy size={12} />
                          </button>
                        )}
                        <span style={{ display: 'inline-flex', alignItems: 'center', height: '26px', padding: '0 10px', borderRadius: '8px', fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)', background: 'var(--bg-card)', border: '1px solid var(--border-light)', whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>
                          {date}
                        </span>
                      </div>
                    </div>
                    {/* Права половина: сума (ліворуч, по межі блоку «Оплата») + «Підтвердити» поруч */}
                    <div className="oc-pay-part" style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'flex-start', gap: '16px' }}>
                    <div style={{ flexShrink: 0, minWidth: '120px' }}>
                      <div style={{ fontSize: '24px', fontWeight: 800, letterSpacing: '-0.02em', color: 'var(--text-primary)', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>{Number(order.total_price).toFixed(0)} ₴</div>
                      <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Сума замовлення</div>
                    </div>
                    <div style={{ marginLeft: 'auto', display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
                    {order.status === 'new' && (() => {
                      const busy = confirming === order.id;
                      const confirmErr = confirmErrors[order.id];
                      return (
                        <div className="oc-confirm-block" style={{ width: '250px', display: 'flex', flexDirection: 'column', alignItems: 'stretch', gap: '6px' }}>
                          <button onClick={() => confirmOrder(order.id)} disabled={busy}
                            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', width: '100%', height: '44px', padding: '0 22px', borderRadius: '12px', border: 'none', background: busy ? '#94A3B8' : '#1E3A5F', color: '#fff', fontSize: '14px', fontWeight: 600, cursor: busy ? 'wait' : 'pointer', boxShadow: '0 1px 2px rgba(30,58,95,0.35)', whiteSpace: 'nowrap' }}>
                            {busy ? 'Обробка…' : <><Check size={17} /> Підтвердити замовлення</>}
                          </button>
                          {confirmErr && (
                            <div style={{ maxWidth: '300px', padding: '8px 10px', background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: '8px', textAlign: 'left' }}>
                              <div style={{ fontSize: '12px', fontWeight: 600, color: '#DC2626', marginBottom: confirmErr.insufficient?.length ? '6px' : 0 }}>⚠ {confirmErr.error}</div>
                              {confirmErr.insufficient?.map(item => {
                                const name = order.items.find(i => i.sku === item.sku)?.name;
                                return (
                                  <div key={item.sku} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '11px', padding: '2px 0', borderTop: '1px solid #FECACA' }}>
                                    <span style={{ color: '#7F1D1D', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '60%' }}>{name ?? item.sku}</span>
                                    <span style={{ color: '#DC2626', fontWeight: 700, flexShrink: 0 }}>{item.available} / {item.requested} шт</span>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      );
                    })()}
                    </div>{/* /кнопка Підтвердити */}
                    </div>{/* /Оплата-part */}
                    </div>{/* /main-part */}
                    {/* Статус — над правою панеллю (250px), «...» = ручна зміна */}
                    <div className="oc-status-panel" style={{ width: '250px', flexShrink: 0, display: 'flex', flexDirection: 'column', gap: '6px' }}>
                      <div style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center', height: '44px', borderRadius: '10px', color: status.color, background: status.bg, border: `1.5px solid ${status.color}` }}>
                        <span style={{ fontSize: '14px', fontWeight: 700, whiteSpace: 'nowrap' }}>{status.label}</span>
                        <button onClick={() => setStatusEditOpen(p => ({ ...p, [order.id]: !p[order.id] }))}
                          title="Змінити статус вручну"
                          style={{ position: 'absolute', right: '8px', top: '50%', transform: 'translateY(-50%)', background: (statusEditOpen[order.id] ?? false) ? 'rgba(0,0,0,0.12)' : 'none', border: 'none', cursor: 'pointer', color: status.color, padding: '3px', borderRadius: '6px', display: 'inline-flex' }}>
                          <MoreHorizontal size={18} />
                        </button>
                      </div>
                      {(() => {
                        // Що зараз у кабінеті Rozetka. Показуємо, лише коли кабінет
                        // попереду нас: коли статуси збігаються, зайвий рядок під
                        // плашкою нічого не додає й тільки шумить.
                        const cab = rozetkaCabinet(order);
                        if (!cab?.ahead) return null;
                        return (
                          <div title={cab.at ? `Зчитано з кабінету: ${new Date(cab.at).toLocaleString('uk-UA', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}` : undefined}
                            style={{ fontSize: '11px', fontWeight: 600, textAlign: 'center', lineHeight: 1.3, color: '#15803D' }}>
                            ↳ у кабінеті: {cab.label}
                          </div>
                        );
                      })()}
                      {order.status === 'shipped' && order.tracking_number && (
                        <div title={order.carrier_status_synced_at ? `Оновлено: ${new Date(order.carrier_status_synced_at).toLocaleString('uk-UA', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}` : undefined}
                          style={{ fontSize: '11px', fontWeight: 600, textAlign: 'center', lineHeight: 1.3, color: order.carrier_accepted_at ? '#15803D' : '#B45309' }}>
                          {order.carrier_accepted_at ? '✓' : '⏳'} {order.carrier_status_text ?? (order.carrier_accepted_at ? 'Прийнято НП' : 'Очікує приймання НП')}
                        </div>
                      )}
                      {(statusEditOpen[order.id] ?? false) && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                          <div style={{ fontSize: '10px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                            Змінити вручну{!isAdmin && <span style={{ marginLeft: '4px', color: '#F59E0B' }}>🔒</span>}
                          </div>
                          <select
                            value={order.status}
                            onChange={e => { if (e.target.value !== order.status) changeStatus(order.id, e.target.value); }}
                            style={{ width: '100%', height: '32px', padding: '0 8px', border: '1px solid var(--border)', borderRadius: '7px', fontSize: '12px', background: 'var(--bg-card)', cursor: 'pointer', color: 'var(--text-primary)' }}
                          >
                            {STATUSES.filter(s => {
                              if (isAdmin) return true;
                              if (s.value === 'cancelled') return order.status === 'new';
                              return (STATUS_RANK[s.value] ?? -1) >= (STATUS_RANK[order.status] ?? 0);
                            }).map(s => (
                              <option key={s.value} value={s.value} style={s.value === 'cancelled' ? { color: '#DC2626', fontWeight: 700 } : undefined}>
                                {s.value === 'cancelled' ? '⚠ ' + s.label : s.label}
                              </option>
                            ))}
                          </select>
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="order-expand-grid" style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 250px', gap: '14px', padding: '14px', background: 'var(--bg-soft)', alignItems: 'stretch' }}>

                    {/* MAIN column (Товари + Контакт/Доставка) */}
                    <div className="order-main-col" style={{ display: 'flex', flexDirection: 'column', gap: '14px', minWidth: 0 }}>

                    {/* Col 1: Items */}
                    <div className="order-col-card" style={{ flex: 1, padding: '16px', display: 'flex', flexDirection: 'column' }}>
                      <div style={{ paddingTop: '0', flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', minHeight: 0 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                          <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                            Товари · {order.items.length}
                          </span>
                          <button
                            onClick={() => editingId === order.id ? setEditingId(null) : startEdit(order)}
                            style={{
                              height: '24px', padding: '0 8px', borderRadius: '6px', fontSize: '11px', fontWeight: 600,
                              border: `1.5px solid ${editingId === order.id ? '#EF4444' : 'var(--border)'}`,
                              background: editingId === order.id ? '#FEF2F2' : 'var(--bg-card)',
                              color: editingId === order.id ? '#EF4444' : 'var(--text-secondary)',
                              cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '3px',
                            }}
                          >
                            {editingId === order.id ? <><X size={10} /> Скасувати</> : <><Pencil size={10} /> Редагувати</>}
                          </button>
                        </div>

                        {editingId === order.id ? (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                            {editItems.map((item, idx) => (
                              <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px' }}>
                                <span style={{ flex: 1, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                  <span style={{ color: 'var(--text-muted)', marginRight: '2px' }}>{item.sku}</span>
                                  <button onClick={() => { navigator.clipboard.writeText(item.sku); setCopiedSku(item.sku); setTimeout(() => setCopiedSku(null), 1500); }} title="Копіювати артикул"
                                    style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '0 4px 0 0', color: copiedSku === item.sku ? '#15803D' : 'var(--text-muted)', lineHeight: 1, fontSize: '11px' }}>
                                    {copiedSku === item.sku ? '✓' : '⎘'}
                                  </button>{item.name}
                                </span>
                                <input type="number" min={1} value={item.qty}
                                  onChange={e => setEditItems(prev => prev.map((it, i) => i === idx ? { ...it, qty: Math.max(1, parseInt(e.target.value) || 1) } : it))}
                                  style={{ width: '46px', height: '26px', border: '1px solid var(--border)', borderRadius: '6px', textAlign: 'center', fontSize: '12px', outline: 'none' }} />
                                <span style={{ color: item.is_bonus ? '#15803D' : 'var(--text-secondary)', width: '70px', textAlign: 'right', flexShrink: 0, fontWeight: item.is_bonus ? 600 : 400 }}>
                                  {item.is_bonus ? '🎁 0 ₴' : `${(item.price * item.qty).toFixed(0)} грн`}
                                </span>
                                <button onClick={() => setEditItems(prev => prev.filter((_, i) => i !== idx))}
                                  style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#EF4444', padding: '2px', flexShrink: 0, display: 'flex' }}>
                                  <Trash2 size={12} />
                                </button>
                              </div>
                            ))}
                            <div style={{ borderTop: '1px solid var(--border-light)', paddingTop: '8px', marginTop: '4px' }}>
                              <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '6px', textTransform: 'uppercase' }}>Додати товар</div>
                              <div ref={prodRef} style={{ position: 'relative', marginBottom: '6px' }}>
                                <input placeholder="Пошук за назвою або SKU..." value={prodSearch}
                                  onChange={e => setProdSearch(e.target.value)}
                                  onFocus={() => prodResults.length > 0 && setProdOpen(true)}
                                  style={{ width: '100%', height: '28px', padding: '0 8px', border: '1px solid var(--border)', borderRadius: '6px', fontSize: '12px', outline: 'none', boxSizing: 'border-box' }} />
                                {prodOpen && prodResults.length > 0 && (
                                  <div style={{ position: 'absolute', top: 'calc(100% + 2px)', left: 0, right: 0, zIndex: 50, background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '8px', boxShadow: '0 4px 16px rgba(0,0,0,0.1)', maxHeight: '160px', overflowY: 'auto' }}>
                                    {prodResults.map(p => (
                                      <button key={p.sku} onMouseDown={() => {
                                        setAddSku(p.sku); setAddName(`${p.brand} ${p.name}`); setAddPrice(String(p.price));
                                        setProdSearch(`${p.brand} ${p.name}`); setProdOpen(false);
                                      }} style={{ width: '100%', padding: '6px 10px', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left', fontSize: '12px', borderBottom: '1px solid var(--border-light)' }}>
                                        <span style={{ color: 'var(--text-muted)', marginRight: '4px' }}>{p.sku}</span>{p.brand} {p.name}
                                        {p.price > 0 && <span style={{ color: 'var(--brand-blue)', marginLeft: '6px', fontWeight: 600 }}>{p.price} грн</span>}
                                      </button>
                                    ))}
                                  </div>
                                )}
                              </div>
                              <div style={{ display: 'grid', gridTemplateColumns: '1fr 50px 70px auto', gap: '4px', alignItems: 'center' }}>
                                <input placeholder="Назва товару" value={addName} onChange={e => setAddName(e.target.value)}
                                  style={{ height: '28px', padding: '0 8px', border: '1px solid var(--border)', borderRadius: '6px', fontSize: '12px', outline: 'none' }} />
                                <input placeholder="К-сть" type="number" min={1} value={addQty} onChange={e => setAddQty(parseInt(e.target.value) || 1)}
                                  style={{ height: '28px', padding: '0 6px', border: '1px solid var(--border)', borderRadius: '6px', fontSize: '12px', textAlign: 'center', outline: 'none' }} />
                                <input placeholder="Ціна" type="number" min={0} value={addPrice} onChange={e => setAddPrice(e.target.value)}
                                  style={{ height: '28px', padding: '0 6px', border: '1px solid var(--border)', borderRadius: '6px', fontSize: '12px', outline: 'none' }} />
                                <button onClick={addItem} style={{ height: '28px', width: '28px', borderRadius: '6px', border: 'none', background: '#1E3A5F', color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                  <Plus size={13} />
                                </button>
                              </div>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '8px', paddingTop: '8px', borderTop: '1px solid var(--border-light)' }}>
                              <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--brand-blue)' }}>
                                Разом: {editItems.reduce((s, i) => s + i.price * i.qty, 0).toFixed(2)} грн
                              </span>
                              <button onClick={() => saveEdit(order.id)} disabled={editSaving}
                                style={{ height: '30px', padding: '0 14px', borderRadius: '7px', border: 'none', background: '#1E3A5F', color: '#fff', fontSize: '12px', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '5px', opacity: editSaving ? 0.6 : 1 }}>
                                {editSaving ? '...' : <><Check size={12} /> Зберегти</>}
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div style={{ display: 'flex', flexDirection: 'column' }}>
                            {/* Items table */}
                            <div className="oc-items-scroll" style={{ padding: '2px 0 0' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                              <thead>
                                <tr style={{ borderBottom: '1px solid var(--border)' }}>
                                  <th style={{ textAlign: 'left', padding: '2px 0 8px', color: 'var(--text-muted)', fontWeight: 600, fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Назва</th>
                                  <th className="oc-col-sku" style={{ textAlign: 'left', padding: '2px 6px 8px 12px', color: 'var(--text-muted)', fontWeight: 600, fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.04em', width: '104px', whiteSpace: 'nowrap' }}>Артикул</th>
                                  <th style={{ textAlign: 'right', padding: '2px 6px 8px', color: 'var(--text-muted)', fontWeight: 600, fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.04em', width: '44px', whiteSpace: 'nowrap' }}>К-сть</th>
                                  <th style={{ textAlign: 'right', padding: '2px 6px 8px', color: 'var(--text-muted)', fontWeight: 600, fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.04em', width: '62px', whiteSpace: 'nowrap' }}>Ціна</th>
                                  <th style={{ textAlign: 'right', padding: '2px 0 8px', color: 'var(--text-muted)', fontWeight: 600, fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.04em', width: '70px' }}>Сума</th>
                                  <th className="oc-col-src" style={{ textAlign: 'right', padding: '2px 0 8px 8px', color: 'var(--text-muted)', fontWeight: 600, fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.04em', width: '90px' }}>Джерело</th>
                                </tr>
                              </thead>
                              <tbody>
                                {(() => {
                                  const planItems = fulfillmentData[order.id]?.plan?.items ?? [];
                                  const sources = order.items.map(item => {
                                    const planSrc = planItems.find(s => s.sku === item.sku);
                                    return sourceOverrides[order.id]?.[item.sku] ?? planSrc?.fulfillment_type;
                                  }).filter(Boolean);
                                  const isMixed = new Set(sources).size > 1;
                                  const expanded = itemsExpanded[order.id] ?? false;
                                  const shown = expanded ? order.items : order.items.slice(0, 1);

                                  const rows = shown.map(item => {
                                    const planSrc = planItems.find(s => s.sku === item.sku);
                                    const effectiveSrc = sourceOverrides[order.id]?.[item.sku] ?? planSrc?.fulfillment_type;
                                    const supplierName = fulfillmentData[order.id]?.by_supplier?.flatMap(g => g.items).find(i => i.sku === item.sku)?.supplier_name;
                                    const srcBg = isMixed
                                      ? effectiveSrc === 'own' ? '#F0FDF4' : '#EFF4FF'
                                      : undefined;
                                    const srcBorder = isMixed
                                      ? effectiveSrc === 'own' ? '2px solid #86EFAC' : '2px solid #BFDBFE'
                                      : undefined;
                                    return (
                                      <tr key={item.sku} style={{ borderBottom: '1px solid var(--border-light)' }}>
                                        {/* Назва — мініатюра + назва зверху жирнішим, код нижче */}
                                        <td className="oc-col-name" style={{ padding: '10px 0', maxWidth: 0, whiteSpace: 'normal', wordBreak: 'break-word', lineHeight: 1.3, verticalAlign: 'middle' }}>
                                          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
                                            {(() => {
                                              const img = itemImages[order.id]?.[item.sku];
                                              return (
                                                <a href={`/admin/products/${encodeURIComponent(item.sku)}`} target="_blank" rel="noopener noreferrer"
                                                  onClick={e => e.stopPropagation()} title="Відкрити картку товару"
                                                  style={{ width: '40px', height: '40px', borderRadius: '8px', flexShrink: 0, border: '1px solid var(--border-light)', display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                  background: img ? `#fff url("${img}") center/cover no-repeat` : '#fff' }}>
                                                  {!img && <Package size={16} color="var(--text-muted)" />}
                                                </a>
                                              );
                                            })()}
                                            <div style={{ minWidth: 0 }}>
                                              <a href={`/admin/products/${encodeURIComponent(item.sku)}`} target="_blank" rel="noopener noreferrer"
                                                onClick={e => e.stopPropagation()}
                                                title="Відкрити картку товару"
                                                style={{ color: 'var(--text-primary)', fontSize: '12.5px', fontWeight: 600, lineHeight: 1.35, letterSpacing: '-0.006em', textDecoration: 'none' }}
                                                onMouseEnter={e => { e.currentTarget.style.color = 'var(--brand-blue)'; e.currentTarget.style.textDecoration = 'underline'; }}
                                                onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-primary)'; e.currentTarget.style.textDecoration = 'none'; }}>{item.name}</a>
                                            </div>
                                          </div>
                                        </td>
                                        {/* Артикул — окремий стовпець */}
                                        <td className="oc-col-sku" style={{ padding: '10px 6px 10px 12px', verticalAlign: 'middle' }}>
                                          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                            <span style={{ color: 'var(--text-secondary)', fontSize: '11.5px', fontFamily: 'monospace', whiteSpace: 'nowrap' }}>{item.sku}</span>
                                            <button onClick={() => { navigator.clipboard.writeText(item.sku); setCopiedSku(item.sku); setTimeout(() => setCopiedSku(null), 1500); }} title="Копіювати артикул"
                                              style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, color: copiedSku === item.sku ? '#15803D' : 'var(--text-muted)', lineHeight: 1, display: 'inline-flex' }}>
                                              {copiedSku === item.sku ? <Check size={12} /> : <Copy size={12} />}
                                            </button>
                                          </div>
                                        </td>
                                        <td className="oc-col-qty" style={{ padding: '10px 6px', color: 'var(--text-primary)', textAlign: 'right', fontSize: '12.5px', fontWeight: 600, fontVariantNumeric: 'tabular-nums', verticalAlign: 'middle' }}>{item.qty}</td>
                                        <td className="oc-col-price" style={{ padding: '10px 6px', textAlign: 'right', color: 'var(--text-primary)', fontSize: '12.5px', fontWeight: 600, fontVariantNumeric: 'tabular-nums', verticalAlign: 'middle' }}>
                                          {item.is_bonus ? '' : `${item.price.toFixed(0)} ₴`}
                                        </td>
                                        <td className="oc-col-sum" style={{ padding: '10px 0', textAlign: 'right', verticalAlign: 'middle' }}>
                                          {item.is_bonus
                                            ? <span style={{ color: '#15803D', fontSize: '11px', fontWeight: 700, background: '#F0FDF4', padding: '1px 6px', borderRadius: '4px' }}>🎁 Бонус</span>
                                            : <span style={{ color: 'var(--text-primary)', fontSize: '12.5px', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{(item.price * item.qty).toFixed(0)} ₴</span>
                                          }
                                        </td>
                                        <td className="oc-col-src" style={{ padding: '10px 0 10px 8px', textAlign: 'right', verticalAlign: 'middle', background: srcBg, borderLeft: srcBorder, borderRadius: isMixed ? '6px' : undefined }}>
                                          {fulfillmentLoading.has(order.id) ? (
                                            <span style={{ color: 'var(--text-muted)', fontSize: '11px' }}>…</span>
                                          ) : planSrc ? (
                                            <select
                                              value={effectiveSrc ?? planSrc.fulfillment_type}
                                              disabled={order.fulfillment_mode !== null || order.status !== 'new'}
                                              onChange={e => setSourceOverrides(prev => ({
                                                ...prev,
                                                [order.id]: { ...(prev[order.id] ?? {}), [item.sku]: e.target.value as 'own' | 'dropship' },
                                              }))}
                                              style={{ fontSize: '11px', fontWeight: 600, border: '1px solid var(--border)', borderRadius: '6px', padding: '3px 6px', background: 'var(--bg-soft)',
                                                cursor: order.fulfillment_mode !== null || order.status !== 'new' ? 'default' : 'pointer',
                                                maxWidth: '90px', opacity: order.fulfillment_mode !== null || order.status !== 'new' ? 0.7 : 1,
                                                color: effectiveSrc === 'own' ? '#15803D' : 'var(--brand-blue)' }}
                                            >
                                              <option value="dropship">{supplierName ?? 'Постач.'}</option>
                                              {(planSrc.available_own ?? 0) >= item.qty && (
                                                <option value="own">Наш ({planSrc.available_own})</option>
                                              )}
                                            </select>
                                          ) : (
                                            <span style={{ color: 'var(--text-muted)', fontSize: '11px' }}>—</span>
                                          )}
                                        </td>
                                      </tr>
                                    );
                                  });
                                  if (order.items.length > 1) {
                                    rows.push(
                                      <tr key="__more">
                                        <td colSpan={6} style={{ padding: '8px 0 2px' }}>
                                          <button type="button" onClick={() => setItemsExpanded(p => ({ ...p, [order.id]: !expanded }))}
                                            style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontSize: '12px', fontWeight: 600, color: 'var(--brand-blue)' }}>
                                            {expanded
                                              ? <><ChevronUp size={14} /> Згорнути список</>
                                              : <><ChevronDown size={14} /> Показати ще {order.items.length - 1} {order.items.length - 1 === 1 ? 'товар' : order.items.length - 1 < 5 ? 'товари' : 'товарів'}</>}
                                          </button>
                                        </td>
                                      </tr>
                                    );
                                    // Підсумок замовлення — лише на мобілці (десктоп: сума в шапці).
                                    // display:none inline ховає на десктопі; мобільне .oc-items-scroll tr{display:flex} перебиває.
                                    rows.push(
                                      <tr className="oc-total-row" key="__total" style={{ display: 'none' }}>
                                        <td colSpan={6} style={{ padding: '10px 0 0' }}>
                                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderTop: '1px solid var(--border)', paddingTop: '10px' }}>
                                            <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-secondary)' }}>Разом</span>
                                            <span style={{ fontSize: '16px', fontWeight: 800, color: 'var(--text-primary)', fontVariantNumeric: 'tabular-nums' }}>{Number(order.total_price).toFixed(0)} ₴</span>
                                          </div>
                                        </td>
                                      </tr>
                                    );
                                  }
                                  return rows;
                                })()}
                              </tbody>
                            </table>
                            </div>

                            {/* «Тип цін + знижка» перенесено в картку «Логістика» нижче */}

                            {/* Ряд Фінанси | Логістика — під таблицею, згортається (за замовчуванням згорнуто) */}
                            <button type="button" onClick={() => setFinLogOpen(p => ({ ...p, [order.id]: !(p[order.id] ?? false) }))}
                              style={{ marginTop: '12px', display: 'flex', alignItems: 'center', gap: '5px', background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontSize: '11px', fontWeight: 700, color: (finLogOpen[order.id] ?? false) ? 'var(--brand-blue)' : 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                              {(finLogOpen[order.id] ?? false) ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                              Фінанси та логістика
                            </button>
                            {(finLogOpen[order.id] ?? false) && (<>
                            <div className="oc-finlog-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', marginTop: '10px', alignItems: 'stretch' }}>
                            <div className="order-col-card" style={{ minWidth: 0, padding: '14px', display: 'flex', flexDirection: 'column' }}>
                            <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '8px' }}>Фінанси</div>
                            {/* Економіка замовлення. Після проведення РН показуємо ФАКТ із проводок
                                (FIFO-собівартість, комісія з усіма зборами, сторно повернень); до того —
                                попередню оцінку (собівартість = поточна закупівля, комісія = збережена
                                при синку або серверний розрахунок брекетами/ставками категорій). */}
                            {(() => {
                              const fi = fulfillmentData[order.id];
                              const fact = fi?.fact ?? null;
                              const isFact = !!fact;
                              const revenue = isFact ? fact.revenue : order.total_price;
                              let commission: number | undefined;
                              if (isFact) {
                                commission = fact.commission;
                              } else if (order.channel_code === 'prom' || order.channel_code === 'rozetka') {
                                const cd = order.channel_code === 'prom' ? order.prom_data?._commission : order.rozetka_data?._commission;
                                commission = cd?.total_commission
                                  ?? fi?.commission_estimate
                                  ?? Math.round(order.total_price * (order.channel_code === 'prom' ? promCommissionPct : rozetkaCommissionPct)) / 100;
                              } else {
                                commission = 0;
                              }
                              const cost = isFact ? fact.cogs : fi?.total_cost;
                              const deliveryExp = isFact ? fact.delivery : 0;
                              const gross = isFact ? fact.revenue - fact.cogs : fi?.total_margin;
                              const grossPct = gross != null && revenue > 0 ? Math.round((gross / revenue) * 1000) / 10 : undefined;
                              const net = gross != null && commission != null ? gross - commission - deliveryExp : undefined;
                              const netPct = net != null && revenue > 0 ? Math.round((net / revenue) * 1000) / 10 : undefined;
                              const finalColor = (v: number | undefined) => (v ?? 0) >= 0 ? '#15803D' : '#DC2626';
                              const row = (label: string, value: string, opts: { color?: string; strong?: boolean; total?: boolean; sub?: string } = {}) => (
                                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '10px',
                                  ...(opts.total ? { marginTop: '3px', paddingTop: '9px', borderTop: '1px solid var(--border-light)' } : {}) }}>
                                  <span style={{ fontSize: '12.5px', color: opts.total ? 'var(--text-primary)' : 'var(--text-secondary)', fontWeight: opts.total ? 700 : 400 }}>{label}</span>
                                  <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', minWidth: 0 }}>
                                    <span style={{ fontSize: '13px', fontWeight: (opts.strong || opts.total) ? 700 : 600, color: opts.color ?? 'var(--text-primary)', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>{value}</span>
                                    {opts.sub && <span style={{ fontSize: '11px', fontWeight: 600, color: opts.color ?? 'var(--text-muted)', fontVariantNumeric: 'tabular-nums', marginTop: '1px' }}>{opts.sub}</span>}
                                  </span>
                                </div>
                              );
                              return (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '9px' }}>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '-2px' }}>
                                    <span title={isFact
                                        ? `Цифри з бухгалтерських проводок (проведено РН: ${fact.posted_docs}). Враховано FIFO-собівартість, усі збори маркетплейсу та повернення.`
                                        : 'Попередня оцінка до проведення продажу: собівартість за поточними цінами закупівлі, комісія — розрахунок за ставками маркетплейсу.'}
                                      style={{ fontSize: '10px', fontWeight: 700, padding: '1px 7px', borderRadius: '999px', letterSpacing: '0.03em', textTransform: 'uppercase',
                                        color: isFact ? '#15803D' : '#B45309', background: isFact ? '#DCFCE7' : '#FEF3C7' }}>
                                      {isFact ? 'Факт' : 'Оцінка'}
                                    </span>
                                  </div>
                                  {row('Виручка', `${revenue.toFixed(0)} ₴`)}
                                  {row('Собівартість', cost != null ? `${cost.toFixed(0)} ₴` : '…', { color: 'var(--text-secondary)' })}
                                  {(commission ?? 0) > 0 && row('Комісія маркетплейсу', `−${commission!.toFixed(0)} ₴`, { color: '#C2410C' })}
                                  {deliveryExp > 0 && row('Доставка НП (наш рахунок)', `−${deliveryExp.toFixed(0)} ₴`, { color: '#C2410C' })}
                                  {row('Валовий прибуток', gross != null ? `${gross.toFixed(0)} ₴` : '…', { color: finalColor(gross), strong: true, sub: grossPct != null ? `${grossPct}%` : undefined })}
                                  {((commission ?? 0) > 0 || deliveryExp > 0) && row('Чистий прибуток', net != null ? `${net.toFixed(0)} ₴` : '…', { color: finalColor(net), total: true, sub: netPct != null ? `${netPct}%` : undefined })}
                                </div>
                              );
                            })()}

                            {/* Прогрес отримання — показується якщо є хоча б один прихід */}
                            {(() => {
                              const lines = receiptLines[order.id] ?? [];
                              if (!lines.length) return null;
                              // Агрегуємо отриману кількість по SKU
                              const received: Record<string, number> = {};
                              for (const l of lines) {
                                received[l.sku] = (received[l.sku] ?? 0) + (l.qty_actual ?? l.qty ?? 0);
                              }
                              const hasAny = order.items.some(i => (received[i.sku] ?? 0) > 0);
                              if (!hasAny) return null;
                              return (
                                <div style={{ marginTop: '10px', padding: '10px 12px', background: '#F0FDF4', border: '1px solid #BBF7D0', borderRadius: '8px' }}>
                                  <div style={{ fontSize: '10px', fontWeight: 700, color: '#15803D', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '8px' }}>
                                    📥 Отримано на склад
                                  </div>
                                  {order.items.map(item => {
                                    const rcv = received[item.sku] ?? 0;
                                    if (rcv === 0) return null;
                                    const pct = Math.min(100, Math.round((rcv / item.qty) * 100));
                                    const full = rcv >= item.qty;
                                    return (
                                      <div key={item.sku} style={{ marginBottom: '6px' }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', marginBottom: '3px' }}>
                                          <span style={{ color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '70%' }}>
                                            {item.name}
                                          </span>
                                          <span style={{ fontWeight: 700, color: full ? '#15803D' : '#B45309', flexShrink: 0 }}>
                                            {rcv} / {item.qty} шт {full ? '✓' : ''}
                                          </span>
                                        </div>
                                        <div style={{ height: '4px', background: '#D1FAE5', borderRadius: '2px', overflow: 'hidden' }}>
                                          <div style={{ height: '100%', width: `${pct}%`, background: full ? '#15803D' : '#F59E0B', borderRadius: '2px', transition: 'width 0.3s' }} />
                                        </div>
                                      </div>
                                    );
                                  })}
                                </div>
                              );
                            })()}

                            </div>
                            <div className="order-col-card" style={{ minWidth: 0, padding: '14px', display: 'flex', flexDirection: 'column' }}>
                            <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '8px' }}>Логістика</div>
                            {/* Тип цін + ручна знижка */}
                            {(() => {
                              const editable = ['new', 'confirmed', 'awaiting_stock', 'picking'].includes(order.status)
                                && order.channel_code !== 'dropship';
                              const pt = order.price_type ?? 'retail';
                              const activePct = Number(order.discount_pct ?? 0);
                              const open = priceBlockOpen[order.id] ?? false;
                              return (
                                <div style={{ marginBottom: '10px' }}>
                                  <button type="button"
                                    onClick={() => setPriceBlockOpen(p => ({ ...p, [order.id]: !open }))}
                                    style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', minHeight: '32px', padding: '5px 10px', border: '1px solid var(--border)', borderRadius: '7px', background: 'var(--bg-soft)', cursor: 'pointer', fontSize: '12px', color: 'var(--text-primary)' }}>
                                    <span style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                                      <span>Тип цін: <strong>{PRICE_TYPE_LABELS[pt] ?? pt}</strong></span>
                                      {activePct > 0
                                        ? <span style={{ fontSize: '11px', fontWeight: 700, color: '#B45309', background: '#FEF3C7', borderRadius: '5px', padding: '1px 7px' }}>−{activePct}%</span>
                                        : <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>+ знижка</span>}
                                    </span>
                                    <span style={{ flexShrink: 0, color: 'var(--text-muted)' }}>
                                      {open ? <ChevronUp size={14} color="#94A3B8" /> : <ChevronDown size={14} color="#94A3B8" />}
                                    </span>
                                  </button>
                                  {open && (
                                  <div style={{ marginTop: '10px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                  <div style={{ minWidth: 0 }}>
                                    <div style={{ fontSize: '10px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '4px' }}
                                      title="Тариф, за яким пораховані позиції. Зміна перерахує всі ціни за відповідним прайсом.">
                                      Тип цін
                                    </div>
                                    {editable ? (
                                      <select
                                        value={pt}
                                        onChange={e => { if (e.target.value !== pt) changePriceType(order.id, e.target.value); }}
                                        style={{ width: '100%', height: '30px', padding: '0 8px', border: '1px solid var(--border)', borderRadius: '6px', fontSize: '12px', background: 'var(--bg-card)', cursor: 'pointer', color: 'var(--text-primary)', fontWeight: 600 }}>
                                        <option value="retail">Роздріб</option>
                                        <option value="wholesale">Опт</option>
                                        <option value="drop">Дроп</option>
                                      </select>
                                    ) : (
                                      <div style={{ height: '30px', display: 'flex', alignItems: 'center', padding: '0 8px', border: '1px solid var(--border-light)', borderRadius: '6px', fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)', background: 'var(--bg-subtle)' }}
                                        title={order.channel_code === 'dropship' ? 'Дропшип — ціна за собівартістю' : 'Ціни зафіксовані у проведеній накладній (відвантажено)'}>
                                        {PRICE_TYPE_LABELS[pt] ?? pt}
                                      </div>
                                    )}
                                  </div>
                                  {(() => {
                                    if (!editable) {
                                      if (activePct > 0) {
                                        return (
                                          <div style={{ minWidth: 0 }}>
                                            <div style={{ fontSize: '10px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '4px' }}>Знижка</div>
                                            <div style={{ height: '30px', display: 'flex', alignItems: 'center', padding: '0 8px', border: '1px solid var(--border-light)', borderRadius: '6px', fontSize: '12px', fontWeight: 600, color: '#B45309', background: '#FFFBEB' }}>
                                              −{activePct}% (−{Number(order.discount_amount ?? 0).toFixed(2)} ₴)
                                            </div>
                                          </div>
                                        );
                                      }
                                      return null;
                                    }
                                    const mode = discMode[order.id] ?? 'pct';
                                    return (
                                      <div style={{ minWidth: 0 }}>
                                        <div style={{ fontSize: '10px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '4px' }}
                                          title="Ручна знижка. Знижує ціни всіх позицій; сума замовлення перераховується.">
                                          Знижка{activePct > 0 ? ` · зараз −${activePct}%` : ''}
                                        </div>
                                        <div style={{ display: 'flex', gap: '4px' }}>
                                          <select
                                            value={mode}
                                            onChange={e => setDiscMode(p => ({ ...p, [order.id]: e.target.value as 'pct' | 'amount' }))}
                                            style={{ height: '30px', padding: '0 4px', border: '1px solid var(--border)', borderRadius: '6px', fontSize: '12px', background: 'var(--bg-card)', cursor: 'pointer' }}>
                                            <option value="pct">%</option>
                                            <option value="amount">₴</option>
                                          </select>
                                          <input
                                            type="number" min="0" step="any"
                                            value={discInput[order.id] ?? ''}
                                            placeholder={mode === 'pct' ? 'напр. 10' : 'напр. 200'}
                                            onChange={e => setDiscInput(p => ({ ...p, [order.id]: e.target.value }))}
                                            style={{ width: '100%', height: '30px', padding: '0 8px', border: '1px solid var(--border)', borderRadius: '6px', fontSize: '12px', background: 'var(--bg-card)' }}
                                          />
                                          <button
                                            onClick={() => applyDiscount(order.id, mode, parseFloat(discInput[order.id] ?? ''))}
                                            style={{ height: '30px', padding: '0 10px', border: '1px solid #93C5FD', background: '#EFF6FF', color: '#1E3A5F', borderRadius: '6px', fontSize: '12px', fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' }}
                                          >OK</button>
                                        </div>
                                        {activePct > 0 && (
                                          <button
                                            onClick={() => applyDiscount(order.id, 'pct', 0)}
                                            style={{ marginTop: '4px', fontSize: '11px', color: '#B91C1C', background: 'none', border: 'none', cursor: 'pointer', padding: 0, textDecoration: 'underline' }}
                                          >Прибрати знижку −{activePct}%</button>
                                        )}
                                      </div>
                                    );
                                  })()}
                                  </div>
                                  )}
                                </div>
                              );
                            })()}
                            {/* Спосіб виконання + Відвантажує пост. — в один рядок, однакова висота */}
                            <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginTop: '4px', alignItems: 'stretch' }}>
                            {order.status === 'new' && (() => {
                              const plan = fulfillmentData[order.id]?.plan;
                              const hasOwn = plan ? plan.has_own : true;
                              return (
                                <div style={{ flex: '1 1 200px', minWidth: 0, padding: '10px 12px', background: 'var(--bg-soft)', borderRadius: '8px', border: '1px solid var(--border)' }}>
                                  <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.03em' }}>Спосіб виконання</div>
                                  <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                                    {(['supplier', 'own', 'mixed'] as const).map(mode => {
                                      const label = mode === 'supplier' ? 'Постачальник' : mode === 'own' ? 'Наш склад' : 'Змішаний';
                                      const active = (selectedMode[order.id] ?? 'supplier') === mode;
                                      const disabled = !hasOwn && (mode === 'own' || mode === 'mixed');
                                      return (
                                        <button key={mode}
                                          onClick={() => !disabled && setSelectedMode(prev => ({ ...prev, [order.id]: mode }))}
                                          title={disabled ? 'Немає товару на власному складі' : undefined}
                                          style={{ width: '100%', padding: '7px 10px', borderRadius: '6px', fontSize: '12px', fontWeight: 600, whiteSpace: 'nowrap', textAlign: 'center',
                                            cursor: disabled ? 'not-allowed' : 'pointer',
                                            border: `1.5px solid ${active ? '#1E3A5F' : 'var(--border)'}`,
                                            background: disabled ? 'var(--bg-soft)' : active ? '#1E3A5F' : 'var(--bg-card)',
                                            color: disabled ? 'var(--text-muted)' : active ? '#fff' : 'var(--text-secondary)',
                                            opacity: disabled ? 0.5 : 1 }}>
                                          {label}
                                        </button>
                                      );
                                    })}
                                  </div>
                                </div>
                              );
                            })()}
                            {/* Хто фактично відвантажив — поряд зі способом виконання */}
                            {(order.fulfillment_mode ?? 'supplier') !== 'own' && suppliersList.length > 0 && (
                              <div style={{ flex: '1 1 200px', minWidth: 0, padding: '10px 12px', background: 'var(--bg-soft)', borderRadius: '8px', border: '1px solid var(--border)' }}>
                                <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.03em' }}
                                  title="Хто фактично відвантажив товар. Борг перед постачальником при відправці буде віднесено саме на нього.">
                                  Відвантажує пост.
                                </div>
                                <select
                                  value={order.shipping_supplier_id ?? ''}
                                  onChange={e => { const v = e.target.value === '' ? null : parseInt(e.target.value); if (v !== (order.shipping_supplier_id ?? null)) setShippingSupplier(order.id, v); }}
                                  style={{ width: '100%', height: '32px', padding: '0 8px', border: '1px solid var(--border)', borderRadius: '7px', fontSize: '12px', background: 'var(--bg-card)', cursor: 'pointer', color: order.shipping_supplier_id ? 'var(--text-primary)' : 'var(--text-muted)', fontWeight: order.shipping_supplier_id ? 600 : 400 }}>
                                  <option value="">— за мапінгом SKU —</option>
                                  {suppliersList.map(s => (<option key={s.id} value={s.id}>{s.name}</option>))}
                                </select>
                                {order.status === 'shipped' && !order.shipping_supplier_id && (
                                  <div style={{ fontSize: '10px', color: '#B45309', marginTop: '4px', lineHeight: 1.3 }}>⚠ Постачальника не підтверджено — борг віднесено за мапінгом</div>
                                )}
                              </div>
                            )}
                            </div>
                            {/* Власний склад недоступний — під блоками, на всю ширину */}
                            {order.status === 'new' && fulfillmentData[order.id]?.plan?.has_own === false && (
                              <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '6px' }}>
                                ℹ️ Власний склад недоступний — всі товари у постачальника
                              </div>
                            )}
                            </div>
                            </div>
                            {/* Прибуток по постачальниках — усередині згортання Фінанси+Логістика */}
                            <div style={{ marginTop: '12px', display: 'flex', alignItems: 'center', gap: '5px', fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                              <TrendingUp size={12} /> Прибуток по постачальниках
                            </div>
                            {fulfillmentData[order.id] && (() => {
                              const fi = fulfillmentData[order.id];
                              // Per-SKU marketplace commission (Prom/Rozetka) для показу в розбивці по позиціях
                              const commItems = order.channel_code === 'prom' ? order.prom_data?._commission?.items
                                              : order.channel_code === 'rozetka' ? order.rozetka_data?._commission?.items
                                              : undefined;
                              const commBySku = new Map<string, { amt: number; pct: number }>();
                              (commItems ?? []).forEach(c => commBySku.set(c.sku, { amt: c.commission_amt, pct: c.commission_pct }));
                              const hasComm = commBySku.size > 0;
                              const activeReservations = (fi.reservations ?? []).filter(r => r.reservation_status === 'active');
                              return (
                                <div style={{ marginTop: '8px', borderRadius: '10px', overflow: 'hidden', border: '1px solid var(--border)', fontSize: '12px' }}>
                                  {/* Підсумки (виручка/собів/маржа/комісія) — у блоці «Економіка» вище, тут лише
                                      деталізація по поставщику. Показуємо тільки резерв (його немає вгорі). */}
                                  {activeReservations.length > 0 && (
                                    <div style={{ display: 'flex', padding: '7px 12px', borderBottom: '1px solid var(--border)', background: 'var(--bg-soft)' }}>
                                      <span style={{ background: '#DCFCE7', color: '#15803D', padding: '1px 8px', borderRadius: '20px', fontWeight: 700 }}>
                                        ✓ Зарезервовано: {activeReservations.length} поз.
                                      </span>
                                    </div>
                                  )}

                                  {/* Per-supplier breakdown. При маркетплейс-комісії показуємо ЧИСТУ маржу
                                      (маржа − комісія), щоб математика сходилась із блоком «Економіка». */}
                                  {fi.by_supplier.map((group, gi) => {
                                    const groupComm = group.items.reduce((s, it) => s + (commBySku.get(it.sku)?.amt ?? 0), 0);
                                    const groupNet = group.total_margin - groupComm;
                                    return (
                                    <div key={gi} style={{ borderBottom: gi < fi.by_supplier.length - 1 ? '1px solid var(--border-light)' : 'none' }}>
                                      <div style={{ padding: '7px 12px', background: 'var(--bg-soft)', fontWeight: 700, color: 'var(--text-primary)', fontSize: '11px', display: 'flex', justifyContent: 'space-between', gap: '8px' }}>
                                        <span>📦 {group.supplier_name ?? 'Невідомий поставщик'}</span>
                                        <span style={{ color: groupNet >= 0 ? '#15803D' : '#DC2626' }}>
                                          {groupNet >= 0 ? '+' : ''}{groupNet.toFixed(0)} грн{hasComm ? ' чистими' : ''}
                                        </span>
                                      </div>
                                      {group.items.map((item, ii) => {
                                        const c = commBySku.get(item.sku);
                                        const net = item.margin - (c?.amt ?? 0);
                                        return (
                                          <div key={ii} style={{ display: 'grid', gridTemplateColumns: hasComm ? 'auto 1fr auto auto auto' : 'auto 1fr auto auto auto', gap: '8px', padding: '6px 12px', alignItems: 'center', borderTop: '1px solid var(--border-light)', fontSize: '12px' }}>
                                            <span style={{ color: 'var(--text-muted)', fontFamily: 'monospace', fontSize: '11px' }}>{item.supplier_sku ?? item.sku}</span>
                                            <span style={{ color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.name}</span>
                                            <span style={{ color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>{item.qty} шт</span>
                                            <span style={{ color: 'var(--text-secondary)', whiteSpace: 'nowrap', fontSize: '11px' }}
                                              title={hasComm && c ? `Валовий прибуток ${item.margin.toFixed(0)} − комісія ${c.amt.toFixed(0)}${c.pct ? ` (${c.pct}%)` : ''}` : 'Собівартість → продаж'}>
                                              {item.cost_price.toFixed(0)}→{item.sale_price.toFixed(0)}{hasComm && c ? ` −${c.amt.toFixed(0)}к` : ''}
                                            </span>
                                            <span style={{ whiteSpace: 'nowrap', fontWeight: 700, color: net >= 0 ? '#15803D' : '#DC2626' }}>
                                              {net >= 0 ? '+' : ''}{net.toFixed(0)} грн
                                            </span>
                                          </div>
                                        );
                                      })}
                                    </div>
                                    );
                                  })}
                                </div>
                              );
                            })()}
                            </>)}

                          </div>
                        )}
                      </div>
                    </div>

                    {/* Col 2: Contact + Delivery + payment + callback + TTN */}
                    <div className="oc-info-wrap" style={{ order: -1, position: 'relative' }}>
                    <div className="oc-info-cards"
                      onScroll={e => {
                        const el = e.currentTarget;
                        const atStart = el.scrollLeft <= 4;
                        const atEnd = el.scrollLeft + el.clientWidth >= el.scrollWidth - 4;
                        const s = atEnd ? 'end' : atStart ? 'start' : 'mid';
                        setCardSwipe(p => p[order.id] === s ? p : { ...p, [order.id]: s });
                      }}
                      style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', alignItems: 'stretch' }}>
                    {/* Клієнт card */}
                    <div className="order-col-card" style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                      <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Клієнт</span>
                      {/* Contact info */}
                      <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
                        <div style={{ width: '44px', height: '44px', borderRadius: '999px', flexShrink: 0, background: '#EEF2FF', color: 'var(--brand-blue)', fontSize: '15px', fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          {order.contact.trim().split(/\s+/).slice(0, 2).map(w => w[0] ?? '').join('').toUpperCase() || '—'}
                        </div>
                        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        {order.company && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '13px', color: 'var(--text-primary)', fontWeight: 600 }}>
                            <Building2 size={12} color="#64748B" />{order.company}
                          </div>
                        )}
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '15px', fontWeight: 700, color: 'var(--text-primary)' }}>
                          {order.contact}
                          {order.customer_id && (
                            <a href={`/admin/partners?open=${order.customer_id}`} target="_blank" rel="noopener noreferrer"
                              title="Відкрити картку контрагента"
                              style={{ display: 'inline-flex', alignItems: 'center', gap: '3px', fontSize: '11px', fontWeight: 700, color: 'var(--brand-blue)', textDecoration: 'none', background: '#EAF1F8', border: '1px solid #D6E3F0', borderRadius: '5px', padding: '1px 6px' }}>
                              Картка ↗
                            </a>
                          )}
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                          <a href={`tel:${order.phone}`} style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '13.5px', color: 'var(--brand-blue)', fontWeight: 700, textDecoration: 'none', fontVariantNumeric: 'tabular-nums' }}>
                            <Phone size={13} />{formatPhone(order.phone)}
                          </a>
                          <button
                            onClick={() => { navigator.clipboard.writeText(order.phone); showToast('Телефон скопійовано'); }}
                            title="Копіювати номер"
                            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '0 2px', color: 'var(--text-muted)', lineHeight: 1, display: 'inline-flex' }}>
                            <Copy size={13} />
                          </button>
                          {!isDropship && (noCallback ? (
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '3px 8px', borderRadius: '6px', fontSize: '11px', fontWeight: 600, background: '#DCFCE7', color: '#15803D', border: '1px solid #86EFAC', whiteSpace: 'nowrap' }}>
                              <Check size={11} /> Без дзвінка
                            </span>
                          ) : (
                            <button onClick={() => toggleFlag(order.id, 'callback_done', !callbackDone)}
                              title={callbackDone ? 'Натисніть, щоб зняти позначку «зателефонували»' : 'Натисніть, коли зателефонували клієнту'}
                              style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '3px 8px', borderRadius: '6px', fontSize: '11px', fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap', background: callbackDone ? '#DCFCE7' : '#FEF3C7', color: callbackDone ? '#15803D' : '#B45309', border: `1px solid ${callbackDone ? '#86EFAC' : '#FCD34D'}` }}>
                              {callbackDone ? <><Check size={11} /> Зателефонували</> : <><Phone size={11} /> Потрібен дзвінок</>}
                            </button>
                          ))}
                        </div>
                        <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{order.email}</div>
                        </div>
                      </div>
                      {/* Статистика клієнта + швидкі прапорці */}
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        {custStats[order.id] && custStats[order.id].count > 1 && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: 'var(--text-secondary)' }}>
                            <ShoppingCart size={13} color="#64748B" />
                            <span>{custStats[order.id].count} замовлень · <strong style={{ color: 'var(--text-primary)' }}>{custStats[order.id].total.toLocaleString('uk-UA', { maximumFractionDigits: 0 })} ₴</strong></span>
                          </div>
                        )}
                        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                          {([
                            { key: 'urgent',  label: 'Терміново',  onBg: '#FEE2E2', onC: '#B91C1C', onB: '#FCA5A5', icon: '⚡' },
                            { key: 'problem', label: 'Проблемний', onBg: '#FEF3C7', onC: '#B45309', onB: '#FCD34D', icon: '⚠' },
                          ] as const).map(f => {
                            const active = (order.flags ?? []).includes(f.key);
                            return (
                              <button key={f.key} onClick={() => toggleOrderFlag(order.id, f.key)}
                                title={active ? `Зняти прапорець «${f.label}»` : `Позначити «${f.label}»`}
                                style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '3px 9px', borderRadius: '999px', fontSize: '11px', fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap',
                                  background: active ? f.onBg : 'var(--bg-soft)', color: active ? f.onC : 'var(--text-muted)', border: `1px solid ${active ? f.onB : 'var(--border)'}` }}>
                                {f.icon} {f.label}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                      {/* Оплата — прижато до нижньої межі, однакова висота з блоком ТТН → розділювачі збігаються */}
                      <div style={{ marginTop: 'auto', minHeight: '118px', paddingTop: '12px', borderTop: '1px solid var(--border-light)', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                      <div style={{ fontSize: '10px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Оплата</div>
                      {editPaymentTypeId === order.id ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', padding: '10px', background: 'var(--bg-soft)', borderRadius: '8px', border: '1px solid var(--border)' }}>
                          <select
                            value={editPaymentTypeValue}
                            onChange={e => setEditPaymentTypeValue(e.target.value)}
                            style={{ height: '30px', borderRadius: '6px', border: '1px solid var(--border)', fontSize: '12px', padding: '0 6px' }}
                          >
                            <option value="cash">Готівка</option>
                            <option value="invoice">Безготівковий (рахунок)</option>
                            <option value="deferred">Відстрочка</option>
                          </select>
                          <div style={{ display: 'flex', gap: '6px' }}>
                            <button
                              onClick={() => savePaymentType(order.id, editPaymentTypeValue)}
                              disabled={savingPaymentType}
                              style={{ height: '28px', padding: '0 12px', borderRadius: '6px', border: 'none', background: '#1E3A5F', color: '#fff', fontSize: '12px', fontWeight: 700, cursor: 'pointer' }}
                            >
                              {savingPaymentType ? '...' : 'Зберегти'}
                            </button>
                            <button
                              onClick={() => setEditPaymentTypeId(null)}
                              style={{ height: '28px', padding: '0 10px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--bg-card)', fontSize: '12px', cursor: 'pointer', color: 'var(--text-secondary)' }}
                            >
                              Скасувати
                            </button>
                          </div>
                        </div>
                      ) : isCod ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '5px 10px', borderRadius: '8px', fontSize: '12px', fontWeight: 600, background: '#DCFCE7', color: '#15803D', border: '1px solid #86EFAC' }}>
                            <CreditCard size={12} /> Накладений платіж
                          </div>
                          <button onClick={() => { setEditPaymentTypeId(order.id); setEditPaymentTypeValue(['cash','invoice','deferred'].includes(order.payment_type) ? order.payment_type : 'cash'); }} title="Змінити спосіб оплати" style={{ flexShrink: 0, background: 'none', border: 'none', cursor: 'pointer', padding: '0 2px', color: 'var(--text-muted)', lineHeight: 1 }}>
                            <Pencil size={11} />
                          </button>
                        </div>
                      ) : order.payment_type === 'card' ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '5px 10px', borderRadius: '8px', fontSize: '12px', fontWeight: 600, background: order.status === 'confirmed' ? '#DCFCE7' : '#EFF6FF', color: order.status === 'confirmed' ? '#15803D' : 'var(--brand-blue)', border: `1px solid ${order.status === 'confirmed' ? '#86EFAC' : '#BFDBFE'}` }}>
                            <CreditCard size={12} />{order.status === 'confirmed' ? 'Оплата карткою — підтверджено' : 'Картка онлайн'}
                          </div>
                          <button onClick={() => { setEditPaymentTypeId(order.id); setEditPaymentTypeValue(['cash','invoice','deferred'].includes(order.payment_type) ? order.payment_type : 'cash'); }} title="Змінити спосіб оплати" style={{ flexShrink: 0, background: 'none', border: 'none', cursor: 'pointer', padding: '0 2px', color: 'var(--text-muted)', lineHeight: 1 }}>
                            <Pencil size={11} />
                          </button>
                        </div>
                      ) : (() => {
                        const amountPaid  = Number(order.amount_paid ?? 0);
                        const total       = Number(order.total_price);
                        const remaining   = Math.max(0, total - amountPaid);
                        const isPartial   = amountPaid > 0 && !paymentConfirmed;
                        const payments    = orderPayments[order.id] ?? [];
                        const isFormOpen  = payFormOpen[order.id] ?? false;
                        const isSaving    = payFormSaving[order.id] ?? false;
                        const modeLabel: Record<string, string> = { cash: 'Готівка', transfer: 'Безготівк.', card: 'Карта', acquiring: 'Еквайринг' };
                        const defaultMode = order.payment_type === 'cash' ? 'cash' : 'transfer';
                        const defaultRemaining = remaining > 0 ? remaining.toFixed(2) : total.toFixed(2);

                        return (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                            {/* Badge */}
                            <div style={{ display: 'flex', alignItems: 'center', gap: '5px', flexWrap: 'wrap' }}>
                              <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '5px 10px', borderRadius: '8px', fontSize: '12px', fontWeight: 600,
                                background: paymentConfirmed ? '#DCFCE7' : isPartial ? '#FFF7ED' : order.payment_type === 'cash' ? '#F0FDF4' : '#FEF3C7',
                                color:      paymentConfirmed ? '#15803D'  : isPartial ? '#C2410C' : order.payment_type === 'cash' ? '#166534' : '#B45309',
                                border: `1px solid ${paymentConfirmed ? '#86EFAC' : isPartial ? '#FDBA74' : order.payment_type === 'cash' ? '#86EFAC' : '#FCD34D'}`,
                              }}>
                                <CreditCard size={12} />
                                {paymentConfirmed
                                  ? `✓ Оплачено ${amountPaid.toLocaleString('uk-UA', { minimumFractionDigits: 2 })} ₴`
                                  : isPartial
                                    ? `${amountPaid.toLocaleString('uk-UA', { minimumFractionDigits: 2 })} / ${total.toLocaleString('uk-UA', { minimumFractionDigits: 2 })} ₴`
                                    : order.payment_type === 'cash' ? 'Оплата готівкою'
                                    : order.payment_type === 'invoice' ? 'Безготівковий'
                                    : order.payment_type === 'deferred'
                                      ? `Відстрочка${order.payment_due_date ? ` · до ${new Date(order.payment_due_date).toLocaleDateString('uk-UA', { day: '2-digit', month: '2-digit' })}` : ''}`
                                    : 'Очікуємо оплату'}
                              </div>
                              <button onClick={() => { setEditPaymentTypeId(order.id); setEditPaymentTypeValue(['cash','invoice','deferred'].includes(order.payment_type) ? order.payment_type : 'cash'); }} title="Змінити спосіб оплати" style={{ flexShrink: 0, background: 'none', border: 'none', cursor: 'pointer', padding: '0 2px', color: 'var(--text-muted)', lineHeight: 1 }}>
                                <Pencil size={11} />
                              </button>
                              {!paymentConfirmed && !isFormOpen && (
                                <button
                                  onClick={() => {
                                    setPayFormOpen(prev  => ({ ...prev,  [order.id]: true }));
                                    setPayFormMode(prev  => ({ ...prev,  [order.id]: defaultMode }));
                                    setPayFormAmount(prev => ({ ...prev, [order.id]: defaultRemaining }));
                                    setPayFormDate(prev  => ({ ...prev,  [order.id]: new Date().toISOString().slice(0, 10) }));
                                  }}
                                  style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', padding: '4px 10px', borderRadius: '6px', border: '1.5px solid #D6E3F0', background: '#EAF1F8', color: 'var(--brand-blue)', fontSize: '11px', fontWeight: 700, cursor: 'pointer' }}
                                >
                                  <Plus size={11} /> Додати оплату
                                </button>
                              )}
                            </div>

                            {/* Залишок */}
                            {isPartial && (
                              <div style={{ fontSize: '11px', color: '#9A3412' }}>
                                Залишок: {remaining.toLocaleString('uk-UA', { minimumFractionDigits: 2 })} ₴
                              </div>
                            )}

                            {/* Форма додавання оплати */}

                            {isFormOpen && (
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', padding: '10px', borderRadius: '8px', border: '1.5px solid #BFDBFE', background: '#F0F9FF' }}>
                                <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                                  <input
                                    type="number" min="0.01" step="0.01"
                                    placeholder="Сума"
                                    value={payFormAmount[order.id] ?? ''}
                                    onChange={e => setPayFormAmount(prev => ({ ...prev, [order.id]: e.target.value }))}
                                    style={{ width: '90px', padding: '5px 8px', borderRadius: '6px', border: '1px solid #CBD5E1', fontSize: '12px' }}
                                  />
                                  <select
                                    value={payFormMode[order.id] ?? defaultMode}
                                    onChange={e => setPayFormMode(prev => ({ ...prev, [order.id]: e.target.value }))}
                                    style={{ padding: '5px 8px', borderRadius: '6px', border: '1px solid #CBD5E1', fontSize: '12px', cursor: 'pointer' }}
                                  >
                                    <option value="cash">Готівка</option>
                                    <option value="transfer">Безготівк.</option>
                                    <option value="card">Карта</option>
                                    <option value="acquiring">Еквайринг</option>
                                  </select>
                                  <input
                                    type="date"
                                    value={payFormDate[order.id] ?? new Date().toISOString().slice(0, 10)}
                                    onChange={e => setPayFormDate(prev => ({ ...prev, [order.id]: e.target.value }))}
                                    style={{ padding: '5px 8px', borderRadius: '6px', border: '1px solid #CBD5E1', fontSize: '12px' }}
                                  />
                                </div>
                                <input
                                  type="text" placeholder="Примітка (необов'язково)"
                                  value={payFormNote[order.id] ?? ''}
                                  onChange={e => setPayFormNote(prev => ({ ...prev, [order.id]: e.target.value }))}
                                  style={{ padding: '5px 8px', borderRadius: '6px', border: '1px solid #CBD5E1', fontSize: '12px' }}
                                />
                                <div style={{ display: 'flex', gap: '6px' }}>
                                  <button
                                    onClick={() => addPayment(order)}
                                    disabled={isSaving}
                                    style={{ padding: '5px 14px', borderRadius: '6px', border: 'none', background: '#1E3A5F', color: '#fff', fontSize: '12px', fontWeight: 700, cursor: isSaving ? 'not-allowed' : 'pointer', opacity: isSaving ? 0.6 : 1 }}
                                  >
                                    {isSaving ? 'Збереження...' : 'Зберегти'}
                                  </button>
                                  <button
                                    onClick={() => setPayFormOpen(prev => ({ ...prev, [order.id]: false }))}
                                    style={{ padding: '5px 10px', borderRadius: '6px', border: '1px solid #CBD5E1', background: 'transparent', fontSize: '12px', cursor: 'pointer', color: 'var(--text-secondary)' }}
                                  >
                                    Скасувати
                                  </button>
                                </div>
                              </div>
                            )}

                            {/* Історія платежів */}
                            {payments.length > 0 && (
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', marginTop: '2px' }}>
                                {payments.map(p => (
                                  <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', color: p.reversed ? 'var(--text-muted)' : 'var(--text-secondary)', textDecoration: p.reversed ? 'line-through' : 'none' }}>
                                    <span style={{ flexShrink: 0, whiteSpace: 'nowrap' }}>{new Date(p.payment_date).toLocaleDateString('uk-UA', { day: '2-digit', month: '2-digit' })}</span>
                                    <span style={{ flexShrink: 0, whiteSpace: 'nowrap', fontWeight: 700, color: p.reversed ? 'var(--text-muted)' : '#15803D' }}>
                                      {Number(p.amount).toLocaleString('uk-UA', { minimumFractionDigits: 2 })} ₴
                                    </span>
                                    <span style={{ flexShrink: 0, whiteSpace: 'nowrap' }}>{modeLabel[p.payment_mode] ?? p.payment_mode}</span>
                                    {p.note && <span title={p.note} style={{ flex: '1 1 auto', minWidth: 0, whiteSpace: 'normal', wordBreak: 'break-word', color: 'var(--text-muted)' }}>· {p.note}</span>}
                                    {!p.reversed && isAdmin && (
                                      <button
                                        onClick={() => reversePayment(order, p.id)}
                                        disabled={payRemoving === p.id}
                                        title="Скасувати платіж"
                                        style={{ marginLeft: 'auto', display: 'flex', padding: '1px 4px', borderRadius: '4px', border: '1px solid #FCA5A5', background: '#FEF2F2', color: '#DC2626', cursor: 'pointer', fontSize: '10px' }}
                                      >
                                        <X size={9} />
                                      </button>
                                    )}
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        );
                      })()}
                      </div>
                    </div>
                    {/* Доставка / ТТН card */}
                    <div className="order-col-card" style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                        <div style={{ fontSize: '10px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Доставка</div>
                        {editDeliveryId !== order.id && (
                          <button onClick={() => openEditDelivery(order)} title="Змінити доставку" style={{ flexShrink: 0, background: 'none', border: 'none', cursor: 'pointer', padding: '0 2px', color: 'var(--text-muted)', lineHeight: 1, display: 'inline-flex' }}>
                            <Pencil size={12} />
                          </button>
                        )}
                      </div>
                      {editDeliveryId === order.id ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', padding: '10px', background: 'var(--bg-soft)', borderRadius: '8px', border: '1px solid var(--border)' }}>
                          <select
                            value={editDeliveryForm.type}
                            onChange={e => setEditDeliveryForm(p => ({ ...p, type: e.target.value, cityName: '', address: '' }))}
                            style={{ height: '30px', borderRadius: '6px', border: '1px solid var(--border)', fontSize: '12px', padding: '0 6px' }}>
                            <option value="nova">Нова Пошта</option>
                            <option value="pickup">Самовивіз</option>
                            <option value="kharkiv">Харків і область</option>
                          </select>
                          {editDeliveryForm.type === 'nova' && (
                            <>
                              <select
                                value={editDeliveryForm.subtype}
                                onChange={e => setEditDeliveryForm(p => ({ ...p, subtype: e.target.value }))}
                                style={{ height: '30px', borderRadius: '6px', border: '1px solid var(--border)', fontSize: '12px', padding: '0 6px' }}>
                                <option value="warehouse">Відділення</option>
                                <option value="courier">Кур'єр</option>
                              </select>
                              <input
                                value={editDeliveryForm.cityName}
                                onChange={e => setEditDeliveryForm(p => ({ ...p, cityName: e.target.value }))}
                                placeholder="Місто"
                                style={{ height: '30px', borderRadius: '6px', border: '1px solid var(--border)', fontSize: '12px', padding: '0 8px' }} />
                              <input
                                value={editDeliveryForm.address}
                                onChange={e => setEditDeliveryForm(p => ({ ...p, address: e.target.value }))}
                                placeholder="Відділення або адреса"
                                style={{ height: '30px', borderRadius: '6px', border: '1px solid var(--border)', fontSize: '12px', padding: '0 8px' }} />
                            </>
                          )}
                          {editDeliveryForm.type === 'kharkiv' && (
                            <input
                              value={editDeliveryForm.address}
                              onChange={e => setEditDeliveryForm(p => ({ ...p, address: e.target.value }))}
                              placeholder="Адреса доставки"
                              style={{ height: '30px', borderRadius: '6px', border: '1px solid var(--border)', fontSize: '12px', padding: '0 8px' }} />
                          )}
                          <div style={{ display: 'flex', gap: '6px' }}>
                            <button
                              onClick={() => saveDelivery(order.id)}
                              disabled={savingDelivery}
                              style={{ height: '28px', padding: '0 12px', borderRadius: '6px', border: 'none', background: '#1E3A5F', color: '#fff', fontSize: '12px', fontWeight: 700, cursor: 'pointer' }}>
                              {savingDelivery ? '...' : 'Зберегти'}
                            </button>
                            <button
                              onClick={() => setEditDeliveryId(null)}
                              style={{ height: '28px', padding: '0 10px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--bg-card)', fontSize: '12px', cursor: 'pointer', color: 'var(--text-secondary)' }}>
                              Скасувати
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '6px', flexWrap: 'wrap', fontSize: '13px', color: 'var(--text-primary)' }}>
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)', whiteSpace: 'nowrap', flexShrink: 0 }}>
                            <Truck size={13} color="#64748B" /> {delivery}
                          </span>
                          <span style={{ color: 'var(--text-secondary)', marginTop: '1px' }}>{subtype.replace(/^ — /, '')}{order.delivery_city_name && <strong style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{subtype ? ' · ' : ''}{order.delivery_city_name}</strong>}{order.delivery_address && ` · ${order.delivery_address}`}</span>
                        </div>
                      )}

                      {/* ТТН Нової Пошти — прижато до нижньої межі картки, однакова висота з «Доставкою» */}
                      <div style={{ marginTop: 'auto', minHeight: '118px', paddingTop: '12px', borderTop: '1px solid var(--border-light)', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                      <div style={{ fontSize: '10px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>ТТН Нової Пошти</div>
                      {(order.delivery_type === 'nova' || order.delivery_type === 'nova_poshta') ? (
                        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                          <div style={{ position: 'relative', flex: '1 1 140px', minWidth: 0 }}>
                            <Hash size={12} color="#94A3B8" style={{ position: 'absolute', left: '8px', top: '50%', transform: 'translateY(-50%)' }} />
                            <input type="text" value={ttnValues[order.id] ?? ''} onChange={e => setTtnValues(prev => ({ ...prev, [order.id]: e.target.value }))}
                              placeholder="59000000000000"
                              style={{ width: '100%', height: '32px', paddingLeft: '26px', paddingRight: '8px', border: '1px solid var(--border)', borderRadius: '7px', fontSize: '12px', outline: 'none', boxSizing: 'border-box' }} />
                          </div>
                          <button onClick={() => saveTTN(order.id)} disabled={ttnSaving === order.id || !!order.tracking_number}
                            title="Зберегти ТТН" className="oc-ttn-save"
                            style={{ height: '32px', padding: '0 12px', borderRadius: '7px', background: '#1E3A5F', color: '#fff', border: 'none', fontSize: '12px', fontWeight: 600, cursor: (ttnSaving === order.id || !!order.tracking_number) ? 'default' : 'pointer', opacity: (ttnSaving === order.id || !!order.tracking_number) ? 0.4 : 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '5px', flexShrink: 0 }}>
                            {ttnSaving === order.id ? '...' : <><Save size={14} className="oc-only-m" /><span className="oc-hide-m">Зберегти</span></>}
                          </button>
                          {(() => {
                            const hasTtn = !!order.tracking_number;
                            return (
                              <button
                                onClick={() => !hasTtn && setTtnModalOrder(order)}
                                disabled={hasTtn}
                                title={hasTtn ? 'ТТН вже створена' : 'Створити ТТН через API Нової Пошти'}
                                style={{ height: '32px', width: '32px', borderRadius: '7px', flexShrink: 0,
                                  background: hasTtn ? 'var(--border-light)' : 'var(--brand-blue-light)',
                                  color: hasTtn ? 'var(--text-muted)' : 'var(--brand-blue)',
                                  border: `1.5px solid ${hasTtn ? 'var(--border)' : '#C7D7F5'}`,
                                  cursor: hasTtn ? 'default' : 'pointer',
                                  display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                <Truck size={14} />
                              </button>
                            );
                          })()}
                          {order.tracking_number && (() => {
                            const inReg = registryAdded.has(order.tracking_number);
                            const isAddingReg = registryAdding === order.id;
                            return (
                              <button
                                onClick={() => !inReg && addToRegistry(order.id, order.tracking_number!)}
                                disabled={inReg || isAddingReg}
                                title={inReg ? 'Вже в реєстрі НП' : 'Додати в реєстр НП'}
                                style={{ height: '32px', width: '32px', borderRadius: '7px', flexShrink: 0,
                                  background: inReg ? '#DCFCE7' : '#F0FDF4', color: '#15803D',
                                  border: '1.5px solid #86EFAC', cursor: inReg ? 'default' : 'pointer',
                                  display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                {isAddingReg ? '…' : inReg ? <Check size={14} /> : <ClipboardList size={14} />}
                              </button>
                            );
                          })()}
                          {order.tracking_number && (
                            <button onClick={() => deleteTTN(order.id)} disabled={ttnDeleting === order.id}
                              title="Видалити ТТН з бази та з НП"
                              style={{ height: '32px', width: '32px', borderRadius: '7px', flexShrink: 0, background: '#FEF2F2', color: '#DC2626', border: '1.5px solid #FECACA', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: ttnDeleting === order.id ? 0.5 : 1 }}>
                              {ttnDeleting === order.id ? '…' : <Trash2 size={14} />}
                            </button>
                          )}
                        </div>
                      ) : order.delivery_type === 'rozetka_delivery' ? (
                        // Накладну для точки видачі виписує сама Rozetka своїм API
                        // (розділ Octopus), номер має вигляд «RMP-…». ТТН Нової Пошти
                        // тут не підходить — точка видачі таку посилку не прийме.
                        <div style={{ fontSize: '12px', lineHeight: 1.5, color: 'var(--text-secondary)', background: '#F0FDF4', border: '1px solid #BBF7D0', borderRadius: '9px', padding: '10px 12px' }}>
                          <div style={{ fontWeight: 700, color: '#15803D' }}>Точка видачі Rozetka</div>
                          {order.tracking_number ? (
                            <div style={{ marginTop: '4px' }}>ТТН: <strong>{order.tracking_number}</strong></div>
                          ) : (
                            <>
                              <div style={{ marginTop: '3px' }}>Адресу отримувача Rozetka візьме із замовлення — потрібні лише габарити.</div>
                              <button onClick={() => setRzTtnModal(order)}
                                style={{ marginTop: '8px', height: '34px', padding: '0 14px', borderRadius: '9px', border: 'none', background: '#15803D', color: '#fff', fontSize: '12.5px', fontWeight: 700, cursor: 'pointer' }}>
                                Створити накладну Rozetka
                              </button>
                            </>
                          )}
                        </div>
                      ) : (
                        <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Доставка не Нова Пошта</div>
                      )}
                      {/* Дві однакові кнопки в один рядок: Надіслати постачальнику + Створити ЗП */}
                      <div style={{ display: 'flex', gap: '8px' }}>
                        {['new', 'confirmed', 'awaiting_stock', 'picking', 'shipped', 'delivered'].includes(order.status)
                          && (['supplier', 'mixed'].includes(order.fulfillment_mode ?? 'supplier') || !!order.supplier_sent_at) && (
                          <button onClick={() => startSupplierSend([order.id])} disabled={supplierQueueLoading}
                            title={order.supplier_sent_at ? `Надіслано ${new Date(order.supplier_sent_at).toLocaleString('uk-UA', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })} · натисніть щоб надіслати ще раз` : 'Надіслати замовлення постачальнику'}
                            style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', height: '40px', padding: '0 10px', boxSizing: 'border-box', fontSize: '12.5px', fontWeight: 600, cursor: supplierQueueLoading ? 'wait' : 'pointer', borderRadius: '9px',
                              border: order.supplier_sent_at ? '1.5px solid #86EFAC' : '1.5px solid #93C5FD',
                              background: order.supplier_sent_at ? '#F0FDF4' : '#EFF6FF',
                              color: order.supplier_sent_at ? '#15803D' : '#1E3A5F',
                              opacity: supplierQueueLoading ? 0.6 : 1 }}>
                            <Mail size={15} style={{ flexShrink: 0 }} />
                            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{order.supplier_sent_at ? 'Надіслано' : 'Постачальнику'}</span>
                          </button>
                        )}
                        <button onClick={() => openSupplierPO(order)} disabled={creatingPo === order.id}
                          title="Створити замовлення постачальнику (ЗП)"
                          style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', height: '40px', padding: '0 10px', boxSizing: 'border-box', fontSize: '12.5px', fontWeight: 600, borderRadius: '9px', border: '1.5px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text-secondary)', cursor: creatingPo === order.id ? 'wait' : 'pointer', opacity: creatingPo === order.id ? 0.6 : 1 }}>
                          <ShoppingCart size={15} style={{ flexShrink: 0 }} />
                          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{creatingPo === order.id ? '...' : 'Створити ЗП'}</span>
                        </button>
                      </div>
                      </div>

                      {(() => {
                        const displayComment = order.comment?.split('\n').filter(line => !line.includes('Не передзвонювати')).join('\n').trim();
                        return displayComment ? (
                          <div>
                            <div style={{ fontSize: '10px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '2px' }}>Коментар</div>
                            <div style={{ fontSize: '12px', color: 'var(--text-secondary)', fontStyle: 'italic' }}>«{displayComment}»</div>
                          </div>
                        ) : null;
                      })()}

                      {/* ТТН і «Надіслати постачальнику» перенесено під таблицю товарів (колонка ТТН) */}

                    </div>
                    {/* /Доставка card + /grid Клієнт|Доставка */}
                    </div>
                    {(cardSwipe[order.id] ?? 'start') !== 'end' && <span className="oc-swipe-hint oc-swipe-right" aria-hidden="true">›</span>}
                    {(cardSwipe[order.id] ?? 'start') !== 'start' && <span className="oc-swipe-hint oc-swipe-left" aria-hidden="true">‹</span>}
                    </div>{/* /oc-info-wrap */}
                    {/* /MAIN column */}
                    </div>

                    {/* Col 3: Status dropdown + context actions */}
                    {(() => {
                      return (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', minWidth: 0 }}>
                        {/* Внутрішні нотатки — окремою карткою зверху, вирівняна з верхом колонки */}
                        <div className="order-col-card" style={{ padding: '16px' }}>
                          <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '8px' }}>Внутрішні нотатки</div>
                          <textarea
                            key={`note-${order.id}-${order.internal_note ?? ''}`}
                            defaultValue={order.internal_note ?? ''}
                            onBlur={e => { const v = e.target.value.trim(); if (v !== (order.internal_note ?? '')) saveInternalNote(order.id, v); }}
                            placeholder="Напр. клієнт думає, чекаємо оплату…"
                            style={{ width: '100%', minHeight: '68px', padding: '8px 10px', border: '1px solid var(--border)', borderRadius: '8px', fontSize: '12.5px', color: 'var(--text-primary)', resize: 'vertical', fontFamily: 'inherit', boxSizing: 'border-box', background: 'var(--bg-card)' }} />
                          {noteSaving === order.id && <div style={{ fontSize: '10.5px', color: 'var(--text-muted)', marginTop: '3px' }}>Збереження…</div>}
                        </div>
                        {/* Дії card */}
                        <div className="order-col-card" style={{ flex: 1, padding: '16px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                          {/* Статус замовлення + ручна зміна винесені у правий верхній кут шапки */}
                          {/* «Відвантажує пост.» перенесено до блоку способу виконання (ліва колонка) */}

                          {/* Context action buttons */}
                          <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '2px' }}>Дії</div>
                          {(() => {
                            // Unified button styles
                            const btn = {
                              display: 'flex' as const, alignItems: 'center' as const, gap: '6px',
                              padding: '7px 10px', borderRadius: '8px', fontSize: '12px', fontWeight: 600,
                              cursor: 'pointer', textDecoration: 'none', border: '1.5px solid #CBD5E1',
                              background: 'var(--bg-card)', color: 'var(--text-primary)', width: '100%',
                              boxSizing: 'border-box' as const, justifyContent: 'flex-start' as const,
                            };
                            const btnPrimary = { ...btn, border: '1.5px solid #93C5FD', background: '#EFF6FF', color: '#1E3A5F' };
                            const btnMuted   = { ...btn, border: '1px solid var(--border-light)', padding: '6px 10px', fontWeight: 500, color: 'var(--text-secondary)' };
                            return (
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginTop: '2px' }}>
                                {/* Primary CTA for new orders — confirm + optional send-to-supplier */}
                                {/* «Підтвердити» → блок способу виконання; «Надіслати постачальнику» → під ТТН */}
                                {(order.status === 'confirmed' || order.status === 'awaiting_stock' || order.status === 'picking') && (() => {
                                  const shippedQty = shippedQtyMap[order.id] ?? {};
                                  const hasRemaining = (order.items as OrderItem[]).some(i => (shippedQty[i.sku] ?? 0) < i.qty);
                                  const docs = saleDocMap[order.id] ?? [];
                                  return (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                      <button
                                        onClick={() => shipOrder(order.id)}
                                        disabled={shipping === order.id || !!loading || !hasRemaining}
                                        style={{ ...btn, background: hasRemaining ? '#DCFCE7' : '#F3F4F6', color: hasRemaining ? '#166534' : '#9CA3AF', border: `1.5px solid ${hasRemaining ? '#86EFAC' : '#E5E7EB'}`, opacity: (shipping === order.id || !!loading) ? 0.6 : 1 }}>
                                        <Truck size={13} /> {shipping === order.id ? 'Створення...' : hasRemaining ? 'Відвантажити' : 'Відвантажено'}
                                      </button>
                                      {order.fulfillment_mode === 'supplier' && !order.tracking_number && hasRemaining && (
                                        <div style={{ fontSize: '10px', color: 'var(--text-muted)', textAlign: 'center' }}>
                                          або авто при створенні ТТН
                                        </div>
                                      )}
                                      {docs.map(doc => (
                                        <a key={doc.id} href={`/vidatkova/${doc.id}`} target="_blank"
                                          style={{ fontSize: '11px', color: '#1E3A5F', fontWeight: 600, textDecoration: 'none', textAlign: 'center', padding: '2px 0' }}>
                                          📄 {doc.number}
                                        </a>
                                      ))}
                                    </div>
                                  );
                                })()}
                                {order.status === 'awaiting_stock' && (() => {
                                  const pos = linkedPOs[order.id] ?? [];
                                  const hasReceipt = pos.some(p => ['received','closed','partially_received'].includes(p.procurement_status ?? ''));
                                  const linkedPO   = pos.find(p => p.id);
                                  const expectedDate = pos
                                    .map(p => p.expected_date)
                                    .filter(Boolean)
                                    .sort()[0];
                                  return (
                                    <>
                                      {expectedDate && (
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '5px 10px', borderRadius: '7px', background: '#FFF7ED', border: '1px solid #FED7AA', fontSize: '12px', color: '#92400E', fontWeight: 600 }}>
                                          📅 Очікується: {new Date(expectedDate).toLocaleDateString('uk-UA', { day: '2-digit', month: 'short', year: 'numeric' })}
                                        </div>
                                      )}
                                      {hasReceipt ? (
                                        <button onClick={() => changeStatus(order.id, 'picking')} disabled={!!loading}
                                          style={{ ...btnPrimary, background: '#0E7490', opacity: loading ? 0.6 : 1 }}>
                                          <Package size={13} /> Товар надійшов — збираємо
                                        </button>
                                      ) : (
                                        <a href={linkedPO ? `/admin/procurement/${linkedPO.id}` : '/admin/procurement'} style={{ ...btnPrimary }}>
                                          <Package size={13} /> Оформити прихід
                                        </a>
                                      )}
                                    </>
                                  );
                                })()}
                                {order.status === 'shipped' && (
                                  <button onClick={() => changeStatus(order.id, 'delivered')} disabled={!!loading}
                                    title="Позначити, що клієнт отримав товар — проведе продаж і комісію, замовлення стане «Доставлено»"
                                    style={{ ...btnPrimary, opacity: loading ? 0.6 : 1 }}>
                                    <MapPin size={13} /> Підтвердити доставку
                                  </button>
                                )}
                                {/* Другорядні інструменти — друк, месенджери, ЗП; відділені від дій зі статусом */}
                                <div style={{ marginTop: '6px', paddingTop: '8px', borderTop: '1px dashed var(--border-light)', fontSize: '10px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                                  Інструменти
                                </div>
                                {isAdmin && ['shipped', 'delivered'].includes(order.status) && (
                                  <button onClick={() => setReturnFor({ id: order.id, number: order.order_number })}
                                    style={{ ...btnMuted, color: '#B45309' }}>
                                    ↩ Повернення
                                  </button>
                                )}
                                <div style={{ display: 'flex', gap: '4px' }}>
                                  <a href={`/invoice/${order.id}`} target="_blank" rel="noopener noreferrer"
                                    style={{ ...btnMuted, flex: 1 }}>
                                    <Printer size={13} /> Друк / Рахунок
                                  </a>
                                  <button onClick={() => setInvoiceCfg(order)} title="Налаштування рахунку — що показувати у рахунку"
                                    style={{ ...btnMuted, width: 'auto', flexShrink: 0, justifyContent: 'center', padding: '6px 11px' }}>
                                    <span style={{ fontSize: '15px', lineHeight: 1 }}>⚙</span>
                                  </button>
                                </div>
                                <InvoiceMessengerButtons
                                  variant="stacked"
                                  phone={order.phone} contact={order.contact}
                                  orderNumber={order.order_number} orderId={order.id}
                                  total={order.total_price} channel={order.channel_code}
                                  promOrderId={order.prom_order_id} rozetkaOrderId={order.rozetka_order_id} />

                                {/* «Створити ЗП» перенесено під ТТН, у рядок із «Надіслати постачальнику» */}

                                {/* Документи замовлення: РН (друкована видаткова) + повернення.
                                    Видимі в будь-якому статусі — РН є кінцевим документом замовлення. */}
                                {(() => {
                                  const rnDocs  = saleDocMap[order.id] ?? [];
                                  const retDocs = initialReturnDocs[order.id] ?? [];
                                  if (!rnDocs.length && !retDocs.length) return null;
                                  return (
                                    <div style={{ marginTop: '4px', display: 'flex', flexDirection: 'column', gap: '3px', borderTop: '1px dashed var(--border)', paddingTop: '6px' }}>
                                      <div style={{ fontSize: '10px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                                        Документи
                                      </div>
                                      {rnDocs.map(doc => (
                                        <a key={doc.id} href={`/vidatkova/${doc.id}`} target="_blank" rel="noopener noreferrer"
                                          title="Видаткова накладна — відкрити та роздрукувати"
                                          style={{ fontSize: '11.5px', color: '#1E3A5F', fontWeight: 700, textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '5px' }}>
                                          <Printer size={11} /> {doc.number}
                                        </a>
                                      ))}
                                      {retDocs.map(doc => (
                                        <a key={doc.id} href={`/admin/accounting/documents/${doc.id}`} target="_blank" rel="noopener noreferrer"
                                          title="Документ повернення від покупця"
                                          style={{ fontSize: '11.5px', color: '#B45309', fontWeight: 700, textDecoration: 'none' }}>
                                          ↩ {doc.number}
                                        </a>
                                      ))}
                                    </div>
                                  );
                                })()}
                              </div>
                            );
                          })()}
                        </div>
                        </div>
                      );
                    })()}

                  </div>

                  {/* ── Журнал подій ── */}
                  {(() => {
                    const STATUS_CFG: Record<string, { icon: string; label: string }> = {
                      new:            { icon: '🛒', label: 'Нове' },
                      confirmed:      { icon: '✅', label: 'Підтверджено' },
                      awaiting_stock: { icon: '⏳', label: 'Очікуємо товар' },
                      picking:        { icon: '📋', label: 'Збирається' },
                      shipped:        { icon: '📦', label: 'Відправлено' },
                      delivered:      { icon: '🏠', label: 'Доставлено' },
                      cancelled:      { icon: '❌', label: 'Скасовано' },
                    };
                    const RANK: Record<string, number> = {
                      new: 0, confirmed: 1, awaiting_stock: 2, picking: 3, shipped: 4, delivered: 5,
                    };

                    // Build event list: always start with "Оформлено", then status_history entries
                    type Ev = { icon: string; label: string; at: string; by?: string; backward?: boolean; href?: string; sub?: string };
                    const evs: Ev[] = [{ icon: '🛒', label: 'Оформлено', at: order.created_at }];

                    const history = order.status_history ?? [];
                    if (history.length > 0) {
                      history.forEach((h, i) => {
                        const cfg = STATUS_CFG[h.status] ?? { icon: '•', label: h.status };
                        const prevStatus = i === 0 ? 'new' : history[i - 1].status;
                        const backward = (RANK[h.status] ?? 99) < (RANK[prevStatus] ?? 0);
                        evs.push({ icon: cfg.icon, label: cfg.label, at: h.at, by: h.by, backward });
                      });
                    } else {
                      // Fallback for very old orders without status_history
                      if (order.confirmed_at) evs.push({ ...STATUS_CFG.confirmed, at: order.confirmed_at });
                      if (order.shipped_at)   evs.push({ ...STATUS_CFG.shipped,   at: order.shipped_at });
                      if (order.delivered_at) evs.push({ ...STATUS_CFG.delivered, at: order.delivered_at });
                      if (order.cancelled_at) evs.push({ ...STATUS_CFG.cancelled, at: order.cancelled_at });
                    }

                    // Insert supplier_sent_at pseudo-event at correct position
                    if (order.supplier_sent_at) {
                      const sentAt = order.supplier_sent_at;
                      const insertAt = evs.findIndex(e => e.at > sentAt);
                      const sentEv: Ev = { icon: '📧', label: 'Постачальнику', at: sentAt };
                      if (insertAt === -1) evs.push(sentEv);
                      else evs.splice(insertAt, 0, sentEv);
                    }

                    // Insert linked PO events
                    for (const po of (linkedPOs[order.id] ?? [])) {
                      const poAt = po.created_at;
                      const poEv: Ev = {
                        icon: '📋',
                        label: po.doc_number,
                        at: poAt,
                        href: `/admin/procurement/${po.id}`,
                        sub: po.supplier?.name ?? undefined,
                      };
                      const insertAt = evs.findIndex(e => e.at > poAt);
                      if (insertAt === -1) evs.push(poEv);
                      else evs.splice(insertAt, 0, poEv);
                    }

                    // Insert receipt events
                    for (const r of (linkedReceipts[order.id] ?? [])) {
                      const rAt = r.created_at;
                      const rEv: Ev = {
                        icon: '📦',
                        label: r.doc_number,
                        at: rAt,
                        href: `/admin/procurement/receipts/${r.id}`,
                        sub: r.total_cost ? `${Number(r.total_cost).toLocaleString('uk-UA', { maximumFractionDigits: 0 })} ₴` : undefined,
                      };
                      const insertAt = evs.findIndex(e => e.at > rAt);
                      if (insertAt === -1) evs.push(rEv);
                      else evs.splice(insertAt, 0, rEv);
                    }

                    if (evs.length <= 1) return null;
                    return (
                      <div style={{ background: 'var(--bg-soft)', padding: '0 14px 14px' }}>
                        <div className="order-col-card" style={{ padding: '16px 18px' }}>
                          <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '18px' }}>
                            Історія замовлення
                          </div>
                          <div style={{ display: 'flex', alignItems: 'flex-start', overflowX: 'auto', paddingBottom: '4px' }}>
                            {evs.map((ev, i) => {
                              const color = ev.backward ? '#B45309' : ev.href ? '#0369A1' : '#1E3A5F';
                              const content = (
                                <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', width: '100%' }}>
                                  {i < evs.length - 1 && (
                                    <div style={{ position: 'absolute', top: '15px', left: '50%', width: '100%', height: '2px', background: ev.backward ? '#FDE68A' : 'var(--border)' }} />
                                  )}
                                  <div style={{ position: 'relative', zIndex: 1, width: '32px', height: '32px', borderRadius: '999px', background: 'var(--bg-card)', border: `2px solid ${color}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '15px' }}>
                                    {ev.icon}
                                  </div>
                                  <div style={{ marginTop: '9px', fontSize: '12px', fontWeight: 700, color: 'var(--text-primary)', lineHeight: 1.25, padding: '0 4px' }}>{ev.label}</div>
                                  <div style={{ marginTop: '3px', fontSize: '10px', color: 'var(--text-muted)', whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>
                                    {new Date(ev.at).toLocaleString('uk-UA', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                                  </div>
                                  {ev.sub && <div style={{ marginTop: '2px', fontSize: '10px', color: 'var(--text-muted)', maxWidth: '96px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ev.sub}</div>}
                                  {ev.by && ev.by !== 'system' && <div style={{ marginTop: '2px', fontSize: '10px', color: 'var(--text-muted)', maxWidth: '96px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ev.by.split('@')[0]}</div>}
                                </div>
                              );
                              const wrapStyle: React.CSSProperties = { flex: '1 0 96px', minWidth: '96px', textDecoration: 'none' };
                              return ev.href
                                ? <a key={i} href={ev.href} style={wrapStyle} onClick={e => e.stopPropagation()}>{content}</a>
                                : <div key={i} style={wrapStyle}>{content}</div>;
                            })}
                          </div>
                        </div>
                      </div>
                    );
                  })()}
                  </>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div style={{ display: 'flex', justifyContent: 'center', gap: '8px', marginTop: '24px' }}>
          {currentPage > 1 && (
            <a href={`?page=${currentPage - 1}`} style={{
              height: '36px', padding: '0 16px', borderRadius: '8px', display: 'inline-flex', alignItems: 'center',
              border: '1.5px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text-secondary)', fontSize: '13px', fontWeight: 600, textDecoration: 'none',
            }}>← Попередня</a>
          )}
          {Array.from({ length: totalPages }, (_, i) => i + 1)
            .filter(p => Math.abs(p - currentPage) <= 2)
            .map(p => (
              <a key={p} href={`?page=${p}`} style={{
                height: '36px', width: '36px', borderRadius: '8px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                border: `1.5px solid ${p === currentPage ? '#162035' : 'var(--border)'}`,
                background: p === currentPage ? 'linear-gradient(135deg, #162035 0%, #1E3A5F 100%)' : 'var(--bg-card)',
                color: p === currentPage ? '#fff' : 'var(--text-secondary)', fontSize: '13px', fontWeight: 600, textDecoration: 'none',
              }}>{p}</a>
            ))}
          {currentPage < totalPages && (
            <a href={`?page=${currentPage + 1}`} style={{
              height: '36px', padding: '0 16px', borderRadius: '8px', display: 'inline-flex', alignItems: 'center',
              border: '1.5px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text-secondary)', fontSize: '13px', fontWeight: 600, textDecoration: 'none',
            }}>Наступна →</a>
          )}
        </div>
      )}

      {/* Supplier send queue modal */}
      {(supplierQueueLoading || supplierQueue !== null) && (() => {
        const item = supplierQueue?.[supplierQueueIdx];
        const total = supplierQueue?.length ?? 0;
        const idx = supplierQueueIdx;
        return (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.55)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}
            onClick={e => { if (!supplierQueueSending && !supplierQueueDone && e.target === e.currentTarget) setSupplierQueue(null); }}>
            <div style={{ background: 'var(--bg-card)', borderRadius: '16px', width: '100%', maxWidth: '460px', boxShadow: '0 24px 80px rgba(0,0,0,0.22)', overflow: 'hidden' }}>

              {/* Header */}
              <div style={{ padding: '18px 22px', borderBottom: '1px solid var(--border-light)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div>
                  <div style={{ fontSize: '15px', fontWeight: 800, color: 'var(--text-primary)' }}>
                    📧 Надіслати постачальнику {total > 1 && <span style={{ fontSize: '13px', fontWeight: 500, color: 'var(--text-muted)' }}>({idx + 1} / {total})</span>}
                  </div>
                  {item && <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>Замовлення #{item.orderNumber}</div>}
                </div>
                {!supplierQueueSending && !supplierQueueDone && (
                  <button onClick={() => setSupplierQueue(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex' }}><X size={18} /></button>
                )}
              </div>

              {supplierQueueLoading ? (
                <div style={{ padding: '32px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '13px' }}>
                  ⏳ Завантаження даних постачальника...
                </div>
              ) : supplierQueueDone ? (
                <div style={{ padding: '28px 22px', display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <span style={{ fontSize: '28px' }}>✅</span>
                  <div>
                    <div style={{ fontSize: '14px', fontWeight: 700, color: '#15803D' }}>Відправлено!</div>
                    <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>
                      #{item?.orderNumber} → {item?.supplierName} ({item?.email || 'email постачальника'})
                    </div>
                  </div>
                </div>
              ) : item ? (
                <div style={{ padding: '18px 22px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
                  {/* Відправник — від кого слати постачальнику */}
                  {senders.length > 1 && (
                    <div>
                      <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '5px', display: 'flex', alignItems: 'center', gap: '5px' }}>
                        <Mail size={11} /> Відправник
                      </div>
                      <select value={chosenSender} onChange={e => setChosenSender(e.target.value)}
                        style={{ width: '100%', height: '38px', padding: '0 10px', border: '1.5px solid var(--border)', borderRadius: '8px', fontSize: '13px', outline: 'none', boxSizing: 'border-box', background: 'var(--bg-soft)', color: 'var(--text-primary)', cursor: 'pointer' }}>
                        {senders.map(s => (
                          <option key={s.email} value={s.email}>{s.name ? `${s.name} <${s.email}>` : s.email}</option>
                        ))}
                      </select>
                    </div>
                  )}

                  {/* Contacts — radio buttons like ProcurementDetail */}
                  {item.contacts.length > 0 && (
                    <div>
                      <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '6px' }}>
                        Контакти постачальника
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                        {item.contacts.map((c, ci) => {
                          const isSelected = item.email === c.email;
                          return (
                            <button key={ci} type="button"
                              onClick={() => setSupplierQueue(prev => prev
                                ? prev.map((it, i) => i === supplierQueueIdx ? { ...it, email: c.email } : it)
                                : prev)}
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

                  {/* Email */}
                  <div>
                    <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '5px', display: 'flex', alignItems: 'center', gap: '5px' }}>
                      <Mail size={11} /> {item.contacts.length > 0 ? 'Або інший email' : 'Email отримувача'}
                    </div>
                    <input
                       
                      autoFocus={item.contacts.length === 0}
                      type="email"
                      value={item.email}
                      onChange={e => setSupplierQueue(prev => prev
                        ? prev.map((it, i) => i === supplierQueueIdx ? { ...it, email: e.target.value } : it)
                        : prev)}
                      placeholder="email@supplier.com"
                      style={{ width: '100%', height: '38px', padding: '0 12px', border: `1.5px solid ${item.email.includes('@') ? 'var(--border)' : '#FCA5A5'}`, borderRadius: '8px', fontSize: '13px', outline: 'none', boxSizing: 'border-box', background: 'var(--bg-soft)', color: 'var(--text-primary)' }}
                    />
                    {item.contacts.length === 0 && !item.email && (
                      <div style={{ fontSize: '11px', color: '#B45309', background: '#FEF3C7', padding: '6px 10px', borderRadius: '6px', marginTop: '4px' }}>
                        ⚠ Контакти не знайдено — додайте їх у картці постачальника або введіть email вручну
                      </div>
                    )}
                  </div>

                  {/* Comment */}
                  <div>
                    <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: '5px' }}>Коментар (необов&apos;язково)</label>
                    <textarea
                      value={item.comment}
                      onChange={e => setSupplierQueue(prev => prev
                        ? prev.map((it, i) => i === supplierQueueIdx ? { ...it, comment: e.target.value } : it)
                        : prev)}
                      placeholder="Термінове замовлення, потрібна доставка до п'ятниці..."
                      style={{ width: '100%', height: '68px', padding: '8px 12px', border: '1.5px solid var(--border)', borderRadius: '8px', fontSize: '13px', outline: 'none', resize: 'none', boxSizing: 'border-box', fontFamily: 'inherit' }}
                    />
                  </div>
                </div>
              ) : null}

              {/* Footer */}
              {!supplierQueueLoading && !supplierQueueDone && item && (
                <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', padding: '12px 22px', borderTop: '1px solid var(--border-light)' }}>
                  <button
                    onClick={advanceSupplierQueue}
                    disabled={supplierQueueSending}
                    style={{ height: '36px', padding: '0 16px', borderRadius: '8px', border: '1.5px solid var(--border)', background: 'var(--bg-card)', fontSize: '13px', fontWeight: 600, cursor: 'pointer', color: 'var(--text-secondary)' }}>
                    Пропустити
                  </button>
                  <button
                    onClick={sendCurrentSupplier}
                    disabled={supplierQueueSending || !item.email.includes('@')}
                    style={{ height: '36px', padding: '0 20px', borderRadius: '8px', border: 'none', background: item.email.includes('@') ? 'linear-gradient(135deg, #162035 0%, #1E3A5F 100%)' : '#94A3B8', color: '#fff', fontSize: '13px', fontWeight: 700, cursor: (!item.email.includes('@') || supplierQueueSending) ? 'default' : 'pointer', opacity: supplierQueueSending ? 0.6 : 1, display: 'flex', alignItems: 'center', gap: '6px' }}>
                    {supplierQueueSending ? '⏳ Відправлення...' : `📧 Відправити${total > 1 ? ` (${idx + 1}/${total})` : ''}`}
                  </button>
                </div>
              )}
            </div>
          </div>
        );
      })()}

      {/* Consolidated bulk supplier send — one email per supplier */}
      {bulkGroups !== null && (() => {
        const sendable = bulkGroups.filter(g => g.supplierId != null && g.email.includes('@'));
        const totalOrders = bulkOrderIds.length;
        return (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.55)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}
            onClick={e => { if (!bulkSending && e.target === e.currentTarget) setBulkGroups(null); }}>
            <div style={{ background: 'var(--bg-card)', borderRadius: '16px', width: '100%', maxWidth: '520px', maxHeight: '90vh', boxShadow: '0 24px 80px rgba(0,0,0,0.22)', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>

              {/* Header */}
              <div style={{ padding: '18px 22px', borderBottom: '1px solid var(--border-light)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div>
                  <div style={{ fontSize: '15px', fontWeight: 800, color: 'var(--text-primary)' }}>
                    📧 Надіслати постачальникам {bulkResults === null && <span style={{ fontSize: '13px', fontWeight: 500, color: 'var(--text-muted)' }}>({bulkGroups.length} {bulkGroups.length === 1 ? 'лист' : 'листів'})</span>}
                  </div>
                  <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>{totalOrders} замовлень · один лист на постачальника</div>
                </div>
                {!bulkSending && (
                  <button onClick={() => setBulkGroups(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex' }}><X size={18} /></button>
                )}
              </div>

              {bulkResults !== null ? (
                <div style={{ padding: '18px 22px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {bulkResults.map((r, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 12px', borderRadius: '9px', background: r.emailed ? '#F0FDF4' : '#FEF2F2', border: `1px solid ${r.emailed ? '#BBF7D0' : '#FECACA'}` }}>
                      <span style={{ fontSize: '18px' }}>{r.emailed ? '✅' : '⚠️'}</span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: '13px', fontWeight: 700, color: r.emailed ? '#15803D' : '#B91C1C' }}>{r.supplierName}</div>
                        <div style={{ fontSize: '11.5px', color: 'var(--text-muted)' }}>
                          {r.emailed ? 'Відправлено' : 'Не відправлено (немає email)'} · {r.orderNumbers.map(n => `#${n}`).join(', ')}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div style={{ padding: '18px 22px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '14px' }}>
                  {/* Sender */}
                  {senders.length > 1 && (
                    <div>
                      <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '5px', display: 'flex', alignItems: 'center', gap: '5px' }}>
                        <Mail size={11} /> Відправник
                      </div>
                      <select value={chosenSender} onChange={e => setChosenSender(e.target.value)}
                        style={{ width: '100%', height: '38px', padding: '0 10px', border: '1.5px solid var(--border)', borderRadius: '8px', fontSize: '13px', outline: 'none', boxSizing: 'border-box', background: 'var(--bg-soft)', color: 'var(--text-primary)', cursor: 'pointer' }}>
                        {senders.map(s => (
                          <option key={s.email} value={s.email}>{s.name ? `${s.name} <${s.email}>` : s.email}</option>
                        ))}
                      </select>
                    </div>
                  )}

                  {/* Supplier groups */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    {bulkGroups.map((g, gi) => {
                      const hasSupplier = g.supplierId != null;
                      const validEmail = g.email.includes('@');
                      return (
                        <div key={gi} style={{ border: `1.5px solid ${hasSupplier && validEmail ? 'var(--border)' : '#FCA5A5'}`, borderRadius: '10px', padding: '12px', background: 'var(--bg-soft)' }}>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', marginBottom: '8px' }}>
                            <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{g.supplierName}</div>
                            <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)', flexShrink: 0 }}>{g.orderNumbers.length} зам. · {g.orderNumbers.map(n => `#${n}`).join(', ')}</div>
                          </div>

                          {g.contacts.length > 0 && (
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px', marginBottom: '8px' }}>
                              {g.contacts.map((c, ci) => {
                                const isSel = g.email === c.email;
                                return (
                                  <button key={ci} type="button"
                                    onClick={() => setBulkGroups(prev => prev ? prev.map((x, i) => i === gi ? { ...x, email: c.email } : x) : prev)}
                                    style={{ display: 'flex', alignItems: 'center', gap: '5px', padding: '5px 9px', borderRadius: '7px', cursor: 'pointer', border: `1.5px solid ${isSel ? '#1E3A5F' : 'var(--border)'}`, background: isSel ? '#EFF4FF' : 'var(--bg-card)', fontSize: '11.5px', fontWeight: 600, color: 'var(--text-primary)' }}>
                                    <div style={{ width: '12px', height: '12px', borderRadius: '50%', flexShrink: 0, border: `2px solid ${isSel ? '#1E3A5F' : '#CBD5E1'}`, background: isSel ? '#1E3A5F' : 'transparent' }} />
                                    {c.name || c.email}
                                  </button>
                                );
                              })}
                            </div>
                          )}

                          <input
                            type="email"
                            value={g.email}
                            onChange={e => setBulkGroups(prev => prev ? prev.map((x, i) => i === gi ? { ...x, email: e.target.value } : x) : prev)}
                            placeholder="email@supplier.com"
                            style={{ width: '100%', height: '34px', padding: '0 10px', border: `1.5px solid ${validEmail ? 'var(--border)' : '#FCA5A5'}`, borderRadius: '7px', fontSize: '12.5px', outline: 'none', boxSizing: 'border-box', background: 'var(--bg-card)', color: 'var(--text-primary)' }}
                          />
                          {!hasSupplier && (
                            <div style={{ fontSize: '11px', color: '#B45309', marginTop: '5px' }}>⚠ Постачальника не визначено — це замовлення пропустимо, надішліть окремо</div>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  {/* Comment */}
                  <div>
                    <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: '5px' }}>Коментар для всіх (необов&apos;язково)</label>
                    <textarea
                      value={bulkComment}
                      onChange={e => setBulkComment(e.target.value)}
                      placeholder="Термінове замовлення, потрібна доставка до п'ятниці..."
                      style={{ width: '100%', height: '60px', padding: '8px 12px', border: '1.5px solid var(--border)', borderRadius: '8px', fontSize: '13px', outline: 'none', resize: 'none', boxSizing: 'border-box', fontFamily: 'inherit' }}
                    />
                  </div>
                </div>
              )}

              {/* Footer */}
              <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', padding: '12px 22px', borderTop: '1px solid var(--border-light)' }}>
                {bulkResults !== null ? (
                  <button onClick={() => setBulkGroups(null)}
                    style={{ height: '36px', padding: '0 20px', borderRadius: '8px', border: 'none', background: 'linear-gradient(135deg, #162035 0%, #1E3A5F 100%)', color: '#fff', fontSize: '13px', fontWeight: 700, cursor: 'pointer' }}>
                    Готово
                  </button>
                ) : (
                  <>
                    <button onClick={() => setBulkGroups(null)} disabled={bulkSending}
                      style={{ height: '36px', padding: '0 16px', borderRadius: '8px', border: '1.5px solid var(--border)', background: 'var(--bg-card)', fontSize: '13px', fontWeight: 600, cursor: 'pointer', color: 'var(--text-secondary)' }}>
                      Скасувати
                    </button>
                    <button onClick={sendBulkSuppliers} disabled={bulkSending || sendable.length === 0}
                      style={{ height: '36px', padding: '0 20px', borderRadius: '8px', border: 'none', background: sendable.length > 0 ? 'linear-gradient(135deg, #162035 0%, #1E3A5F 100%)' : '#94A3B8', color: '#fff', fontSize: '13px', fontWeight: 700, cursor: (bulkSending || sendable.length === 0) ? 'default' : 'pointer', opacity: bulkSending ? 0.6 : 1, display: 'flex', alignItems: 'center', gap: '6px' }}>
                      {bulkSending ? '⏳ Відправлення...' : `📧 Відправити всі (${sendable.length})`}
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>
        );
      })()}

      {returnFor && (
        <ReturnOrderModal
          orderId={returnFor.id}
          orderNumber={returnFor.number}
          onClose={() => setReturnFor(null)}
          onDone={() => router.refresh()}
        />
      )}

      {invoiceCfg && (
        <InvoiceOptionsModal
          order={{ id: invoiceCfg.id, invoice_as_company: invoiceCfg.invoice_as_company, invoice_options: invoiceCfg.invoice_options, customer_id: invoiceCfg.customer_id }}
          onClose={() => setInvoiceCfg(null)}
          onSaved={(v) => setOrders(prev => prev.map(o => o.id === invoiceCfg.id ? { ...o, ...v } : o))}
        />
      )}

      {ttnModalOrder && (
        <CreateTTNModal
          order={{
            id: ttnModalOrder.id,
            contact: ttnModalOrder.contact,
            phone: ttnModalOrder.phone,
            total_price: ttnModalOrder.total_price,
            payment_type: ttnModalOrder.payment_type,
            total_qty: ttnModalOrder.items.reduce((s, i) => s + i.qty, 0),
            items: ttnModalOrder.items.map(i => ({ sku: i.sku, qty: i.qty, name: i.name })),
            delivery_city_ref: ttnModalOrder.delivery_city_ref,
            delivery_city_name: ttnModalOrder.delivery_city_name,
            delivery_warehouse_ref: ttnModalOrder.delivery_warehouse_ref,
            delivery_subtype: ttnModalOrder.delivery_subtype,
            delivery_address: ttnModalOrder.delivery_address,
          }}
          onClose={() => setTtnModalOrder(null)}
          onCreated={async (ttn) => {
            const orderId = ttnModalOrder.id;
            setTtnValues(prev => ({ ...prev, [orderId]: ttn }));
            setOrders(prev => prev.map(o => o.id === orderId ? { ...o, tracking_number: ttn } : o));
            setTtnModalOrder(null);
            await finishTtnFlow([orderId]);
          }}
        />
      )}

      {rzTtnModal && (
        <RozetkaDeliveryTtnModal
          order={{ id: rzTtnModal.id, order_number: rzTtnModal.order_number, items: rzTtnModal.items.map(i => ({ sku: i.sku, qty: i.qty, name: i.name })) }}
          onClose={() => setRzTtnModal(null)}
          onCreated={ttn => {
            const orderId = rzTtnModal.id;
            setOrders(prev => prev.map(o => o.id === orderId ? { ...o, tracking_number: ttn } : o));
            setTtnValues(prev => ({ ...prev, [orderId]: ttn }));
            setRzTtnModal(null);
            showToast(`Накладна Rozetka створена: ${ttn}`, 'success', 5000);
            // Далі — той самий хвіст, що й після накладної НП: у режимі
            // «постачальник» замовлення відвантажується саме.
            void finishTtnFlow([orderId]);
          }}
        />
      )}

      {mergeModal && (
        <CreateTTNModal
          order={mergeModal}
          onClose={() => setMergeModal(null)}
          onCreated={ttn => {
            const ids = mergeModal.mergedIds ?? [mergeModal.id];
            setOrders(prev => prev.map(o =>
              ids.includes(o.id) ? { ...o, tracking_number: ttn } : o
            ));
            ids.forEach(id => setTtnValues(prev => ({ ...prev, [id]: ttn })));
            setSelectedIds(new Set());
            setMergeModal(null);
            void finishTtnFlow(ids);
          }}
        />
      )}

      {/* ── Ship modal (partial / full shipment) ──────────────────────────── */}
      {/* Вибір причини скасування для Rozetka: без причини кабінет скасування не приймає
          (статус 13 «Скасовано адміністратором» продавцю через API недоступний) */}
      {rozCancelFor && (() => {
        const REASONS = [
          { id: 16, label: 'Немає в наявності / брак' },
          { id: 18, label: 'Не вдалося зв\'язатися' },
          { id: 17, label: 'Не влаштовують умови оплати' },
          { id: 24, label: 'Не влаштовує доставка' },
          { id: 20, label: 'Товар не підходить за характеристиками' },
          { id: 11, label: 'Не прийшов за замовленням' },
          { id: 12, label: 'Відмова при отриманні' },
          { id: 25, label: 'Тестове замовлення' },
        ];
        const ord = orders.find(o => o.id === rozCancelFor);
        return (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 10000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}>
            <div className="adm-modal-box" style={{ background: '#fff', borderRadius: '16px', padding: '24px', width: '420px', maxWidth: '96vw', boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}>
              <div style={{ fontWeight: 800, fontSize: '16px', marginBottom: '4px', color: '#DC2626' }}>Скасування замовлення Rozetka</div>
              <div style={{ fontSize: '12.5px', color: '#6B7280', marginBottom: '16px', lineHeight: 1.5 }}>
                #{ord?.order_number} — Rozetka вимагає вказати причину. Її побачить покупець, і вона піде в статистику кабінету.
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '18px' }}>
                {REASONS.map(r => (
                  <button key={r.id}
                    onClick={() => { const id = rozCancelFor; setRozCancelFor(null); changeStatus(id, 'cancelled', r.id); }}
                    style={{ height: '38px', padding: '0 14px', textAlign: 'left', borderRadius: '9px', border: '1.5px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text-primary)', fontSize: '13.5px', fontWeight: 600, cursor: 'pointer' }}
                    onMouseEnter={e => { e.currentTarget.style.borderColor = '#DC2626'; e.currentTarget.style.background = '#FEF2F2'; }}
                    onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.background = 'var(--bg-card)'; }}>
                    {r.label}
                  </button>
                ))}
              </div>
              <button onClick={() => setRozCancelFor(null)}
                style={{ width: '100%', height: '36px', borderRadius: '9px', border: '1px solid var(--border)', background: 'none', color: 'var(--text-secondary)', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}>
                Не скасовувати
              </button>
            </div>
          </div>
        );
      })()}

      {shipModal && (() => {
        const updateQty = (sku: string, val: number) =>
          setShipModal(prev => prev ? {
            ...prev,
            items: prev.items.map(i => i.sku === sku ? { ...i, shipQty: Math.max(0, Math.min(val, i.orderQty - i.shippedQty)) } : i),
          } : null);
        const hasAny = shipModal.items.some(i => i.shipQty > 0);
        const isPartial = shipModal.items.some(i => i.shipQty < (i.orderQty - i.shippedQty));
        // padding + overflow на підкладці: замовлення з довгим списком товарів
        // інакше не влізе, і верх вікна — заголовок і перші позиції — опиниться
        // вище екрана, куди не доскролити.
        return (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 10000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px', overflowY: 'auto' }}>
            <div className="adm-modal-box" style={{ background: '#fff', borderRadius: '16px', padding: '28px 28px 24px', width: '480px', maxWidth: '96vw', maxHeight: '92vh', overflowY: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}>
              <div style={{ fontWeight: 800, fontSize: '16px', marginBottom: '4px', color: '#1E3A5F' }}>Відвантаження</div>
              <div style={{ fontSize: '12px', color: '#6B7280', marginBottom: '20px' }}>
                Вкажіть кількість для відвантаження (можна змінити для часткового відвантаження)
              </div>
              {/* TTN field for Prom orders */}
              {shipModal.isProm && (
                <div style={{ marginBottom: '16px' }}>
                  <label style={{ fontSize: '11px', fontWeight: 700, color: '#C2410C', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: '6px' }}>
                    ТТН (буде надіслано на Prom)
                  </label>
                  <input
                    type="text"
                    placeholder="Номер відправлення..."
                    value={shipModal.ttn}
                    onChange={e => setShipModal(prev => prev ? { ...prev, ttn: e.target.value } : null)}
                    style={{ width: '100%', height: '36px', padding: '0 10px', border: '1.5px solid #FED7AA', borderRadius: '8px', fontSize: '14px', fontFamily: 'monospace', boxSizing: 'border-box', outline: 'none', color: '#92400E', background: '#FFFBEB' }}
                  />
                </div>
              )}
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', marginBottom: '20px' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid #E5E7EB' }}>
                    <th style={{ textAlign: 'left', padding: '4px 0', fontWeight: 600, color: '#6B7280', fontSize: '11px' }}>Товар</th>
                    <th style={{ textAlign: 'center', padding: '4px 8px', fontWeight: 600, color: '#6B7280', fontSize: '11px', whiteSpace: 'nowrap' }}>Замовл.</th>
                    <th style={{ textAlign: 'center', padding: '4px 8px', fontWeight: 600, color: '#6B7280', fontSize: '11px', whiteSpace: 'nowrap' }}>Відвант.</th>
                    <th style={{ textAlign: 'center', padding: '4px 0', fontWeight: 600, color: '#166534', fontSize: '11px', whiteSpace: 'nowrap' }}>Зараз</th>
                  </tr>
                </thead>
                <tbody>
                  {shipModal.items.map(item => (
                    <tr key={item.sku} style={{ borderBottom: '1px solid #F3F4F6' }}>
                      <td style={{ padding: '8px 0' }}>
                        <div style={{ fontWeight: 600, lineHeight: 1.3 }}>{item.brand} {item.name}</div>
                        <div style={{ fontSize: '10px', color: '#9CA3AF', fontFamily: 'monospace' }}>{item.sku}</div>
                      </td>
                      <td style={{ textAlign: 'center', padding: '8px', color: '#374151' }}>{item.orderQty}</td>
                      <td style={{ textAlign: 'center', padding: '8px', color: item.shippedQty > 0 ? '#059669' : '#9CA3AF' }}>
                        {item.shippedQty > 0 ? item.shippedQty : '—'}
                      </td>
                      <td style={{ textAlign: 'center', padding: '8px 0' }}>
                        <input
                          type="number" min={0} max={item.orderQty - item.shippedQty}
                          value={item.shipQty}
                          onChange={e => updateQty(item.sku, parseInt(e.target.value) || 0)}
                          style={{ width: '60px', textAlign: 'center', border: '1.5px solid #86EFAC', borderRadius: '6px', padding: '4px 6px', fontSize: '13px', fontWeight: 700, color: '#166534' }}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {isPartial && (
                <div style={{ fontSize: '11px', color: '#92400E', background: '#FFF7ED', border: '1px solid #FED7AA', borderRadius: '8px', padding: '8px 12px', marginBottom: '16px' }}>
                  ⚠ Часткове відвантаження — буде створена окрема ВН. Залишок можна відвантажити пізніше.
                </div>
              )}
              <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
                <button onClick={() => setShipModal(null)}
                  style={{ height: '38px', padding: '0 20px', borderRadius: '9px', border: '1.5px solid #E5E7EB', background: '#fff', fontSize: '13px', fontWeight: 600, cursor: 'pointer', color: '#374151' }}>
                  Скасувати
                </button>
                <button
                  onClick={() => executeShip(
                    shipModal.orderId,
                    shipModal.items.filter(i => i.shipQty > 0).map(i => ({ sku: i.sku, shipQty: i.shipQty })),
                    shipModal.isProm && shipModal.ttn ? shipModal.ttn : undefined,
                  )}
                  disabled={!hasAny || shipping === shipModal.orderId}
                  style={{ height: '38px', padding: '0 24px', borderRadius: '9px', border: 'none', background: hasAny ? '#166534' : '#9CA3AF', color: '#fff', fontSize: '13px', fontWeight: 700, cursor: hasAny ? 'pointer' : 'not-allowed' }}>
                  <Truck size={14} style={{ display: 'inline', marginRight: '6px', verticalAlign: 'middle' }} />
                  {isPartial ? 'Відвантажити частково' : 'Відвантажити'}
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      <style>{`
        @keyframes awaiting-pulse {
          0%, 100% { opacity: 1; box-shadow: 0 0 0 0 rgba(124,58,237,0.4); }
          50% { opacity: 0.85; box-shadow: 0 0 0 4px rgba(124,58,237,0); }
        }
        .status-awaiting-pulse {
          animation: awaiting-pulse 2s ease-in-out infinite;
        }
        @keyframes awaiting-banner-pulse {
          0%, 100% { border-color: #DDD6FE; }
          50% { border-color: #8B5CF6; }
        }
      `}</style>
    </>
  );
}
