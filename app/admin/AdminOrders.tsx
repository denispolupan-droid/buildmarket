'use client';

import { useState } from 'react';
import { MapPin, CreditCard, Phone, Building2, Package, Hash } from 'lucide-react';

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
  payment_type: string;
  comment: string | null;
  tracking_number: string | null;
  items: OrderItem[];
};

const STATUSES = [
  { value: 'new',       label: 'Нове',         color: '#1E3A5F', bg: '#EFF4FF' },
  { value: 'confirmed', label: 'Підтверджено',  color: '#15803D', bg: '#DCFCE7' },
  { value: 'shipped',   label: 'Відправлено',   color: '#B45309', bg: '#FEF3C7' },
  { value: 'delivered', label: 'Доставлено',    color: '#15803D', bg: '#DCFCE7' },
  { value: 'cancelled', label: 'Скасовано',     color: '#DC2626', bg: '#FEE2E2' },
];

const DELIVERY_LABEL: Record<string, string> = {
  nova: 'Нова Пошта', kharkiv: 'Харків і область', pickup: 'Самовивіз',
};
const PAYMENT_LABEL: Record<string, string> = {
  invoice: 'Безготівковий', cod: 'Оплата при отриманні',
};

const FILTER_TABS = [
  { value: '', label: 'Всі' },
  ...STATUSES,
];

export default function AdminOrders({ initialOrders }: { initialOrders: Order[] }) {
  const [orders, setOrders]     = useState<Order[]>(initialOrders);
  const [filter, setFilter]     = useState('');
  const [loading, setLoading]   = useState<string | null>(null);
  const [ttnValues, setTtnValues] = useState<Record<string, string>>(
    Object.fromEntries(initialOrders.map(o => [o.id, o.tracking_number ?? '']))
  );
  const [ttnSaving, setTtnSaving] = useState<string | null>(null);

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

  const filtered = filter ? orders.filter(o => o.status === filter) : orders;

  return (
    <>
      {/* Filter tabs */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '24px', flexWrap: 'wrap' }}>
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

            return (
              <div key={order.id} style={{
                background: '#fff', border: '1px solid #E2E8F0', borderRadius: '16px', overflow: 'hidden',
              }}>
                {/* Header */}
                <div style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '14px 20px', background: '#F8FAFC', borderBottom: '1px solid #F1F5F9',
                  flexWrap: 'wrap', gap: '8px',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <span style={{ fontSize: '15px', fontWeight: 800, color: '#0F172A' }}>#{short}</span>
                    <span style={{ fontSize: '12px', color: '#94A3B8' }}>{date}</span>
                    <span style={{
                      fontSize: '12px', fontWeight: 600, padding: '3px 10px', borderRadius: '20px',
                      color: status.color, background: status.bg,
                    }}>
                      {status.label}
                    </span>
                  </div>
                  <span style={{ fontSize: '16px', fontWeight: 800, color: '#1E3A5F' }}>
                    {order.total_price.toFixed(2)} грн
                  </span>
                </div>

                <div className="admin-order-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0' }}>
                  {/* Left: client + items */}
                  <div style={{ padding: '16px 20px', borderRight: '1px solid #F1F5F9' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '14px' }}>
                      {order.company && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', color: '#0F172A', fontWeight: 600 }}>
                          <Building2 size={13} color="#64748B" />
                          {order.company}
                        </div>
                      )}
                      <div style={{ fontSize: '13px', color: '#374151' }}>{order.contact}</div>
                      <a href={`tel:${order.phone}`} style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', color: '#1E3A5F', fontWeight: 600 }}>
                        <Phone size={13} />{order.phone}
                      </a>
                      <div style={{ fontSize: '12px', color: '#94A3B8' }}>{order.email}</div>
                    </div>

                    <div style={{ borderTop: '1px solid #F1F5F9', paddingTop: '12px', display: 'flex', flexDirection: 'column', gap: '5px' }}>
                      {order.items.map(item => (
                        <div key={item.sku} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px' }}>
                          <span style={{ color: '#374151' }}>
                            <span style={{ color: '#94A3B8', marginRight: '4px' }}>{item.brand}</span>{item.name}
                          </span>
                          <span style={{ color: '#64748B', flexShrink: 0, marginLeft: '12px' }}>
                            {item.qty} шт
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Right: delivery + status change */}
                  <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '16px' }}>
                      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '6px', fontSize: '13px', color: '#374151' }}>
                        <MapPin size={13} color="#64748B" style={{ flexShrink: 0, marginTop: '2px' }} />
                        <span>{delivery}{subtype}{order.delivery_address ? `: ${order.delivery_address}` : ''}</span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', color: '#374151' }}>
                        <CreditCard size={13} color="#64748B" />
                        {PAYMENT_LABEL[order.payment_type] ?? order.payment_type}
                      </div>
                      {order.comment && (
                        <div style={{ fontSize: '12px', color: '#64748B', fontStyle: 'italic', marginTop: '4px' }}>
                          «{order.comment}»
                        </div>
                      )}
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
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Status buttons */}
                    <div>
                      <div style={{ fontSize: '11px', fontWeight: 600, color: '#94A3B8', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
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
    </>
  );
}
