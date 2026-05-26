'use client';

import { useState, useRef, useEffect } from 'react';
import { X, Minus, Loader2, Trash2, Plus, AlertCircle } from 'lucide-react';
import { useRouter } from 'next/navigation';
import NovaPoshtaSelect from '../../components/NovaPoshtaSelect';
import type { OrderDraft, OrderLine } from '../OrderDraftManager';

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
  const router = useRouter();

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
  const [saving, setSaving] = useState(false);
  const [error,  setError]  = useState('');

  // SKU lookup debounce
  const lookupTimers  = useRef<Record<number, ReturnType<typeof setTimeout>>>({});
  // Name autocomplete
  const nameTimers    = useRef<Record<number, ReturnType<typeof setTimeout>>>({});
  const nameInputRefs = useRef<Record<number, HTMLInputElement | null>>({});
  const [nameSuggestions, setNameSuggestions] = useState<
    Record<number, { sku: string; name: string; brand: string }[]>
  >({});
  const [suggestionAnchor, setSuggestionAnchor] = useState<{
    idx: number; top: number; left: number; width: number;
  } | null>(null);
  const [activeDropdownIdx, setActiveDropdownIdx] = useState(-1);

  // Cleanup timers on unmount
  useEffect(() => {
    const lt = lookupTimers.current;
    const nt = nameTimers.current;
    return () => {
      Object.values(lt).forEach(clearTimeout);
      Object.values(nt).forEach(clearTimeout);
    };
  }, []);

  // Reset NP fields when delivery type changes
  useEffect(() => {
    setNovaSubtype('');
    setNovaCityRef('');
    setNovaCityName('');
    setNovaWarehouseRef('');
    setAddress('');
  }, [delivery]);

  // Sync draft state upward (debounce-free, useEffect handles batching)
  useEffect(() => {
    onDraftChange({
      contact, phone, email, company, channelCode,
      delivery, novaSubtype, novaCityRef, novaCityName, novaWarehouseRef,
      address, payment, comment, lines,
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contact, phone, email, company, channelCode,
      delivery, novaSubtype, novaCityRef, novaCityName, novaWarehouseRef,
      address, payment, comment, lines]);

  // ── Line helpers ────────────────────────────────────────────────────────────
  function setLineField<K extends keyof OrderLine>(idx: number, key: K, val: OrderLine[K]) {
    setLines(prev => prev.map((l, i) => i === idx ? { ...l, [key]: val } : l));
  }

  function addLine() {
    setLines(prev => [...prev, { sku: '', name: '', brand: '', qty: 1, price: 0, matched: false }]);
  }

  // SKU lookup — fills name, brand, price from catalog
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
        ...l,
        sku:     found.sku,
        name:    found.name   ?? l.name,
        brand:   found.brand  ?? l.brand,
        price:   found.price_unit ?? found.price_cost ?? l.price,
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

  // Name autocomplete
  function updateAnchor(idx: number) {
    const el = nameInputRefs.current[idx];
    if (!el) return;
    const r = el.getBoundingClientRect();
    setSuggestionAnchor({ idx, top: r.top + r.height + 4, left: r.left, width: r.width });
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
    // Get price from catalog
    await lookupSku(idx, s.sku);
  }

  // ── Computed ─────────────────────────────────────────────────────────────────
  const total       = lines.reduce((s, l) => s + l.qty * l.price, 0);
  const filledLines = lines.filter(l => l.sku || l.name).length;
  const warnCount   = lines.filter(l => l.sku && !l.matched && l.sku.length >= 3).length;

  // ── Submit ───────────────────────────────────────────────────────────────────
  async function handleSubmit() {
    if (!contact.trim()) { setError('Вкажіть контактну особу'); return; }
    if (filledLines === 0) { setError('Додайте хоча б один товар'); return; }
    setSaving(true); setError('');
    try {
      const validLines = lines.filter(l => l.name.trim() || l.sku.trim());
      const fullComment = ['⛔ Не передзвонювати для підтвердження', comment].filter(Boolean).join('\n');

      const res = await fetch('/api/admin/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          company: company || null,
          contact, phone, email,
          deliveryType:         delivery,
          deliverySubtype:      delivery === 'nova' ? novaSubtype : null,
          deliveryAddress:      delivery === 'nova' && novaSubtype === 'courier'
                                  ? address
                                  : delivery === 'kharkiv' ? address : null,
          deliveryCityRef:      delivery === 'nova' ? novaCityRef : null,
          deliveryCityName:     delivery === 'nova' ? novaCityName : null,
          deliveryWarehouseRef: delivery === 'nova' && (novaSubtype === 'warehouse' || novaSubtype === 'postomat')
                                  ? novaWarehouseRef : null,
          paymentType:  payment,
          comment:      fullComment,
          items: validLines.map(l => ({
            sku:   l.sku,
            name:  l.brand ? `${l.brand} ${l.name}`.trim() : l.name,
            brand: l.brand,
            qty:   l.qty,
            price: l.price,
          })),
          totalPrice: total,
          channelCode,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Помилка');
      onSubmitted();
      router.push('/admin?status=new');
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Невідома помилка');
    } finally {
      setSaving(false);
    }
  }

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <>
      {/* ── Side panel ─────────────────────────────────────────────────────── */}
      <div
        className="order-panel-enter"
        style={{
          position: 'fixed', top: 0, left: '220px', bottom: '42px', zIndex,
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

          {/* Body */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>

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

            {/* Customer */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: '10px' }}>
              <div>
                <label style={lbl}>Контактна особа *</label>
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

            {/* Items table */}
            <div style={{ border: '1px solid var(--border)', borderRadius: '10px', overflow: 'hidden' }}>
              {/* Header row */}
              <div style={{
                display: 'grid',
                gridTemplateColumns: '130px 2fr 70px 120px 110px 32px',
                padding: '8px 12px',
                background: 'var(--bg-soft)',
                borderBottom: '1px solid var(--border)',
                fontSize: '11px', fontWeight: 700,
                color: 'var(--text-muted)', textTransform: 'uppercase', gap: '8px',
              }}>
                <span>Артикул</span>
                <span>Найменування</span>
                <span style={{ textAlign: 'right' }}>К-сть</span>
                <span style={{ textAlign: 'right' }}>Ціна продажу</span>
                <span style={{ textAlign: 'right' }}>Сума</span>
                <span />
              </div>

              {/* Rows */}
              <div style={{ maxHeight: '300px', overflowY: 'auto' }}>
                {lines.map((line, idx) => {
                  const rowSum = line.qty * line.price;
                  const warn   = line.sku && !line.matched && line.sku.length >= 3;
                  return (
                    <div key={idx} style={{
                      display: 'grid',
                      gridTemplateColumns: '130px 2fr 70px 120px 110px 32px',
                      padding: '6px 12px', gap: '8px', alignItems: 'center',
                      borderBottom: '1px solid var(--border-light)',
                      background: warn ? '#FFFBEB' : 'transparent',
                    }}>

                      {/* SKU */}
                      <input
                        style={{ ...inp, fontFamily: 'monospace', fontSize: '11px', borderColor: warn ? '#FCD34D' : undefined }}
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
                        style={inp}
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
                          if (e.key === 'ArrowDown') {
                            e.preventDefault();
                            setActiveDropdownIdx(prev => Math.min(prev + 1, suggs.length - 1));
                          } else if (e.key === 'ArrowUp') {
                            e.preventDefault();
                            setActiveDropdownIdx(prev => Math.max(prev - 1, 0));
                          } else if (e.key === 'Enter' && activeDropdownIdx >= 0) {
                            e.preventDefault();
                            selectNameSuggestion(idx, suggs[activeDropdownIdx]);
                          } else if (e.key === 'Escape') {
                            setNameSuggestions(prev => ({ ...prev, [idx]: [] }));
                            setSuggestionAnchor(null);
                            setActiveDropdownIdx(-1);
                          }
                        }}
                      />

                      {/* Qty */}
                      <input
                        style={{ ...inp, textAlign: 'right' }}
                        type="number" min="1" step="1"
                        value={line.qty || ''}
                        onChange={e => { const n = parseInt(e.target.value); setLineField(idx, 'qty', isNaN(n) ? 0 : n); }}
                        onBlur={() => { if (!line.qty || line.qty < 1) setLineField(idx, 'qty', 1); }}
                      />

                      {/* Price */}
                      <div style={{ position: 'relative' }}>
                        <input
                          style={{ ...inp, textAlign: 'right', paddingRight: '18px' }}
                          type="number" min="0" step="0.01"
                          value={line.price || ''}
                          placeholder="0.00"
                          onChange={e => setLineField(idx, 'price', parseFloat(e.target.value) || 0)}
                        />
                        <span style={{ position: 'absolute', right: '6px', top: '50%', transform: 'translateY(-50%)', fontSize: '10px', color: 'var(--text-muted)', pointerEvents: 'none' }}>₴</span>
                      </div>

                      {/* Sum */}
                      <div style={{ textAlign: 'right', fontSize: '13px', fontWeight: 600, color: rowSum > 0 ? 'var(--text-primary)' : 'var(--text-muted)' }}>
                        {rowSum > 0 ? `${fmt(rowSum)} ₴` : '—'}
                      </div>

                      {/* Delete */}
                      <button
                        onClick={() => setLines(prev => prev.filter((_, i) => i !== idx))}
                        disabled={lines.length === 1}
                        style={{ background: 'none', border: 'none', cursor: lines.length > 1 ? 'pointer' : 'default', color: lines.length > 1 ? '#EF4444' : 'var(--text-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0 }}>
                        <Trash2 size={13} />
                      </button>
                    </div>
                  );
                })}
              </div>

              {/* Table footer: add + total */}
              <div style={{
                display: 'grid',
                gridTemplateColumns: '130px 2fr 70px 120px 110px 32px',
                padding: '8px 12px', gap: '8px',
                borderTop: '2px solid var(--border)',
                background: 'var(--bg-soft)', alignItems: 'center',
              }}>
                <div style={{ gridColumn: '1 / 3' }}>
                  <button onClick={addLine}
                    style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '12px', color: '#1E3A5F', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600, padding: 0 }}>
                    <Plus size={13} /> Додати рядок
                  </button>
                </div>
                <span />
                <span style={{ textAlign: 'right', fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Разом:</span>
                <span style={{ textAlign: 'right', fontSize: '15px', fontWeight: 800, color: 'var(--text-primary)' }}>
                  {fmt(total)} ₴
                </span>
                <span />
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

            {/* Kharkiv address */}
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
              <textarea
                value={comment} onChange={e => setComment(e.target.value)}
                placeholder="Додаткові примітки..."
                style={{
                  width: '100%', padding: '8px 10px',
                  border: '1.5px solid var(--border)', borderRadius: '8px',
                  fontSize: '13px', outline: 'none', boxSizing: 'border-box',
                  resize: 'vertical', minHeight: '56px',
                  background: 'var(--bg-soft)', color: 'var(--text-primary)',
                }}
              />
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
          <div style={{ padding: '14px 24px', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
            <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
              {filledLines} позицій · {fmt(total)} ₴
            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button onClick={onClose} disabled={saving}
                style={{ height: '38px', padding: '0 18px', borderRadius: '8px', border: '1.5px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text-secondary)', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}>
                Скасувати
              </button>
              <button
                onClick={handleSubmit}
                disabled={saving || !contact.trim()}
                style={{
                  height: '38px', padding: '0 22px', borderRadius: '8px', border: 'none',
                  background: saving || !contact.trim() ? '#94A3B8' : '#1E3A5F',
                  color: '#fff', fontSize: '13px', fontWeight: 700,
                  cursor: saving ? 'wait' : !contact.trim() ? 'not-allowed' : 'pointer',
                  display: 'flex', alignItems: 'center', gap: '8px',
                  opacity: saving ? 0.7 : 1,
                }}>
                {saving
                  ? <><Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> Збереження...</>
                  : `✅ Створити замовлення${total > 0 ? ` · ${fmt(total)} ₴` : ''}`}
              </button>
            </div>
          </div>

        </div>
      </div>

      {/* ── Name suggestions dropdown (fixed positioning) ────────────────────── */}
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
