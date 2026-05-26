'use client';

import { useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import {
  Wallet, CheckCircle, XCircle, Plus, ChevronDown, ChevronUp,
  Users, ShoppingBag, TrendingUp, X, Edit2, Save, Eye,
} from 'lucide-react';

/* ── Phone mask (same as cart) ──────────────────────────────────────────── */
function getLocalDigits(formatted: string): string {
  const raw = formatted.replace(/\D/g, '');
  if (raw.startsWith('380')) return raw.slice(3);
  if (raw.startsWith('38'))  return raw.slice(2);
  if (raw.startsWith('0'))   return raw.slice(1);
  return raw;
}
function formatPhone(localDigits: string): string {
  const d = localDigits.replace(/\D/g, '').slice(0, 9);
  if (!d) return '';
  let r = '+38 (0' + d.slice(0, Math.min(2, d.length));
  if (d.length <= 2) return r;
  r += ') ' + d.slice(2, Math.min(5, d.length));
  if (d.length <= 5) return r;
  r += '-' + d.slice(5, Math.min(7, d.length));
  if (d.length <= 7) return r;
  return r + '-' + d.slice(7);
}

type Customer = {
  id: string; name: string; email: string | null; phone: string | null;
  company: string | null; city: string | null; type: string; price_tier: string;
  balance: number; balance_held: number; is_active: boolean;
  orders_count: number; total_revenue: number; last_order_at: string | null;
  created_at: string; partner_code: string | null; credit_limit: number | null;
  notes: string | null;
};

type Payout = {
  id: string; customer_id: string; amount: number; method: string;
  status: string; bank_details: string | null; requested_at: string; notes: string | null;
};

const TYPE_LABELS: Record<string, { label: string; short: string; color: string; bg: string }> = {
  retail:           { label: 'Роздріб',     short: 'Роздріб',  color: '#64748B', bg: '#F1F5F9' },
  wholesale:        { label: 'Оптовий',     short: 'Опт',      color: '#15803D', bg: '#F0FDF4' },
  dropship_partner: { label: 'Дропшип',     short: 'Дропшип',  color: '#4880B8', bg: '#EFF6FF' },
};

const TABS = [
  { value: '',                 label: 'Всі' },
  { value: 'retail',           label: 'Роздріб' },
  { value: 'wholesale',        label: 'Оптові' },
  { value: 'dropship_partner', label: 'Дропшип' },
];

const inp: React.CSSProperties = {
  width: '100%', padding: '7px 10px', border: '1.5px solid var(--border)',
  borderRadius: '8px', fontSize: '13px', background: 'var(--bg-soft)',
  color: 'var(--text-primary)', boxSizing: 'border-box', outline: 'none',
};

function fmtMoney(n: number) { return n.toLocaleString('uk-UA', { maximumFractionDigits: 0 }) + ' ₴'; }
function fmtDate(s: string | null) {
  if (!s) return '—';
  return new Date(s).toLocaleDateString('uk-UA', { day: '2-digit', month: '2-digit', year: '2-digit' });
}

export default function PartnersClient({
  customers: initialCustomers,
  pendingPayouts,
}: {
  customers: Customer[];
  pendingPayouts: Payout[];
}) {
  const [customers, setCustomers] = useState<Customer[]>(initialCustomers);
  const [payouts,   setPayouts]   = useState<Payout[]>(pendingPayouts);
  const [tab,       setTab]       = useState('');
  const [expandedId,  setExpandedId]  = useState<string | null>(null);
  const [editingId,   setEditingId]   = useState<string | null>(null);
  const [topupId,     setTopupId]     = useState<string | null>(null);
  const [topupAmount, setTopupAmount] = useState('');
  const [topupNote,   setTopupNote]   = useState('');
  const [saving,      setSaving]      = useState(false);
  const [error,       setError]       = useState('');
  const [viewingId,   setViewingId]   = useState<string | null>(null);

  // New customer modal
  const [showNew,  setShowNew]  = useState(false);
  const [newForm,  setNewForm]  = useState({
    name: '', company: '', phone: '', email: '', city: '',
    type: 'retail', credit_limit: '', notes: '',
  });
  const [newPhone, setNewPhone] = useState('');
  const [newSaving, setNewSaving] = useState(false);
  const [newError,  setNewError]  = useState('');

  // Edit form state
  const [editForm,  setEditForm]  = useState<Partial<Customer>>({});
  const [editPhone, setEditPhone] = useState('');

  // ── Auto-expand customer from URL ?open=<id> ───────────────────────────────
  const searchParams = useSearchParams();
  useEffect(() => {
    const openId = searchParams.get('open');
    if (!openId) return;
    setExpandedId(openId);
    // Switch tab to show this customer's type
    const customer = initialCustomers.find(c => c.id === openId);
    if (customer) setTab(customer.type);
    // Scroll to the row after render
    setTimeout(() => {
      const el = document.getElementById(`partner-row-${openId}`);
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 200);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Filtered list ──────────────────────────────────────────────────────────
  const filtered = tab ? customers.filter(c => c.type === tab) : customers;

  // ── Summary stats ──────────────────────────────────────────────────────────
  const retailCount    = customers.filter(c => c.type === 'retail').length;
  const partnerCount   = customers.filter(c => c.type !== 'retail').length;
  const totalRevenue   = customers.reduce((s, c) => s + Number(c.total_revenue), 0);
  const partnerBalance = customers.filter(c => c.type !== 'retail').reduce((s, c) => s + Number(c.balance), 0);

  // ── Create new customer ───────────────────────────────────────────────────
  async function handleCreate() {
    if (!newForm.name.trim()) { setNewError('Вкажіть ім\'я або назву'); return; }
    setNewSaving(true); setNewError('');
    const res = await fetch('/api/admin/partners', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...newForm, phone: newPhone }),
    });
    const data = await res.json();
    setNewSaving(false);
    if (!res.ok) { setNewError(data.error ?? 'Помилка'); return; }
    setCustomers(prev => [data, ...prev]);
    setShowNew(false);
    setNewForm({ name: '', company: '', phone: '', email: '', city: '', type: 'retail', credit_limit: '', notes: '' });
    setNewPhone('');
  }

  // ── Save edit ─────────────────────────────────────────────────────────────
  async function handleSaveEdit(id: string) {
    setSaving(true); setError('');
    const payload = { ...editForm, phone: editPhone };
    const res = await fetch(`/api/admin/partners/${id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    setSaving(false);
    if (!res.ok) { setError('Помилка збереження'); return; }
    setCustomers(prev => prev.map(c => c.id === id ? { ...c, ...payload } : c));
    setEditingId(null);
    setEditForm({});
    setEditPhone('');
  }

  // ── Toggle active ─────────────────────────────────────────────────────────
  async function toggleActive(id: string, current: boolean) {
    await fetch(`/api/admin/partners/${id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_active: !current }),
    });
    setCustomers(prev => prev.map(c => c.id === id ? { ...c, is_active: !current } : c));
  }

  // ── Topup ─────────────────────────────────────────────────────────────────
  async function handleTopup(id: string) {
    if (!topupAmount || Number(topupAmount) <= 0) { setError('Вкажіть суму'); return; }
    setSaving(true); setError('');
    const res = await fetch('/api/admin/partners/topup', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ customer_id: id, amount: Number(topupAmount), description: topupNote || 'Поповнення (адмін)' }),
    });
    setSaving(false);
    if (!res.ok) { setError('Помилка'); return; }
    setCustomers(prev => prev.map(c =>
      c.id === id ? { ...c, balance: Number(c.balance) + Number(topupAmount) } : c
    ));
    setTopupId(null); setTopupAmount(''); setTopupNote('');
  }

  // ── Payout ────────────────────────────────────────────────────────────────
  async function handlePayout(payoutId: string, action: 'approve' | 'reject') {
    setSaving(true);
    await fetch(`/api/admin/partners/payout/${payoutId}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action }),
    });
    setSaving(false);
    setPayouts(prev => prev.filter(p => p.id !== payoutId));
  }

  const isPartnerType = (type: string) => type === 'wholesale' || type === 'dropship_partner';

  return (
    <>
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <div>
          <h1 style={{ fontSize: '22px', fontWeight: 800, color: 'var(--text-primary)', margin: 0 }}>Контрагенти</h1>
          <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginTop: '4px' }}>
            Єдиний довідник клієнтів — роздріб, опт, дропшип-партнери
          </p>
        </div>
        <button onClick={() => setShowNew(true)}
          style={{ display: 'flex', alignItems: 'center', gap: '6px', height: '38px', padding: '0 18px', borderRadius: '9px', background: '#1E3A5F', color: '#fff', border: 'none', fontSize: '13px', fontWeight: 700, cursor: 'pointer' }}>
          <Plus size={14} /> Новий контрагент
        </button>
      </div>

      {/* ── Summary cards ──────────────────────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '14px', marginBottom: '24px' }}>
        {[
          { label: 'Всього',           value: String(customers.length),   sub: `${customers.filter(c => c.is_active).length} активних`,  color: '#1E3A5F', icon: Users },
          { label: 'Роздрібних',       value: String(retailCount),        sub: 'Покупці',                                                color: '#64748B', icon: ShoppingBag },
          { label: 'Партнерів',        value: String(partnerCount),       sub: 'Опт + Дропшип',                                          color: '#15803D', icon: TrendingUp },
          { label: 'Загальна виручка', value: fmtMoney(totalRevenue),     sub: `Баланси партнерів: ${fmtMoney(partnerBalance)}`,          color: '#B45309', icon: Wallet },
        ].map(c => {
          const Icon = c.icon;
          return (
            <div key={c.label} style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '12px', padding: '16px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '4px' }}>{c.label}</div>
                <div style={{ fontSize: '22px', fontWeight: 800, color: c.color }}>{c.value}</div>
                <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>{c.sub}</div>
              </div>
              <div style={{ width: '36px', height: '36px', borderRadius: '9px', background: 'var(--bg-soft)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Icon size={16} color={c.color} />
              </div>
            </div>
          );
        })}
      </div>

      {/* ── Pending payouts ─────────────────────────────────────────────────── */}
      {payouts.length > 0 && (
        <div style={{ background: '#FEF3C7', border: '1px solid #FCD34D', borderRadius: '12px', padding: '16px 20px', marginBottom: '20px' }}>
          <div style={{ fontSize: '13px', fontWeight: 700, color: '#B45309', marginBottom: '10px' }}>
            ⏳ Заявки на виплату ({payouts.length})
          </div>
          {payouts.map(p => {
            const partner = customers.find(c => c.id === p.customer_id);
            return (
              <div key={p.id} style={{ background: 'var(--bg-card)', border: '1px solid #FDE68A', borderRadius: '8px', padding: '12px 16px', marginBottom: '8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)' }}>{partner?.name ?? p.customer_id} — {p.amount.toFixed(2)} ₴</div>
                  <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '2px' }}>
                    {p.method === 'bank' ? `Переказ: ${p.bank_details ?? '—'}` : 'Товарний залік'}
                    {' · '}{new Date(p.requested_at).toLocaleDateString('uk-UA')}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button onClick={() => handlePayout(p.id, 'approve')} disabled={saving}
                    style={{ height: '30px', padding: '0 12px', borderRadius: '7px', border: 'none', background: '#15803D', color: '#fff', fontSize: '12px', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <CheckCircle size={12} /> Підтвердити
                  </button>
                  <button onClick={() => handlePayout(p.id, 'reject')} disabled={saving}
                    style={{ height: '30px', padding: '0 12px', borderRadius: '7px', border: '1px solid #FCA5A5', background: '#FEF2F2', color: '#DC2626', fontSize: '12px', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <XCircle size={12} /> Відхилити
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Type tabs ───────────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', gap: '6px', marginBottom: '16px' }}>
        {TABS.map(t => {
          const cnt = t.value ? customers.filter(c => c.type === t.value).length : customers.length;
          const isActive = tab === t.value;
          return (
            <button key={t.value} onClick={() => setTab(t.value)}
              style={{
                height: '32px', padding: '0 14px', borderRadius: '8px', fontSize: '13px', fontWeight: isActive ? 700 : 400,
                border: `1px solid ${isActive ? '#1E3A5F' : 'var(--border)'}`,
                background: isActive ? '#1E3A5F' : 'var(--bg-card)',
                color: isActive ? '#fff' : 'var(--text-secondary)', cursor: 'pointer',
                display: 'flex', alignItems: 'center', gap: '6px',
              }}>
              {t.label}
              {cnt > 0 && (
                <span style={{ fontSize: '10px', fontWeight: 700, background: isActive ? 'rgba(255,255,255,0.25)' : '#E2E8F0', color: isActive ? '#fff' : '#475569', borderRadius: '4px', padding: '0 5px', lineHeight: '16px' }}>
                  {cnt}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* ── Table ───────────────────────────────────────────────────────────── */}
      <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '14px', overflow: 'hidden' }}>
        {/* Header */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 90px 90px 90px 90px 90px 36px', padding: '10px 20px', background: 'var(--bg-soft)', borderBottom: '1px solid var(--border)', fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', gap: '8px' }}>
          <span>Контрагент</span>
          <span style={{ textAlign: 'right' }}>Замовлень</span>
          <span style={{ textAlign: 'right' }}>Виручка</span>
          <span style={{ textAlign: 'right' }}>Баланс</span>
          <span>Остання поку.</span>
          <span style={{ textAlign: 'center' }}>Статус</span>
          <span />
        </div>

        {filtered.length === 0 ? (
          <div style={{ padding: '60px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '13px' }}>
            {tab ? 'Контрагентів цього типу ще немає' : 'Контрагентів ще немає'}
          </div>
        ) : (
          filtered.map((c, i) => {
            const isExpanded  = expandedId  === c.id;
            const isEditing   = editingId   === c.id;
            const isTopup     = topupId     === c.id;
            const typeInfo    = TYPE_LABELS[c.type] ?? TYPE_LABELS.retail;
            const avail       = Number(c.balance) - Number(c.balance_held);
            const hasBalance  = isPartnerType(c.type);

            return (
              <div key={c.id} id={`partner-row-${c.id}`} style={{ borderBottom: i < filtered.length - 1 ? '1px solid var(--border-light)' : 'none' }}>
                {/* Main row */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 90px 90px 90px 90px 90px 36px', padding: '12px 20px', alignItems: 'center', gap: '8px' }}>
                  {/* Name + contact */}
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '7px' }}>
                      <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>{c.name}</span>
                      <span style={{ fontSize: '10px', fontWeight: 700, padding: '1px 7px', borderRadius: '20px', background: typeInfo.bg, color: typeInfo.color }}>
                        {typeInfo.short}
                      </span>
                    </div>
                    {c.company && <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{c.company}</div>}
                    <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
                      {[c.phone, c.email, c.city].filter(Boolean).join(' · ')}
                    </div>
                  </div>

                  {/* Orders count */}
                  <div style={{ textAlign: 'right', fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>
                    {c.orders_count}
                  </div>

                  {/* Revenue */}
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>{fmtMoney(Number(c.total_revenue))}</div>
                  </div>

                  {/* Balance (partners only) */}
                  <div style={{ textAlign: 'right' }}>
                    {hasBalance ? (
                      <>
                        <div style={{ fontSize: '13px', fontWeight: 700, color: avail >= 0 ? '#15803D' : '#DC2626' }}>{fmtMoney(avail)}</div>
                        <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>всього: {fmtMoney(Number(c.balance))}</div>
                      </>
                    ) : <span style={{ color: 'var(--text-muted)', fontSize: '12px' }}>—</span>}
                  </div>

                  {/* Last order */}
                  <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                    {fmtDate(c.last_order_at)}
                  </div>

                  {/* Status */}
                  <div style={{ display: 'flex', justifyContent: 'center' }}>
                    <button onClick={() => toggleActive(c.id, c.is_active)}
                      style={{ padding: '2px 10px', borderRadius: '20px', border: 'none', fontSize: '11px', fontWeight: 600, cursor: 'pointer', background: c.is_active ? '#DCFCE7' : '#F1F5F9', color: c.is_active ? '#16A34A' : '#64748B' }}>
                      {c.is_active ? 'Активний' : 'Вимкнено'}
                    </button>
                  </div>

                  {/* Expand / Edit toggle */}
                  <button onClick={() => {
                    if (isEditing) { setEditingId(null); setEditForm({}); return; }
                    setExpandedId(isExpanded ? null : c.id);
                    setTopupId(null);
                  }}
                    style={{ width: '28px', height: '28px', borderRadius: '7px', border: '1px solid var(--border)', background: 'var(--bg-soft)', color: 'var(--text-secondary)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    {isExpanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                  </button>
                </div>

                {/* ── Expanded section ────────────────────────────────────── */}
                {isExpanded && (
                  <div style={{ background: 'var(--bg-soft)', borderTop: '1px solid var(--border-light)', padding: '14px 20px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    {/* Action bar */}
                    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                      <button onClick={() => setViewingId(c.id)}
                        style={{ height: '30px', padding: '0 12px', borderRadius: '7px', border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text-secondary)', fontSize: '12px', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <Eye size={11} /> Картка
                      </button>
                      <button onClick={() => {
                        setEditingId(c.id);
                        setEditPhone(c.phone ?? '');
                        setEditForm({ name: c.name, company: c.company ?? '', email: c.email ?? '', city: c.city ?? '', type: c.type, credit_limit: c.credit_limit ?? undefined, notes: c.notes ?? '' });
                      }}
                        style={{ height: '30px', padding: '0 12px', borderRadius: '7px', border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text-secondary)', fontSize: '12px', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <Edit2 size={11} /> Редагувати
                      </button>
                      {hasBalance && (
                        <button onClick={() => { setTopupId(isTopup ? null : c.id); setTopupAmount(''); setTopupNote(''); setError(''); }}
                          style={{ height: '30px', padding: '0 12px', borderRadius: '7px', border: 'none', background: '#EFF6FF', color: '#4880B8', fontSize: '12px', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}>
                          <Plus size={11} /> Поповнити баланс
                        </button>
                      )}
                    </div>

                    {/* Edit form */}
                    {isEditing && (
                      <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '10px', padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: '8px' }}>
                          {[
                            { key: 'name',    label: "Ім'я / Назва *" },
                            { key: 'company', label: 'Компанія' },
                            { key: 'email',   label: 'Email' },
                            { key: 'city',    label: 'Місто' },
                          ].map(f => (
                            <div key={f.key}>
                              <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '3px', textTransform: 'uppercase' }}>{f.label}</div>
                              <input
                                value={String((editForm as Record<string, unknown>)[f.key] ?? '')}
                                onChange={e => setEditForm(prev => ({ ...prev, [f.key]: e.target.value }))}
                                style={inp} />
                            </div>
                          ))}
                          <div>
                            <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '3px', textTransform: 'uppercase' }}>Телефон</div>
                            <input
                              value={editPhone}
                              placeholder="+38 (0__) ___-__-__"
                              onChange={e => setEditPhone(formatPhone(getLocalDigits(e.target.value)))}
                              onKeyDown={e => {
                                if (e.key !== 'Backspace') return;
                                e.preventDefault();
                                setEditPhone(formatPhone(getLocalDigits(editPhone).slice(0, -1)));
                              }}
                              style={inp} />
                          </div>
                          <div>
                            <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '3px', textTransform: 'uppercase' }}>Тип</div>
                            <select value={editForm.type ?? c.type}
                              onChange={e => setEditForm(prev => ({ ...prev, type: e.target.value }))}
                              style={{ ...inp, cursor: 'pointer' }}>
                              <option value="retail">Роздріб</option>
                              <option value="wholesale">Оптовий</option>
                              <option value="dropship_partner">Дропшип</option>
                            </select>
                          </div>
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 120px', gap: '8px' }}>
                          <div>
                            <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '3px', textTransform: 'uppercase' }}>Нотатки</div>
                            <input value={String(editForm.notes ?? '')} onChange={e => setEditForm(prev => ({ ...prev, notes: e.target.value }))} style={inp} placeholder="Внутрішні примітки" />
                          </div>
                          <div>
                            <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '3px', textTransform: 'uppercase' }}>Кредит ₴</div>
                            <input type="number" min={0} value={String(editForm.credit_limit ?? '')} onChange={e => setEditForm(prev => ({ ...prev, credit_limit: Number(e.target.value) || undefined }))} style={inp} placeholder="0" />
                          </div>
                        </div>
                        {error && <div style={{ color: '#DC2626', fontSize: '12px' }}>{error}</div>}
                        <div style={{ display: 'flex', gap: '8px' }}>
                          <button onClick={() => handleSaveEdit(c.id)} disabled={saving}
                            style={{ height: '32px', padding: '0 16px', borderRadius: '7px', border: 'none', background: '#1E3A5F', color: '#fff', fontSize: '12px', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px', opacity: saving ? 0.7 : 1 }}>
                            <Save size={12} /> Зберегти
                          </button>
                          <button onClick={() => { setEditingId(null); setEditForm({}); }}
                            style={{ height: '32px', padding: '0 12px', borderRadius: '7px', border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-secondary)', fontSize: '12px', cursor: 'pointer' }}>
                            Скасувати
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Topup form */}
                    {isTopup && (
                      <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-end', flexWrap: 'wrap' }}>
                        <div style={{ width: '130px' }}>
                          <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '3px', textTransform: 'uppercase' }}>Сума ₴</div>
                          <input type="number" min={1} step={50} value={topupAmount} onChange={e => setTopupAmount(e.target.value)} placeholder="500" style={inp} />
                        </div>
                        <div style={{ flex: 1, minWidth: '160px' }}>
                          <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '3px', textTransform: 'uppercase' }}>Примітка</div>
                          <input value={topupNote} onChange={e => setTopupNote(e.target.value)} placeholder="Оплата рахунку №..." style={inp} />
                        </div>
                        <button onClick={() => handleTopup(c.id)} disabled={saving}
                          style={{ height: '34px', padding: '0 16px', borderRadius: '7px', border: 'none', background: '#15803D', color: '#fff', fontSize: '12px', fontWeight: 700, cursor: 'pointer' }}>
                          Поповнити
                        </button>
                        <button onClick={() => setTopupId(null)}
                          style={{ height: '34px', padding: '0 10px', borderRadius: '7px', border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-secondary)', fontSize: '12px', cursor: 'pointer' }}>
                          Скасувати
                        </button>
                        {error && <div style={{ color: '#DC2626', fontSize: '12px' }}>{error}</div>}
                      </div>
                    )}

                    {/* Transactions (partners only) */}
                    {hasBalance && !isEditing && <PartnerTransactions partnerId={c.id} />}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* ── Customer card modal ────────────────────────────────────────────── */}
      {viewingId && (() => {
        const vc = customers.find(c => c.id === viewingId);
        if (!vc) return null;
        const typeInfo = TYPE_LABELS[vc.type] ?? TYPE_LABELS.retail;
        const avail    = Number(vc.balance) - Number(vc.balance_held);
        const hasBalance = vc.type === 'wholesale' || vc.type === 'dropship_partner';
        return (
          <div style={{ position: 'fixed', inset: 0, zIndex: 300, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
            onClick={e => { if (e.target === e.currentTarget) setViewingId(null); }}>
            <div style={{ background: 'var(--bg-card)', borderRadius: '18px', width: '520px', maxWidth: '95vw', boxShadow: '0 32px 80px rgba(0,0,0,0.45)', border: '1px solid var(--border)', overflow: 'hidden' }}>

              {/* Header */}
              <div style={{ background: 'linear-gradient(135deg, #1E3A5F 0%, #0F2040 100%)', padding: '24px 28px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px' }}>
                    <span style={{ fontSize: '20px', fontWeight: 800, color: '#fff' }}>{vc.name}</span>
                    <span style={{ fontSize: '11px', fontWeight: 700, padding: '2px 9px', borderRadius: '20px', background: typeInfo.bg, color: typeInfo.color }}>{typeInfo.label}</span>
                  </div>
                  {vc.company && <div style={{ fontSize: '13px', color: '#94A3B8' }}>{vc.company}</div>}
                  <div style={{ fontSize: '11px', color: '#64748B', marginTop: '2px' }}>
                    ID: {vc.id.slice(0, 8)}…
                    {vc.partner_code && ` · Код: ${vc.partner_code}`}
                  </div>
                </div>
                <button onClick={() => setViewingId(null)} style={{ background: 'rgba(255,255,255,0.1)', border: 'none', borderRadius: '8px', width: '32px', height: '32px', cursor: 'pointer', color: '#94A3B8', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <X size={16} />
                </button>
              </div>

              {/* Body */}
              <div style={{ padding: '24px 28px', display: 'flex', flexDirection: 'column', gap: '20px' }}>

                {/* Contacts */}
                <div>
                  <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '10px' }}>Контакти</div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                    {[
                      { label: 'Телефон', value: vc.phone },
                      { label: 'Email',   value: vc.email },
                      { label: 'Місто',   value: vc.city },
                    ].filter(r => r.value).map(r => (
                      <div key={r.label} style={{ background: 'var(--bg-soft)', borderRadius: '9px', padding: '10px 14px' }}>
                        <div style={{ fontSize: '10px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '3px' }}>{r.label}</div>
                        <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>{r.value}</div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Stats */}
                <div>
                  <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '10px' }}>Статистика</div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px' }}>
                    {[
                      { label: 'Замовлень',    value: String(vc.orders_count) },
                      { label: 'Виручка',      value: fmtMoney(Number(vc.total_revenue)) },
                      { label: 'Остання купів', value: fmtDate(vc.last_order_at) },
                    ].map(r => (
                      <div key={r.label} style={{ background: 'var(--bg-soft)', borderRadius: '9px', padding: '10px 14px', textAlign: 'center' }}>
                        <div style={{ fontSize: '10px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '3px' }}>{r.label}</div>
                        <div style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text-primary)' }}>{r.value}</div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Balance (partners) */}
                {hasBalance && (
                  <div style={{ background: Number(avail) >= 0 ? '#F0FDF4' : '#FEF2F2', borderRadius: '10px', padding: '14px 18px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '3px' }}>Баланс</div>
                      <div style={{ fontSize: '20px', fontWeight: 800, color: avail >= 0 ? '#15803D' : '#DC2626' }}>{fmtMoney(avail)}</div>
                      <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Всього: {fmtMoney(Number(vc.balance))} · Заморожено: {fmtMoney(Number(vc.balance_held))}</div>
                    </div>
                    {vc.credit_limit && (
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '3px' }}>Кредит</div>
                        <div style={{ fontSize: '16px', fontWeight: 700, color: '#4880B8' }}>{fmtMoney(Number(vc.credit_limit))}</div>
                      </div>
                    )}
                  </div>
                )}

                {/* Notes */}
                {vc.notes && (
                  <div style={{ background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: '9px', padding: '12px 16px' }}>
                    <div style={{ fontSize: '10px', fontWeight: 700, color: '#B45309', textTransform: 'uppercase', marginBottom: '4px' }}>Нотатки</div>
                    <div style={{ fontSize: '13px', color: 'var(--text-primary)' }}>{vc.notes}</div>
                  </div>
                )}

                {/* Footer actions */}
                <div style={{ display: 'flex', gap: '10px' }}>
                  <button onClick={() => { setViewingId(null); setExpandedId(vc.id); setEditingId(vc.id); setEditPhone(vc.phone ?? ''); setEditForm({ name: vc.name, company: vc.company ?? '', email: vc.email ?? '', city: vc.city ?? '', type: vc.type, credit_limit: vc.credit_limit ?? undefined, notes: vc.notes ?? '' }); }}
                    style={{ flex: 1, height: '38px', borderRadius: '9px', border: '1.5px solid var(--border)', background: 'var(--bg-soft)', color: 'var(--text-secondary)', fontSize: '13px', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
                    <Edit2 size={13} /> Редагувати
                  </button>
                  <button onClick={() => setViewingId(null)}
                    style={{ flex: 1, height: '38px', borderRadius: '9px', border: 'none', background: '#1E3A5F', color: '#fff', fontSize: '13px', fontWeight: 700, cursor: 'pointer' }}>
                    Закрити
                  </button>
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ── New customer modal ─────────────────────────────────────────────── */}
      {showNew && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          onClick={e => { if (e.target === e.currentTarget) setShowNew(false); }}>
          <div style={{ background: 'var(--bg-card)', borderRadius: '16px', padding: '28px 32px', width: '520px', boxShadow: '0 24px 60px rgba(0,0,0,0.4)', border: '1px solid var(--border)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <div style={{ fontSize: '17px', fontWeight: 800, color: 'var(--text-primary)' }}>Новий контрагент</div>
              <button onClick={() => setShowNew(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex' }}><X size={18} /></button>
            </div>

            {/* Type selector */}
            <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
              {[
                { value: 'retail',           label: 'Роздрібний' },
                { value: 'wholesale',        label: 'Оптовий' },
                { value: 'dropship_partner', label: 'Дропшип' },
              ].map(t => (
                <button key={t.value} onClick={() => setNewForm(prev => ({ ...prev, type: t.value }))}
                  style={{
                    flex: 1, padding: '7px', borderRadius: '8px', fontSize: '12px', fontWeight: 600, cursor: 'pointer',
                    border: `1.5px solid ${newForm.type === t.value ? '#1E3A5F' : 'var(--border)'}`,
                    background: newForm.type === t.value ? '#1E3A5F' : 'var(--bg-soft)',
                    color: newForm.type === t.value ? '#fff' : 'var(--text-secondary)',
                  }}>
                  {t.label}
                </button>
              ))}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '12px' }}>
              {[
                { key: 'name',    label: "Ім'я / Назва *", placeholder: 'Іваненко Петро' },
                { key: 'company', label: 'Компанія',        placeholder: 'ТОВ «...»' },
                { key: 'email',   label: 'Email',           placeholder: 'email@...' },
                { key: 'city',    label: 'Місто',           placeholder: 'Харків' },
              ].map(f => (
                <div key={f.key}>
                  <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '3px', textTransform: 'uppercase' }}>{f.label}</div>
                  <input
                    placeholder={f.placeholder}
                    value={(newForm as Record<string, string>)[f.key] ?? ''}
                    onChange={e => setNewForm(prev => ({ ...prev, [f.key]: e.target.value }))}
                    style={inp} />
                </div>
              ))}
              <div>
                <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '3px', textTransform: 'uppercase' }}>Телефон</div>
                <input
                  placeholder="+38 (0__) ___-__-__"
                  value={newPhone}
                  onChange={e => setNewPhone(formatPhone(getLocalDigits(e.target.value)))}
                  onKeyDown={e => {
                    if (e.key !== 'Backspace') return;
                    e.preventDefault();
                    setNewPhone(formatPhone(getLocalDigits(newPhone).slice(0, -1)));
                  }}
                  style={inp} />
              </div>
              {(newForm.type === 'wholesale' || newForm.type === 'dropship_partner') && (
                <div>
                  <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '3px', textTransform: 'uppercase' }}>Кредитний ліміт ₴</div>
                  <input type="number" min={0} placeholder="0"
                    value={newForm.credit_limit}
                    onChange={e => setNewForm(prev => ({ ...prev, credit_limit: e.target.value }))}
                    style={inp} />
                </div>
              )}
            </div>

            <div style={{ marginBottom: '16px' }}>
              <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '3px', textTransform: 'uppercase' }}>Нотатки</div>
              <input placeholder="Внутрішні примітки..." value={newForm.notes}
                onChange={e => setNewForm(prev => ({ ...prev, notes: e.target.value }))} style={inp} />
            </div>

            {newError && <div style={{ color: '#DC2626', fontSize: '13px', marginBottom: '10px' }}>{newError}</div>}

            <div style={{ display: 'flex', gap: '10px' }}>
              <button onClick={() => setShowNew(false)}
                style={{ flex: 1, height: '40px', borderRadius: '9px', border: '1.5px solid var(--border)', background: 'var(--bg-soft)', color: 'var(--text-secondary)', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}>
                Скасувати
              </button>
              <button onClick={handleCreate} disabled={newSaving}
                style={{ flex: 1, height: '40px', borderRadius: '9px', border: 'none', background: '#1E3A5F', color: '#fff', fontSize: '13px', fontWeight: 700, cursor: 'pointer', opacity: newSaving ? 0.7 : 1 }}>
                {newSaving ? 'Збереження...' : 'Створити'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// ── Partner transaction history (for wholesale/dropship) ──────────────────────
function PartnerTransactions({ partnerId }: { partnerId: string }) {
  const [txs,     setTxs]     = useState<Record<string, unknown>[] | null>(null);
  const [loading, setLoading] = useState(false);

  if (!txs && !loading) {
    setLoading(true);
    fetch(`/api/admin/partners/${partnerId}/transactions`)
      .then(r => r.json())
      .then(data => { setTxs(data); setLoading(false); })
      .catch(() => { setTxs([]); setLoading(false); });
  }

  const TX_LABELS: Record<string, string> = {
    top_up: 'Поповнення', charge: 'Списання', cod_credit: 'COD нарахування',
    np_fee: 'Комісія НП', return_refund: 'Повернення', return_fee: 'Зворотна доставка',
    payout: 'Виплата', goods_offset: 'Товарний залік', adjustment: 'Коригування',
  };

  if (loading) return <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Завантаження транзакцій...</div>;
  if (!txs?.length) return null;

  return (
    <div>
      <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '6px', textTransform: 'uppercase' }}>Транзакції</div>
      {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
      {txs.map((tx: any) => (
        <div key={tx.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', borderBottom: '1px solid var(--border-light)', fontSize: '12px' }}>
          <div>
            <span style={{ color: 'var(--text-primary)', fontWeight: 500 }}>{TX_LABELS[tx.tx_type] ?? tx.tx_type}</span>
            {tx.description && <span style={{ color: 'var(--text-muted)', marginLeft: '8px' }}>{tx.description}</span>}
          </div>
          <div style={{ display: 'flex', gap: '16px', flexShrink: 0 }}>
            <span style={{ color: tx.amount >= 0 ? '#15803D' : '#DC2626', fontWeight: 700 }}>
              {tx.amount >= 0 ? '+' : ''}{Number(tx.amount).toFixed(2)} ₴
            </span>
            <span style={{ color: 'var(--text-muted)', minWidth: '76px', textAlign: 'right' }}>
              {new Date(tx.created_at).toLocaleDateString('uk-UA')}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}
