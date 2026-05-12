'use client';

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Trash2, ShoppingCart, ArrowLeft, Plus, Minus, Check, ChevronDown, ChevronUp, User, Truck, CreditCard, MessageSquare } from 'lucide-react';
import { useCart } from '../../lib/cart';
import { trackBeginCheckout, trackPurchase } from '../../lib/analytics';
import { getSupabaseBrowser } from '../../lib/supabase-browser';
import ProductImage from '../components/ProductImage';
import NovaPoshtaSelect from '../components/NovaPoshtaSelect';
import Footer from '../components/Footer';

const DELIVERY_OPTIONS = [
  { value: 'nova', label: 'Нова Пошта' },
];

function getLocalDigits(str: string): string {
  const raw = str.replace(/\D/g, '');
  // Strip country code 38, keep the leading 0
  if (raw.startsWith('380')) return raw.slice(2);   // "3806..." → "06..."
  if (raw.startsWith('38'))  return '0' + raw.slice(2); // "38X..." → "0X..."
  if (raw.startsWith('0'))   return raw;
  return raw.length ? '0' + raw : '';
}

function formatPhone(localDigits: string): string {
  const d = localDigits.slice(0, 10);
  if (!d) return '';
  let r = '+38 (' + d.slice(0, Math.min(3, d.length));
  if (d.length <= 3) return r;
  r += ') ' + d.slice(3, Math.min(6, d.length));
  if (d.length <= 6) return r;
  r += '-' + d.slice(6, Math.min(8, d.length));
  if (d.length <= 8) return r;
  return r + '-' + d.slice(8, 10);
}

const PAYMENT_OPTIONS_RETAIL = [
  { value: 'card',    label: 'Оплата карткою онлайн',                      sub: 'Visa · Mastercard · Apple Pay · Google Pay' },
  { value: 'cod',     label: 'Накладний платіж (оплата при отриманні)',     sub: null },
];

const PAYMENT_OPTIONS_WHOLESALE = [
  { value: 'card',    label: 'Оплата карткою онлайн',                      sub: 'Visa · Mastercard · Apple Pay · Google Pay' },
  { value: 'cod',     label: 'Накладний платіж (оплата при отриманні)',     sub: null },
  { value: 'invoice', label: 'Безготівковий розрахунок по рахунку (IBAN)', sub: 'Для ФОП та юридичних осіб · без РРО' },
];

const inputStyle: React.CSSProperties = {
  width: '100%', height: '44px', padding: '0 14px',
  border: '1px solid #E2E8F0', borderRadius: '10px',
  background: 'var(--bg-card)', fontSize: '14px', color: 'var(--text-primary)',
  outline: 'none', boxSizing: 'border-box',
};

const labelStyle: React.CSSProperties = {
  display: 'block', fontSize: '13px', fontWeight: 600,
  color: '#374151', marginBottom: '6px',
};

function Section({ icon: Icon, title, children, error }: { icon: React.ElementType; title: string; children: React.ReactNode; error?: boolean }) {
  return (
    <div style={{
      background: 'var(--bg-card)', border: `1.5px solid ${error ? '#EF4444' : 'var(--border)'}`, borderRadius: '14px',
      transition: 'border-color 0.15s',
    }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: '10px',
        padding: '16px 20px', borderBottom: `1px solid ${error ? '#7F1D1D' : 'var(--border)'}`,
        background: error ? '#2D0A0A' : 'var(--bg-soft)',
        borderRadius: '14px 14px 0 0',
      }}>
        <div style={{
          width: '32px', height: '32px', borderRadius: '8px',
          background: '#E8EEF5', display: 'flex', alignItems: 'center', justifyContent: 'center',
          flexShrink: 0,
        }}>
          <Icon size={16} color="#1E3A5F" strokeWidth={2} />
        </div>
        <span style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text-primary)' }}>{title}</span>
      </div>
      <div style={{ padding: '20px' }}>{children}</div>
    </div>
  );
}

export default function CartPage() {
  const { items, totalItems, totalPrice, loaded, addItem, removeItem, updateQty, clearCart } = useCart();
  const router = useRouter();
  const searchParams = useSearchParams();

  const [role, setRole] = useState<'wholesale' | 'retail' | 'guest'>('guest');
  const [company,    setCompany]    = useState('');
  const [lastName,   setLastName]   = useState('');
  const [firstName,  setFirstName]  = useState('');
  const [middleName, setMiddleName] = useState('');
  const [phone,      setPhone]      = useState('');
  const [email,     setEmail]     = useState('');

  useEffect(() => {
    const supabase = getSupabaseBrowser();
    supabase.auth.getUser().then(async ({ data }: { data: { user: import('@supabase/supabase-js').User | null } }) => {
      if (!data.user) {
        setRole('guest');
        return;
      }
      const type = data.user.user_metadata?.account_type as string | undefined;
      const wholesale = ['dealer', 'wholesale', 'contractor', 'shop_owner'].includes(type ?? '');
      setRole(wholesale ? 'wholesale' : 'retail');
      setCompany(data.user.user_metadata?.company_name ?? '');
      setEmail(data.user.email ?? '');

      // Auto-fill from last order
      if (wholesale) {
        const { data: orders } = await supabase
          .from('orders')
          .select('contact, phone, delivery_type, delivery_address, payment_type')
          .eq('user_id', data.user.id)
          .order('created_at', { ascending: false })
          .limit(1)
          .single();
        if (orders) {
          if (orders.contact) {
            const parts = orders.contact.trim().split(/\s+/);
            setLastName(parts[0] ?? '');
            setFirstName(parts[1] ?? '');
            setMiddleName(parts[2] ?? '');
          }
          if (orders.phone) setPhone(orders.phone);
          if (orders.delivery_type) setDelivery(orders.delivery_type);
          if (orders.delivery_address) setAddress(orders.delivery_address);
          if (orders.payment_type) setPayment(orders.payment_type);
        }
      }
    });
  }, []);

  // Restore cart from abandoned-cart email link (?restore=TOKEN)
  useEffect(() => {
    const token = searchParams.get('restore');
    if (!token || !loaded) return;
    fetch(`/api/cart/restore/${token}`)
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data?.items?.length) {
          for (const item of data.items) addItem(item, item.qty);
          router.replace('/cart', { scroll: false });
        }
      })
      .catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded]);

  // Save cart to DB for abandoned-cart reminders (debounced 2s)
  useEffect(() => {
    if (!loaded || !email?.includes('@') || items.length === 0) return;
    const t = setTimeout(() => {
      fetch('/api/cart/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, items, totalPrice }),
      }).catch(() => {});
    }, 2000);
    return () => clearTimeout(t);
  }, [email, items, totalPrice, loaded]);

  const [delivery,          setDelivery]          = useState('');
  const [novaSubtype,       setNovaSubtype]       = useState<'warehouse' | 'courier' | ''>('');
  const [address,           setAddress]           = useState('');
  const [novaCityRef,       setNovaCityRef]       = useState('');
  const [novaCityName,      setNovaCityName]      = useState('');
  const [novaWarehouseRef,  setNovaWarehouseRef]  = useState('');
  const [payment,   setPayment]   = useState('');
  const [comment,     setComment]     = useState('');
  const [commentOpen, setCommentOpen] = useState(false);
  const [noCallback,  setNoCallback]  = useState(true);
  const [errors, setErrors] = useState<Set<string>>(new Set());

  function validate(): Set<string> {
    const e = new Set<string>();
    if (!isRetail && !company.trim()) e.add('company');
    if (!lastName.trim())  e.add('lastName');
    if (!firstName.trim()) e.add('firstName');
    if (!/^\+?3?8?(0\d{9})$/.test(phone.replace(/[\s\-()]/g, ''))) e.add('phone');
    if (!email.trim())    e.add('email');
    if (!delivery)        e.add('delivery');
    if (delivery === 'nova' && !novaSubtype) e.add('novaSubtype');
    if (delivery === 'nova' && novaSubtype === 'warehouse' && !novaWarehouseRef) e.add('address');
    if (delivery === 'nova' && novaSubtype === 'courier' && !address.trim()) e.add('address');
    if (!payment)         e.add('payment');
    setErrors(e);
    return e;
  }

  function scrollToFirstError(errs: Set<string>) {
    const priority = ['company', 'lastName', 'firstName', 'phone', 'email', 'delivery', 'novaSubtype', 'address', 'payment'];
    for (const key of priority) {
      if (errs.has(key)) {
        const el = document.getElementById(`field-${key}`);
        el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        break;
      }
    }
  }

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');

  async function handleSubmit() {
    const errs = validate();
    if (errs.size > 0) {
      setTimeout(() => scrollToFirstError(errs), 50);
      return;
    }
    setSubmitting(true);
    setSubmitError('');
    trackBeginCheckout(items, totalPrice);
    try {
      const res = await fetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          company,
          contact: [lastName, firstName, middleName].filter(Boolean).join(' '),
          phone, email,
          deliveryType: delivery,
          deliverySubtype: delivery === 'nova' ? novaSubtype : null,
          deliveryAddress: address || null,
          deliveryCityRef: delivery === 'nova' && novaCityRef ? novaCityRef : null,
          deliveryCityName: delivery === 'nova' && novaCityName ? novaCityName : null,
          deliveryWarehouseRef: delivery === 'nova' && novaSubtype === 'warehouse' && novaWarehouseRef ? novaWarehouseRef : null,
          paymentType: payment,
          comment: [comment, noCallback ? '⛔ Не передзвонювати для підтвердження' : ''].filter(Boolean).join('\n') || null,
          items,
          totalPrice,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Помилка сервера');
      trackPurchase(String(data.id), items, totalPrice);
      clearCart();
      if (payment === 'card' && data.pageUrl) {
        window.location.href = data.pageUrl;
      } else {
        router.push(`/order-success?id=${data.id}&num=${data.orderNumber}${isRetail ? '&from=shop' : ''}`);
      }
    } catch (e) {
      setSubmitError(e instanceof Error ? e.message : 'Невідома помилка');
    } finally {
      setSubmitting(false);
    }
  }

  function err(field: string) {
    return errors.has(field) ? '1.5px solid #EF4444' : undefined;
  }

  const isRetail     = role !== 'wholesale';
  const backHref     = isRetail ? '/shop' : '/catalog';
  const backLabel    = isRetail ? 'До магазину' : 'До каталогу';
  const PAYMENT_OPTIONS = isRetail ? PAYMENT_OPTIONS_RETAIL : PAYMENT_OPTIONS_WHOLESALE;

  if (!loaded) return (
    <div style={{ background: 'var(--bg-soft)', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ width: 40, height: 40, border: '3px solid #E2E8F0', borderTopColor: '#1E3A5F', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );

  if (items.length === 0) {
    return (
      <>
        <div style={{ background: 'var(--bg-soft)', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ textAlign: 'center', padding: '40px' }}>
            <div style={{ color: '#CBD5E1', marginBottom: '16px' }}>
              <ShoppingCart size={64} strokeWidth={1} />
            </div>
            <h1 style={{ fontSize: '22px', fontWeight: 800, color: 'var(--text-primary)', marginBottom: '8px' }}>Кошик порожній</h1>
            <p style={{ fontSize: '14px', color: '#64748B', marginBottom: '24px' }}>Додайте товари з каталогу</p>
            <Link href={backHref} style={{
              display: 'inline-flex', alignItems: 'center', gap: '8px',
              height: '44px', padding: '0 24px', borderRadius: '10px',
              background: '#1E3A5F', color: '#fff', fontSize: '14px', fontWeight: 600,
            }}>
              <ArrowLeft size={15} />{backLabel}
            </Link>
          </div>
        </div>
        <Footer />
      </>
    );
  }

  return (
    <>
      <div style={{ background: 'var(--bg-soft)', minHeight: '100vh' }}>
        <div className="mobile-pad" style={{ maxWidth: '1280px', margin: '0 auto', padding: '32px 32px 64px' }}>

          {/* Page header */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '28px' }}>
            <div>
              <h1 style={{ fontSize: '24px', fontWeight: 800, color: 'var(--text-primary)', marginBottom: '4px' }}>Оформлення замовлення</h1>
              <p style={{ fontSize: '14px', color: '#64748B' }}>{totalItems} товарів на суму {totalPrice.toFixed(2)} грн</p>
            </div>
            <Link href={backHref} style={{
              display: 'inline-flex', alignItems: 'center', gap: '6px',
              height: '36px', padding: '0 14px', borderRadius: '8px',
              border: '1px solid var(--border)', background: 'var(--bg-card)',
              color: 'var(--text-secondary)', fontSize: '13px', fontWeight: 600,
            }}>
              <ArrowLeft size={13} />{backLabel}
            </Link>
          </div>

          {/* Main grid */}
          <div className="cart-grid" style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '24px', alignItems: 'start' }}>

            {/* ── LEFT: Checkout form ── */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>

              {/* Contact info */}
              <Section icon={User} title="Контактні дані">
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                  {!isRetail && (
                    <div id="field-company" style={{ gridColumn: '1 / -1' }}>
                      <label style={{ ...labelStyle, color: errors.has('company') ? '#EF4444' : undefined }}>Назва компанії</label>
                      <input style={{ ...inputStyle, border: err('company') ?? inputStyle.border }} placeholder="ТОВ «Будмайстер»" value={company} onChange={e => { setCompany(e.target.value); setErrors(s => { const n = new Set(s); n.delete('company'); return n; }); }} />
                      {errors.has('company') && <p style={{ margin: '4px 0 0', fontSize: '12px', color: '#EF4444' }}>Вкажіть назву компанії</p>}
                    </div>
                  )}
                  <div id="field-lastName">
                    <label style={{ ...labelStyle, color: errors.has('lastName') ? '#EF4444' : undefined }}>Прізвище</label>
                    <input style={{ ...inputStyle, border: err('lastName') ?? inputStyle.border }} placeholder="Іванченко" value={lastName} onChange={e => { setLastName(e.target.value); setErrors(s => { const n = new Set(s); n.delete('lastName'); return n; }); }} />
                    {errors.has('lastName') && <p style={{ margin: '4px 0 0', fontSize: '12px', color: '#EF4444' }}>Вкажіть прізвище</p>}
                  </div>
                  <div id="field-firstName">
                    <label style={{ ...labelStyle, color: errors.has('firstName') ? '#EF4444' : undefined }}>Ім'я</label>
                    <input style={{ ...inputStyle, border: err('firstName') ?? inputStyle.border }} placeholder="Іван" value={firstName} onChange={e => { setFirstName(e.target.value); setErrors(s => { const n = new Set(s); n.delete('firstName'); return n; }); }} />
                    {errors.has('firstName') && <p style={{ margin: '4px 0 0', fontSize: '12px', color: '#EF4444' }}>Вкажіть ім'я</p>}
                  </div>
                  <div style={{ gridColumn: '1 / -1' }}>
                    <label style={labelStyle}>По батькові <span style={{ fontWeight: 400, color: '#94A3B8' }}>(необов'язково)</span></label>
                    <input style={inputStyle} placeholder="Іванович" value={middleName} onChange={e => setMiddleName(e.target.value)} />
                  </div>
                  <div id="field-phone">
                    <label style={{ ...labelStyle, color: errors.has('phone') ? '#EF4444' : undefined }}>Телефон</label>
                    <input
                      style={{ ...inputStyle, border: err('phone') ?? inputStyle.border }}
                      placeholder="+38 (0__) ___-__-__"
                      value={phone}
                      onChange={e => {
                        setPhone(formatPhone(getLocalDigits(e.target.value)));
                        setErrors(s => { const n = new Set(s); n.delete('phone'); return n; });
                      }}
                      onKeyDown={e => {
                        if (e.key !== 'Backspace') return;
                        e.preventDefault();
                        const shorter = getLocalDigits(phone).slice(0, -1);
                        setPhone(formatPhone(shorter));
                        setErrors(s => { const n = new Set(s); n.delete('phone'); return n; });
                      }}
                    />
                    {errors.has('phone') && <p style={{ margin: '4px 0 0', fontSize: '12px', color: '#EF4444' }}>Введіть коректний номер телефону</p>}
                  </div>
                  <div id="field-email" style={{ gridColumn: '1 / -1' }}>
                    <label style={{ ...labelStyle, color: errors.has('email') ? '#EF4444' : undefined }}>Email для підтвердження</label>
                    <input style={{ ...inputStyle, border: err('email') ?? inputStyle.border }} type="email" placeholder="company@email.com" value={email} onChange={e => { setEmail(e.target.value); setErrors(s => { const n = new Set(s); n.delete('email'); return n; }); }} />
                    {errors.has('email') && <p style={{ margin: '4px 0 0', fontSize: '12px', color: '#EF4444' }}>Вкажіть email</p>}
                  </div>
                </div>
              </Section>

              {/* Delivery */}
              <div id="field-delivery" /><div id="field-novaSubtype" /><div id="field-address" />
              <Section icon={Truck} title="Спосіб доставки" error={errors.has('delivery') || errors.has('novaSubtype') || errors.has('address')}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {DELIVERY_OPTIONS.filter(opt => !delivery || delivery === opt.value).map(opt => (
                    <div key={opt.value}>
                      <label style={{
                        display: 'flex', alignItems: 'center', gap: '12px',
                        padding: '12px 14px', borderRadius: '10px', cursor: delivery === opt.value ? 'default' : 'pointer',
                        border: `1.5px solid ${delivery === opt.value ? '#1E3A5F' : 'var(--border)'}`,
                        background: delivery === opt.value ? '#1E3A5F22' : 'var(--bg-card)',
                        transition: 'all 0.15s',
                      }}>
                        <div style={{
                          width: '18px', height: '18px', borderRadius: '50%', flexShrink: 0,
                          border: `2px solid ${delivery === opt.value ? '#1E3A5F' : '#CBD5E1'}`,
                          background: delivery === opt.value ? '#1E3A5F' : 'var(--bg-card)',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                        }}>
                          {delivery === opt.value && <Check size={10} color="#fff" strokeWidth={3} />}
                        </div>
                        <input type="radio" name="delivery" value={opt.value} checked={delivery === opt.value} onChange={() => { setDelivery(opt.value); setErrors(s => { const n = new Set(s); n.delete('delivery'); return n; }); }} style={{ display: 'none' }} />
                        <span style={{ fontSize: '14px', fontWeight: delivery === opt.value ? 600 : 500, color: 'var(--text-primary)', flex: 1 }}>{opt.label}</span>
                        {delivery === opt.value && (
                          <button
                            onClick={e => { e.preventDefault(); setDelivery(''); setAddress(''); setNovaSubtype(''); }}
                            style={{ fontSize: '12px', color: '#64748B', background: 'none', border: 'none', cursor: 'pointer', flexShrink: 0 }}
                          >
                            змінити
                          </button>
                        )}
                      </label>

                      {/* Nova Poshta sub-options */}
                      {opt.value === 'nova' && delivery === 'nova' && (
                        <div style={{ marginTop: '10px', paddingLeft: '14px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                          {(['warehouse', 'courier'] as const).filter(sub => !novaSubtype || novaSubtype === sub).map(sub => (
                            <label key={sub} style={{
                              display: 'flex', alignItems: 'center', gap: '10px',
                              padding: '10px 14px', borderRadius: '8px', cursor: novaSubtype === sub ? 'default' : 'pointer',
                              border: `1.5px solid ${novaSubtype === sub ? '#1E3A5F' : 'var(--border)'}`,
                              background: novaSubtype === sub ? '#1E3A5F22' : 'var(--bg-soft)',
                              transition: 'all 0.15s',
                            }}>
                              <div style={{
                                width: '16px', height: '16px', borderRadius: '50%', flexShrink: 0,
                                border: `2px solid ${novaSubtype === sub ? '#1E3A5F' : '#CBD5E1'}`,
                                background: novaSubtype === sub ? '#1E3A5F' : 'var(--bg-card)',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                              }}>
                                {novaSubtype === sub && <Check size={8} color="#fff" strokeWidth={3} />}
                              </div>
                              <input type="radio" name="nova_sub" value={sub} checked={novaSubtype === sub} onChange={() => { setNovaSubtype(sub); setErrors(s => { const n = new Set(s); n.delete('novaSubtype'); return n; }); }} style={{ display: 'none' }} />
                              <span style={{ fontSize: '13px', fontWeight: novaSubtype === sub ? 600 : 500, color: 'var(--text-primary)', flex: 1 }}>
                                {sub === 'warehouse' ? 'Відділення' : 'Кур\'єр'}
                              </span>
                              {novaSubtype === sub && (
                                <button
                                  onClick={e => { e.preventDefault(); setNovaSubtype(''); setAddress(''); }}
                                  style={{ fontSize: '12px', color: '#64748B', background: 'none', border: 'none', cursor: 'pointer', flexShrink: 0 }}
                                >
                                  змінити
                                </button>
                              )}
                            </label>
                          ))}
                          {novaSubtype && (
                            <div style={{ marginTop: '6px' }}>
                              <NovaPoshtaSelect
                                key={novaSubtype}
                                mode={novaSubtype}
                                onCityChange={city => { setNovaCityName(city); setAddress(city); setErrors(s => { const n = new Set(s); n.delete('address'); return n; }); }}
                                onWarehouseChange={wh => { setAddress(wh); setErrors(s => { const n = new Set(s); n.delete('address'); return n; }); }}
                                onAddressChange={addr => { setAddress(addr); setErrors(s => { const n = new Set(s); n.delete('address'); return n; }); }}
                                onCityRefChange={setNovaCityRef}
                                onWarehouseRefChange={setNovaWarehouseRef}
                              />
                            </div>
                          )}
                        </div>
                      )}

                      {/* Kharkiv delivery address */}
                      {opt.value === 'kharkiv' && delivery === 'kharkiv' && (
                        <div style={{ marginTop: '10px', paddingLeft: '14px' }}>
                          <label style={labelStyle}>Адреса доставки</label>
                          <input
                            style={{ ...inputStyle, paddingLeft: '14px', border: err('address') ?? inputStyle.border }}
                            placeholder="Вулиця, будинок, квартира / офіс"
                            value={address}
                            onChange={e => { setAddress(e.target.value); setErrors(s => { const n = new Set(s); n.delete('address'); return n; }); }}
                          />
                        </div>
                      )}
                    </div>
                  ))}
                </div>
                {errors.has('delivery') && <p style={{ margin: '8px 0 0', fontSize: '12px', color: '#EF4444' }}>Оберіть спосіб доставки</p>}
                {errors.has('novaSubtype') && <p style={{ margin: '8px 0 0', fontSize: '12px', color: '#EF4444' }}>Оберіть відділення або кур'єр</p>}
                {errors.has('address') && <p style={{ margin: '8px 0 0', fontSize: '12px', color: '#EF4444' }}>Оберіть місто та відділення Нової Пошти</p>}
              </Section>

              {/* Payment */}
              <div id="field-payment" />
              <Section icon={CreditCard} title="Спосіб оплати" error={errors.has('payment')}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {PAYMENT_OPTIONS.filter(opt => !payment || payment === opt.value).map(opt => (
                    <label key={opt.value} style={{
                      display: 'flex', alignItems: 'center', gap: '12px',
                      padding: '12px 14px', borderRadius: '10px', cursor: payment === opt.value ? 'default' : 'pointer',
                      border: `1.5px solid ${payment === opt.value ? '#1E3A5F' : 'var(--border)'}`,
                      background: payment === opt.value ? '#1E3A5F22' : 'var(--bg-card)',
                      transition: 'all 0.15s',
                    }}>
                      <div style={{
                        width: '18px', height: '18px', borderRadius: '50%', flexShrink: 0,
                        border: `2px solid ${payment === opt.value ? '#1E3A5F' : '#CBD5E1'}`,
                        background: payment === opt.value ? '#1E3A5F' : 'var(--bg-card)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                      }}>
                        {payment === opt.value && <Check size={10} color="#fff" strokeWidth={3} />}
                      </div>
                      <input type="radio" name="payment" value={opt.value} checked={payment === opt.value} onChange={() => { setPayment(opt.value); setErrors(s => { const n = new Set(s); n.delete('payment'); return n; }); }} style={{ display: 'none' }} />
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: '14px', fontWeight: payment === opt.value ? 600 : 500, color: 'var(--text-primary)' }}>{opt.label}</div>
                        {opt.sub && <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>{opt.sub}</div>}
                      </div>
                      {payment === opt.value && (
                        <button
                          onClick={e => { e.preventDefault(); setPayment(''); }}
                          style={{ fontSize: '12px', color: '#64748B', background: 'none', border: 'none', cursor: 'pointer', flexShrink: 0 }}
                        >
                          змінити
                        </button>
                      )}
                    </label>
                  ))}
                </div>
                {errors.has('payment') && <p style={{ margin: '8px 0 0', fontSize: '12px', color: '#EF4444' }}>Оберіть спосіб оплати</p>}
              </Section>

              {/* Comment */}
              <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '14px', overflow: 'hidden' }}>
                <button
                  onClick={() => setCommentOpen(o => !o)}
                  style={{
                    width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '16px 20px', background: 'var(--bg-soft)', border: 'none', cursor: 'pointer',
                    borderBottom: commentOpen ? `1px solid var(--border)` : 'none',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: '#E8EEF5', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <MessageSquare size={16} color="#1E3A5F" strokeWidth={2} />
                    </div>
                    <span style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text-primary)' }}>Коментар до замовлення</span>
                  </div>
                  {commentOpen ? <ChevronUp size={16} color="#64748B" /> : <ChevronDown size={16} color="#64748B" />}
                </button>
                {commentOpen && (
                  <div style={{ padding: '20px' }}>
                    <textarea
                      value={comment}
                      onChange={e => setComment(e.target.value)}
                      placeholder="Побажання, уточнення до замовлення..."
                      rows={4}
                      style={{
                        width: '100%', padding: '12px 14px',
                        border: '1px solid #E2E8F0', borderRadius: '10px',
                        background: 'var(--bg-card)', fontSize: '14px', color: 'var(--text-primary)',
                        outline: 'none', resize: 'vertical', fontFamily: 'inherit',
                        boxSizing: 'border-box',
                      }}
                    />
                  </div>
                )}
              </div>

            </div>

            {/* ── RIGHT: Order summary ── */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>

              {/* Items list */}
              <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '14px', overflow: 'hidden' }}>
                <div style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '14px 16px', background: 'var(--bg-soft)', borderBottom: '1px solid var(--border)',
                }}>
                  <span style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)' }}>Ваше замовлення</span>
                  <button
                    onClick={clearCart}
                    style={{
                      display: 'inline-flex', alignItems: 'center', gap: '4px',
                      fontSize: '12px', color: '#EF4444', background: 'none',
                      border: 'none', cursor: 'pointer', fontWeight: 600,
                    }}
                  >
                    <Trash2 size={12} />Очистити
                  </button>
                </div>

                <div style={{ maxHeight: '420px', overflowY: 'auto' }}>
                  {items.map((item, idx) => (
                    <div key={item.sku} style={{
                      display: 'flex', gap: '10px', padding: '12px 16px',
                      borderBottom: idx < items.length - 1 ? '1px solid var(--border)' : 'none',
                      alignItems: 'flex-start',
                    }}>
                      <Link href={`/product/${item.sku}`} style={{ width: '64px', height: '64px', flexShrink: 0, display: 'block', borderRadius: '8px', overflow: 'hidden', border: '1px solid var(--border)' }}>
                        <ProductImage
                          brand={item.brand} nl1={item.nl1} nl2={item.nl2}
                          volume={item.volume ?? ''} bc={item.bc} ac={item.ac} type={item.img_type}
                          imageUrl={item.imageUrl}
                        />
                      </Link>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginBottom: '1px' }}>{item.brand} · {item.sku}</div>
                        <Link href={`/product/${item.sku}`} style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)', lineHeight: 1.3, marginBottom: '6px', display: 'block', textDecoration: 'none' }}>{item.name}</Link>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <button
                              onClick={() => updateQty(item.sku, item.qty - item.min_order)}
                              style={{ width: '24px', height: '24px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--bg-soft)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: 'var(--text-secondary)' }}
                            >
                              <Minus size={10} />
                            </button>
                            <span style={{ fontSize: '13px', fontWeight: 600, minWidth: '28px', textAlign: 'center' }}>{item.qty}</span>
                            <button
                              onClick={() => updateQty(item.sku, item.qty + item.min_order)}
                              style={{ width: '24px', height: '24px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--bg-soft)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: 'var(--text-secondary)' }}
                            >
                              <Plus size={10} />
                            </button>
                          </div>
                          <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)' }}>
                            {item.price > 0 ? `${(item.price * item.qty).toFixed(2)} грн` : '—'}
                          </span>
                        </div>
                      </div>
                      <button
                        onClick={() => removeItem(item.sku)}
                        style={{ width: '24px', height: '24px', borderRadius: '6px', border: 'none', background: 'none', cursor: 'pointer', color: 'var(--text-secondary)', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              {/* Totals + submit */}
              <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '14px', padding: '20px' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '16px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
                    <span style={{ color: 'var(--text-secondary)' }}>Товарів ({totalItems} шт)</span>
                    <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{totalPrice.toFixed(2)} грн</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
                    <span style={{ color: 'var(--text-secondary)' }}>Доставка</span>
                    <span style={{ color: 'var(--text-secondary)', fontWeight: 500 }}>За тарифами перевізника</span>
                  </div>
                </div>
                <div style={{ borderTop: '1px solid var(--border)', paddingTop: '12px', display: 'flex', justifyContent: 'space-between', fontSize: '16px', fontWeight: 700, marginBottom: '16px' }}>
                  <span style={{ color: 'var(--text-primary)' }}>Разом</span>
                  <span style={{ color: 'var(--text-primary)' }}>{totalPrice.toFixed(2)} грн</span>
                </div>
                {role === 'guest' && (
                  <div style={{
                    background: '#F0F9FF', border: '1px solid #BAE6FD',
                    borderRadius: '10px', padding: '12px 14px', marginBottom: '12px',
                    fontSize: '13px', color: '#0369A1', lineHeight: 1.5,
                  }}>
                    💡 Можна оформити замовлення без реєстрації — просто заповніть форму.
                  </div>
                )}
                <button
                  onClick={handleSubmit}
                  disabled={submitting}
                  style={{
                    width: '100%', height: '48px', borderRadius: '10px',
                    border: 'none', background: submitting ? '#94A3B8' : '#1E3A5F', color: '#fff',
                    fontSize: '15px', fontWeight: 700, cursor: submitting ? 'not-allowed' : 'pointer',
                    transition: 'background 0.15s',
                  }}
                >
                  {submitting ? 'Завантаження...' : payment === 'card' ? 'Перейти до оплати →' : 'Підтвердити замовлення →'}
                </button>
                {submitError && (
                  <p style={{ fontSize: '12px', color: '#EF4444', textAlign: 'center', marginTop: '8px' }}>{submitError}</p>
                )}
                <div
                  onClick={() => setNoCallback(v => !v)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '12px',
                    marginTop: '12px', cursor: 'pointer', userSelect: 'none',
                    padding: '12px 14px', borderRadius: '10px',
                    background: noCallback ? '#F0FDF4' : '#F8FAFC',
                    border: `1.5px solid ${noCallback ? '#86EFAC' : '#E2E8F0'}`,
                    transition: 'all 0.15s',
                  }}
                >
                  <div style={{
                    width: '20px', height: '20px', borderRadius: '6px', flexShrink: 0,
                    border: `2px solid ${noCallback ? '#16A34A' : '#CBD5E1'}`,
                    background: noCallback ? '#16A34A' : '#fff',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    transition: 'all 0.15s',
                  }}>
                    {noCallback && (
                      <svg width="11" height="9" viewBox="0 0 11 9" fill="none">
                        <path d="M1 4.5L4 7.5L10 1" stroke="white" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    )}
                  </div>
                  <span style={{ fontSize: '13px', fontWeight: 600, color: noCallback ? '#15803D' : '#64748B', lineHeight: 1.4 }}>
                    Не передзвонювати для підтвердження замовлення
                  </span>
                </div>
              </div>

            </div>
          </div>
        </div>
      </div>
      <Footer />
    </>
  );
}
