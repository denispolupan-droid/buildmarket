'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Search, Trash2, Plus, ChevronLeft, Send, AlertCircle, CheckCircle } from 'lucide-react';
import { getSupabaseBrowser } from '../../../../lib/supabase-browser';
import NovaPoshtaSelect from '../../../components/NovaPoshtaSelect';

type OrderItem = {
  sku:           string;
  name:          string;
  brand:         string;
  qty:           number;
  cost_price:    number;   // price_drop — списується з балансу
  selling_price: number;   // ціна клієнту — сума COD
};

type Recipient = {
  last_name:    string;
  first_name:   string;
  mid_name:     string;
  phone:        string;
  city_ref:     string;
  city_name:    string;
  warehouse_ref: string;
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

  const [items, setItems] = useState<OrderItem[]>([]);
  const [recipient, setRecipient] = useState<Recipient>({
    last_name: '', first_name: '', mid_name: '', phone: '',
    city_ref: '', city_name: '', warehouse_ref: '', warehouse_name: '',
  });
  const [weight,  setWeight]  = useState('1');
  const [comment, setComment] = useState('');
  const [saving,  setSaving]  = useState(false);
  const [error,   setError]   = useState('');
  const [result,  setResult]  = useState<{ order_number: number; ttn: string } | null>(null);

  // Product search
  const [prodQuery,   setProdQuery]   = useState('');
  const [prodResults, setProdResults] = useState<{ sku: string; name: string; brand: string; price_drop: number }[]>([]);
  const [prodOpen,    setProdOpen]    = useState(false);
  const prodRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (prodQuery.length < 2) { setProdResults([]); return; }
    const t = setTimeout(async () => {
      const sb = getSupabaseBrowser();
      const { data } = await sb
        .from('products')
        .select('sku, name, brand, stock:product_stock(price_drop, stock_status)')
        .or(`name.ilike.%${prodQuery}%,sku.ilike.%${prodQuery}%`)
        .eq('is_active', true)
        .limit(8);
      setProdResults(
        (data ?? [])
          .filter((p: any) => p.stock?.[0]?.stock_status === 'in_stock')
          .map((p: any) => ({
            sku: p.sku, name: p.name, brand: p.brand,
            price_drop: p.stock?.[0]?.price_drop ?? 0,
          }))
      );
      setProdOpen(true);
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
      return [...prev, {
        sku: p.sku, name: p.name, brand: p.brand,
        qty: 1,
        cost_price:    p.price_drop,
        selling_price: p.price_drop, // партнер змінює на свій розсуд
      }];
    });
    setProdQuery(''); setProdOpen(false);
  }

  function updateItem(sku: string, field: 'qty' | 'selling_price', val: number) {
    setItems(prev => prev.map(i => i.sku === sku ? { ...i, [field]: val } : i));
  }

  function removeItem(sku: string) {
    setItems(prev => prev.filter(i => i.sku !== sku));
  }

  const setR = (field: keyof Recipient, val: string) =>
    setRecipient(prev => ({ ...prev, [field]: val }));

  const totalCost    = items.reduce((s, i) => s + i.cost_price * i.qty, 0);
  const totalCod     = items.reduce((s, i) => s + i.selling_price * i.qty, 0);
  const balanceAfter = balanceAvail - totalCost;
  const hasBalance   = balanceAfter >= 0;

  async function submit() {
    setError('');
    if (!items.length) { setError('Додайте хоча б один товар'); return; }
    if (!recipient.last_name || !recipient.first_name) { setError('Введіть прізвище та ім\'я отримувача'); return; }
    if (!recipient.phone) { setError('Введіть телефон отримувача'); return; }
    if (!recipient.city_ref) { setError('Оберіть місто доставки'); return; }
    if (!recipient.warehouse_ref) { setError('Оберіть відділення Нової Пошти'); return; }
    if (!hasBalance) { setError(`Недостатньо балансу. Потрібно ${totalCost.toFixed(2)} ₴, доступно ${balanceAvail.toFixed(2)} ₴`); return; }

    setSaving(true);
    const res = await fetch('/api/cabinet/orders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items, recipient, weight: parseFloat(weight) || 1, comment, cod_amount: totalCod }),
    });
    const data = await res.json();
    setSaving(false);
    if (!res.ok) { setError(data.error ?? 'Помилка оформлення'); return; }
    setResult(data);
  }

  // Success screen
  if (result) {
    return (
      <div style={{ padding: '28px 32px 64px', maxWidth: '600px' }}>
        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '16px', padding: '40px', textAlign: 'center' }}>
          <CheckCircle size={48} color="#15803D" style={{ marginBottom: '16px' }} />
          <h2 style={{ fontSize: '20px', fontWeight: 800, color: 'var(--text-primary)', marginBottom: '8px' }}>
            Замовлення оформлено!
          </h2>
          <div style={{ fontSize: '15px', color: 'var(--text-secondary)', marginBottom: '24px' }}>
            Замовлення #{result.order_number}
          </div>
          <div style={{ background: 'var(--bg-soft)', borderRadius: '12px', padding: '20px', marginBottom: '24px', textAlign: 'left' }}>
            <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '8px' }}>ТТН Нової Пошти</div>
            <div style={{ fontSize: '24px', fontWeight: 800, color: '#1E3A5F', letterSpacing: '1px' }}>{result.ttn}</div>
            <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '6px' }}>
              Передайте цей номер вашому клієнту для відстеження посилки
            </div>
          </div>
          <div style={{ display: 'flex', gap: '10px', justifyContent: 'center' }}>
            <button onClick={() => { setResult(null); setItems([]); setRecipient({ last_name: '', first_name: '', mid_name: '', phone: '', city_ref: '', city_name: '', warehouse_ref: '', warehouse_name: '' }); setComment(''); }} style={{ height: '40px', padding: '0 20px', borderRadius: '9px', border: '1.5px solid var(--border)', background: 'var(--bg-soft)', color: 'var(--text-primary)', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}>
              Нове замовлення
            </button>
            <button onClick={() => router.push('/cabinet/orders')} style={{ height: '40px', padding: '0 20px', borderRadius: '9px', border: 'none', background: '#1E3A5F', color: '#fff', fontSize: '13px', fontWeight: 700, cursor: 'pointer' }}>
              Мої замовлення →
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ padding: '28px 32px 64px', maxWidth: '900px' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '28px' }}>
        <button onClick={() => router.back()} style={{ display: 'flex', alignItems: 'center', gap: '5px', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: '13px', padding: 0 }}>
          <ChevronLeft size={15} /> Назад
        </button>
        <h1 style={{ fontSize: '20px', fontWeight: 800, color: 'var(--text-primary)', margin: 0 }}>
          Нове замовлення
        </h1>
      </div>

      {/* Balance warning */}
      <div style={{ background: hasBalance || !items.length ? 'var(--bg-soft)' : '#FEF2F2', border: `1px solid ${hasBalance || !items.length ? 'var(--border)' : '#FCA5A5'}`, borderRadius: '10px', padding: '12px 16px', marginBottom: '24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
          Доступний баланс: <strong style={{ color: hasBalance || !items.length ? '#15803D' : '#DC2626' }}>{balanceAvail.toFixed(2)} ₴</strong>
        </span>
        {items.length > 0 && (
          <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
            Після замовлення: <strong style={{ color: hasBalance ? 'var(--text-primary)' : '#DC2626' }}>{balanceAfter.toFixed(2)} ₴</strong>
          </span>
        )}
      </div>

      {error && (
        <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-start', background: '#FEF2F2', border: '1px solid #FCA5A5', borderRadius: '10px', padding: '12px 16px', marginBottom: '20px' }}>
          <AlertCircle size={16} color="#DC2626" style={{ flexShrink: 0, marginTop: '1px' }} />
          <span style={{ fontSize: '13px', color: '#DC2626' }}>{error}</span>
        </div>
      )}

      {/* ── 1. Товари ─────────────────────────────────────────────────── */}
      <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '14px', overflow: 'hidden', marginBottom: '20px' }}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', fontSize: '15px', fontWeight: 700, color: 'var(--text-primary)' }}>
          Товари
        </div>
        <div style={{ padding: '16px 20px' }}>

          {/* Product search */}
          <div ref={prodRef} style={{ position: 'relative', marginBottom: '16px' }}>
            <Search size={14} color="var(--text-muted)" style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)' }} />
            <input value={prodQuery} onChange={e => setProdQuery(e.target.value)} onFocus={() => prodResults.length > 0 && setProdOpen(true)}
              placeholder="Пошук товару за назвою або артикулом..."
              style={{ ...inp, paddingLeft: '30px' }} />
            {prodOpen && prodResults.length > 0 && (
              <div style={{ position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0, zIndex: 50, background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '10px', boxShadow: '0 8px 24px rgba(0,0,0,0.12)', maxHeight: '260px', overflowY: 'auto' }}>
                {prodResults.map(p => (
                  <button key={p.sku} onMouseDown={() => addProduct(p)} style={{ width: '100%', padding: '10px 14px', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left', borderBottom: '1px solid var(--border-light)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <span style={{ fontSize: '13px', color: 'var(--text-primary)', fontWeight: 500 }}>{p.brand} {p.name}</span>
                      <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontFamily: 'monospace', marginLeft: '8px' }}>{p.sku}</span>
                    </div>
                    <span style={{ fontSize: '13px', fontWeight: 700, color: '#4880B8', flexShrink: 0, marginLeft: '12px' }}>{p.price_drop} ₴</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Items list */}
          {items.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '24px', color: 'var(--text-muted)', fontSize: '13px' }}>
              Знайдіть і додайте товари за допомогою пошуку вище
            </div>
          ) : (
            <>
              {/* Header */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 80px 120px 120px 32px', gap: '8px', marginBottom: '8px', fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                <span>Товар</span>
                <span style={{ textAlign: 'center' }}>К-сть</span>
                <span style={{ textAlign: 'right' }}>Закупочна</span>
                <span style={{ textAlign: 'right' }}>Ваша ціна ₴</span>
                <span />
              </div>
              {items.map(item => (
                <div key={item.sku} style={{ display: 'grid', gridTemplateColumns: '1fr 80px 120px 120px 32px', gap: '8px', marginBottom: '8px', alignItems: 'center' }}>
                  <div>
                    <div style={{ fontSize: '13px', fontWeight: 500, color: 'var(--text-primary)' }}>{item.brand} {item.name}</div>
                    <div style={{ fontSize: '10px', color: 'var(--text-muted)', fontFamily: 'monospace' }}>{item.sku}</div>
                  </div>
                  <input type="number" min={1} step={1} value={item.qty}
                    onChange={e => updateItem(item.sku, 'qty', Math.max(1, parseInt(e.target.value) || 1))}
                    style={{ ...inp, textAlign: 'center', padding: '6px 8px' }} />
                  <div style={{ textAlign: 'right', fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary)' }}>
                    {item.cost_price} ₴
                  </div>
                  <input type="number" min={0} step={1} value={item.selling_price || ''}
                    onChange={e => updateItem(item.sku, 'selling_price', parseFloat(e.target.value) || 0)}
                    placeholder="0"
                    style={{ ...inp, textAlign: 'right', padding: '6px 8px' }} />
                  <button onClick={() => removeItem(item.sku)} style={{ display: 'flex', justifyContent: 'center', background: 'none', border: 'none', cursor: 'pointer', color: '#EF4444', padding: '4px' }}>
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}

              {/* Totals */}
              <div style={{ borderTop: '1px solid var(--border)', marginTop: '12px', paddingTop: '12px', display: 'flex', justifyContent: 'flex-end', gap: '24px', fontSize: '13px' }}>
                <span style={{ color: 'var(--text-secondary)' }}>
                  З балансу: <strong style={{ color: '#DC2626' }}>−{totalCost.toFixed(2)} ₴</strong>
                </span>
                <span style={{ color: 'var(--text-secondary)' }}>
                  Накладений платіж: <strong style={{ color: '#15803D' }}>{totalCod.toFixed(2)} ₴</strong>
                </span>
                <span style={{ color: 'var(--text-secondary)' }}>
                  Ваш заробіток: <strong style={{ color: '#4880B8' }}>{(totalCod - totalCost).toFixed(2)} ₴</strong>
                </span>
              </div>
            </>
          )}
        </div>
      </div>

      {/* ── 2. Отримувач ──────────────────────────────────────────────── */}
      <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '14px', overflow: 'hidden', marginBottom: '20px' }}>
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
              <label style={lbl}>Ім'я *</label>
              <input style={inp} value={recipient.first_name} onChange={e => setR('first_name', e.target.value)} placeholder="Іван" />
            </div>
            <div>
              <label style={lbl}>По батькові</label>
              <input style={inp} value={recipient.mid_name} onChange={e => setR('mid_name', e.target.value)} placeholder="Іванович" />
            </div>
          </div>
          <div>
            <label style={lbl}>Телефон *</label>
            <input style={inp} value={recipient.phone} onChange={e => setR('phone', e.target.value)} placeholder="+380991234567" type="tel" />
          </div>

          {/* Nova Poshta selector */}
          <NovaPoshtaSelect
            mode="warehouse"
            onCityChange={n => setR('city_name', n)}
            onCityRefChange={r => setR('city_ref', r)}
            onWarehouseChange={n => setR('warehouse_name', n)}
            onWarehouseRefChange={r => setR('warehouse_ref', r)}
          />
        </div>
      </div>

      {/* ── 3. Додатково ──────────────────────────────────────────────── */}
      <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '14px', overflow: 'hidden', marginBottom: '24px' }}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', fontSize: '15px', fontWeight: 700, color: 'var(--text-primary)' }}>
          Додатково
        </div>
        <div style={{ padding: '20px', display: 'grid', gridTemplateColumns: '120px 1fr', gap: '16px' }}>
          <div>
            <label style={lbl}>Вага (кг)</label>
            <input type="number" min="0.1" step="0.1" value={weight} onChange={e => setWeight(e.target.value)} style={inp} />
          </div>
          <div>
            <label style={lbl}>Коментар для себе</label>
            <input value={comment} onChange={e => setComment(e.target.value)} placeholder="Необов'язково" style={inp} />
          </div>
        </div>
      </div>

      {/* Submit */}
      <button
        onClick={submit}
        disabled={saving || !items.length || !hasBalance}
        style={{
          width: '100%', height: '48px', borderRadius: '12px', border: 'none',
          background: saving || !items.length || !hasBalance ? '#94A3B8' : '#1E3A5F',
          color: '#fff', fontSize: '15px', fontWeight: 700,
          cursor: saving || !items.length || !hasBalance ? 'not-allowed' : 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
        }}
      >
        <Send size={16} />
        {saving ? 'Оформлюємо...' : `Оформити замовлення — ${totalCod.toFixed(2)} ₴ COD`}
      </button>
    </div>
  );
}
