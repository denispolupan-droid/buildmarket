'use client';

import { useState } from 'react';
import { Plus, X, Check, Loader2, FileText, Banknote, ExternalLink } from 'lucide-react';

type Contract = {
  id: string;
  contract_number: string;
  customer_id: string;
  customer_name: string | null;
  credit_days: number;
  credit_limit: number;
  discount_pct: number;
  allow_promo: boolean;
  payment_terms: string | null;
  price_type: string | null;
  start_date: string;
  end_date: string | null;
  status: 'active' | 'suspended' | 'closed';
  notes: string | null;
  balance?: number;
};

const inp: React.CSSProperties = {
  width: '100%', height: '38px', padding: '0 12px',
  border: '1.5px solid var(--border)', borderRadius: '8px',
  fontSize: '13px', outline: 'none', boxSizing: 'border-box',
  color: 'var(--text-primary)', background: 'var(--bg-soft)',
};
const lbl: React.CSSProperties = {
  fontSize: '11px', fontWeight: 700, color: 'var(--text-secondary)',
  display: 'block', marginBottom: '4px',
  textTransform: 'uppercase', letterSpacing: '0.04em',
};

const EMPTY: Omit<Contract, 'id' | 'balance'> = {
  contract_number: '', customer_id: '', customer_name: '',
  credit_days: 30, credit_limit: 0, discount_pct: 0,
  allow_promo: false, payment_terms: '', price_type: 'retail',
  start_date: new Date().toISOString().slice(0, 10),
  end_date: null, status: 'active', notes: '',
};

const STATUS_CFG = {
  active:    { label: 'Активний',    color: '#15803D', bg: '#F0FDF4' },
  suspended: { label: 'Призупинено', color: '#B45309', bg: '#FEF3C7' },
  closed:    { label: 'Закрито',     color: '#DC2626', bg: '#FEF2F2' },
};

export default function ContractsClient({ initialContracts }: { initialContracts: Contract[] }) {
  const [contracts, setContracts] = useState(initialContracts);
  const [modal, setModal]         = useState<'create' | 'edit' | null>(null);
  const [editing, setEditing]     = useState<Contract | null>(null);
  const [form, setForm]           = useState<Omit<Contract, 'id' | 'balance'>>(EMPTY);
  const [saving, setSaving]       = useState(false);
  const [error, setError]         = useState('');
  const [search, setSearch]       = useState('');

  // Payment modal
  const [payModal, setPayModal]   = useState<Contract | null>(null);
  const [payAmount, setPayAmount] = useState('');
  const [payMethod, setPayMethod] = useState<'bank' | 'cash' | 'acquiring'>('bank');
  const [payDate, setPayDate]     = useState(new Date().toISOString().slice(0, 10));
  const [payDesc, setPayDesc]     = useState('');
  const [payAdvance, setPayAdvance] = useState(false);
  const [paying, setPaying]       = useState(false);
  const [payError, setPayError]   = useState('');

  function openCreate() { setForm(EMPTY); setEditing(null); setError(''); setModal('create'); }
  function openEdit(c: Contract) {
    setForm({ ...c }); setEditing(c); setError(''); setModal('edit');
  }

  function set<K extends keyof typeof form>(key: K, value: typeof form[K]) {
    setForm(prev => ({ ...prev, [key]: value }));
  }

  async function handleSave() {
    if (!form.contract_number.trim()) { setError('Номер договору обов\'язковий'); return; }
    if (!form.customer_id.trim()) { setError('ID клієнта обов\'язковий'); return; }
    setSaving(true); setError('');
    try {
      const url = editing ? `/api/admin/contracts/${editing.id}` : '/api/admin/contracts';
      const method = editing ? 'PUT' : 'POST';
      const res = await fetch(url, {
        method, headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? 'Помилка збереження'); return; }
      if (editing) {
        setContracts(prev => prev.map(c => c.id === editing.id ? { ...c, ...data } : c));
      } else {
        setContracts(prev => [data, ...prev]);
      }
      setModal(null);
    } catch { setError('Мережева помилка'); }
    finally { setSaving(false); }
  }

  async function handlePayment() {
    if (!payModal || !payAmount || parseFloat(payAmount) <= 0) {
      setPayError('Введіть суму оплати'); return;
    }
    setPaying(true); setPayError('');
    try {
      const res = await fetch('/api/admin/payments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contractId:    payModal.id,
          customerId:    payModal.customer_id,
          amount:        parseFloat(payAmount),
          paymentMethod: payMethod,
          businessDate:  payDate,
          description:   payDesc || undefined,
          isAdvance:     payAdvance,
        }),
      });
      const data = await res.json();
      if (!res.ok) { setPayError(data.error ?? 'Помилка'); return; }
      // Оновлюємо баланс локально
      setContracts(prev => prev.map(c =>
        c.id === payModal.id
          ? { ...c, balance: Math.max(0, (c.balance ?? 0) - parseFloat(payAmount)) }
          : c
      ));
      setPayModal(null);
      setPayAmount(''); setPayDesc(''); setPayAdvance(false);
    } catch { setPayError('Мережева помилка'); }
    finally { setPaying(false); }
  }

  const filtered = contracts.filter(c =>
    !search || c.contract_number.toLowerCase().includes(search.toLowerCase()) ||
    (c.customer_name ?? '').toLowerCase().includes(search.toLowerCase()) ||
    c.customer_id.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div style={{ padding: '28px 32px', maxWidth: '1200px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px' }}>
        <div>
          <h1 style={{ fontSize: '22px', fontWeight: 800, color: 'var(--text-primary)', margin: 0 }}>Договори</h1>
          <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginTop: '4px' }}>
            Кредитні умови та дебіторська заборгованість клієнтів
          </p>
        </div>
        <button onClick={openCreate}
          style={{ display: 'flex', alignItems: 'center', gap: '6px', height: '38px', padding: '0 18px', borderRadius: '8px', border: 'none', background: '#1E3A5F', color: '#fff', fontSize: '13px', fontWeight: 700, cursor: 'pointer' }}>
          <Plus size={15} /> Новий договір
        </button>
      </div>

      {/* Search */}
      <input value={search} onChange={e => setSearch(e.target.value)}
        placeholder="Пошук по номеру договору або клієнту..."
        style={{ ...inp, marginBottom: '16px', maxWidth: '400px' }} />

      {/* Summary */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px', marginBottom: '20px' }}>
        {[
          { label: 'Активних',      value: contracts.filter(c => c.status === 'active').length,    color: '#16A34A',           accent: '#16A34A' },
          { label: 'Призупинено',  value: contracts.filter(c => c.status === 'suspended').length, color: '#D97706',           accent: '#D97706' },
          { label: 'Загальний борг', value: `${contracts.filter(c => c.status === 'active').reduce((s, c) => s + (c.balance ?? 0), 0).toLocaleString('uk-UA', { maximumFractionDigits: 0 })} ₴`, color: 'var(--brand-blue)', accent: '#4880B8' },
        ].map(s => (
          <div key={s.label} style={{ padding: '14px 18px', borderRadius: '10px', background: 'var(--bg-card)', border: '1px solid var(--border)', borderLeft: `3px solid ${s.accent}` }}>
            <div style={{ fontSize: '22px', fontWeight: 800, color: s.color }}>{s.value}</div>
            <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Table */}
      {filtered.length === 0 ? (
        <div style={{ padding: '48px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '14px', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '12px' }}>
          {contracts.length === 0 ? 'Немає договорів. Натисніть «Новий договір» для створення.' : 'Нічого не знайдено'}
        </div>
      ) : (
        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '12px', overflow: 'hidden' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '160px 1fr 100px 120px 90px 100px 120px 140px', padding: '8px 16px', background: 'var(--bg-soft)', borderBottom: '1px solid var(--border)', fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
            <span>Договір</span><span>Клієнт</span><span style={{ textAlign: 'right' }}>Відстрочка</span>
            <span style={{ textAlign: 'right' }}>Ліміт</span><span style={{ textAlign: 'right' }}>Знижка</span>
            <span style={{ textAlign: 'center' }}>Статус</span><span style={{ textAlign: 'right' }}>Борг</span>
            <span style={{ textAlign: 'center' }}>Дії</span>
          </div>
          {filtered.map((c, idx) => {
            const st = STATUS_CFG[c.status];
            const balance = c.balance ?? 0;
            return (
              <div key={c.id} style={{
                display: 'grid', gridTemplateColumns: '160px 1fr 100px 120px 90px 100px 120px 140px',
                padding: '11px 16px', alignItems: 'center', cursor: 'default',
                borderBottom: idx < filtered.length - 1 ? '1px solid var(--border-light)' : 'none',
                transition: 'background 0.1s',
              }}
                onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-soft)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
              >
                <div>
                  <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)' }}>{c.contract_number}</div>
                  {c.end_date && <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>до {c.end_date}</div>}
                </div>
                <div>
                  <div style={{ fontSize: '13px', color: 'var(--text-primary)' }}>{c.customer_name || c.customer_id}</div>
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontFamily: 'monospace' }}>{c.customer_id}</div>
                </div>
                <span style={{ textAlign: 'right', fontSize: '13px', color: 'var(--text-primary)', fontWeight: 600 }}>
                  {c.credit_days > 0 ? `${c.credit_days} дн.` : '—'}
                </span>
                <span style={{ textAlign: 'right', fontSize: '13px', color: 'var(--text-secondary)' }}>
                  {c.credit_limit > 0 ? `${c.credit_limit.toLocaleString('uk-UA', { maximumFractionDigits: 0 })} ₴` : 'Без ліміту'}
                </span>
                <span style={{ textAlign: 'right', fontSize: '13px', color: c.discount_pct > 0 ? '#15803D' : 'var(--text-muted)' }}>
                  {c.discount_pct > 0 ? `${c.discount_pct}%` : '—'}
                </span>
                <div style={{ display: 'flex', justifyContent: 'center' }}>
                  <span style={{ padding: '2px 8px', borderRadius: '20px', fontSize: '11px', fontWeight: 600, color: st.color, background: st.bg }}>{st.label}</span>
                </div>
                <span style={{ textAlign: 'right', fontSize: '13px', fontWeight: 700, color: balance > 0 ? '#DC2626' : '#15803D' }}>
                  {balance > 0 ? `${balance.toLocaleString('uk-UA', { maximumFractionDigits: 0 })} ₴` : '—'}
                </span>
                <div style={{ display: 'flex', justifyContent: 'center', gap: '4px', flexShrink: 0, flexWrap: 'nowrap' }}>
                  <button onClick={() => { setPayModal(c); setPayAmount(balance > 0 ? String(Math.round(balance)) : ''); setPayDate(new Date().toISOString().slice(0, 10)); setPayDesc(''); setPayError(''); }}
                    title="Записати оплату"
                    style={{ height: '28px', padding: '0 8px', borderRadius: '6px', border: '1.5px solid #86EFAC', background: '#F0FDF4', color: '#15803D', fontSize: '11px', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <Banknote size={12} /> Оплата
                  </button>
                  <button onClick={() => openEdit(c)} title="Редагувати"
                    style={{ height: '28px', width: '28px', borderRadius: '6px', border: '1.5px solid var(--border)', background: 'var(--bg-soft)', color: 'var(--text-secondary)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <FileText size={12} />
                  </button>
                  <a href={`/admin/finance/settlements?customerId=${c.customer_id}`} title="Взаєморозрахунки"
                    style={{ height: '28px', width: '28px', borderRadius: '6px', border: '1.5px solid var(--border)', background: 'var(--bg-soft)', color: 'var(--text-secondary)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', textDecoration: 'none' }}>
                    <ExternalLink size={12} />
                  </a>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modal */}
      {modal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.55)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}
          onClick={e => { if (e.target === e.currentTarget) setModal(null); }}>
          <div style={{ background: 'var(--bg-card)', borderRadius: '16px', width: '100%', maxWidth: '560px', maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 24px 80px rgba(0,0,0,0.22)' }}>
            <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ fontSize: '16px', fontWeight: 800, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <FileText size={18} color="#1E3A5F" />
                {modal === 'create' ? 'Новий договір' : `Договір ${editing?.contract_number}`}
              </div>
              <button onClick={() => setModal(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex' }}><X size={20} /></button>
            </div>

            <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={lbl}>Номер договору *</label>
                  <input style={inp} value={form.contract_number} onChange={e => set('contract_number', e.target.value)} placeholder="ДГ-2026-001" />
                </div>
                <div>
                  <label style={lbl}>Статус</label>
                  <select style={{ ...inp, cursor: 'pointer' }} value={form.status} onChange={e => set('status', e.target.value as Contract['status'])}>
                    <option value="active">Активний</option>
                    <option value="suspended">Призупинено</option>
                    <option value="closed">Закрито</option>
                  </select>
                </div>
              </div>

              <div>
                <label style={lbl}>ID клієнта *</label>
                <input style={inp} value={form.customer_id} onChange={e => set('customer_id', e.target.value)} placeholder="UUID або код клієнта" />
                {form.customer_name && (
                  <div style={{ marginTop: '5px', fontSize: '12px', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '5px' }}>
                    <span style={{ color: 'var(--text-muted)' }}>↳</span>
                    <span>{form.customer_name}</span>
                    <span style={{ color: 'var(--text-muted)', fontSize: '11px' }}>(назва підтягується автоматично)</span>
                  </div>
                )}
              </div>

              <div style={{ borderTop: '1px solid var(--border)', paddingTop: '14px' }}>
                <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '12px', letterSpacing: '0.04em' }}>Кредитні умови</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px' }}>
                  <div>
                    <label style={lbl}>Відстрочка (днів)</label>
                    <input style={inp} type="number" min="0" value={form.credit_days} onChange={e => set('credit_days', parseInt(e.target.value) || 0)} placeholder="30" />
                  </div>
                  <div>
                    <label style={lbl}>Ліміт (грн)</label>
                    <input style={inp} type="number" min="0" value={form.credit_limit || ''} onChange={e => set('credit_limit', parseFloat(e.target.value) || 0)} placeholder="0 = без ліміту" />
                  </div>
                  <div>
                    <label style={lbl}>Знижка (%)</label>
                    <input style={inp} type="number" min="0" max="100" step="0.5" value={form.discount_pct || ''} onChange={e => set('discount_pct', parseFloat(e.target.value) || 0)} placeholder="0" />
                  </div>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={lbl}>Тип цін</label>
                  <select style={{ ...inp, cursor: 'pointer' }} value={form.price_type ?? 'retail'} onChange={e => set('price_type', e.target.value)}>
                    <option value="retail">Роздріб</option>
                    <option value="wholesale">Опт</option>
                    <option value="contract">Договірна</option>
                  </select>
                </div>
                <div>
                  <label style={lbl}>Акційні відвантаження</label>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '8px' }}>
                    <input type="checkbox" checked={form.allow_promo} onChange={e => set('allow_promo', e.target.checked)} style={{ width: '16px', height: '16px', cursor: 'pointer' }} />
                    <span style={{ fontSize: '13px', color: 'var(--text-primary)' }}>Дозволено</span>
                  </div>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={lbl}>Дата початку *</label>
                  <input style={inp} type="date" value={form.start_date} onChange={e => set('start_date', e.target.value)} />
                </div>
                <div>
                  <label style={lbl}>Дата закінчення</label>
                  <input style={inp} type="date" value={form.end_date ?? ''} onChange={e => set('end_date', e.target.value || null)} />
                </div>
              </div>

              <div>
                <label style={lbl}>Умови оплати</label>
                <input style={inp} value={form.payment_terms ?? ''} onChange={e => set('payment_terms', e.target.value)} placeholder="Оплата протягом 30 днів після відвантаження" />
              </div>

              <div>
                <label style={lbl}>Нотатки</label>
                <textarea value={form.notes ?? ''} onChange={e => set('notes', e.target.value)}
                  style={{ ...inp, height: '64px', resize: 'vertical' }} placeholder="Додаткові умови договору..." />
              </div>

              {error && <div style={{ padding: '10px 12px', background: '#FEF2F2', borderRadius: '8px', color: '#DC2626', fontSize: '13px' }}>{error}</div>}
            </div>

            <div style={{ padding: '14px 24px', borderTop: '1px solid var(--border)', display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
              <button onClick={() => setModal(null)} style={{ height: '36px', padding: '0 16px', borderRadius: '8px', border: '1.5px solid var(--border)', background: 'var(--bg-card)', fontSize: '13px', fontWeight: 600, cursor: 'pointer', color: 'var(--text-secondary)' }}>
                Скасувати
              </button>
              <button onClick={handleSave} disabled={saving}
                style={{ height: '36px', padding: '0 20px', borderRadius: '8px', border: 'none', background: '#1E3A5F', color: '#fff', fontSize: '13px', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '7px', opacity: saving ? 0.7 : 1 }}>
                {saving ? <><Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} />Збереження...</> : <><Check size={14} />Зберегти</>}
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Payment modal */}
      {payModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.55)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}
          onClick={e => { if (e.target === e.currentTarget) setPayModal(null); }}>
          <div style={{ background: 'var(--bg-card)', borderRadius: '16px', width: '100%', maxWidth: '440px', boxShadow: '0 24px 80px rgba(0,0,0,0.22)', overflow: 'hidden' }}>

            <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ fontSize: '16px', fontWeight: 800, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Banknote size={18} color="#15803D" /> Записати оплату
              </div>
              <button onClick={() => setPayModal(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex' }}><X size={20} /></button>
            </div>

            <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div style={{ padding: '10px 14px', background: 'var(--bg-soft)', borderRadius: '8px', fontSize: '13px', color: 'var(--text-secondary)' }}>
                <strong>{payModal.contract_number}</strong> · {payModal.customer_name || payModal.customer_id}
                {(payModal.balance ?? 0) > 0 && (
                  <span style={{ marginLeft: '8px', color: '#DC2626', fontWeight: 700 }}>
                    Борг: {(payModal.balance ?? 0).toLocaleString('uk-UA', { maximumFractionDigits: 0 })} ₴
                  </span>
                )}
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={lbl}>Сума (грн) *</label>
                  <input style={inp} type="number" min="0.01" step="0.01" value={payAmount}
                    onChange={e => setPayAmount(e.target.value)} placeholder="0.00" autoFocus />
                </div>
                <div>
                  <label style={lbl}>Дата оплати</label>
                  <input style={inp} type="date" value={payDate} onChange={e => setPayDate(e.target.value)} />
                </div>
              </div>

              <div>
                <label style={lbl}>Спосіб оплати</label>
                <div style={{ display: 'flex', gap: '6px' }}>
                  {(['bank', 'cash', 'acquiring'] as const).map(m => (
                    <button key={m} onClick={() => setPayMethod(m)}
                      style={{ flex: 1, height: '36px', borderRadius: '8px', fontSize: '12px', fontWeight: 600, cursor: 'pointer',
                        border: `1.5px solid ${payMethod === m ? '#1E3A5F' : 'var(--border)'}`,
                        background: payMethod === m ? '#1E3A5F' : 'var(--bg-soft)',
                        color: payMethod === m ? '#fff' : 'var(--text-secondary)' }}>
                      {m === 'bank' ? '🏦 Банк' : m === 'cash' ? '💵 Готівка' : '💳 Еквайринг'}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label style={lbl}>Коментар</label>
                <input style={inp} value={payDesc} onChange={e => setPayDesc(e.target.value)}
                  placeholder="Платіжне доручення №123..." />
              </div>

              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                <input type="checkbox" checked={payAdvance} onChange={e => setPayAdvance(e.target.checked)}
                  style={{ width: '16px', height: '16px', cursor: 'pointer' }} />
                <span style={{ fontSize: '13px', color: 'var(--text-primary)' }}>
                  Аванс (ще немає відвантаження під цю оплату)
                </span>
              </label>

              {payError && <div style={{ padding: '10px 12px', background: '#FEF2F2', borderRadius: '8px', color: '#DC2626', fontSize: '13px' }}>{payError}</div>}
            </div>

            <div style={{ padding: '14px 24px', borderTop: '1px solid var(--border)', display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
              <button onClick={() => setPayModal(null)}
                style={{ height: '36px', padding: '0 16px', borderRadius: '8px', border: '1.5px solid var(--border)', background: 'var(--bg-card)', fontSize: '13px', fontWeight: 600, cursor: 'pointer', color: 'var(--text-secondary)' }}>
                Скасувати
              </button>
              <button onClick={handlePayment} disabled={paying}
                style={{ height: '36px', padding: '0 20px', borderRadius: '8px', border: 'none', background: '#15803D', color: '#fff', fontSize: '13px', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '7px', opacity: paying ? 0.7 : 1 }}>
                {paying ? <><Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} />Збереження...</> : <><Check size={14} />Зафіксувати оплату</>}
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}
