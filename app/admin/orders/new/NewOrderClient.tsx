'use client';

import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { getSupabaseBrowser } from '../../../../lib/supabase-browser';
import { Plus, Trash2, Search, ChevronLeft } from 'lucide-react';
import Link from 'next/link';
import NovaPoshtaSelect from '../../../components/NovaPoshtaSelect';

type Item = { sku: string; name: string; brand: string; qty: number; price: number };

const CHANNEL_OPTIONS = [
  { value: 'retail',  label: 'Магазин / самовивіз' },
  { value: 'phone',   label: 'Телефон' },
  { value: 'b2b',     label: 'Оптовий' },
];

const PAYMENT_OPTIONS = [
  { value: 'cash',    label: 'Готівка' },
  { value: 'cod',     label: 'Накладений платіж' },
  { value: 'invoice', label: 'Безготівковий (рахунок)' },
];

const DELIVERY_OPTIONS = [
  { value: 'pickup',  label: 'Самовивіз' },
  { value: 'nova',    label: 'Нова Пошта' },
  { value: 'kharkiv', label: 'Доставка по місту' },
];

export default function NewOrderClient() {
  const router = useRouter();

  const [contact,           setContact]           = useState('');
  const [phone,             setPhone]             = useState('');
  const [email,             setEmail]             = useState('');
  const [company,           setCompany]           = useState('');
  const [delivery,          setDelivery]          = useState('pickup');
  const [novaSubtype,       setNovaSubtype]       = useState<'warehouse' | 'courier' | ''>('');
  const [novaCityRef,       setNovaCityRef]       = useState('');
  const [novaCityName,      setNovaCityName]      = useState('');
  const [novaWarehouseRef,  setNovaWarehouseRef]  = useState('');
  const [address,           setAddress]           = useState('');
  const [payment,           setPayment]           = useState('cash');
  const [channelCode,       setChannelCode]       = useState('retail');
  const [comment,           setComment]           = useState('');
  const [items,             setItems]             = useState<Item[]>([]);
  const [submitting,        setSubmitting]        = useState(false);
  const [error,             setError]             = useState('');

  const [prodSearch,   setProdSearch]   = useState('');
  const [prodResults,  setProdResults]  = useState<{ sku: string; name: string; brand: string; price: number }[]>([]);
  const [prodOpen,     setProdOpen]     = useState(false);
  const prodRef = useRef<HTMLDivElement>(null);
  const [addQty,       setAddQty]       = useState(1);
  const [addPrice,     setAddPrice]     = useState('');
  const [selectedProd, setSelectedProd] = useState<{ sku: string; name: string; brand: string } | null>(null);

  // Reset NP fields when delivery type changes
  useEffect(() => {
    setNovaSubtype('');
    setNovaCityRef('');
    setNovaCityName('');
    setNovaWarehouseRef('');
    setAddress('');
  }, [delivery]);

  useEffect(() => {
    if (prodSearch.length < 2) { setProdResults([]); return; }
    const t = setTimeout(async () => {
      const sb = getSupabaseBrowser();
      const { data } = await sb.from('products')
        .select('sku, name, brand, stock:product_stock(price_unit)')
        .or(`name.ilike.%${prodSearch}%,sku.ilike.%${prodSearch}%`)
        .limit(8);
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

  function addItem() {
    if (!selectedProd) return;
    setItems(prev => [...prev, {
      sku: selectedProd.sku, name: `${selectedProd.brand} ${selectedProd.name}`,
      brand: selectedProd.brand, qty: addQty, price: parseFloat(addPrice) || 0,
    }]);
    setSelectedProd(null); setProdSearch(''); setAddQty(1); setAddPrice(''); setProdOpen(false);
  }

  const totalPrice = items.reduce((s, i) => s + i.qty * i.price, 0);

  async function handleSubmit() {
    if (!contact.trim()) { setError('Вкажіть контактну особу'); return; }
    if (items.length === 0) { setError('Додайте хоча б один товар'); return; }
    setSubmitting(true);
    setError('');
    try {
      // Manual orders always have "no callback" flag
      const fullComment = ['⛔ Не передзвонювати для підтвердження', comment].filter(Boolean).join('\n');

      const res = await fetch('/api/admin/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          company: company || null,
          contact, phone, email,
          deliveryType:         delivery,
          deliverySubtype:      delivery === 'nova' ? novaSubtype : null,
          deliveryAddress:      delivery === 'nova' && novaSubtype === 'courier' ? address : (delivery === 'kharkiv' ? address : null),
          deliveryCityRef:      delivery === 'nova' ? novaCityRef : null,
          deliveryCityName:     delivery === 'nova' ? novaCityName : null,
          deliveryWarehouseRef: delivery === 'nova' && novaSubtype === 'warehouse' ? novaWarehouseRef : null,
          paymentType:          payment,
          comment:              fullComment,
          items,
          totalPrice,
          channelCode,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Помилка');
      router.push('/admin?status=new');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Невідома помилка');
    } finally {
      setSubmitting(false);
    }
  }

  const inputStyle: React.CSSProperties = {
    width: '100%', height: '36px', padding: '0 10px',
    border: '1.5px solid #E2E8F0', borderRadius: '8px',
    fontSize: '13px', outline: 'none', boxSizing: 'border-box', background: '#fff',
  };
  const labelStyle: React.CSSProperties = { fontSize: '12px', fontWeight: 600, color: '#64748B', marginBottom: '4px', display: 'block' };
  const sectionStyle: React.CSSProperties = { background: '#fff', border: '1px solid #E2E8F0', borderRadius: '12px', padding: '20px', marginBottom: '16px' };

  return (
    <div style={{ maxWidth: '760px', margin: '0 auto', padding: '32px 24px 64px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '24px' }}>
        <Link href="/admin" style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '13px', color: '#64748B', textDecoration: 'none' }}>
          <ChevronLeft size={14} /> Замовлення
        </Link>
        <span style={{ color: '#CBD5E1' }}>/</span>
        <h1 style={{ fontSize: '18px', fontWeight: 800, color: '#0F172A', margin: 0 }}>Нове замовлення</h1>
      </div>

      {/* Channel */}
      <div style={sectionStyle}>
        <div style={{ fontSize: '13px', fontWeight: 700, color: '#374151', marginBottom: '12px' }}>Канал</div>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          {CHANNEL_OPTIONS.map(ch => (
            <button key={ch.value} onClick={() => setChannelCode(ch.value)}
              style={{ padding: '6px 14px', borderRadius: '8px', fontSize: '13px', fontWeight: 600, cursor: 'pointer',
                border: `1.5px solid ${channelCode === ch.value ? '#1E3A5F' : '#E2E8F0'}`,
                background: channelCode === ch.value ? '#1E3A5F' : '#fff',
                color: channelCode === ch.value ? '#fff' : '#475569' }}>
              {ch.label}
            </button>
          ))}
        </div>
      </div>

      {/* Customer */}
      <div style={sectionStyle}>
        <div style={{ fontSize: '13px', fontWeight: 700, color: '#374151', marginBottom: '12px' }}>Клієнт</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
          <div>
            <label style={labelStyle}>Контактна особа *</label>
            <input value={contact} onChange={e => setContact(e.target.value)} placeholder="Іваненко Петро" style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>Телефон</label>
            <input value={phone} onChange={e => setPhone(e.target.value)} placeholder="+380..." style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>Компанія</label>
            <input value={company} onChange={e => setCompany(e.target.value)} placeholder="ТОВ «...»" style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>Email</label>
            <input value={email} onChange={e => setEmail(e.target.value)} placeholder="email@..." style={inputStyle} />
          </div>
        </div>
      </div>

      {/* Items */}
      <div style={sectionStyle}>
        <div style={{ fontSize: '13px', fontWeight: 700, color: '#374151', marginBottom: '12px' }}>Товари</div>

        {items.length > 0 && (
          <div style={{ marginBottom: '12px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {items.map((item, idx) => (
              <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', padding: '8px 10px', background: '#F8FAFC', borderRadius: '8px' }}>
                <span style={{ flex: 1, color: '#374151' }}>{item.name}</span>
                <input type="number" min={1} value={item.qty}
                  onChange={e => setItems(prev => prev.map((it, i) => i === idx ? { ...it, qty: Math.max(1, parseInt(e.target.value) || 1) } : it))}
                  style={{ width: '50px', height: '28px', border: '1px solid #E2E8F0', borderRadius: '6px', textAlign: 'center', fontSize: '12px', outline: 'none' }} />
                <span style={{ color: '#64748B', minWidth: '80px', textAlign: 'right' }}>{(item.price * item.qty).toFixed(0)} грн</span>
                <button onClick={() => setItems(prev => prev.filter((_, i) => i !== idx))}
                  style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#EF4444', padding: '2px', display: 'flex' }}>
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
            <div style={{ textAlign: 'right', fontSize: '14px', fontWeight: 800, color: '#1E3A5F', paddingRight: '10px' }}>
              Разом: {totalPrice.toFixed(2)} грн
            </div>
          </div>
        )}

        <div ref={prodRef} style={{ position: 'relative', marginBottom: '8px' }}>
          <Search size={14} color="#94A3B8" style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} />
          <input
            placeholder="Пошук товару за назвою або SKU..."
            value={prodSearch}
            onChange={e => setProdSearch(e.target.value)}
            onFocus={() => prodResults.length > 0 && setProdOpen(true)}
            style={{ ...inputStyle, paddingLeft: '32px' }}
          />
          {prodOpen && prodResults.length > 0 && (
            <div style={{ position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0, zIndex: 50, background: '#fff', border: '1px solid #E2E8F0', borderRadius: '10px', boxShadow: '0 4px 20px rgba(0,0,0,0.1)', maxHeight: '200px', overflowY: 'auto' }}>
              {prodResults.map(p => (
                <button key={p.sku} onMouseDown={() => {
                  setSelectedProd(p); setAddPrice(String(p.price));
                  setProdSearch(`${p.brand} ${p.name}`); setProdOpen(false);
                }} style={{ width: '100%', padding: '8px 12px', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left', fontSize: '13px', borderBottom: '1px solid #F8FAFC', display: 'flex', justifyContent: 'space-between' }}>
                  <span><span style={{ color: '#94A3B8', marginRight: '6px', fontSize: '11px' }}>{p.sku}</span>{p.brand} {p.name}</span>
                  {p.price > 0 && <span style={{ color: '#1E3A5F', fontWeight: 700 }}>{p.price} грн</span>}
                </button>
              ))}
            </div>
          )}
        </div>
        {selectedProd && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 60px 90px auto', gap: '6px', alignItems: 'center' }}>
            <span style={{ fontSize: '13px', color: '#374151', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{selectedProd.brand} {selectedProd.name}</span>
            <input placeholder="К-сть" type="number" min={1} value={addQty} onChange={e => setAddQty(parseInt(e.target.value) || 1)}
              style={{ height: '34px', padding: '0 8px', border: '1.5px solid #E2E8F0', borderRadius: '8px', fontSize: '13px', textAlign: 'center', outline: 'none' }} />
            <input placeholder="Ціна" type="number" min={0} value={addPrice} onChange={e => setAddPrice(e.target.value)}
              style={{ height: '34px', padding: '0 8px', border: '1.5px solid #E2E8F0', borderRadius: '8px', fontSize: '13px', outline: 'none' }} />
            <button onClick={addItem}
              style={{ height: '34px', width: '34px', borderRadius: '8px', border: 'none', background: '#1E3A5F', color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Plus size={15} />
            </button>
          </div>
        )}
      </div>

      {/* Delivery */}
      <div style={sectionStyle}>
        <div style={{ fontSize: '13px', fontWeight: 700, color: '#374151', marginBottom: '12px' }}>Доставка та оплата</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: delivery === 'nova' ? '16px' : 0 }}>
          <div>
            <label style={labelStyle}>Спосіб доставки</label>
            <select value={delivery} onChange={e => setDelivery(e.target.value)}
              style={{ ...inputStyle, cursor: 'pointer' }}>
              {DELIVERY_OPTIONS.map(d => <option key={d.value} value={d.value}>{d.label}</option>)}
            </select>
          </div>
          <div>
            <label style={labelStyle}>Оплата</label>
            <select value={payment} onChange={e => setPayment(e.target.value)}
              style={{ ...inputStyle, cursor: 'pointer' }}>
              {PAYMENT_OPTIONS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
            </select>
          </div>
        </div>

        {/* Nova Poshta */}
        {delivery === 'nova' && (
          <div>
            <div style={{ display: 'flex', gap: '8px', marginBottom: '14px' }}>
              {(['warehouse', 'courier'] as const).map(sub => (
                <button key={sub} onClick={() => setNovaSubtype(sub)}
                  style={{ flex: 1, padding: '8px', borderRadius: '8px', fontSize: '13px', fontWeight: 600, cursor: 'pointer',
                    border: `1.5px solid ${novaSubtype === sub ? '#1E3A5F' : '#E2E8F0'}`,
                    background: novaSubtype === sub ? '#EFF4FF' : '#fff',
                    color: novaSubtype === sub ? '#1E3A5F' : '#64748B' }}>
                  {sub === 'warehouse' ? '📦 Відділення' : '🚚 Кур\'єр'}
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

        {/* Kharkiv city delivery */}
        {delivery === 'kharkiv' && (
          <div style={{ marginTop: '8px' }}>
            <label style={labelStyle}>Адреса доставки</label>
            <input value={address} onChange={e => setAddress(e.target.value)} placeholder="Вулиця, будинок, квартира"
              style={inputStyle} />
          </div>
        )}

        <div style={{ marginTop: '14px' }}>
          <label style={labelStyle}>Коментар</label>
          <textarea value={comment} onChange={e => setComment(e.target.value)} placeholder="Додаткові примітки..."
            style={{ width: '100%', padding: '8px 10px', border: '1.5px solid #E2E8F0', borderRadius: '8px', fontSize: '13px', outline: 'none', boxSizing: 'border-box', resize: 'vertical', minHeight: '60px' }} />
          <div style={{ fontSize: '11px', color: '#94A3B8', marginTop: '4px' }}>
            ⛔ Мітка «не передзвонювати» додається автоматично для всіх ручних замовлень
          </div>
        </div>
      </div>

      {error && <div style={{ color: '#DC2626', fontSize: '13px', marginBottom: '12px' }}>{error}</div>}

      <button onClick={handleSubmit} disabled={submitting}
        style={{ width: '100%', height: '44px', borderRadius: '10px', border: 'none', background: '#1E3A5F', color: '#fff', fontSize: '14px', fontWeight: 700, cursor: submitting ? 'wait' : 'pointer', opacity: submitting ? 0.7 : 1 }}>
        {submitting ? 'Збереження...' : `Створити замовлення${totalPrice > 0 ? ` · ${totalPrice.toFixed(2)} грн` : ''}`}
      </button>
    </div>
  );
}
