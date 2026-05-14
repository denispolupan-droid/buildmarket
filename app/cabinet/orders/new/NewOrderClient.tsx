'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Search, Trash2, ChevronLeft, Send, AlertCircle, CheckCircle, Minus, Plus } from 'lucide-react';
import NovaPoshtaSelect from '../../../components/NovaPoshtaSelect';

// ── Phone formatting (same as cart) ─────────────────────────────────────────
function getLocalDigits(str: string): string {
  const raw = str.replace(/\D/g, '');
  if (raw.startsWith('380')) return raw.slice(2);
  if (raw.startsWith('38'))  return '0' + raw.slice(2);
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

// НП комісія за переказ: 2% від суми COD
const NP_COD_RATE = 0.02;
function npCommission(amount: number) { return Math.max(20, amount * NP_COD_RATE); }

type OrderItem = {
  sku:           string;
  name:          string;
  brand:         string;
  qty:           number;
  cost_price:    number;
  selling_price: number;
};

type Recipient = {
  last_name:      string;
  first_name:     string;
  mid_name:       string;
  phone:          string;
  city_ref:       string;
  city_name:      string;
  warehouse_ref:  string;
  warehouse_name: string;
};

const inp: React.CSSProperties = {
  width: '100%', padding: '8px 12px', border: '1px solid var(--border)',
  borderRadius: '8px', fontSize: '13px', background: 'var(--bg-soft)',
  color: 'var(--text-primary)', boxSizing: 'border-box',
};
const lbl: React.CSSProperties = {
  fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)',
  display: 'block', marginBottom: '5px',
};

export default function NewOrderClient({
  customerId, balanceAvail,
}: {
  customerId: string;
  balanceAvail: number;
}) {
  const router = useRouter();

  const [items,     setItems]     = useState<OrderItem[]>([]);
  const [recipient, setRecipient] = useState<Recipient>({
    last_name: '', first_name: '', mid_name: '', phone: '',
    city_ref: '', city_name: '', warehouse_ref: '', warehouse_name: '',
  });
  const [hasCod,  setHasCod]  = useState(true);
  const [comment, setComment] = useState('');
  const [saving,  setSaving]  = useState(false);
  const [error,   setError]   = useState('');
  const [result,  setResult]  = useState<{ order_number: number } | null>(null);

  // Raw qty strings while user is typing (keyed by sku)
  const [rawQtys, setRawQtys] = useState<Record<string, string>>({});

  // Product search
  const [prodQuery,   setProdQuery]   = useState('');
  const [prodResults, setProdResults] = useState<{ sku: string; name: string; brand: string; price_drop: number }[]>([]);
  const [prodOpen,    setProdOpen]    = useState(false);
  const [prodEmpty,   setProdEmpty]   = useState(false);
  const prodRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (prodQuery.length < 2) { setProdResults([]); setProdOpen(false); setProdEmpty(false); return; }
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/cabinet/products?q=${encodeURIComponent(prodQuery.trim())}`);
        if (!res.ok) return;
        const data = await res.json();
        const results = data.results ?? [];
        setProdResults(results);
        setProdEmpty(results.length === 0);
        setProdOpen(results.length > 0);
      } catch {}
    }, 300);
    return () => clearTimeout(t);
  }, [prodQuery]);

  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (prodRef.current && !prodRef.current.contains(e.target as Node)) setProdOpen(false);
    };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  function addProduct(p: typeof prodResults[0]) {
    setItems(prev => {
      if (prev.find(i => i.sku === p.sku)) return prev;
      return [...prev, { sku: p.sku, name: p.name, brand: p.brand, qty: 1, cost_price: p.price_drop, selling_price: p.price_drop }];
    });
    setProdQuery(''); setProdOpen(false);
  }

  function updateQty(sku: string, qty: number) {
    if (qty < 1) { removeItem(sku); return; }
    setItems(prev => prev.map(i => i.sku === sku ? { ...i, qty } : i));
  }

  function updateSellingPrice(sku: string, val: number) {
    setItems(prev => prev.map(i => i.sku === sku ? { ...i, selling_price: Math.max(i.cost_price, val) } : i));
  }

  function removeItem(sku: string) {
    setItems(prev => prev.filter(i => i.sku !== sku));
    setRawQtys(prev => { const n = { ...prev }; delete n[sku]; return n; });
  }

  const setR = (field: keyof Recipient, val: string) =>
    setRecipient(prev => ({ ...prev, [field]: val }));

  const totalCost    = items.reduce((s, i) => s + i.cost_price * i.qty, 0);
  const totalSell    = items.reduce((s, i) => s + i.selling_price * i.qty, 0);
  const commission   = hasCod ? npCommission(totalSell) : 0;
  const netProfit    = totalSell - totalCost - commission;
  const balanceAfter = balanceAvail - totalCost;
  const hasBalance   = balanceAfter >= 0;
  const hasPriceError = items.some(i => i.selling_price < i.cost_price);

  async function submit() {
    setError('');
    if (!items.length)          { setError('Додайте хоча б один товар'); return; }
    if (hasPriceError)          { setError('Ваша ціна не може бути меншою за закупочну'); return; }
    if (items.length > 0 && !hasBalance) {
      setError(`Недостатньо балансу. Потрібно ${totalCost.toFixed(2)} ₴, доступно ${balanceAvail.toFixed(2)} ₴`);
      return;
    }
    if (!recipient.last_name || !recipient.first_name) { setError("Введіть прізвище та ім'я отримувача"); return; }
    if (!recipient.phone)       { setError('Введіть телефон отримувача'); return; }
    if (!recipient.city_ref)    { setError('Оберіть місто доставки'); return; }
    if (!recipient.warehouse_ref) { setError('Оберіть відділення Нової Пошти'); return; }

    setSaving(true);
    const res = await fetch('/api/cabinet/orders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items, recipient, comment, has_cod: hasCod, cod_amount: totalSell }),
    });
    const data = await res.json();
    setSaving(false);
    if (!res.ok) { setError(data.error ?? 'Помилка оформлення'); return; }
    setResult(data);
  }

  // ── Success screen ────────────────────────────────────────────────────────
  if (result) {
    return (
      <div style={{ padding: '28px 32px 64px', maxWidth: '600px' }}>
        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '16px', padding: '40px', textAlign: 'center' }}>
          <CheckCircle size={48} color="#15803D" style={{ marginBottom: '16px' }} />
          <h2 style={{ fontSize: '20px', fontWeight: 800, color: 'var(--text-primary)', marginBottom: '8px' }}>Замовлення прийнято!</h2>
          <div style={{ fontSize: '15px', color: 'var(--text-secondary)', marginBottom: '16px' }}>
            Замовлення #{result.order_number}
          </div>
          <div style={{ background: 'var(--bg-soft)', borderRadius: '12px', padding: '16px 20px', marginBottom: '24px', textAlign: 'left' }}>
            <div style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
              Ми перевіримо наявність товару та зв&apos;яжемося з вами. Після підтвердження — товар буде відправлено, а ТТН з&apos;явиться у списку замовлень.
            </div>
          </div>
          <div style={{ display: 'flex', gap: '10px', justifyContent: 'center' }}>
            <button
              onClick={() => { setResult(null); setItems([]); setRecipient({ last_name: '', first_name: '', mid_name: '', phone: '', city_ref: '', city_name: '', warehouse_ref: '', warehouse_name: '' }); setComment(''); setHasCod(true); }}
              style={{ height: '40px', padding: '0 20px', borderRadius: '9px', border: '1.5px solid var(--border)', background: 'var(--bg-soft)', color: 'var(--text-primary)', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}
            >
              Нове замовлення
            </button>
            <button
              onClick={() => router.push('/cabinet/orders')}
              style={{ height: '40px', padding: '0 20px', borderRadius: '9px', border: 'none', background: '#1E3A5F', color: '#fff', fontSize: '13px', fontWeight: 700, cursor: 'pointer' }}
            >
              Мої замовлення →
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Main form ─────────────────────────────────────────────────────────────
  return (
    <div style={{ padding: '28px 32px 64px', maxWidth: '960px' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '28px' }}>
        <button onClick={() => router.back()} style={{ display: 'flex', alignItems: 'center', gap: '5px', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: '13px', padding: 0 }}>
          <ChevronLeft size={15} /> Назад
        </button>
        <h1 style={{ fontSize: '20px', fontWeight: 800, color: 'var(--text-primary)', margin: 0 }}>Нове замовлення</h1>
      </div>

      {/* Balance bar */}
      <div style={{ background: !items.length || hasBalance ? 'var(--bg-soft)' : '#FEF2F2', border: `1px solid ${!items.length || hasBalance ? 'var(--border)' : '#FCA5A5'}`, borderRadius: '10px', padding: '12px 16px', marginBottom: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
          Доступний баланс: <strong style={{ color: !items.length || hasBalance ? '#15803D' : '#DC2626' }}>{balanceAvail.toFixed(2)} ₴</strong>
        </span>
        {items.length > 0 && (
          <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
            До списання: <strong style={{ color: hasBalance ? '#1E3A5F' : '#DC2626' }}>{totalCost.toFixed(2)} ₴</strong>
            {hasBalance && <span style={{ marginLeft: '12px', color: 'var(--text-muted)' }}>→ залишок: {balanceAfter.toFixed(2)} ₴</span>}
          </span>
        )}
      </div>

      {error && (
        <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-start', background: '#FEF2F2', border: '1px solid #FCA5A5', borderRadius: '10px', padding: '12px 16px', marginBottom: '20px' }}>
          <AlertCircle size={16} color="#DC2626" style={{ flexShrink: 0, marginTop: '1px' }} />
          <span style={{ fontSize: '13px', color: '#DC2626' }}>{error}</span>
        </div>
      )}

      {/* ── 1. Товари ──────────────────────────────────────────────────── */}
      <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '14px', marginBottom: '20px' }}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', fontSize: '15px', fontWeight: 700, color: 'var(--text-primary)' }}>
          Товари
        </div>
        <div style={{ padding: '16px 20px' }}>

          {/* Search */}
          <div ref={prodRef} style={{ position: 'relative', marginBottom: '16px' }}>
            <Search size={14} color="var(--text-muted)" style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} />
            <input
              value={prodQuery}
              onChange={e => setProdQuery(e.target.value)}
              onFocus={() => prodResults.length > 0 && setProdOpen(true)}
              placeholder="Пошук товару за назвою або артикулом..."
              style={{ ...inp, paddingLeft: '30px' }}
            />
            {prodOpen && prodResults.length > 0 && (
              <div style={{ position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0, zIndex: 200, background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '10px', boxShadow: '0 8px 24px rgba(0,0,0,0.12)', maxHeight: '320px', overflowY: 'auto' }}>
                {prodResults.map(p => (
                  <button key={p.sku} onMouseDown={() => addProduct(p)} style={{ width: '100%', padding: '10px 14px', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left', borderBottom: '1px solid var(--border-light)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px' }}>
                    <div style={{ minWidth: 0 }}>
                      <span style={{ fontSize: '13px', color: 'var(--text-primary)', fontWeight: 500 }}>{p.brand} {p.name}</span>
                      <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontFamily: 'monospace', marginLeft: '8px' }}>{p.sku}</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexShrink: 0 }}>
                      <span style={{ fontSize: '11px', color: '#15803D', fontWeight: 600, whiteSpace: 'nowrap' }}>
                        В наявності
                      </span>
                      <span style={{ fontSize: '13px', fontWeight: 700, color: '#4880B8' }}>{p.price_drop} ₴</span>
                    </div>
                  </button>
                ))}
              </div>
            )}
            {prodEmpty && prodQuery.length >= 2 && (
              <div style={{ position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0, zIndex: 200, background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '10px', padding: '12px 14px', fontSize: '13px', color: 'var(--text-muted)' }}>
                Товар не знайдено або не в наявності
              </div>
            )}
          </div>

          {items.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '24px', color: 'var(--text-muted)', fontSize: '13px' }}>
              Знайдіть і додайте товари за допомогою пошуку вище
            </div>
          ) : (
            <>
              {/* Header row */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 70px 110px 110px 130px 32px', gap: '8px', marginBottom: '8px', fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                <span>Товар</span>
                <span style={{ textAlign: 'center' }}>Наявн.</span>
                <span style={{ textAlign: 'center' }}>К-сть</span>
                <span style={{ textAlign: 'right' }}>Закупочна</span>
                <span style={{ textAlign: 'right' }}>Ваша ціна ₴</span>
                <span />
              </div>

              {items.map(item => {
                const priceErr  = item.selling_price < item.cost_price;
                const rawQty    = rawQtys[item.sku];
                const displayQty = rawQty !== undefined ? rawQty : String(item.qty);
                return (
                  <div key={item.sku} style={{ display: 'grid', gridTemplateColumns: '1fr 70px 110px 110px 130px 32px', gap: '8px', marginBottom: '8px', alignItems: 'center' }}>
                    {/* Name */}
                    <div>
                      <div style={{ fontSize: '13px', fontWeight: 500, color: 'var(--text-primary)', lineHeight: 1.3 }}>{item.brand} {item.name}</div>
                      <div style={{ fontSize: '10px', color: 'var(--text-muted)', fontFamily: 'monospace' }}>{item.sku}</div>
                    </div>

                    {/* Stock status */}
                    <div style={{ textAlign: 'center' }}>
                      <span style={{ fontSize: '11px', fontWeight: 600, color: '#15803D' }}>✓ є</span>
                    </div>

                    {/* Qty counter */}
                    <div style={{ display: 'flex', alignItems: 'center', border: '1px solid var(--border)', borderRadius: '8px', overflow: 'hidden', background: 'var(--bg-soft)', height: '32px' }}>
                      <button
                        onClick={() => {
                          setRawQtys(prev => { const n = { ...prev }; delete n[item.sku]; return n; });
                          updateQty(item.sku, item.qty - 1);
                        }}
                        style={{ width: '26px', flexShrink: 0, height: '100%', border: 'none', background: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: item.qty <= 1 ? '#EF4444' : 'var(--text-secondary)' }}
                      >
                        {item.qty <= 1 ? <Trash2 size={11} /> : <Minus size={11} />}
                      </button>
                      <input
                        type="number"
                        min={1}
                        value={displayQty}
                        onChange={e => {
                          const raw = e.target.value;
                          setRawQtys(prev => ({ ...prev, [item.sku]: raw }));
                          const v = parseInt(raw);
                          if (v > 0) setItems(prev => prev.map(i => i.sku === item.sku ? { ...i, qty: v } : i));
                        }}
                        onBlur={e => {
                          const v = parseInt(e.target.value);
                          setRawQtys(prev => { const n = { ...prev }; delete n[item.sku]; return n; });
                          if (!v || v < 1) removeItem(item.sku);
                          else updateQty(item.sku, v);
                        }}
                        style={{ flex: 1, width: 0, textAlign: 'center', border: 'none', background: 'transparent', fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)', outline: 'none' } as React.CSSProperties}
                      />
                      <button
                        onClick={() => {
                          setRawQtys(prev => { const n = { ...prev }; delete n[item.sku]; return n; });
                          updateQty(item.sku, item.qty + 1);
                        }}
                        style={{ width: '26px', flexShrink: 0, height: '100%', border: 'none', background: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-secondary)' }}
                      >
                        <Plus size={11} />
                      </button>
                    </div>

                    {/* Cost */}
                    <div style={{ textAlign: 'right', fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary)' }}>
                      <div>{item.cost_price} ₴</div>
                      {item.qty > 1 && <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>{(item.cost_price * item.qty).toFixed(0)} ₴</div>}
                    </div>

                    {/* Selling price */}
                    <div>
                      <input
                        type="number"
                        min={item.cost_price}
                        step={1}
                        value={item.selling_price || ''}
                        onChange={e => {
                          const v = parseFloat(e.target.value) || 0;
                          setItems(prev => prev.map(i => i.sku === item.sku ? { ...i, selling_price: v } : i));
                        }}
                        onBlur={e => updateSellingPrice(item.sku, parseFloat(e.target.value) || 0)}
                        placeholder="0"
                        style={{ ...inp, textAlign: 'right', padding: '6px 8px', borderColor: priceErr ? '#FCA5A5' : 'var(--border)', background: priceErr ? '#FFF5F5' : 'var(--bg-soft)' }}
                      />
                      {item.qty > 1 && (
                        <div style={{ fontSize: '10px', color: 'var(--text-muted)', textAlign: 'right', marginTop: '2px' }}>
                          {(item.selling_price * item.qty).toFixed(0)} ₴
                        </div>
                      )}
                      {priceErr && <div style={{ fontSize: '10px', color: '#DC2626', marginTop: '2px' }}>нижче закупочної</div>}
                    </div>

                    {/* Delete */}
                    <button onClick={() => removeItem(item.sku)} style={{ display: 'flex', justifyContent: 'center', background: 'none', border: 'none', cursor: 'pointer', color: '#EF4444', padding: '4px' }}>
                      <Trash2 size={14} />
                    </button>
                  </div>
                );
              })}

              {/* Totals row */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 70px 110px 110px 130px 32px', gap: '8px', borderTop: '1px solid var(--border)', marginTop: '8px', paddingTop: '10px', alignItems: 'center' }}>
                <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Разом</span>
                <span />
                <span />
                <div style={{ textAlign: 'right', fontSize: '13px', fontWeight: 700, color: '#DC2626' }}>{totalCost.toFixed(2)} ₴</div>
                <div style={{ textAlign: 'right', fontSize: '13px', fontWeight: 700, color: '#15803D' }}>{totalSell.toFixed(2)} ₴</div>
                <span />
              </div>

              {/* COD toggle + summary */}
              <div style={{ marginTop: '16px', paddingTop: '14px', borderTop: '1px solid var(--border)' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', marginBottom: '10px' }}>
                  <input
                    type="checkbox"
                    checked={hasCod}
                    onChange={e => setHasCod(e.target.checked)}
                    style={{ width: '16px', height: '16px', accentColor: '#1E3A5F', cursor: 'pointer' }}
                  />
                  <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>
                    Накладений платіж (клієнт платить при отриманні)
                  </span>
                </label>

                {hasCod ? (
                  <div style={{ background: 'var(--bg-soft)', borderRadius: '8px', padding: '10px 14px', display: 'flex', flexDirection: 'column', gap: '5px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
                      <span style={{ color: 'var(--text-secondary)' }}>COD з клієнта:</span>
                      <strong style={{ color: '#15803D' }}>{totalSell.toFixed(2)} ₴</strong>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', borderTop: '1px solid var(--border)', paddingTop: '5px', marginTop: '2px' }}>
                      <span style={{ color: 'var(--text-secondary)', fontWeight: 600 }}>Ваш заробіток:</span>
                      <strong style={{ color: (totalSell - totalCost) >= 0 ? '#4880B8' : '#DC2626' }}>{(totalSell - totalCost).toFixed(2)} ₴</strong>
                    </div>
                  </div>
                ) : (
                  <div style={{ background: 'var(--bg-soft)', borderRadius: '8px', padding: '10px 14px', display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
                    <span style={{ color: 'var(--text-muted)' }}>Клієнт вже оплатив. Посилка без накладеного платежу.</span>
                    <strong style={{ color: '#4880B8', whiteSpace: 'nowrap', marginLeft: '12px' }}>
                      прибуток: {(totalSell - totalCost).toFixed(2)} ₴
                    </strong>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {/* ── 2. Отримувач ──────────────────────────────────────────────── */}
      <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '14px', marginBottom: '20px' }}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', fontSize: '15px', fontWeight: 700, color: 'var(--text-primary)' }}>
          Дані отримувача (ваш клієнт)
        </div>
        <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px' }}>
            <div>
              <label style={lbl}>Прізвище *</label>
              <input style={inp} value={recipient.last_name} onChange={e => setR('last_name', e.target.value)} placeholder="Іваненко" />
            </div>
            <div>
              <label style={lbl}>Ім&apos;я *</label>
              <input style={inp} value={recipient.first_name} onChange={e => setR('first_name', e.target.value)} placeholder="Іван" />
            </div>
            <div>
              <label style={lbl}>По батькові</label>
              <input style={inp} value={recipient.mid_name} onChange={e => setR('mid_name', e.target.value)} placeholder="Іванович" />
            </div>
          </div>
          <div>
            <label style={lbl}>Телефон *</label>
            <input
              style={inp}
              placeholder="+38 (0__) ___-__-__"
              value={recipient.phone}
              onChange={e => setR('phone', formatPhone(getLocalDigits(e.target.value)))}
              onKeyDown={e => {
                if (e.key !== 'Backspace') return;
                e.preventDefault();
                setR('phone', formatPhone(getLocalDigits(recipient.phone).slice(0, -1)));
              }}
              type="tel"
            />
          </div>
          <NovaPoshtaSelect
            mode="warehouse"
            onCityChange={n => setR('city_name', n)}
            onCityRefChange={r => setR('city_ref', r)}
            onWarehouseChange={n => setR('warehouse_name', n)}
            onWarehouseRefChange={r => setR('warehouse_ref', r)}
          />
        </div>
      </div>

      {/* ── 3. Коментар ───────────────────────────────────────────────── */}
      <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '14px', marginBottom: '24px' }}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', fontSize: '15px', fontWeight: 700, color: 'var(--text-primary)' }}>
          Коментар для себе
        </div>
        <div style={{ padding: '20px' }}>
          <input value={comment} onChange={e => setComment(e.target.value)} placeholder="Необов'язково" style={inp} />
        </div>
      </div>

      {/* Submit */}
      <button
        onClick={submit}
        disabled={saving || !items.length || hasPriceError || (items.length > 0 && !hasBalance)}
        style={{
          width: '100%', height: '48px', borderRadius: '12px', border: 'none',
          background: saving || !items.length || hasPriceError || (items.length > 0 && !hasBalance) ? '#94A3B8' : '#1E3A5F',
          color: '#fff', fontSize: '15px', fontWeight: 700,
          cursor: saving || !items.length || hasPriceError || (items.length > 0 && !hasBalance) ? 'not-allowed' : 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
        }}
      >
        <Send size={16} />
        {saving ? 'Відправляємо...' : 'Відправити замовлення на підтвердження'}
      </button>
    </div>
  );
}
