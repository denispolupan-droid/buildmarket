'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import {
  X, Minus, Loader2, Trash2, Plus, AlertCircle, Upload, Search, UserCheck, Users,
  Printer, ChevronDown, CheckSquare, Package, Send, Warehouse, RefreshCw, Info,
  Gift, LayoutGrid,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import * as XLSX from 'xlsx';
import dynamic from 'next/dynamic';
import NovaPoshtaSelect from '../../components/NovaPoshtaSelect';
import type { OrderDraft, OrderLine } from '../OrderDraftManager';

const ProductPickerModal = dynamic(() => import('../procurement/ProductPickerModal'), { ssr: false });

// ── Style tokens ─────────────────────────────────────────────────────────────
const inp: React.CSSProperties = {
  border: '1px solid var(--border)', borderRadius: '6px',
  fontSize: '12px', outline: 'none', padding: '4px 8px',
  color: 'var(--text-primary)', background: 'var(--bg-soft)',
  width: '100%', boxSizing: 'border-box',
};
const lbl: React.CSSProperties = {
  fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)',
  display: 'block', marginBottom: '4px', textTransform: 'uppercase',
};
const sinp: React.CSSProperties = {
  height: '34px', padding: '0 10px', border: '1.5px solid var(--border)',
  borderRadius: '8px', fontSize: '13px', outline: 'none',
  color: 'var(--text-primary)', background: 'var(--bg-soft)', width: '100%',
  boxSizing: 'border-box',
};

const CHANNEL_OPTIONS = [
  { value: 'retail', label: 'Магазин / самовивіз' },
  { value: 'phone',  label: 'Телефон' },
  { value: 'b2b',    label: 'Оптовий' },
];
const PAYMENT_OPTIONS = [
  { value: 'cash',    label: 'Готівка' },
  { value: 'cod',     label: 'Накладений платіж' },
  { value: 'invoice', label: 'Безготівковий' },
];
const DELIVERY_OPTIONS = [
  { value: 'pickup',  label: 'Самовивіз' },
  { value: 'nova',    label: 'Нова Пошта' },
  { value: 'kharkiv', label: 'Доставка по місту' },
];

function fmt(n: number) { return n.toLocaleString('uk-UA', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }

// ── Excel parser ─────────────────────────────────────────────────────────────
function detectCol(headers: string[], keys: string[]): number {
  const lowers = headers.map(h => h.toLowerCase().replace(/[\s_\-\.]/g, ''));
  for (const k of keys) {
    const idx = lowers.findIndex(h => h.includes(k));
    if (idx >= 0) return idx;
  }
  return -1;
}

function parseExcel(buffer: ArrayBuffer): { sku: string; name: string; qty: number; price: number }[] {
  const wb   = XLSX.read(buffer, { type: 'array' });
  const ws   = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<string[]>(ws, { header: 1, defval: '' }) as string[][];
  if (rows.length < 2) return [];
  let headerIdx = 0;
  for (let i = 0; i < Math.min(5, rows.length); i++) {
    if (rows[i].filter(Boolean).length >= 2) { headerIdx = i; break; }
  }
  const headers = rows[headerIdx].map(String);
  const skuCol   = detectCol(headers, ['sku','код','арт','code','article']);
  const nameCol  = detectCol(headers, ['назв','name','товар','найменув','опис','description']);
  const qtyCol   = detectCol(headers, ['кіл','qty','кол','количество','amount','count']);
  const priceCol = detectCol(headers, ['цін','price','ціна','вартість','cost','прайс']);
  const result: { sku: string; name: string; qty: number; price: number }[] = [];
  for (let i = headerIdx + 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row.some(Boolean)) continue;
    const sku   = skuCol  >= 0 ? String(row[skuCol]  ?? '').trim() : '';
    const name  = nameCol >= 0 ? String(row[nameCol] ?? '').trim() : '';
    const qty   = qtyCol  >= 0 ? parseFloat(String(row[qtyCol]).replace(',', '.'))   : 1;
    const price = priceCol >= 0 ? parseFloat(String(row[priceCol]).replace(',', '.')) : 0;
    if (!sku && !name) continue;
    result.push({ sku, name, qty: isNaN(qty) || qty <= 0 ? 1 : qty, price: isNaN(price) ? 0 : price });
  }
  return result;
}

// ── Price tier helpers ────────────────────────────────────────────────────────
const PRICE_TIER_OPTIONS = [
  { value: 'retail',    label: 'Роздріб' },
  { value: 'wholesale', label: 'Оптова'  },
  { value: 'drop',      label: 'Дроп'    },
  { value: 'cost',      label: 'Закуп'   },
];

type ProductPrices = {
  price_retail?:    number | null;
  price_wholesale?: number | null;
  price_drop?:      number | null;
  price_cost?:      number | null;
  price_unit?:      number | null;
};

function priceForTier(p: ProductPrices, tier: string): number {
  const v = tier === 'retail'    ? (p.price_retail    ?? p.price_unit)
          : tier === 'wholesale' ? (p.price_wholesale ?? p.price_unit)
          : tier === 'drop'      ? (p.price_drop      ?? p.price_unit)
          : tier === 'cost'      ? p.price_cost
          : p.price_unit;
  return Number(v ?? 0);
}

// ── Customer type ─────────────────────────────────────────────────────────────
type Customer = {
  id: string; name: string; company: string | null;
  phone: string | null; email: string | null;
  type: string; city: string | null; price_tier: string | null;
};

type Props = {
  initialData:   OrderDraft;
  zIndex?:       number;
  onMinimize:    () => void;
  onClose:       () => void;
  onDraftChange: (data: Partial<OrderDraft>) => void;
  onSubmitted:   () => void;
};

export default function NewOrderModal({
  initialData, zIndex = 1003, onMinimize, onClose, onDraftChange, onSubmitted,
}: Props) {
  const router  = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);

  // ── Customer picker state ────────────────────────────────────────────────
  const [customerId,       setCustomerId]       = useState<string | null>(initialData.customerId ?? null);
  const [customerSearch,   setCustomerSearch]   = useState('');
  const [customerResults,  setCustomerResults]  = useState<Customer[]>([]);
  const [customerOpen,     setCustomerOpen]     = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const customerRef = useRef<HTMLDivElement>(null);
  const customerTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // ── Customer picker modal ─────────────────────────────────────────────────
  const [showPicker,    setShowPicker]    = useState(false);
  const [pickerQuery,   setPickerQuery]   = useState('');
  const [pickerList,    setPickerList]    = useState<Customer[]>([]);
  const [pickerLoading, setPickerLoading] = useState(false);
  const pickerTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // ── Order fields ──────────────────────────────────────────────────────────
  const [contact,          setContact]          = useState(initialData.contact);
  const [phone,            setPhone]            = useState(initialData.phone);
  const [email,            setEmail]            = useState(initialData.email);
  const [company,          setCompany]          = useState(initialData.company);
  const [channelCode,      setChannelCode]      = useState(initialData.channelCode || 'retail');
  const [delivery,         setDelivery]         = useState(initialData.delivery || 'pickup');
  const [novaSubtype,      setNovaSubtype]      = useState<'warehouse' | 'courier' | 'postomat' | ''>(
    (initialData.novaSubtype as 'warehouse' | 'courier' | 'postomat' | '') || ''
  );
  const [novaCityRef,      setNovaCityRef]      = useState(initialData.novaCityRef || '');
  const [novaCityName,     setNovaCityName]     = useState(initialData.novaCityName || '');
  const [novaWarehouseRef, setNovaWarehouseRef] = useState(initialData.novaWarehouseRef || '');
  const [address,          setAddress]          = useState(initialData.address || '');
  const [payment,          setPayment]          = useState(initialData.payment || 'cash');
  const [comment,          setComment]          = useState(initialData.comment || '');
  const [lines,            setLines]            = useState<OrderLine[]>(
    initialData.lines?.length
      ? initialData.lines
      : [{ sku: '', name: '', brand: '', qty: 1, price: 0, matched: false }]
  );
  const [priceTier, setPriceTier] = useState<string>(initialData.priceTier || 'retail');

  // ── Saved order state ─────────────────────────────────────────────────────
  const [createdOrderId,     setCreatedOrderId]     = useState<string | null>(null);
  const [createdOrderNumber, setCreatedOrderNumber] = useState<number | null>(null);

  // ── Action menu (split-button dropdown) ───────────────────────────────────
  const [actionMenu,  setActionMenu]  = useState(false);
  const [actionBusy,  setActionBusy]  = useState(false);
  const actionMenuRef = useRef<HTMLDivElement>(null);

  // ── PO selection modal ────────────────────────────────────────────────────
  type PoModalState = { allItems: OrderLine[]; missingItems: OrderLine[]; hasOwn: boolean; orderId: string };
  const [poModal, setPoModal] = useState<PoModalState | null>(null);

  // ── Supplier send modal ───────────────────────────────────────────────────
  type SupplierModalState = { orderId: string; supplierName: string; emailOverride: string; comment: string; sending: boolean };
  const [supplierModal, setSupplierModal] = useState<SupplierModalState | null>(null);

  // ── Result modal ──────────────────────────────────────────────────────────
  type ResultModalState = { title: string; message: string; orderId?: string; orderNumber?: number; insufficient?: { sku: string; requested: number; available: number }[] };
  const [resultModal, setResultModal] = useState<ResultModalState | null>(null);

  // ── Excel / processing state ──────────────────────────────────────────────
  const [dragging, setDragging] = useState(false);
  const [parsing,  setParsing]  = useState(false);
  const [saving,   setSaving]   = useState(false);
  const [error,    setError]    = useState('');

  // ── SKU lookup debounce ───────────────────────────────────────────────────
  const lookupTimers  = useRef<Record<number, ReturnType<typeof setTimeout>>>({});
  // ── Name autocomplete ─────────────────────────────────────────────────────
  const nameTimers    = useRef<Record<number, ReturnType<typeof setTimeout>>>({});
  const nameInputRefs = useRef<Record<number, HTMLInputElement | null>>({});
  const [nameSuggestions, setNameSuggestions] = useState<
    Record<number, { sku: string; name: string; brand: string }[]>
  >({});
  const [suggestionAnchor, setSuggestionAnchor] = useState<{
    idx: number; top: number; left: number;
  } | null>(null);
  const [activeDropdownIdx, setActiveDropdownIdx] = useState(-1);

  // ── Catalog picker ────────────────────────────────────────────────────────
  const [showCatalog, setShowCatalog] = useState(false);

  // Cleanup timers
  useEffect(() => {
    const lt = lookupTimers.current;
    const nt = nameTimers.current;
    return () => {
      Object.values(lt).forEach(clearTimeout);
      Object.values(nt).forEach(clearTimeout);
      clearTimeout(customerTimer.current);
      clearTimeout(pickerTimer.current);
    };
  }, []);

  // Close customer dropdown on outside click
  useEffect(() => {
    function h(e: MouseEvent) {
      if (customerRef.current && !customerRef.current.contains(e.target as Node))
        setCustomerOpen(false);
    }
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  // Close action menu on outside click
  useEffect(() => {
    function h(e: MouseEvent) {
      if (actionMenuRef.current && !actionMenuRef.current.contains(e.target as Node))
        setActionMenu(false);
    }
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  // Reset NP fields when delivery changes
  useEffect(() => {
    setNovaSubtype('');
    setNovaCityRef('');
    setNovaCityName('');
    setNovaWarehouseRef('');
    setAddress('');
  }, [delivery]);

  // Sync draft upward
  useEffect(() => {
    onDraftChange({
      customerId, contact, phone, email, company, channelCode, priceTier,
      delivery, novaSubtype, novaCityRef, novaCityName, novaWarehouseRef,
      address, payment, comment, lines,
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customerId, contact, phone, email, company, channelCode, priceTier,
      delivery, novaSubtype, novaCityRef, novaCityName, novaWarehouseRef,
      address, payment, comment, lines]);

  // Re-apply prices when priceTier changes (only for matched lines)
  useEffect(() => {
    const matchedSkus = lines.filter(l => l.matched && l.sku).map(l => l.sku);
    if (!matchedSkus.length) return;
    fetch('/api/admin/products/search-skus', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ skus: matchedSkus }),
    }).then(r => r.json()).then(data => {
      const pm = new Map<string, ProductPrices>((data.products ?? []).map(
        (p: ProductPrices & { sku: string }) => [p.sku, p]
      ));
      setLines(prev => prev.map(l => {
        if (!l.matched || !l.sku) return l;
        const p = pm.get(l.sku);
        if (!p) return l;
        const newPrice = priceForTier(p, priceTier);
        return newPrice > 0 ? { ...l, price: newPrice } : l;
      }));
    }).catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [priceTier]);

  // ── Customer picker modal logic ───────────────────────────────────────────
  async function openPicker() {
    setShowPicker(true);
    setPickerQuery('');
    setPickerLoading(true);
    const res = await fetch('/api/admin/customers/search?q=&limit=60');
    const data: Customer[] = res.ok ? await res.json() : [];
    setPickerList(data);
    setPickerLoading(false);
  }

  function handlePickerSearch(val: string) {
    setPickerQuery(val);
    clearTimeout(pickerTimer.current);
    setPickerLoading(true);
    pickerTimer.current = setTimeout(async () => {
      const q = val.trim();
      const url = q.length >= 2
        ? `/api/admin/customers/search?q=${encodeURIComponent(q)}&limit=60`
        : '/api/admin/customers/search?q=&limit=60';
      const res = await fetch(url);
      const data: Customer[] = res.ok ? await res.json() : [];
      setPickerList(data);
      setPickerLoading(false);
    }, 250);
  }

  function pickCustomer(c: Customer) {
    selectCustomer(c);
    setShowPicker(false);
    setPickerQuery('');
  }

  // ── Customer picker ───────────────────────────────────────────────────────
  function handleCustomerSearch(val: string) {
    setCustomerSearch(val);
    clearTimeout(customerTimer.current);
    if (val.length >= 2) {
      customerTimer.current = setTimeout(async () => {
        const res = await fetch(`/api/admin/customers/search?q=${encodeURIComponent(val)}`);
        if (!res.ok) return;
        const data: Customer[] = await res.json();
        setCustomerResults(data);
        setCustomerOpen(data.length > 0);
      }, 300);
    } else {
      setCustomerResults([]);
      setCustomerOpen(false);
    }
  }

  function selectCustomer(c: Customer) {
    setCustomerId(c.id);
    setSelectedCustomer(c);
    setContact(c.name);
    setPhone(c.phone ?? '');
    setEmail(c.email ?? '');
    setCompany(c.company ?? '');
    setCustomerSearch('');
    setCustomerOpen(false);
    setPriceTier(c.price_tier ?? 'retail');
  }

  function clearCustomer() {
    setCustomerId(null);
    setSelectedCustomer(null);
    setContact('');
    setPhone('');
    setEmail('');
    setCompany('');
    setPriceTier('retail');
  }

  // ── Excel upload ──────────────────────────────────────────────────────────
  async function resolveLines(
    raw: { sku: string; name: string; qty: number; price: number }[]
  ): Promise<OrderLine[]> {
    const skus = raw.map(r => r.sku).filter(Boolean);
    if (!skus.length) return raw.map(r => ({ sku: '', name: r.name, brand: '', qty: r.qty, price: r.price, matched: false }));

    const res = await fetch('/api/admin/products/search-skus', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ skus }),
    });
    if (!res.ok) return raw.map(r => ({ sku: r.sku, name: r.name, brand: '', qty: r.qty, price: r.price, matched: false }));

    const data = await res.json();
    const byInput = new Map<string, { sku: string; name: string; brand: string; price_cost: number | null; price_unit: number | null; matched: boolean }>();
    for (const p of (data.products ?? [])) byInput.set(p.input_sku, p);

    return raw.map(r => {
      const found = byInput.get(r.sku);
      return {
        sku:      found?.sku   ?? r.sku,
        name:     found        ? `${found.brand ?? ''} ${found.name ?? ''}`.trim() : r.name,
        brand:    found?.brand ?? '',
        qty:      r.qty,
        price:    r.price || (found ? priceForTier(found, priceTier) : 0),
        matched:  found?.matched ?? false,
        is_bonus: false,
      };
    });
  }

  async function processFile(file: File) {
    setParsing(true); setError('');
    try {
      const buf = await file.arrayBuffer();
      const raw = parseExcel(buf);
      if (!raw.length) { setError('Не знайдено рядків у файлі. Перевірте формат.'); return; }
      const resolved = await resolveLines(raw);
      setLines(resolved);
    } catch (e) {
      setError('Помилка читання файлу: ' + (e instanceof Error ? e.message : String(e)));
    } finally { setParsing(false); }
  }

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault(); setDragging(false);
    const f = e.dataTransfer.files[0];
    if (f) processFile(f);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Line helpers ──────────────────────────────────────────────────────────
  function setLineField<K extends keyof OrderLine>(idx: number, key: K, val: OrderLine[K]) {
    setLines(prev => prev.map((l, i) => i === idx ? { ...l, [key]: val } : l));
  }
  function addLine() {
    setLines(prev => [...prev, { sku: '', name: '', brand: '', qty: 1, price: 0, matched: false, is_bonus: false }]);
  }

  async function lookupSku(idx: number, sku: string) {
    if (!sku.trim()) return;
    const res = await fetch('/api/admin/products/search-skus', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ skus: [sku.trim()] }),
    });
    if (!res.ok) return;
    const data = await res.json();
    const found = data.products?.[0];
    if (found?.matched) {
      setLines(prev => prev.map((l, i) => i === idx ? {
        ...l, sku: found.sku,
        name:  found.name  ?? l.name,
        brand: found.brand ?? l.brand,
        price: priceForTier(found, priceTier) || found.price_unit || found.price_cost || l.price,
        matched: true,
      } : l));
    } else {
      setLineField(idx, 'matched', false as unknown as never);
    }
  }

  function handleSkuChange(idx: number, val: string) {
    setLineField(idx, 'sku', val);
    setLineField(idx, 'matched', false as unknown as never);
    clearTimeout(lookupTimers.current[idx]);
    if (val.trim().length >= 3) {
      lookupTimers.current[idx] = setTimeout(() => lookupSku(idx, val), 600);
    }
  }

  function updateAnchor(idx: number) {
    const el = nameInputRefs.current[idx];
    if (!el) return;
    const r = el.getBoundingClientRect();
    setSuggestionAnchor({ idx, top: r.top + r.height + 4, left: r.left });
  }

  function handleNameChange(idx: number, val: string) {
    setLineField(idx, 'name', val);
    clearTimeout(nameTimers.current[idx]);
    if (val.trim().length >= 2) {
      nameTimers.current[idx] = setTimeout(async () => {
        const res = await fetch(`/api/admin/products/search?q=${encodeURIComponent(val.trim())}`);
        if (!res.ok) return;
        const data = await res.json();
        setNameSuggestions(prev => ({ ...prev, [idx]: data.slice(0, 8) }));
        updateAnchor(idx);
      }, 300);
    } else {
      setNameSuggestions(prev => ({ ...prev, [idx]: [] }));
      setSuggestionAnchor(null);
      setActiveDropdownIdx(-1);
    }
  }

  async function selectNameSuggestion(idx: number, s: { sku: string; name: string; brand: string }) {
    setNameSuggestions(prev => ({ ...prev, [idx]: [] }));
    setSuggestionAnchor(null);
    setActiveDropdownIdx(-1);
    setLines(prev => prev.map((l, i) => i === idx
      ? { ...l, sku: s.sku, name: `${s.brand} ${s.name}`.trim(), brand: s.brand, matched: true }
      : l
    ));
    await lookupSku(idx, s.sku);
  }

  // ── Catalog picker ────────────────────────────────────────────────────────
  function handleCatalogAdd(items: { sku: string; name: string; qty: number; cost_price: number }[]) {
    const cleanedLines = lines.filter(l => l.sku || l.name);
    const newLines: OrderLine[] = items.map(item => ({
      sku: item.sku, name: item.name, brand: '', qty: item.qty,
      price: 0, matched: true, is_bonus: false,
    }));
    setLines([...cleanedLines, ...newLines]);
    // Fetch tier-correct prices for each item
    items.forEach((item, i) => lookupSku(cleanedLines.length + i, item.sku));
  }

  // ── Computed ──────────────────────────────────────────────────────────────
  const total       = lines.reduce((s, l) => s + (l.is_bonus ? 0 : l.qty * l.price), 0);
  const filledLines = lines.filter(l => l.sku || l.name).length;
  const warnCount   = lines.filter(l => l.sku && !l.matched && l.sku.length >= 3).length;

  // ── Actions ────────────────────────────────────────────────────────────────

  function buildPayload() {
    const validLines = lines.filter(l => l.name.trim() || l.sku.trim());
    const fullComment = ['⛔ Не передзвонювати для підтвердження', comment].filter(Boolean).join('\n');
    return {
      customerId: customerId ?? undefined,
      company: company || null, contact, phone, email,
      deliveryType:         delivery,
      deliverySubtype:      delivery === 'nova' ? novaSubtype : null,
      deliveryAddress:      delivery === 'nova' && novaSubtype === 'courier' ? address
                            : delivery === 'kharkiv' ? address : null,
      deliveryCityRef:      delivery === 'nova' ? novaCityRef    : null,
      deliveryCityName:     delivery === 'nova' ? novaCityName   : null,
      deliveryWarehouseRef: delivery === 'nova' && (novaSubtype === 'warehouse' || novaSubtype === 'postomat')
                            ? novaWarehouseRef : null,
      paymentType:  payment,
      comment:      fullComment,
      items: validLines.map(l => ({
        sku: l.sku,
        name: l.brand ? `${l.brand} ${l.name}`.trim() : l.name,
        brand: l.brand, qty: l.qty,
        price: l.is_bonus ? 0 : l.price,
        is_bonus: l.is_bonus ?? false,
      })),
      totalPrice: total,
      channelCode,
    };
  }

  /** Save order to DB; returns {id, orderNumber} or null on error. Idempotent. */
  async function saveOrder(): Promise<{ id: string; orderNumber: number } | null> {
    if (!contact.trim()) { setError('Вкажіть клієнта'); return null; }
    if (filledLines === 0) { setError('Додайте хоча б один товар'); return null; }
    if (createdOrderId && createdOrderNumber) return { id: createdOrderId, orderNumber: createdOrderNumber };

    setActionBusy(true); setSaving(true); setError('');
    try {
      const res = await fetch('/api/admin/orders', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(buildPayload()),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Помилка');
      setCreatedOrderId(data.id);
      setCreatedOrderNumber(data.orderNumber);
      return { id: data.id, orderNumber: data.orderNumber };
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Невідома помилка');
      return null;
    } finally { setActionBusy(false); setSaving(false); }
  }

  /** Записати — просто зберегти */
  async function handleRecord() {
    const saved = await saveOrder();
    if (!saved) return;
    onSubmitted();
    router.push('/admin?status=new');
    router.refresh();
  }

  /** Зарезервувати — зберегти + зарезервувати зі свого складу */
  async function handleReserve() {
    const saved = await saveOrder();
    if (!saved) return;
    setActionBusy(true); setError('');
    try {
      const planRes = await fetch(`/api/admin/orders/${saved.id}/fulfillment`);
      const planData = await planRes.json();
      const ownItems = (planData.plan?.items ?? []).filter(
        (i: { fulfillment_type: string; warehouse_id: number }) => i.fulfillment_type === 'own' && i.warehouse_id
      );
      if (!ownItems.length) {
        setResultModal({ title: '📦 Резервування', message: 'Немає товарів для резервування зі власного складу', orderId: saved.id, orderNumber: saved.orderNumber });
        return;
      }
      const res = await fetch(`/api/admin/orders/${saved.id}/reserve`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: ownItems.map((i: { sku: string; warehouse_id: number; qty: number }) => ({ sku: i.sku, warehouse_id: i.warehouse_id, qty: i.qty })) }),
      });
      const data = await res.json();
      setResultModal({
        title: '📦 Резервування',
        message: data.insufficient?.length
          ? `Зарезервовано: ${data.reserved} поз. · Недостатньо: ${data.insufficient.length} поз.`
          : `Успішно зарезервовано ${data.reserved} позицій`,
        orderId: saved.id, orderNumber: saved.orderNumber,
        insufficient: data.insufficient,
      });
    } catch (e) { setError(e instanceof Error ? e.message : 'Помилка'); }
    finally { setActionBusy(false); }
  }

  /** Провести (власний / дропшип / змішане) */
  async function handleConfirm(mode: 'own' | 'supplier' | 'mixed') {
    const saved = await saveOrder();
    if (!saved) return;
    setActionBusy(true); setError('');
    try {
      const res = await fetch(`/api/admin/orders/${saved.id}/confirm`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fulfillment_mode: mode }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (data.insufficient?.length) {
          setResultModal({ title: '⚠️ Недостатньо товару', message: data.error ?? 'Деякі позиції не вдалось зарезервувати', orderId: saved.id, orderNumber: saved.orderNumber, insufficient: data.insufficient });
          return;
        }
        throw new Error(data.error ?? 'Помилка');
      }
      const modeLabel = mode === 'own' ? 'власний склад' : mode === 'supplier' ? 'дропшип' : 'змішане';
      setResultModal({ title: `✅ Проведено — ${modeLabel}`, message: `Замовлення №${saved.orderNumber} підтверджено`, orderId: saved.id, orderNumber: saved.orderNumber });
    } catch (e) { setError(e instanceof Error ? e.message : 'Помилка'); }
    finally { setActionBusy(false); }
  }

  /** Замовити у постачальника — перевірка залишків → вибір позицій → ЗП */
  async function handleCreatePO() {
    const saved = await saveOrder();
    if (!saved) return;
    setActionBusy(true); setError('');
    try {
      const res = await fetch(`/api/admin/orders/${saved.id}/fulfillment`);
      const data = await res.json();
      const planItems: { sku: string; available_own: number }[] = data.plan?.items ?? [];
      const ownSkus = new Set(planItems.filter(i => i.available_own > 0).map(i => i.sku));
      const orderLines = lines.filter(l => l.sku || l.name);
      const missingItems = orderLines.filter(l => !ownSkus.has(l.sku));
      setPoModal({ allItems: orderLines, missingItems, hasOwn: ownSkus.size > 0, orderId: saved.id });
    } catch (e) { setError(e instanceof Error ? e.message : 'Помилка'); }
    finally { setActionBusy(false); }
  }

  function openPODraft(items: OrderLine[]) {
    window.dispatchEvent(new CustomEvent('open-po-draft', {
      detail: {
        suppliers: [],
        prefill: {
          lines: items.map(l => ({
            sku: l.sku,
            name: l.brand ? `${l.brand} ${l.name}`.trim() : l.name,
            qty: l.qty, cost_price: 0, matched: l.matched,
          })),
          notes: `Замовлення покупця №${createdOrderNumber}`,
        },
      },
    }));
    setPoModal(null);
    onSubmitted();
  }

  /** Відправити постачальнику (дропшип) */
  async function handleSendToSupplier() {
    const saved = await saveOrder();
    if (!saved) return;
    setActionBusy(true); setError('');
    try {
      const res = await fetch(`/api/admin/orders/${saved.id}/supplier-order`);
      const data = await res.json();
      if (!data.tracking_number) {
        const ok = window.confirm('ТТН не створена для цього замовлення. Все одно відправити постачальнику?');
        if (!ok) { setActionBusy(false); return; }
      }
      setSupplierModal({ orderId: saved.id, supplierName: data.supplier_name ?? '—', emailOverride: data.supplier_email ?? '', comment: '', sending: false });
    } catch (e) { setError(e instanceof Error ? e.message : 'Помилка'); }
    finally { setActionBusy(false); }
  }

  async function confirmSendToSupplier() {
    if (!supplierModal) return;
    setSupplierModal(p => p ? { ...p, sending: true } : null);
    try {
      const res = await fetch(`/api/admin/orders/${supplierModal.orderId}/supplier-order`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ overrideEmail: supplierModal.emailOverride || undefined, comment: supplierModal.comment || undefined }),
      });
      if (res.ok) {
        setSupplierModal(null);
        setResultModal({ title: '📤 Відправлено постачальнику', message: `Замовлення №${createdOrderNumber} надіслано`, orderId: supplierModal.orderId, orderNumber: createdOrderNumber ?? undefined });
      } else {
        const d = await res.json();
        setError(d.error ?? 'Помилка відправки');
        setSupplierModal(p => p ? { ...p, sending: false } : null);
      }
    } catch (e) { setError(e instanceof Error ? e.message : 'Помилка'); setSupplierModal(p => p ? { ...p, sending: false } : null); }
  }

  // ── Action button helper ──────────────────────────────────────────────────
  function ActionBtn({ icon, label, sub, onClick }: { icon: React.ReactNode; label: string; sub: string; onClick: () => void }) {
    return (
      <button
        onMouseDown={onClick}
        style={{ width: '100%', padding: '8px 14px', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left', display: 'flex', alignItems: 'flex-start', gap: '10px' }}
        onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-soft)')}
        onMouseLeave={e => (e.currentTarget.style.background = 'none')}
      >
        <span style={{ color: '#1E3A5F', marginTop: '2px', flexShrink: 0 }}>{icon}</span>
        <div>
          <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>{label}</div>
          <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '1px' }}>{sub}</div>
        </div>
      </button>
    );
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <>
      {/* ── Side panel ───────────────────────────────────────────────────── */}
      <div
        className="order-panel-enter"
        style={{
          position: 'fixed', top: 0, left: '240px', bottom: '42px', zIndex,
          width: 'min(980px, 72vw)',
          display: 'flex', flexDirection: 'column',
          background: 'var(--bg-card)',
          boxShadow: '8px 0 32px rgba(0,0,0,0.22)',
          borderRight: '1px solid var(--border)',
          borderBottom: '1px solid var(--border)',
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>

          {/* Header */}
          <div style={{ padding: '18px 24px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
            <div style={{ fontSize: '16px', fontWeight: 800, color: 'var(--text-primary)' }}>
              Нове замовлення покупця
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <button onClick={onMinimize} title="Згорнути" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex', padding: '4px', borderRadius: '6px' }}>
                <Minus size={18} />
              </button>
              <button onClick={onClose} title="Закрити" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex', padding: '4px', borderRadius: '6px' }}>
                <X size={18} />
              </button>
            </div>
          </div>

          {/* Scrollable body */}
          <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>

            {/* Channel */}
            <div>
              <label style={lbl}>Канал</label>
              <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                {CHANNEL_OPTIONS.map(ch => (
                  <button key={ch.value} onClick={() => setChannelCode(ch.value)}
                    style={{
                      padding: '5px 14px', borderRadius: '7px', fontSize: '12px', fontWeight: 600, cursor: 'pointer',
                      border: `1.5px solid ${channelCode === ch.value ? '#1E3A5F' : 'var(--border)'}`,
                      background: channelCode === ch.value ? '#1E3A5F' : 'var(--bg-soft)',
                      color: channelCode === ch.value ? '#fff' : 'var(--text-secondary)',
                    }}>
                    {ch.label}
                  </button>
                ))}
              </div>
            </div>

            {/* ── CLIENT SECTION ─────────────────────────────────────────── */}
            <div style={{ border: '1px solid var(--border)', borderRadius: '10px', padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <label style={{ ...lbl, margin: 0 }}>Клієнт / Контрагент</label>
                {selectedCustomer && (
                  <span style={{ fontSize: '11px', background: '#EFF6FF', color: '#1D4ED8', padding: '2px 8px', borderRadius: '5px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <UserCheck size={11} /> З довідника
                  </span>
                )}
              </div>

              {/* Customer search (shows only when no customer selected) */}
              {!selectedCustomer ? (
                <div ref={customerRef} style={{ position: 'relative' }}>
                  <div style={{ position: 'relative' }}>
                    <Search size={13} color="#94A3B8" style={{ position: 'absolute', left: '9px', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} />
                    <input
                      placeholder="Пошук клієнта за ім'ям, компанією, телефоном..."
                      value={customerSearch}
                      onChange={e => handleCustomerSearch(e.target.value)}
                      onFocus={() => customerResults.length > 0 && setCustomerOpen(true)}
                      style={{ ...sinp, paddingLeft: '30px', paddingRight: '38px' }}
                    />
                    <button
                      type="button"
                      onClick={openPicker}
                      title="Вибрати зі списку контрагентів"
                      style={{
                        position: 'absolute', right: '6px', top: '50%', transform: 'translateY(-50%)',
                        background: 'none', border: 'none', cursor: 'pointer',
                        color: '#64748B', display: 'flex', padding: '3px', borderRadius: '4px',
                      }}
                    >
                      <Users size={15} />
                    </button>
                  </div>
                  {customerOpen && customerResults.length > 0 && (
                    <div style={{ position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0, zIndex: 50, background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '10px', boxShadow: '0 8px 24px rgba(0,0,0,0.15)', maxHeight: '220px', overflowY: 'auto' }}>
                      {customerResults.map(c => (
                        <button key={c.id} onMouseDown={() => selectCustomer(c)}
                          style={{ width: '100%', padding: '9px 12px', background: 'none', border: 'none', borderBottom: '1px solid var(--border-light)', cursor: 'pointer', textAlign: 'left', display: 'flex', flexDirection: 'column', gap: '2px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)' }}>{c.name}</span>
                            {c.company && <span style={{ fontSize: '11px', color: 'var(--text-muted)', background: 'var(--bg-soft)', padding: '1px 6px', borderRadius: '4px' }}>{c.company}</span>}
                            <span style={{ fontSize: '10px', color: c.type === 'wholesale' ? '#7C3AED' : '#64748B', marginLeft: 'auto' }}>{c.type === 'wholesale' ? 'Опт' : 'Роздріб'}</span>
                          </div>
                          {(c.phone || c.city) && (
                            <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                              {[c.phone, c.city].filter(Boolean).join(' · ')}
                            </div>
                          )}
                        </button>
                      ))}
                    </div>
                  )}
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>
                    Або заповніть поля нижче вручну — клієнт не збережеться до довідника
                  </div>
                </div>
              ) : (
                /* Selected customer badge */
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 12px', background: '#EFF6FF', borderRadius: '8px', border: '1px solid #BFDBFE' }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: '13px', fontWeight: 700, color: '#1E3A5F' }}>{selectedCustomer.name}</div>
                    <div style={{ fontSize: '11px', color: '#3B82F6' }}>
                      {[selectedCustomer.company, selectedCustomer.phone, selectedCustomer.city].filter(Boolean).join(' · ')}
                    </div>
                  </div>
                  <button onClick={clearCustomer} title="Скинути вибір"
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#3B82F6', display: 'flex', padding: '3px' }}>
                    <X size={14} />
                  </button>
                </div>
              )}

              {/* Contact fields (always editable) */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: '10px' }}>
                <div>
                  <label style={lbl}>Ім'я *</label>
                  <input value={contact} onChange={e => setContact(e.target.value)}
                    placeholder="Іваненко Петро"
                    style={{ ...sinp, borderColor: !contact.trim() ? '#FCA5A5' : undefined }} />
                </div>
                <div>
                  <label style={lbl}>Телефон</label>
                  <input value={phone} onChange={e => setPhone(e.target.value)}
                    placeholder="+380..." style={sinp} />
                </div>
                <div>
                  <label style={lbl}>Компанія</label>
                  <input value={company} onChange={e => setCompany(e.target.value)}
                    placeholder="ТОВ «...»" style={sinp} />
                </div>
                <div>
                  <label style={lbl}>Email</label>
                  <input value={email} onChange={e => setEmail(e.target.value)}
                    placeholder="email@..." style={sinp} />
                </div>
              </div>
            </div>

            {/* ── EXCEL UPLOAD ───────────────────────────────────────────── */}
            <div
              onDragOver={e => { e.preventDefault(); setDragging(true); }}
              onDragLeave={() => setDragging(false)}
              onDrop={onDrop}
              onClick={() => fileRef.current?.click()}
              style={{
                border: `2px dashed ${dragging ? '#1E3A5F' : 'var(--border)'}`,
                borderRadius: '10px', padding: '12px 20px', cursor: 'pointer',
                background: dragging ? '#EFF4FF' : 'var(--bg-soft)',
                display: 'flex', alignItems: 'center', gap: '12px',
                transition: 'all 0.15s',
              }}
            >
              {parsing
                ? <><Loader2 size={18} color="#1E3A5F" style={{ animation: 'spin 1s linear infinite' }} /><span style={{ fontSize: '13px', color: '#1E3A5F' }}>Читаємо файл...</span></>
                : <>
                    <Upload size={18} color={dragging ? '#1E3A5F' : '#94A3B8'} />
                    <div>
                      <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>Завантажити з Excel / CSV</div>
                      <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Перетягніть файл або натисніть · Колонки: Артикул, Назва, К-сть, Ціна</div>
                    </div>
                  </>}
              <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" style={{ display: 'none' }}
                onChange={e => { const f = e.target.files?.[0]; if (f) processFile(f); e.target.value = ''; }} />
            </div>

            {/* ── ITEMS TABLE ────────────────────────────────────────────── */}
            <div style={{ border: '1px solid var(--border)', borderRadius: '10px' }}>
              {/* Price tier selector */}
              <div style={{
                display: 'flex', alignItems: 'center', gap: '8px',
                padding: '8px 12px',
                borderBottom: '1px solid var(--border)',
                background: 'var(--bg-soft)',
              }}>
                <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>
                  Тип цін:
                </span>
                <div style={{ display: 'flex', gap: '4px' }}>
                  {PRICE_TIER_OPTIONS.map(t => (
                    <button key={t.value} onClick={() => setPriceTier(t.value)}
                      style={{
                        padding: '3px 10px', borderRadius: '5px', fontSize: '11px', fontWeight: 700,
                        cursor: 'pointer', border: 'none',
                        background: priceTier === t.value ? '#1E3A5F' : 'transparent',
                        color:      priceTier === t.value ? '#fff'     : 'var(--text-muted)',
                        transition: 'all 0.12s',
                      }}>
                      {t.label}
                    </button>
                  ))}
                </div>
                <span style={{ fontSize: '10px', color: 'var(--text-muted)', marginLeft: 'auto' }}>
                  Ціни підтягуються автоматично по тарифу
                </span>
              </div>
              {/* Table header */}
              <div style={{
                display: 'grid',
                gridTemplateColumns: '130px 2fr 70px 120px 100px 26px 32px',
                padding: '8px 12px',
                background: 'var(--bg-soft)',
                borderBottom: '1px solid var(--border)',
                fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)',
                textTransform: 'uppercase', gap: '8px',
              }}>
                <span>Артикул</span>
                <span>Найменування</span>
                <span style={{ textAlign: 'right' }}>К-сть</span>
                <span style={{ textAlign: 'right' }}>
                  Ціна · <span style={{ color: '#1E3A5F' }}>{PRICE_TIER_OPTIONS.find(t => t.value === priceTier)?.label}</span>
                </span>
                <span style={{ textAlign: 'right' }}>Сума</span>
                <span title="Бонусний товар" style={{ textAlign: 'center' }}>🎁</span>
                <span />
              </div>

              {/* Rows */}
              <div style={{ maxHeight: '300px', overflowY: 'auto' }}>
                {lines.map((line, idx) => {
                  const isBonus = !!line.is_bonus;
                  const rowSum  = isBonus ? 0 : line.qty * line.price;
                  const warn    = line.sku && !line.matched && line.sku.length >= 3;
                  return (
                    <div key={idx} style={{
                      display: 'grid',
                      gridTemplateColumns: '130px 2fr 70px 120px 100px 26px 32px',
                      padding: '6px 12px', gap: '8px', alignItems: 'center',
                      borderBottom: '1px solid var(--border-light)',
                      background: isBonus ? 'rgba(21,128,61,0.06)' : warn ? '#FFFBEB' : 'transparent',
                    }}>
                      {/* SKU */}
                      <input
                        style={{ ...inp, fontFamily: 'monospace', fontSize: '11px', borderColor: warn ? '#FCD34D' : isBonus ? 'rgba(21,128,61,0.3)' : undefined }}
                        placeholder="1300-014"
                        value={line.sku}
                        onChange={e => handleSkuChange(idx, e.target.value)}
                        onBlur={e => { if (e.target.value && !line.matched) lookupSku(idx, e.target.value); }}
                        onKeyDown={e => {
                          if (e.key === 'Backspace' && !line.sku && lines.length > 1) {
                            e.preventDefault();
                            setLines(prev => prev.filter((_, i) => i !== idx));
                          }
                        }}
                      />
                      {/* Name */}
                      <input
                        ref={el => { nameInputRefs.current[idx] = el; }}
                        style={{ ...inp, color: isBonus ? '#15803D' : undefined }}
                        placeholder="Назва товару або пошук..."
                        title={line.name || undefined}
                        value={line.name}
                        onChange={e => { handleNameChange(idx, e.target.value); setActiveDropdownIdx(-1); }}
                        onBlur={() => setTimeout(() => {
                          setNameSuggestions(prev => ({ ...prev, [idx]: [] }));
                          setSuggestionAnchor(null);
                          setActiveDropdownIdx(-1);
                        }, 150)}
                        onFocus={() => {
                          if (line.name.length >= 2 && !nameSuggestions[idx]?.length)
                            handleNameChange(idx, line.name);
                        }}
                        onKeyDown={e => {
                          const suggs = nameSuggestions[idx] ?? [];
                          if (!suggs.length) return;
                          if (e.key === 'ArrowDown') { e.preventDefault(); setActiveDropdownIdx(prev => Math.min(prev + 1, suggs.length - 1)); }
                          else if (e.key === 'ArrowUp') { e.preventDefault(); setActiveDropdownIdx(prev => Math.max(prev - 1, 0)); }
                          else if (e.key === 'Enter' && activeDropdownIdx >= 0) { e.preventDefault(); selectNameSuggestion(idx, suggs[activeDropdownIdx]); }
                          else if (e.key === 'Escape') { setNameSuggestions(prev => ({ ...prev, [idx]: [] })); setSuggestionAnchor(null); setActiveDropdownIdx(-1); }
                        }}
                      />
                      {/* Qty */}
                      <input style={{ ...inp, textAlign: 'right' }} type="number" min="1" step="1"
                        value={line.qty || ''}
                        onChange={e => { const n = parseInt(e.target.value); setLineField(idx, 'qty', isNaN(n) ? 0 : n); }}
                        onBlur={() => { if (!line.qty || line.qty < 1) setLineField(idx, 'qty', 1); }}
                      />
                      {/* Price */}
                      <div style={{ position: 'relative' }}>
                        {isBonus ? (
                          <div style={{ height: '26px', borderRadius: '6px', background: 'rgba(21,128,61,0.1)', border: '1px solid rgba(21,128,61,0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', fontWeight: 700, color: '#15803D' }}>
                            Безкоштовно
                          </div>
                        ) : (
                          <>
                            <input style={{ ...inp, textAlign: 'right', paddingRight: '18px' }} type="number" min="0" step="0.01"
                              value={line.price || ''}
                              placeholder="0.00"
                              onChange={e => setLineField(idx, 'price', parseFloat(e.target.value) || 0)}
                            />
                            <span style={{ position: 'absolute', right: '6px', top: '50%', transform: 'translateY(-50%)', fontSize: '10px', color: 'var(--text-muted)', pointerEvents: 'none' }}>₴</span>
                          </>
                        )}
                      </div>
                      {/* Sum */}
                      <div style={{ textAlign: 'right', fontSize: '13px', fontWeight: 600, color: isBonus ? '#15803D' : rowSum > 0 ? 'var(--text-primary)' : 'var(--text-muted)' }}>
                        {isBonus ? '0 ₴' : rowSum > 0 ? `${fmt(rowSum)} ₴` : '—'}
                      </div>
                      {/* Bonus toggle */}
                      <button
                        onClick={() => setLineField(idx, 'is_bonus', (!isBonus) as unknown as never)}
                        title={isBonus ? 'Скасувати бонус' : 'Позначити як бонусний товар'}
                        style={{
                          background: isBonus ? 'rgba(21,128,61,0.15)' : 'none',
                          border: isBonus ? '1px solid rgba(21,128,61,0.3)' : 'none',
                          borderRadius: '5px',
                          cursor: 'pointer',
                          color: isBonus ? '#15803D' : 'var(--text-muted)',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          padding: '2px', width: '22px', height: '22px',
                          opacity: isBonus ? 1 : 0.45,
                          transition: 'all 0.15s',
                        }}
                        onMouseEnter={e => { e.currentTarget.style.opacity = '1'; }}
                        onMouseLeave={e => { e.currentTarget.style.opacity = isBonus ? '1' : '0.45'; }}
                      >
                        <Gift size={12} />
                      </button>
                      {/* Delete */}
                      <button onClick={() => setLines(prev => prev.filter((_, i) => i !== idx))}
                        disabled={lines.length === 1}
                        style={{ background: 'none', border: 'none', cursor: lines.length > 1 ? 'pointer' : 'default', color: lines.length > 1 ? '#EF4444' : 'var(--text-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0 }}>
                        <Trash2 size={13} />
                      </button>
                    </div>
                  );
                })}
              </div>

              {/* Table footer */}
              <div style={{
                display: 'grid',
                gridTemplateColumns: '130px 2fr 70px 120px 100px 26px 32px',
                padding: '8px 12px', gap: '8px',
                borderTop: '2px solid var(--border)',
                background: 'var(--bg-soft)', alignItems: 'center',
              }}>
                <div style={{ gridColumn: '1 / 3', display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <button onClick={addLine}
                    style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '12px', color: '#1E3A5F', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600, padding: 0 }}>
                    <Plus size={13} /> Додати рядок
                  </button>
                  <button onClick={() => setShowCatalog(true)}
                    style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '12px', color: '#6366F1', background: 'rgba(99,102,241,0.08)', border: '1px solid rgba(99,102,241,0.2)', borderRadius: '6px', cursor: 'pointer', fontWeight: 600, padding: '3px 9px' }}>
                    <LayoutGrid size={12} /> З каталогу
                  </button>
                </div>
                <span />
                <span style={{ textAlign: 'right', fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Разом:</span>
                <span style={{ textAlign: 'right', fontSize: '15px', fontWeight: 800, color: 'var(--text-primary)' }}>
                  {fmt(total)} ₴
                </span>
                <span /><span />
              </div>
            </div>

            {warnCount > 0 && (
              <div style={{ padding: '8px 14px', background: '#FEF3C7', borderRadius: '8px', fontSize: '12px', color: '#B45309', display: 'flex', gap: '6px', alignItems: 'center' }}>
                <AlertCircle size={13} />
                {warnCount} артикул(ів) не знайдено в базі — підсвічено помаранчевим
              </div>
            )}

            {/* Delivery & Payment */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <div>
                <label style={lbl}>Спосіб доставки</label>
                <select value={delivery} onChange={e => setDelivery(e.target.value)} style={{ ...sinp, cursor: 'pointer' }}>
                  {DELIVERY_OPTIONS.map(d => <option key={d.value} value={d.value}>{d.label}</option>)}
                </select>
              </div>
              <div>
                <label style={lbl}>Оплата</label>
                <select value={payment} onChange={e => setPayment(e.target.value)} style={{ ...sinp, cursor: 'pointer' }}>
                  {PAYMENT_OPTIONS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
                </select>
              </div>
            </div>

            {/* Nova Poshta */}
            {delivery === 'nova' && (
              <div>
                <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
                  {(['warehouse', 'postomat', 'courier'] as const).map(sub => (
                    <button key={sub} onClick={() => setNovaSubtype(sub)}
                      style={{
                        flex: 1, padding: '7px', borderRadius: '8px', fontSize: '12px', fontWeight: 600, cursor: 'pointer',
                        border: `1.5px solid ${novaSubtype === sub ? '#1E3A5F' : 'var(--border)'}`,
                        background: novaSubtype === sub ? '#EFF4FF' : 'var(--bg-soft)',
                        color: novaSubtype === sub ? '#1E3A5F' : 'var(--text-secondary)',
                      }}>
                      {sub === 'warehouse' ? '📦 Відділення' : sub === 'postomat' ? '🏧 Поштомат' : "🚚 Кур'єр"}
                    </button>
                  ))}
                </div>
                {novaSubtype && (
                  <NovaPoshtaSelect
                    mode={novaSubtype}
                    onCityChange={setNovaCityName}
                    onCityRefChange={setNovaCityRef}
                    onWarehouseRefChange={setNovaWarehouseRef}
                    onAddressChange={setAddress}
                  />
                )}
              </div>
            )}

            {delivery === 'kharkiv' && (
              <div>
                <label style={lbl}>Адреса доставки</label>
                <input value={address} onChange={e => setAddress(e.target.value)}
                  placeholder="Вулиця, будинок, квартира" style={sinp} />
              </div>
            )}

            {/* Comment */}
            <div>
              <label style={lbl}>Коментар</label>
              <textarea value={comment} onChange={e => setComment(e.target.value)}
                placeholder="Додаткові примітки..."
                style={{
                  width: '100%', padding: '8px 10px',
                  border: '1.5px solid var(--border)', borderRadius: '8px',
                  fontSize: '13px', outline: 'none', boxSizing: 'border-box',
                  resize: 'vertical', minHeight: '56px',
                  background: 'var(--bg-soft)', color: 'var(--text-primary)',
                }} />
              <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>
                ⛔ Мітка «не передзвонювати» додається автоматично для всіх ручних замовлень
              </div>
            </div>

            {error && (
              <div style={{ padding: '10px 14px', background: '#FEF2F2', borderRadius: '8px', color: '#DC2626', fontSize: '13px', display: 'flex', gap: '7px', alignItems: 'center' }}>
                <AlertCircle size={14} /> {error}
              </div>
            )}
          </div>

          {/* Footer */}
          <div style={{ padding: '12px 24px', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
            {/* Left: summary */}
            <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
              {createdOrderNumber
                ? <span style={{ color: '#059669', fontWeight: 700 }}>✅ №{createdOrderNumber}</span>
                : <>{filledLines} позицій · {fmt(total)} ₴</>}
              {customerId && <span style={{ marginLeft: '8px', color: '#3B82F6' }}>· 🔗 Прив'язаний</span>}
            </div>

            {/* Right: actions */}
            <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
              {/* Print — only after save */}
              {createdOrderId && (
                <a
                  href={`/admin?order=${createdOrderId}&print=1`}
                  target="_blank" rel="noopener noreferrer"
                  title="Роздрукувати замовлення"
                  style={{ height: '36px', padding: '0 12px', borderRadius: '8px', border: '1.5px solid var(--border)', background: 'var(--bg-soft)', color: 'var(--text-secondary)', fontSize: '12px', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', textDecoration: 'none' }}>
                  <Printer size={13} /> Друк
                </a>
              )}

              <button onClick={onClose} disabled={actionBusy}
                style={{ height: '36px', padding: '0 16px', borderRadius: '8px', border: '1.5px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text-secondary)', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}>
                {createdOrderId ? 'Закрити' : 'Скасувати'}
              </button>

              {/* Split button: Записати | ▼ */}
              <div ref={actionMenuRef} style={{ position: 'relative', display: 'flex' }}>
                <button
                  onClick={handleRecord}
                  disabled={actionBusy || !contact.trim()}
                  style={{
                    height: '36px', padding: '0 16px', border: 'none',
                    borderRadius: '8px 0 0 8px',
                    background: actionBusy || !contact.trim() ? '#94A3B8' : '#1E3A5F',
                    color: '#fff', fontSize: '13px', fontWeight: 700,
                    cursor: actionBusy ? 'wait' : !contact.trim() ? 'not-allowed' : 'pointer',
                    display: 'flex', alignItems: 'center', gap: '7px',
                  }}>
                  {actionBusy
                    ? <><Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} /> Збереження...</>
                    : `✅ Записати${total > 0 ? ` · ${fmt(total)} ₴` : ''}`}
                </button>
                <button
                  onClick={() => setActionMenu(v => !v)}
                  disabled={actionBusy || !contact.trim()}
                  title="Більше дій"
                  style={{
                    height: '36px', width: '32px', border: 'none',
                    borderRadius: '0 8px 8px 0',
                    borderLeft: '1px solid rgba(255,255,255,0.25)',
                    background: actionBusy || !contact.trim() ? '#94A3B8' : '#1E3A5F',
                    color: '#fff', cursor: actionBusy ? 'wait' : !contact.trim() ? 'not-allowed' : 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                  <ChevronDown size={14} />
                </button>

                {/* Action dropdown */}
                {actionMenu && (
                  <div style={{
                    position: 'absolute', bottom: 'calc(100% + 6px)', right: 0, zIndex: 100,
                    background: 'var(--bg-card)', border: '1px solid var(--border)',
                    borderRadius: '10px', boxShadow: '0 8px 28px rgba(0,0,0,0.18)',
                    minWidth: '240px', overflow: 'hidden',
                  }}>
                    {/* Reserve / confirm */}
                    <div style={{ padding: '6px 0', borderBottom: '1px solid var(--border-light)' }}>
                      <ActionBtn icon={<Warehouse size={14} />} label="Зарезервувати" sub="Зарезервувати зі свого складу" onClick={() => { setActionMenu(false); handleReserve(); }} />
                      <ActionBtn icon={<CheckSquare size={14} />} label="Провести — власний склад" sub="Резервування + підтвердження" onClick={() => { setActionMenu(false); handleConfirm('own'); }} />
                      <ActionBtn icon={<RefreshCw size={14} />} label="Провести — змішане" sub="Своє зарезервувати + ЗП на решту" onClick={() => { setActionMenu(false); handleConfirm('mixed'); }} />
                    </div>
                    {/* PO / dropship */}
                    <div style={{ padding: '6px 0' }}>
                      <ActionBtn icon={<Package size={14} />} label="Замовити у постачальника" sub="Перевірка залишків, вибір позицій" onClick={() => { setActionMenu(false); handleCreatePO(); }} />
                      <ActionBtn icon={<Send size={14} />} label="Відправити постачальнику" sub="Дропшип — надіслати лист" onClick={() => { setActionMenu(false); handleSendToSupplier(); }} />
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Name suggestions dropdown ──────────────────────────────────── */}
      {suggestionAnchor && (nameSuggestions[suggestionAnchor.idx]?.length ?? 0) > 0 && (() => {
        const dropW = 500;
        const left  = Math.min(suggestionAnchor.left, window.innerWidth - dropW - 12);
        return (
          <div style={{
            position: 'fixed', top: suggestionAnchor.top, left, width: dropW,
            zIndex: 9999, background: 'var(--bg-card)',
            border: '1px solid var(--border)', borderRadius: '8px',
            boxShadow: '0 8px 24px rgba(0,0,0,0.18)', maxHeight: '280px', overflowY: 'auto',
          }}>
            {nameSuggestions[suggestionAnchor.idx].map((s, i) => {
              const isActive = i === activeDropdownIdx;
              return (
                <div key={s.sku}
                  onMouseDown={() => selectNameSuggestion(suggestionAnchor.idx, s)}
                  onMouseEnter={() => setActiveDropdownIdx(i)}
                  style={{
                    padding: '8px 12px', cursor: 'pointer', fontSize: '13px',
                    borderBottom: '1px solid var(--border-light)',
                    display: 'flex', alignItems: 'baseline', gap: '8px',
                    whiteSpace: 'nowrap', overflow: 'hidden',
                    background: isActive ? '#EFF4FF' : 'transparent',
                    transition: 'background 0.1s',
                  }}>
                  <span style={{ color: isActive ? '#1E3A5F' : 'var(--text-muted)', fontSize: '11px', fontFamily: 'monospace', flexShrink: 0 }}>{s.sku}</span>
                  <span style={{ fontWeight: 700, color: '#1E3A5F', flexShrink: 0 }}>{s.brand}</span>
                  <span style={{ color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis' }}>{s.name}</span>
                </div>
              );
            })}
          </div>
        );
      })()}

      {/* ── Catalog picker ────────────────────────────────────────────── */}
      {showCatalog && (
        <ProductPickerModal
          zIndex={9999}
          onClose={() => setShowCatalog(false)}
          onAdd={items => { handleCatalogAdd(items); setShowCatalog(false); }}
        />
      )}

      {/* ── Customer picker modal ─────────────────────────────────────── */}
      {showPicker && (
        <div
          style={{ position: 'fixed', inset: 0, zIndex: 9998, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          onMouseDown={e => { if (e.target === e.currentTarget) setShowPicker(false); }}
        >
          <div style={{
            width: '520px', maxHeight: '580px', background: 'var(--bg-card)',
            borderRadius: '14px', boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
            display: 'flex', flexDirection: 'column', overflow: 'hidden',
          }}>
            {/* Header */}
            <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
              <div style={{ fontSize: '14px', fontWeight: 800, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Users size={16} color="#1E3A5F" /> Вибір контрагента
              </div>
              <button onClick={() => setShowPicker(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex', padding: '4px' }}>
                <X size={16} />
              </button>
            </div>

            {/* Search */}
            <div style={{ padding: '12px 20px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
              <div style={{ position: 'relative' }}>
                <Search size={13} color="#94A3B8" style={{ position: 'absolute', left: '9px', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} />
                <input
                  autoFocus
                  placeholder="Пошук за ім'ям, компанією, телефоном..."
                  value={pickerQuery}
                  onChange={e => handlePickerSearch(e.target.value)}
                  style={{ ...sinp, paddingLeft: '30px' }}
                />
              </div>
            </div>

            {/* List */}
            <div style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
              {pickerLoading ? (
                <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '13px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
                  <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> Завантаження...
                </div>
              ) : pickerList.length === 0 ? (
                <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '13px' }}>
                  Нічого не знайдено
                </div>
              ) : (
                pickerList.map((c, i) => {
                  const typeColor = c.type === 'wholesale' ? '#7C3AED' : c.type === 'dropship_partner' ? '#2563EB' : '#64748B';
                  const typeBg   = c.type === 'wholesale' ? '#F5F3FF' : c.type === 'dropship_partner' ? '#EFF6FF' : '#F8FAFC';
                  const typeLabel = c.type === 'wholesale' ? 'Опт' : c.type === 'dropship_partner' ? 'Дропшип' : 'Роздріб';
                  return (
                    <button
                      key={c.id}
                      onMouseDown={() => pickCustomer(c)}
                      style={{
                        width: '100%', padding: '11px 20px', background: 'none', border: 'none',
                        borderBottom: i < pickerList.length - 1 ? '1px solid var(--border-light)' : 'none',
                        cursor: 'pointer', textAlign: 'left', display: 'flex', alignItems: 'center', gap: '12px',
                      }}
                      onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-soft)')}
                      onMouseLeave={e => (e.currentTarget.style.background = 'none')}
                    >
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {c.name}
                          {c.company && <span style={{ fontWeight: 400, color: 'var(--text-muted)', marginLeft: '6px' }}>{c.company}</span>}
                        </div>
                        {(c.phone || c.city) && (
                          <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>
                            {[c.phone, c.city].filter(Boolean).join(' · ')}
                          </div>
                        )}
                      </div>
                      <span style={{ fontSize: '10px', fontWeight: 600, color: typeColor, background: typeBg, padding: '2px 7px', borderRadius: '4px', flexShrink: 0 }}>
                        {typeLabel}
                      </span>
                    </button>
                  );
                })
              )}
            </div>

            {!pickerLoading && pickerList.length > 0 && (
              <div style={{ padding: '8px 20px', borderTop: '1px solid var(--border)', fontSize: '11px', color: 'var(--text-muted)', flexShrink: 0 }}>
                {pickerList.length} контрагент(ів) · клікніть щоб вибрати
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── PO selection modal ────────────────────────────────────────── */}
      {poModal && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 9998, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          onMouseDown={e => { if (e.target === e.currentTarget) setPoModal(null); }}>
          <div style={{ width: '480px', background: 'var(--bg-card)', borderRadius: '14px', boxShadow: '0 20px 60px rgba(0,0,0,0.3)', overflow: 'hidden' }}>
            <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ fontSize: '14px', fontWeight: 800, color: 'var(--text-primary)', display: 'flex', gap: '8px', alignItems: 'center' }}>
                <Package size={16} color="#1E3A5F" /> Замовлення постачальнику
              </div>
              <button onClick={() => setPoModal(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex', padding: '4px' }}><X size={16} /></button>
            </div>
            <div style={{ padding: '16px 20px' }}>
              {poModal.hasOwn ? (
                <div style={{ marginBottom: '16px' }}>
                  <div style={{ display: 'flex', gap: '10px', marginBottom: '10px' }}>
                    <div style={{ flex: 1, padding: '10px 14px', background: '#F0FDF4', borderRadius: '8px', border: '1px solid #BBF7D0' }}>
                      <div style={{ fontSize: '11px', fontWeight: 700, color: '#15803D', textTransform: 'uppercase' }}>На складі</div>
                      <div style={{ fontSize: '22px', fontWeight: 800, color: '#15803D' }}>{poModal.allItems.length - poModal.missingItems.length}</div>
                      <div style={{ fontSize: '11px', color: '#16A34A' }}>позицій в наявності</div>
                    </div>
                    <div style={{ flex: 1, padding: '10px 14px', background: '#FEF2F2', borderRadius: '8px', border: '1px solid #FECACA' }}>
                      <div style={{ fontSize: '11px', fontWeight: 700, color: '#DC2626', textTransform: 'uppercase' }}>Відсутні</div>
                      <div style={{ fontSize: '22px', fontWeight: 800, color: '#DC2626' }}>{poModal.missingItems.length}</div>
                      <div style={{ fontSize: '11px', color: '#EF4444' }}>позицій потрібно замовити</div>
                    </div>
                  </div>
                  <div style={{ fontSize: '12px', color: 'var(--text-muted)', padding: '8px 12px', background: 'var(--bg-soft)', borderRadius: '8px', display: 'flex', gap: '6px', alignItems: 'flex-start' }}>
                    <Info size={13} style={{ flexShrink: 0, marginTop: '1px' }} />
                    Оберіть позиції для замовлення постачальнику:
                  </div>
                </div>
              ) : (
                <div style={{ marginBottom: '16px', padding: '12px 14px', background: '#FEF2F2', borderRadius: '8px', fontSize: '13px', color: '#DC2626' }}>
                  На власному складі нічого немає — замовимо весь асортимент
                </div>
              )}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {poModal.missingItems.length > 0 && (
                  <button
                    onClick={() => openPODraft(poModal.missingItems)}
                    style={{ padding: '12px 16px', background: '#1E3A5F', color: '#fff', border: 'none', borderRadius: '9px', fontSize: '13px', fontWeight: 700, cursor: 'pointer', textAlign: 'left' }}>
                    📋 Тільки відсутні ({poModal.missingItems.length} поз.) — мінімальне замовлення
                  </button>
                )}
                <button
                  onClick={() => openPODraft(poModal.allItems)}
                  style={{ padding: '12px 16px', background: poModal.missingItems.length > 0 ? 'var(--bg-soft)' : '#1E3A5F', color: poModal.missingItems.length > 0 ? 'var(--text-primary)' : '#fff', border: `1.5px solid ${poModal.missingItems.length > 0 ? 'var(--border)' : 'none'}`, borderRadius: '9px', fontSize: '13px', fontWeight: 700, cursor: 'pointer', textAlign: 'left' }}>
                  📦 Весь асортимент ({poModal.allItems.length} поз.)
                </button>
                <button onClick={() => setPoModal(null)} style={{ padding: '10px', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: '13px' }}>
                  Скасувати
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Supplier send modal ────────────────────────────────────────── */}
      {supplierModal && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 9998, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          onMouseDown={e => { if (e.target === e.currentTarget) setSupplierModal(null); }}>
          <div style={{ width: '420px', background: 'var(--bg-card)', borderRadius: '14px', boxShadow: '0 20px 60px rgba(0,0,0,0.3)', overflow: 'hidden' }}>
            <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ fontSize: '14px', fontWeight: 800, color: 'var(--text-primary)', display: 'flex', gap: '8px', alignItems: 'center' }}>
                <Send size={15} color="#1E3A5F" /> Відправити постачальнику
              </div>
              <button onClick={() => setSupplierModal(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex', padding: '4px' }}><X size={16} /></button>
            </div>
            <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div>
                <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '4px' }}>Постачальник</div>
                <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)' }}>{supplierModal.supplierName}</div>
              </div>
              <div>
                <label style={lbl}>Email</label>
                <input value={supplierModal.emailOverride} onChange={e => setSupplierModal(p => p ? { ...p, emailOverride: e.target.value } : null)} placeholder="email@supplier.com" style={sinp} />
              </div>
              <div>
                <label style={lbl}>Коментар (необов'язково)</label>
                <textarea value={supplierModal.comment} onChange={e => setSupplierModal(p => p ? { ...p, comment: e.target.value } : null)}
                  placeholder="Термінове, особливі умови..."
                  style={{ width: '100%', padding: '8px 10px', border: '1.5px solid var(--border)', borderRadius: '8px', fontSize: '13px', outline: 'none', resize: 'vertical', minHeight: '56px', background: 'var(--bg-soft)', color: 'var(--text-primary)', boxSizing: 'border-box' }} />
              </div>
              <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                <button onClick={() => setSupplierModal(null)} style={{ height: '38px', padding: '0 18px', borderRadius: '8px', border: '1.5px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text-secondary)', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}>
                  Скасувати
                </button>
                <button onClick={confirmSendToSupplier} disabled={supplierModal.sending || !supplierModal.emailOverride.trim()}
                  style={{ height: '38px', padding: '0 20px', borderRadius: '8px', border: 'none', background: '#1E3A5F', color: '#fff', fontSize: '13px', fontWeight: 700, cursor: supplierModal.sending ? 'wait' : 'pointer', display: 'flex', alignItems: 'center', gap: '7px', opacity: supplierModal.sending ? 0.7 : 1 }}>
                  {supplierModal.sending ? <><Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} /> Надсилаємо...</> : <><Send size={13} /> Надіслати</>}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Result modal ───────────────────────────────────────────────── */}
      {resultModal && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 9998, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ width: '440px', maxHeight: '520px', background: 'var(--bg-card)', borderRadius: '14px', boxShadow: '0 20px 60px rgba(0,0,0,0.3)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)' }}>
              <div style={{ fontSize: '15px', fontWeight: 800, color: 'var(--text-primary)' }}>{resultModal.title}</div>
              <div style={{ fontSize: '13px', color: 'var(--text-secondary)', marginTop: '4px' }}>{resultModal.message}</div>
            </div>
            {resultModal.insufficient && resultModal.insufficient.length > 0 && (
              <div style={{ flex: 1, overflowY: 'auto', padding: '12px 20px' }}>
                <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '8px' }}>Позиції з нестачею</div>
                <div style={{ border: '1px solid var(--border)', borderRadius: '8px', overflow: 'hidden' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 80px 80px', padding: '6px 12px', background: 'var(--bg-soft)', fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', gap: '8px' }}>
                    <span>Артикул</span><span style={{ textAlign: 'right' }}>Потрібно</span><span style={{ textAlign: 'right' }}>В наявності</span>
                  </div>
                  {resultModal.insufficient.map((item, i) => (
                    <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 80px 80px', padding: '7px 12px', borderTop: '1px solid var(--border-light)', fontSize: '12px', gap: '8px', alignItems: 'center' }}>
                      <span style={{ fontFamily: 'monospace', color: 'var(--text-primary)' }}>{item.sku}</span>
                      <span style={{ textAlign: 'right', fontWeight: 600 }}>{item.requested}</span>
                      <span style={{ textAlign: 'right', color: item.available === 0 ? '#DC2626' : '#F59E0B', fontWeight: 700 }}>{item.available}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            <div style={{ padding: '14px 20px', borderTop: '1px solid var(--border)', display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
              <button onClick={() => { setResultModal(null); onSubmitted(); router.push('/admin?status=new'); router.refresh(); }}
                style={{ height: '36px', padding: '0 16px', borderRadius: '8px', border: '1.5px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text-secondary)', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}>
                Закрити
              </button>
              <button onClick={() => { setResultModal(null); onSubmitted(); router.push('/admin?status=new'); router.refresh(); }}
                style={{ height: '36px', padding: '0 18px', borderRadius: '8px', border: 'none', background: '#1E3A5F', color: '#fff', fontSize: '13px', fontWeight: 700, cursor: 'pointer' }}>
                До списку замовлень
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        @keyframes spin { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }
        @keyframes order-panel-enter {
          0%   { opacity:0; transform:scale(0.96) translateY(10px); filter:blur(6px); }
          55%  { filter:blur(0); }
          100% { opacity:1; transform:scale(1) translateY(0); }
        }
        .order-panel-enter { animation: order-panel-enter 0.32s cubic-bezier(0.22,1,0.36,1); }
      `}</style>
    </>
  );
}
