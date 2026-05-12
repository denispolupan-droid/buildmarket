'use client';

import { useState, useEffect, useRef } from 'react';
import { MapPin, CreditCard, Phone, Building2, Package, Hash, Truck, RefreshCw, Pencil, Trash2, Plus, X, Check, Merge, TrendingUp, ChevronDown, ChevronUp } from 'lucide-react';
import type { OrderFulfillmentInfo } from '../../lib/accounting/dropship';
import CreateTTNModal from '../components/admin/CreateTTNModal';
import { getSupabaseBrowser } from '../../lib/supabase-browser';

type OrderItem = { sku: string; name: string; brand: string; qty: number; price: number };

type Order = {
  id: string;
  order_number: number;
  created_at: string;
  status: string;
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
  payment_confirmed: boolean;
  callback_done: boolean;
  items: OrderItem[];
};

const STATUSES = [
  { value: 'pending_payment', label: 'Очікує оплати', color: '#B45309', bg: '#FEF3C7' },
  { value: 'new',             label: 'Нове',           color: '#1E3A5F', bg: '#EFF4FF' },
  { value: 'confirmed',       label: 'Підтверджено',   color: '#15803D', bg: '#DCFCE7' },
  { value: 'shipped',         label: 'Відправлено',    color: '#B45309', bg: '#FEF3C7' },
  { value: 'delivered',       label: 'Доставлено',     color: '#15803D', bg: '#DCFCE7' },
  { value: 'cancelled',       label: 'Скасовано',      color: '#DC2626', bg: '#FEE2E2' },
];

const DELIVERY_LABEL: Record<string, string> = {
  nova: 'Нова Пошта', kharkiv: 'Харків і область', pickup: 'Самовивіз',
};
const PAYMENT_LABEL: Record<string, string> = {
  invoice: 'Безготівковий', cod: 'Оплата при отриманні', card: '💳 Картка онлайн',
};

const FILTER_TABS = [
  { value: 'new',             label: 'Нові' },
  { value: 'pending_payment', label: 'Очікує оплати' },
  { value: 'confirmed',       label: 'Підтверджено' },
  { value: 'shipped',         label: 'Відправлено' },
  { value: 'delivered',       label: 'Доставлено' },
  { value: 'cancelled',       label: 'Скасовано' },
  { value: '',                label: 'Всі' },
];

export default function AdminOrders({ initialOrders, currentPage = 1, totalPages = 1 }: { initialOrders: Order[]; currentPage?: number; totalPages?: number }) {
  const [orders, setOrders]     = useState<Order[]>(initialOrders);
  const [filter, setFilter]     = useState('');
  const [loading, setLoading]   = useState<string | null>(null);
  const [ttnValues, setTtnValues] = useState<Record<string, string>>(
    Object.fromEntries(initialOrders.map(o => [o.id, o.tracking_number ?? '']))
  );
  const [ttnSaving,      setTtnSaving]      = useState<string | null>(null);
  const [ttnModalOrder,  setTtnModalOrder]  = useState<Order | null>(null);
  const [syncing,        setSyncing]        = useState(false);
  const [syncResult,     setSyncResult]     = useState<{ updated: number; checked: number } | null>(null);

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

  // Fulfillment / margin info
  const [fulfillmentData,    setFulfillmentData]    = useState<Record<string, OrderFulfillmentInfo>>({});
  const [fulfillmentOpen,    setFulfillmentOpen]    = useState<Set<string>>(new Set());
  const [fulfillmentLoading, setFulfillmentLoading] = useState<Set<string>>(new Set());

  async function toggleFulfillment(orderId: string) {
    if (fulfillmentOpen.has(orderId)) {
      setFulfillmentOpen(prev => { const s = new Set(prev); s.delete(orderId); return s; });
      return;
    }
    setFulfillmentOpen(prev => new Set([...prev, orderId]));
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

  // Merge orders
  const [selectedIds,    setSelectedIds]    = useState<Set<string>>(new Set());
  const [mergeModal,     setMergeModal]     = useState<Parameters<typeof CreateTTNModal>[0]['order'] | null>(null);

  const SYNC_KEY = 'lastDeliverySync';
  const SYNC_INTERVAL_MS = 4 * 60 * 60 * 1000; // 4 години

  async function syncDeliveryStatus() {
    setSyncing(true);
    setSyncResult(null);
    try {
      const res = await fetch('/api/admin/sync-delivery-status', { method: 'POST' });
      const data = await res.json();
      setSyncResult(data);
      if (data.updated > 0) {
        setOrders(prev => prev.map(o =>
          data.updatedIds?.includes(o.id) ? { ...o, status: 'delivered' } : o
        ));
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

  async function changeStatus(id: string, status: string) {
    setLoading(id + status);
    const res = await fetch(`/api/admin/orders/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    });
    if (res.ok) {
      setOrders(prev => prev.map(o => o.id === id ? { ...o, status } : o));
    }
    setLoading(null);
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
    });
  }

  async function toggleFlag(id: string, field: 'payment_confirmed' | 'callback_done', value: boolean) {
    await fetch(`/api/admin/orders/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ [field]: value }),
    });
    setOrders(prev => prev.map(o => o.id === id ? { ...o, [field]: value } : o));
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
    }
    setTtnSaving(null);
  }

  const filtered = filter
    ? orders.filter(o => o.status === filter)
    : orders.filter(o => o.status !== 'pending_payment');

  return (
    <>
      {/* Merge bar */}
      {selectedIds.size >= 2 && (
        <div style={{
          position: 'sticky', top: '52px', zIndex: 50,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '12px 20px', marginBottom: '16px',
          background: '#1E3A5F', borderRadius: '12px',
          boxShadow: '0 4px 20px rgba(30,58,95,0.35)',
        }}>
          <span style={{ fontSize: '14px', fontWeight: 600, color: '#fff' }}>
            Вибрано замовлень: {selectedIds.size} · Сума: {orders.filter(o => selectedIds.has(o.id)).reduce((s, o) => s + o.total_price, 0).toFixed(2)} грн
          </span>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button onClick={() => setSelectedIds(new Set())} style={{
              height: '34px', padding: '0 14px', borderRadius: '8px',
              border: '1px solid rgba(255,255,255,0.2)', background: 'transparent',
              color: '#fff', fontSize: '13px', cursor: 'pointer',
            }}>Скасувати</button>
            <button onClick={openMergeModal} style={{
              height: '34px', padding: '0 16px', borderRadius: '8px',
              border: 'none', background: '#fff', color: '#1E3A5F',
              fontSize: '13px', fontWeight: 700, cursor: 'pointer',
              display: 'flex', alignItems: 'center', gap: '6px',
            }}>
              <Truck size={14} /> Об'єднати в ТТН
            </button>
          </div>
        </div>
      )}

      {/* Filter tabs + sync button */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', gap: '12px', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
        {FILTER_TABS.map(tab => (
          <button
            key={tab.value}
            onClick={() => setFilter(tab.value)}
            style={{
              height: '34px', padding: '0 16px', borderRadius: '8px', fontSize: '13px', fontWeight: 600,
              border: `1.5px solid ${filter === tab.value ? '#1E3A5F' : '#E2E8F0'}`,
              background: filter === tab.value ? '#1E3A5F' : '#fff',
              color: filter === tab.value ? '#fff' : '#475569',
              cursor: 'pointer', transition: 'all 0.15s',
            }}
          >
            {tab.label}
            <span style={{
              marginLeft: '6px', fontSize: '11px', opacity: 0.7,
            }}>
              {tab.value ? orders.filter(o => o.status === tab.value).length : orders.length}
            </span>
          </button>
        ))}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexShrink: 0 }}>
          {syncResult && (
            <span style={{ fontSize: '12px', color: syncResult.updated > 0 ? '#15803D' : '#64748B' }}>
              {syncResult.updated > 0
                ? `✓ Оновлено: ${syncResult.updated} з ${syncResult.checked}`
                : `Перевірено: ${syncResult.checked}, змін немає`}
            </span>
          )}
          <button
            onClick={syncDeliveryStatus}
            disabled={syncing}
            title="Синхронізувати статуси доставки НП"
            style={{
              display: 'inline-flex', alignItems: 'center', gap: '6px',
              height: '34px', padding: '0 14px', borderRadius: '8px',
              border: '1.5px solid #E2E8F0', background: '#fff',
              fontSize: '13px', fontWeight: 600, color: '#475569',
              cursor: syncing ? 'wait' : 'pointer',
              opacity: syncing ? 0.6 : 1,
            }}
          >
            <RefreshCw size={13} style={{ animation: syncing ? 'spin 1s linear infinite' : 'none' }} />
            {syncing ? 'Синхронізую...' : 'Синхронізувати НП'}
          </button>
        </div>
      </div>

      {filtered.length === 0 ? (
        <div style={{
          background: '#fff', border: '1px solid #E2E8F0', borderRadius: '14px',
          padding: '48px', textAlign: 'center', color: '#94A3B8',
        }}>
          <Package size={36} strokeWidth={1} style={{ marginBottom: '10px' }} />
          <p>Замовлень немає</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {filtered.map(order => {
            const status = STATUSES.find(s => s.value === order.status) ?? STATUSES[0];
            const short = order.order_number;
            const date = new Date(order.created_at).toLocaleDateString('uk-UA', {
              day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
            });
            const delivery = DELIVERY_LABEL[order.delivery_type] ?? order.delivery_type;
            const subtype = order.delivery_subtype === 'courier' ? ' — кур\'єр' : order.delivery_subtype === 'warehouse' ? ' — відділення' : '';
            const isCod = order.payment_type === 'cod';
            const paymentConfirmed = order.payment_confirmed ?? false;
            const noCallback = order.comment?.includes('Не передзвонювати') ?? false;
            const callbackDone = order.callback_done ?? false;

            return (
              <div key={order.id} className="admin-order-card" style={{
                background: '#fff', border: '1px solid #E2E8F0', borderRadius: '16px', overflow: 'hidden',
              }}>
                {/* Header */}
                <div className="admin-order-header" style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '14px 20px', background: '#F8FAFC', borderBottom: '1px solid #F1F5F9',
                  flexWrap: 'wrap', gap: '8px',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    {/* Checkbox for merge */}
                    <div
                      onClick={() => toggleSelect(order.id)}
                      style={{
                        width: '18px', height: '18px', borderRadius: '5px', flexShrink: 0, cursor: 'pointer',
                        border: `2px solid ${selectedIds.has(order.id) ? '#1E3A5F' : '#CBD5E1'}`,
                        background: selectedIds.has(order.id) ? '#1E3A5F' : '#fff',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                      }}
                    >
                      {selectedIds.has(order.id) && <Check size={11} color="#fff" strokeWidth={3} />}
                    </div>
                    <span style={{ fontSize: '15px', fontWeight: 800, color: '#0F172A' }}>#{short}</span>
                    <span style={{ fontSize: '12px', color: '#94A3B8' }}>{date}</span>
                    <span style={{
                      fontSize: '12px', fontWeight: 600, padding: '3px 10px', borderRadius: '20px',
                      color: status.color, background: status.bg,
                    }}>
                      {status.label}
                    </span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <span style={{ fontSize: '16px', fontWeight: 800, color: '#1E3A5F' }}>
                      {order.total_price.toFixed(2)} грн
                    </span>
                    <button
                      onClick={() => editingId === order.id ? setEditingId(null) : startEdit(order)}
                      style={{
                        height: '28px', padding: '0 10px', borderRadius: '7px', fontSize: '12px', fontWeight: 600,
                        border: `1.5px solid ${editingId === order.id ? '#EF4444' : '#E2E8F0'}`,
                        background: editingId === order.id ? '#FEF2F2' : '#fff',
                        color: editingId === order.id ? '#EF4444' : '#475569',
                        cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px',
                      }}
                    >
                      {editingId === order.id ? <><X size={11} /> Скасувати</> : <><Pencil size={11} /> Редагувати</>}
                    </button>
                  </div>
                </div>

                <div className="admin-order-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0' }}>
                  {/* Left: client + items */}
                  <div className="admin-order-col" style={{ padding: '16px 20px', borderRight: '1px solid #F1F5F9' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '14px' }}>
                      {order.company && (
                        <div className="admin-text-primary" style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', color: '#0F172A', fontWeight: 600 }}>
                          <Building2 size={13} color="#64748B" />
                          {order.company}
                        </div>
                      )}
                      <div className="admin-text-primary" style={{ fontSize: '13px', color: '#374151' }}>{order.contact}</div>
                      <a href={`tel:${order.phone}`} style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', color: '#1E3A5F', fontWeight: 600 }}>
                        <Phone size={13} />{order.phone}
                      </a>
                      <div className="admin-text-muted" style={{ fontSize: '12px', color: '#94A3B8' }}>{order.email}</div>
                    </div>

                    <div className="admin-border-top" style={{ borderTop: '1px solid #F1F5F9', paddingTop: '12px' }}>
                    {editingId === order.id ? (
                      /* ── Edit mode ── */
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                        {editItems.map((item, idx) => (
                          <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px' }}>
                            <span style={{ flex: 1, color: '#374151', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              <span style={{ color: '#94A3B8', marginRight: '4px' }}>{item.brand}</span>{item.name}
                            </span>
                            <input
                              type="number" min={1} value={item.qty}
                              onChange={e => setEditItems(prev => prev.map((it, i) => i === idx ? { ...it, qty: Math.max(1, parseInt(e.target.value) || 1) } : it))}
                              style={{ width: '46px', height: '26px', border: '1px solid #E2E8F0', borderRadius: '6px', textAlign: 'center', fontSize: '12px', outline: 'none' }}
                            />
                            <span style={{ color: '#64748B', width: '70px', textAlign: 'right', flexShrink: 0 }}>
                              {(item.price * item.qty).toFixed(0)} грн
                            </span>
                            <button onClick={() => setEditItems(prev => prev.filter((_, i) => i !== idx))}
                              style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#EF4444', padding: '2px', flexShrink: 0, display: 'flex' }}>
                              <Trash2 size={12} />
                            </button>
                          </div>
                        ))}

                        {/* Add item */}
                        <div style={{ borderTop: '1px solid #F1F5F9', paddingTop: '8px', marginTop: '4px' }}>
                          <div style={{ fontSize: '11px', fontWeight: 600, color: '#94A3B8', marginBottom: '6px', textTransform: 'uppercase' }}>Додати товар</div>
                          <div ref={prodRef} style={{ position: 'relative', marginBottom: '6px' }}>
                            <input
                              placeholder="Пошук за назвою або SKU..."
                              value={prodSearch}
                              onChange={e => setProdSearch(e.target.value)}
                              onFocus={() => prodResults.length > 0 && setProdOpen(true)}
                              style={{ width: '100%', height: '28px', padding: '0 8px', border: '1px solid #E2E8F0', borderRadius: '6px', fontSize: '12px', outline: 'none', boxSizing: 'border-box' }}
                            />
                            {prodOpen && prodResults.length > 0 && (
                              <div style={{ position: 'absolute', top: 'calc(100% + 2px)', left: 0, right: 0, zIndex: 50, background: '#fff', border: '1px solid #E2E8F0', borderRadius: '8px', boxShadow: '0 4px 16px rgba(0,0,0,0.1)', maxHeight: '160px', overflowY: 'auto' }}>
                                {prodResults.map(p => (
                                  <button key={p.sku} onMouseDown={() => {
                                    setAddSku(p.sku); setAddName(`${p.brand} ${p.name}`); setAddPrice(String(p.price));
                                    setProdSearch(`${p.brand} ${p.name}`); setProdOpen(false);
                                  }} style={{ width: '100%', padding: '6px 10px', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left', fontSize: '12px', borderBottom: '1px solid #F8FAFC' }}>
                                    <span style={{ color: '#94A3B8', marginRight: '4px' }}>{p.sku}</span>{p.brand} {p.name}
                                    {p.price > 0 && <span style={{ color: '#1E3A5F', marginLeft: '6px', fontWeight: 600 }}>{p.price} грн</span>}
                                  </button>
                                ))}
                              </div>
                            )}
                          </div>
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 50px 70px auto', gap: '4px', alignItems: 'center' }}>
                            <input placeholder="Назва товару" value={addName} onChange={e => setAddName(e.target.value)}
                              style={{ height: '28px', padding: '0 8px', border: '1px solid #E2E8F0', borderRadius: '6px', fontSize: '12px', outline: 'none' }} />
                            <input placeholder="К-сть" type="number" min={1} value={addQty} onChange={e => setAddQty(parseInt(e.target.value) || 1)}
                              style={{ height: '28px', padding: '0 6px', border: '1px solid #E2E8F0', borderRadius: '6px', fontSize: '12px', textAlign: 'center', outline: 'none' }} />
                            <input placeholder="Ціна" type="number" min={0} value={addPrice} onChange={e => setAddPrice(e.target.value)}
                              style={{ height: '28px', padding: '0 6px', border: '1px solid #E2E8F0', borderRadius: '6px', fontSize: '12px', outline: 'none' }} />
                            <button onClick={addItem} style={{ height: '28px', width: '28px', borderRadius: '6px', border: 'none', background: '#1E3A5F', color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                              <Plus size={13} />
                            </button>
                          </div>
                        </div>

                        {/* Save / total */}
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '8px', paddingTop: '8px', borderTop: '1px solid #F1F5F9' }}>
                          <span style={{ fontSize: '13px', fontWeight: 700, color: '#1E3A5F' }}>
                            Разом: {editItems.reduce((s, i) => s + i.price * i.qty, 0).toFixed(2)} грн
                          </span>
                          <button onClick={() => saveEdit(order.id)} disabled={editSaving}
                            style={{ height: '30px', padding: '0 14px', borderRadius: '7px', border: 'none', background: '#1E3A5F', color: '#fff', fontSize: '12px', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '5px', opacity: editSaving ? 0.6 : 1 }}>
                            {editSaving ? '...' : <><Check size={12} /> Зберегти</>}
                          </button>
                        </div>
                      </div>
                    ) : (
                      /* ── Normal mode ── */
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                        {order.items.map(item => (
                          <div key={item.sku} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px' }}>
                            <span className="admin-text-primary" style={{ color: '#374151' }}>
                              <span className="admin-text-muted" style={{ color: '#94A3B8', marginRight: '4px' }}>{item.brand}</span>{item.name}
                            </span>
                            <span className="admin-text-secondary" style={{ color: '#64748B', flexShrink: 0, marginLeft: '12px' }}>
                              {item.qty} шт
                            </span>
                          </div>
                        ))}

                        {/* Fulfillment toggle */}
                        <button
                          onClick={() => toggleFulfillment(order.id)}
                          style={{
                            marginTop: '8px', display: 'flex', alignItems: 'center', gap: '5px',
                            background: 'none', border: 'none', cursor: 'pointer', padding: '0',
                            fontSize: '12px', fontWeight: 600,
                            color: fulfillmentOpen.has(order.id) ? '#1E3A5F' : '#64748B',
                          }}
                        >
                          <TrendingUp size={12} />
                          {fulfillmentLoading.has(order.id)
                            ? 'Завантаження...'
                            : fulfillmentOpen.has(order.id)
                              ? <><ChevronUp size={12} /> Сховати поставщика</>
                              : <><ChevronDown size={12} /> Поставщик та маржа</>
                          }
                        </button>

                        {/* Fulfillment panel */}
                        {fulfillmentOpen.has(order.id) && fulfillmentData[order.id] && (() => {
                          const fi = fulfillmentData[order.id];
                          const marginColor = fi.total_margin >= 0 ? '#15803D' : '#DC2626';
                          const marginBg    = fi.total_margin >= 0 ? '#F0FDF4' : '#FEF2F2';
                          return (
                            <div style={{
                              marginTop: '8px', borderRadius: '10px', overflow: 'hidden',
                              border: '1px solid #E2E8F0', fontSize: '12px',
                            }}>
                              {/* Summary bar */}
                              <div style={{
                                display: 'flex', gap: '12px', padding: '8px 12px',
                                background: marginBg, borderBottom: '1px solid #E2E8F0',
                                flexWrap: 'wrap',
                              }}>
                                <span style={{ fontWeight: 700, color: marginColor }}>
                                  Маржа: {fi.total_margin.toFixed(0)} грн ({fi.margin_pct}%)
                                </span>
                                <span style={{ color: '#64748B' }}>
                                  Виручка: {fi.total_revenue.toFixed(0)} грн
                                </span>
                                <span style={{ color: '#64748B' }}>
                                  Собів.: {fi.total_cost.toFixed(0)} грн
                                </span>
                              </div>

                              {/* Per-supplier breakdown */}
                              {fi.by_supplier.map((group, gi) => (
                                <div key={gi} style={{ borderBottom: gi < fi.by_supplier.length - 1 ? '1px solid #F1F5F9' : 'none' }}>
                                  <div style={{
                                    padding: '6px 12px', background: '#F8FAFC',
                                    fontWeight: 600, color: '#374151', fontSize: '11px',
                                    display: 'flex', justifyContent: 'space-between',
                                  }}>
                                    <span>📦 {group.supplier_name ?? 'Невідомий поставщик'}</span>
                                    <span style={{ color: '#94A3B8' }}>
                                      +{group.total_margin.toFixed(0)} грн
                                    </span>
                                  </div>
                                  {group.items.map((item, ii) => (
                                    <div key={ii} style={{
                                      display: 'grid',
                                      gridTemplateColumns: 'auto 1fr auto auto auto',
                                      gap: '8px', padding: '5px 12px',
                                      alignItems: 'center',
                                      borderTop: '1px solid #F8FAFC',
                                    }}>
                                      <span style={{ color: '#94A3B8', fontFamily: 'monospace', fontSize: '11px' }}>
                                        {item.supplier_sku ?? item.sku}
                                      </span>
                                      <span style={{ color: '#374151', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                        {item.name}
                                      </span>
                                      <span style={{ color: '#64748B', whiteSpace: 'nowrap' }}>
                                        {item.qty} шт
                                      </span>
                                      <span style={{ color: '#64748B', whiteSpace: 'nowrap' }}>
                                        {item.cost_price.toFixed(0)} → {item.sale_price.toFixed(0)} грн
                                      </span>
                                      <span style={{
                                        whiteSpace: 'nowrap', fontWeight: 600,
                                        color: item.margin >= 0 ? '#15803D' : '#DC2626',
                                      }}>
                                        +{item.margin.toFixed(0)} грн
                                      </span>
                                    </div>
                                  ))}
                                </div>
                              ))}
                            </div>
                          );
                        })()}
                      </div>
                    )}
                    </div>
                  </div>

                  {/* Right: delivery + status change */}
                  <div className="admin-order-col" style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '16px' }}>
                      <div className="admin-text-primary" style={{ display: 'flex', alignItems: 'flex-start', gap: '6px', fontSize: '13px', color: '#374151' }}>
                        <MapPin size={13} color="#64748B" style={{ flexShrink: 0, marginTop: '2px' }} />
                        <span>
                          {delivery}{subtype}
                          {order.delivery_city_name && <strong> · {order.delivery_city_name}</strong>}
                          {order.delivery_address && ` · ${order.delivery_address}`}
                        </span>
                      </div>
                      {/* Payment badge */}
                      {isCod ? (
                        <div style={{
                          display: 'inline-flex', alignItems: 'center', gap: '6px',
                          padding: '5px 10px', borderRadius: '8px', fontSize: '12px', fontWeight: 600,
                          background: '#DCFCE7', color: '#15803D', border: '1px solid #86EFAC',
                        }}>
                          <CreditCard size={12} /> Накладений платіж
                        </div>
                      ) : order.payment_type === 'card' ? (
                        <div style={{
                          display: 'inline-flex', alignItems: 'center', gap: '6px',
                          padding: '5px 10px', borderRadius: '8px', fontSize: '12px', fontWeight: 600,
                          background: order.status === 'confirmed' ? '#DCFCE7' : '#EFF6FF',
                          color: order.status === 'confirmed' ? '#15803D' : '#1E3A5F',
                          border: `1px solid ${order.status === 'confirmed' ? '#86EFAC' : '#BFDBFE'}`,
                        }}>
                          <CreditCard size={12} />
                          {order.status === 'confirmed' ? '💳 Оплата карткою — підтверджено' : '💳 Картка онлайн'}
                        </div>
                      ) : (
                        <div>
                          <div style={{
                            display: 'inline-flex', alignItems: 'center', gap: '6px',
                            padding: '5px 10px', borderRadius: '8px', fontSize: '12px', fontWeight: 600,
                            background: paymentConfirmed ? '#DCFCE7' : '#FEF3C7',
                            color: paymentConfirmed ? '#15803D' : '#B45309',
                            border: `1px solid ${paymentConfirmed ? '#86EFAC' : '#FCD34D'}`,
                          }}>
                            <CreditCard size={12} />
                            {paymentConfirmed ? '✓ Оплата за рахунком підтверджена' : '⏳ Очікуємо оплату за рахунком'}
                          </div>
                          <label style={{ display: 'flex', alignItems: 'center', gap: '7px', marginTop: '6px', cursor: 'pointer' }}
                            onClick={() => toggleFlag(order.id, 'payment_confirmed', !paymentConfirmed)}>
                            <div style={{
                              width: '16px', height: '16px', borderRadius: '4px', flexShrink: 0,
                              border: `2px solid ${paymentConfirmed ? '#15803D' : '#D97706'}`,
                              background: paymentConfirmed ? '#15803D' : '#fff',
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                            }}>
                              {paymentConfirmed && <svg width="9" height="7" viewBox="0 0 9 7" fill="none"><path d="M1 3.5L3.5 6L8 1" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>}
                            </div>
                            <span style={{ fontSize: '12px', color: '#475569' }}>Оплату отримано</span>
                          </label>
                        </div>
                      )}

                      {/* Callback badge */}
                      {noCallback ? (
                        <div style={{
                          display: 'inline-flex', alignItems: 'center', gap: '6px',
                          padding: '5px 10px', borderRadius: '8px', fontSize: '12px', fontWeight: 600,
                          background: '#DCFCE7', color: '#15803D', border: '1px solid #86EFAC',
                        }}>
                          ✓ Без дзвінка
                        </div>
                      ) : (
                        <div>
                          <div style={{
                            display: 'inline-flex', alignItems: 'center', gap: '6px',
                            padding: '5px 10px', borderRadius: '8px', fontSize: '12px', fontWeight: 600,
                            background: callbackDone ? '#DCFCE7' : '#FEF3C7',
                            color: callbackDone ? '#15803D' : '#B45309',
                            border: `1px solid ${callbackDone ? '#86EFAC' : '#FCD34D'}`,
                          }}>
                            {callbackDone ? '✓ Зателефонували' : '☎ Потрібен дзвінок'}
                          </div>
                          <label style={{ display: 'flex', alignItems: 'center', gap: '7px', marginTop: '6px', cursor: 'pointer' }}
                            onClick={() => toggleFlag(order.id, 'callback_done', !callbackDone)}>
                            <div style={{
                              width: '16px', height: '16px', borderRadius: '4px', flexShrink: 0,
                              border: `2px solid ${callbackDone ? '#15803D' : '#D97706'}`,
                              background: callbackDone ? '#15803D' : '#fff',
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                            }}>
                              {callbackDone && <svg width="9" height="7" viewBox="0 0 9 7" fill="none"><path d="M1 3.5L3.5 6L8 1" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>}
                            </div>
                            <span style={{ fontSize: '12px', color: '#475569' }}>Зателефонували</span>
                          </label>
                        </div>
                      )}

                      {(() => {
                        const displayComment = order.comment
                          ?.split('\n')
                          .filter(line => !line.includes('Не передзвонювати'))
                          .join('\n')
                          .trim();
                        return displayComment ? (
                          <div style={{ fontSize: '12px', color: '#64748B', fontStyle: 'italic', marginTop: '4px' }}>
                            «{displayComment}»
                          </div>
                        ) : null;
                      })()}
                      {order.delivery_type === 'nova' && (
                        <div style={{ marginTop: '10px' }}>
                          <div style={{ fontSize: '11px', fontWeight: 600, color: '#94A3B8', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                            ТТН Нової Пошти
                          </div>
                          <div style={{ display: 'flex', gap: '6px' }}>
                            <div style={{ position: 'relative', flex: 1 }}>
                              <Hash size={12} color="#94A3B8" style={{ position: 'absolute', left: '8px', top: '50%', transform: 'translateY(-50%)' }} />
                              <input
                                type="text"
                                value={ttnValues[order.id] ?? ''}
                                onChange={e => setTtnValues(prev => ({ ...prev, [order.id]: e.target.value }))}
                                placeholder="59000000000000"
                                style={{
                                  width: '100%', height: '32px', paddingLeft: '26px', paddingRight: '8px',
                                  border: '1px solid #E2E8F0', borderRadius: '7px',
                                  fontSize: '12px', outline: 'none', boxSizing: 'border-box',
                                }}
                              />
                            </div>
                            <button
                              onClick={() => saveTTN(order.id)}
                              disabled={ttnSaving === order.id}
                              style={{
                                height: '32px', padding: '0 12px', borderRadius: '7px',
                                background: '#1E3A5F', color: '#fff', border: 'none',
                                fontSize: '12px', fontWeight: 600, cursor: 'pointer',
                                opacity: ttnSaving === order.id ? 0.5 : 1,
                              }}
                            >
                              {ttnSaving === order.id ? '...' : 'Зберегти'}
                            </button>
                            {order.delivery_subtype === 'warehouse' && (
                              <button
                                onClick={() => setTtnModalOrder(order)}
                                title="Створити ТТН через API Нової Пошти"
                                style={{
                                  height: '32px', width: '32px', borderRadius: '7px', flexShrink: 0,
                                  background: '#EFF4FF', color: '#1E3A5F', border: '1.5px solid #C7D7F5',
                                  cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                                }}
                              >
                                <Truck size={14} />
                              </button>
                            )}
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Status buttons */}
                    <div>
                      <div className="admin-text-muted" style={{ fontSize: '11px', fontWeight: 600, color: '#94A3B8', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                        Змінити статус
                      </div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                        {STATUSES.filter(s => s.value !== order.status).map(s => (
                          <button
                            key={s.value}
                            onClick={() => changeStatus(order.id, s.value)}
                            disabled={loading === order.id + s.value}
                            style={{
                              fontSize: '12px', fontWeight: 600, padding: '4px 10px', borderRadius: '6px',
                              border: `1.5px solid ${s.color}20`, color: s.color, background: s.bg,
                              cursor: 'pointer', opacity: loading === order.id + s.value ? 0.5 : 1,
                              transition: 'opacity 0.15s',
                            }}
                          >
                            {s.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
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
              border: '1.5px solid #E2E8F0', background: '#fff', color: '#475569', fontSize: '13px', fontWeight: 600, textDecoration: 'none',
            }}>← Попередня</a>
          )}
          {Array.from({ length: totalPages }, (_, i) => i + 1)
            .filter(p => Math.abs(p - currentPage) <= 2)
            .map(p => (
              <a key={p} href={`?page=${p}`} style={{
                height: '36px', width: '36px', borderRadius: '8px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                border: `1.5px solid ${p === currentPage ? '#1E3A5F' : '#E2E8F0'}`,
                background: p === currentPage ? '#1E3A5F' : '#fff',
                color: p === currentPage ? '#fff' : '#475569', fontSize: '13px', fontWeight: 600, textDecoration: 'none',
              }}>{p}</a>
            ))}
          {currentPage < totalPages && (
            <a href={`?page=${currentPage + 1}`} style={{
              height: '36px', padding: '0 16px', borderRadius: '8px', display: 'inline-flex', alignItems: 'center',
              border: '1.5px solid #E2E8F0', background: '#fff', color: '#475569', fontSize: '13px', fontWeight: 600, textDecoration: 'none',
            }}>Наступна →</a>
          )}
        </div>
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
          }}
          onClose={() => setTtnModalOrder(null)}
          onCreated={ttn => {
            setTtnValues(prev => ({ ...prev, [ttnModalOrder.id]: ttn }));
            setOrders(prev => prev.map(o =>
              o.id === ttnModalOrder.id ? { ...o, tracking_number: ttn, status: 'shipped' } : o
            ));
            setTtnModalOrder(null);
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
              ids.includes(o.id) ? { ...o, tracking_number: ttn, status: 'shipped' } : o
            ));
            ids.forEach(id => setTtnValues(prev => ({ ...prev, [id]: ttn })));
            setSelectedIds(new Set());
            setMergeModal(null);
          }}
        />
      )}
    </>
  );
}
