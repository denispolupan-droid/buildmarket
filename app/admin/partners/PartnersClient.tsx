'use client';

import { useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import {
  Wallet, CheckCircle, XCircle, Plus, ChevronDown, ChevronUp,
  Users, ShoppingBag, TrendingUp, X, Edit2, Save, Eye, FileText,
} from 'lucide-react';
import Link from 'next/link';

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
  notes: string | null; customer_number: number | null;
  legal_name: string | null; tax_number: string | null;
  address: string | null; legal_address: string | null;
  bank_name: string | null; bank_iban: string | null; bank_mfo: string | null;
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

  // Contracts for the viewed customer
  type ContractRow = { id: string; contract_number: string; status: string; credit_days: number; credit_limit: number; payment_terms: string | null; start_date: string | null; end_date: string | null; is_auto: boolean };
  const [contracts,      setContracts]      = useState<ContractRow[]>([]);
  const [contractsLoading, setContractsLoading] = useState(false);
  const [showNewContract,  setShowNewContract]  = useState(false);
  const [newContract,      setNewContract]      = useState({ payment_terms: 'prepay', credit_days: 0, credit_limit: 0 });

  useEffect(() => {
    if (!viewingId) { setContracts([]); return; }
    setContractsLoading(true);
    fetch(`/api/admin/contracts?customer_id=${viewingId}`)
      .then(r => r.json()).then(d => setContracts(Array.isArray(d) ? d : []))
      .finally(() => setContractsLoading(false));
  }, [viewingId]);

  async function addCustomerContract() {
    if (!viewingId) return;
    const res = await fetch('/api/admin/contracts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ customer_id: viewingId, ...newContract }),
    });
    if (res.ok) {
      const c = await res.json();
      setContracts(prev => [c, ...prev]);
      setShowNewContract(false);
      setNewContract({ payment_terms: 'prepay', credit_days: 0, credit_limit: 0 });
    }
  }

  // New customer modal
  const [showNew,  setShowNew]  = useState(false);
  const [newForm,  setNewForm]  = useState({
    name: '', company: '', legal_name: '', tax_number: '',
    email: '', city: '', address: '', legal_address: '',
    bank_name: '', bank_iban: '', bank_mfo: '',
    type: 'retail', credit_limit: '', notes: '',
    contract_payment_terms: 'prepay', contract_credit_days: 0, contract_credit_limit: 0,
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

    const { contract_payment_terms, contract_credit_days, contract_credit_limit, ...customerFields } = newForm;

    const res = await fetch('/api/admin/partners', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...customerFields, phone: newPhone }),
    });
    const data = await res.json();
    if (!res.ok) { setNewSaving(false); setNewError(data.error ?? 'Помилка'); return; }

    // For wholesale/dropship — create contract with specified terms right away
    if (newForm.type === 'wholesale' || newForm.type === 'dropship_partner') {
      await fetch('/api/admin/contracts', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customer_id:   data.id,
          payment_terms: contract_payment_terms,
          credit_days:   contract_credit_days,
          credit_limit:  contract_credit_limit,
          is_auto:       false,
        }),
      });
    }

    setNewSaving(false);
    setCustomers(prev => [data, ...prev]);
    setShowNew(false);
    setNewForm({ name: '', company: '', legal_name: '', tax_number: '', email: '', city: '', address: '', legal_address: '', bank_name: '', bank_iban: '', bank_mfo: '', type: 'retail', credit_limit: '', notes: '', contract_payment_terms: 'prepay', contract_credit_days: 0, contract_credit_limit: 0 });
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
      <div style={{ display: 'flex', gap: '6px', marginBottom: '16px', alignItems: 'center' }}>
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
        <div style={{ flex: 1 }} />
      </div>

      {/* ── Table ───────────────────────────────────────────────────────────── */}
      <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '14px', overflow: 'hidden' }}>
        {/* Header */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 90px 130px 120px 150px 130px 36px', padding: '10px 20px', background: 'var(--bg-soft)', borderBottom: '1px solid var(--border)', fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', gap: '12px' }}>
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
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 90px 130px 120px 150px 130px 36px', padding: '12px 20px', alignItems: 'center', gap: '12px' }}>
                  {/* Name + contact */}
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '7px' }}>
                      {c.customer_number && (
                        <span style={{ fontSize: '10px', fontWeight: 700, color: 'var(--text-muted)', flexShrink: 0 }}>
                          #{String(c.customer_number).padStart(3, '0')}
                        </span>
                      )}
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
                        setEditForm({ name: c.name, company: c.company ?? '', email: c.email ?? '', city: c.city ?? '', type: c.type, credit_limit: c.credit_limit ?? undefined, notes: c.notes ?? '', legal_name: c.legal_name ?? '', tax_number: c.tax_number ?? '', legal_address: c.legal_address ?? '', address: c.address ?? '', bank_name: c.bank_name ?? '', bank_iban: c.bank_iban ?? '', bank_mfo: c.bank_mfo ?? '' });
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
                        {/* Основна */}
                        <div style={{ fontSize: '10px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Основна інформація</div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: '8px' }}>
                          {[
                            { key: 'name',    label: "Ім'я / Назва *" },
                            { key: 'company', label: 'Компанія' },
                            { key: 'email',   label: 'Email' },
                            { key: 'city',    label: 'Місто' },
                          ].map(f => (
                            <div key={f.key}>
                              <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '3px', textTransform: 'uppercase' }}>{f.label}</div>
                              <input value={String((editForm as Record<string, unknown>)[f.key] ?? '')}
                                onChange={e => setEditForm(prev => ({ ...prev, [f.key]: e.target.value }))} style={inp} />
                            </div>
                          ))}
                          <div>
                            <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '3px', textTransform: 'uppercase' }}>Телефон</div>
                            <input value={editPhone} placeholder="+38 (0__) ___-__-__"
                              onChange={e => setEditPhone(formatPhone(getLocalDigits(e.target.value)))}
                              onKeyDown={e => { if (e.key !== 'Backspace') return; e.preventDefault(); setEditPhone(formatPhone(getLocalDigits(editPhone).slice(0, -1))); }}
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
                          <div>
                            <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '3px', textTransform: 'uppercase' }}>Кредит ₴</div>
                            <input type="number" min={0} value={String(editForm.credit_limit ?? '')} onChange={e => setEditForm(prev => ({ ...prev, credit_limit: Number(e.target.value) || undefined }))} style={inp} placeholder="0" />
                          </div>
                        </div>
                        {/* Реквізити */}
                        <div style={{ fontSize: '10px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginTop: '2px' }}>Юридичні реквізити</div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: '8px' }}>
                          <div>
                            <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '3px', textTransform: 'uppercase' }}>Юридична назва</div>
                            <input value={String((editForm as Record<string, unknown>).legal_name ?? '')} onChange={e => setEditForm(prev => ({ ...prev, legal_name: e.target.value }))} style={inp} placeholder="ТОВ або ФОП" />
                          </div>
                          <div>
                            <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '3px', textTransform: 'uppercase' }}>ЄДРПОУ / ІПН</div>
                            <input value={String((editForm as Record<string, unknown>).tax_number ?? '')} onChange={e => setEditForm(prev => ({ ...prev, tax_number: e.target.value }))} style={inp} placeholder="12345678" />
                          </div>
                          <div>
                            <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '3px', textTransform: 'uppercase' }}>Юрадреса</div>
                            <input value={String((editForm as Record<string, unknown>).legal_address ?? '')} onChange={e => setEditForm(prev => ({ ...prev, legal_address: e.target.value }))} style={inp} placeholder="вул., місто" />
                          </div>
                          <div>
                            <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '3px', textTransform: 'uppercase' }}>Факт. адреса</div>
                            <input value={String((editForm as Record<string, unknown>).address ?? '')} onChange={e => setEditForm(prev => ({ ...prev, address: e.target.value }))} style={inp} placeholder="вул., місто" />
                          </div>
                        </div>
                        {/* Банк */}
                        <div style={{ fontSize: '10px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginTop: '2px' }}>Банківські реквізити</div>
                        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: '8px' }}>
                          <div>
                            <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '3px', textTransform: 'uppercase' }}>IBAN / Р/С</div>
                            <input value={String((editForm as Record<string, unknown>).bank_iban ?? '')} onChange={e => setEditForm(prev => ({ ...prev, bank_iban: e.target.value }))} style={inp} placeholder="UA21..." />
                          </div>
                          <div>
                            <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '3px', textTransform: 'uppercase' }}>МФО</div>
                            <input value={String((editForm as Record<string, unknown>).bank_mfo ?? '')} onChange={e => setEditForm(prev => ({ ...prev, bank_mfo: e.target.value }))} style={inp} placeholder="322313" />
                          </div>
                          <div>
                            <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '3px', textTransform: 'uppercase' }}>Банк</div>
                            <input value={String((editForm as Record<string, unknown>).bank_name ?? '')} onChange={e => setEditForm(prev => ({ ...prev, bank_name: e.target.value }))} style={inp} placeholder="АТ «ПриватБанк»" />
                          </div>
                        </div>
                        {/* Нотатки */}
                        <div>
                          <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '3px', textTransform: 'uppercase' }}>Нотатки</div>
                          <input value={String(editForm.notes ?? '')} onChange={e => setEditForm(prev => ({ ...prev, notes: e.target.value }))} style={inp} placeholder="Внутрішні примітки" />
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
            <div style={{ background: 'var(--bg-card)', borderRadius: '18px', width: '640px', maxWidth: '95vw', boxShadow: '0 32px 80px rgba(0,0,0,0.45)', border: '1px solid var(--border)', overflow: 'hidden' }}>

              {/* Header */}
              <div style={{ background: 'linear-gradient(135deg, #1E3A5F 0%, #0F2040 100%)', padding: '24px 28px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px' }}>
                    <span style={{ fontSize: '20px', fontWeight: 800, color: '#fff' }}>{vc.name}</span>
                    <span style={{ fontSize: '11px', fontWeight: 700, padding: '2px 9px', borderRadius: '20px', background: typeInfo.bg, color: typeInfo.color }}>{typeInfo.label}</span>
                  </div>
                  {vc.company && <div style={{ fontSize: '13px', color: '#94A3B8' }}>{vc.company}</div>}
                  <div style={{ fontSize: '11px', color: '#64748B', marginTop: '2px' }}>
                    {vc.customer_number ? `#${String(vc.customer_number).padStart(3, '0')}` : `ID: ${vc.id.slice(0, 8)}…`}
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

                {/* Contracts */}
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
                    <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Договори</div>
                    <button onClick={() => setShowNewContract(v => !v)}
                      style={{ fontSize: '11px', fontWeight: 700, color: '#1E3A5F', background: '#EFF4FF', border: '1px solid #BFDBFE', borderRadius: '6px', padding: '3px 10px', cursor: 'pointer' }}>
                      + Новий
                    </button>
                  </div>
                  {showNewContract && (
                    <div style={{ background: '#F8FAFC', border: '1px solid var(--border)', borderRadius: '10px', padding: '12px 14px', marginBottom: '10px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px' }}>
                        <div>
                          <div style={{ fontSize: '10px', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '3px' }}>Умови оплати</div>
                          <select value={newContract.payment_terms} onChange={e => setNewContract(p => ({ ...p, payment_terms: e.target.value }))}
                            style={{ width: '100%', padding: '5px 8px', border: '1px solid var(--border)', borderRadius: '6px', fontSize: '12px', background: 'var(--bg-card)', color: 'var(--text-primary)' }}>
                            <option value="prepay">Передоплата</option>
                            <option value="deferred">Відстрочка</option>
                            <option value="consignment">Консигнація</option>
                          </select>
                        </div>
                        <div>
                          <div style={{ fontSize: '10px', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '3px' }}>Днів відстрочки</div>
                          <input type="number" min={0} value={newContract.credit_days} onChange={e => setNewContract(p => ({ ...p, credit_days: Number(e.target.value) }))}
                            style={{ width: '100%', padding: '5px 8px', border: '1px solid var(--border)', borderRadius: '6px', fontSize: '12px', background: 'var(--bg-card)', color: 'var(--text-primary)', boxSizing: 'border-box' }} />
                        </div>
                        <div>
                          <div style={{ fontSize: '10px', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '3px' }}>Кредитний ліміт</div>
                          <input type="number" min={0} value={newContract.credit_limit} onChange={e => setNewContract(p => ({ ...p, credit_limit: Number(e.target.value) }))}
                            style={{ width: '100%', padding: '5px 8px', border: '1px solid var(--border)', borderRadius: '6px', fontSize: '12px', background: 'var(--bg-card)', color: 'var(--text-primary)', boxSizing: 'border-box' }} />
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                        <button onClick={() => setShowNewContract(false)} style={{ fontSize: '12px', padding: '5px 12px', border: '1px solid var(--border)', borderRadius: '6px', background: 'var(--bg-card)', cursor: 'pointer', color: 'var(--text-secondary)' }}>Скасувати</button>
                        <button onClick={addCustomerContract} style={{ fontSize: '12px', padding: '5px 14px', border: 'none', borderRadius: '6px', background: '#1E3A5F', color: '#fff', cursor: 'pointer', fontWeight: 700 }}>Зберегти</button>
                      </div>
                    </div>
                  )}
                  {contractsLoading ? (
                    <div style={{ fontSize: '12px', color: 'var(--text-muted)', padding: '8px 0' }}>Завантаження…</div>
                  ) : contracts.length === 0 ? (
                    <div style={{ fontSize: '12px', color: 'var(--text-muted)', padding: '8px 0' }}>Договорів немає</div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                      {contracts.map(c => (
                        <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 12px', background: c.is_auto ? '#FAFAFA' : 'var(--bg-soft)', borderRadius: '8px', border: `1px solid ${c.is_auto ? '#E2E8F0' : 'var(--border)'}` }}>
                          <FileText size={13} style={{ color: c.is_auto ? '#94A3B8' : '#4880B8', flexShrink: 0 }} />
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)' }}>{c.contract_number}</span>
                            {c.is_auto && (
                              <span title="Створено автоматично при першому замовленні" style={{ fontSize: '9px', fontWeight: 700, padding: '1px 5px', borderRadius: '4px', background: '#F1F5F9', color: '#94A3B8', marginLeft: '6px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Авто</span>
                            )}
                            {c.payment_terms && <span style={{ fontSize: '11px', color: 'var(--text-muted)', marginLeft: '8px' }}>{c.payment_terms === 'prepay' || c.payment_terms === 'Передоплата' ? 'Передоплата' : c.payment_terms === 'deferred' ? `Відстрочка ${c.credit_days}д.` : c.payment_terms}</span>}
                            {(c.credit_limit > 0) && <span style={{ fontSize: '11px', color: '#15803D', marginLeft: '8px' }}>Ліміт: {Number(c.credit_limit).toLocaleString('uk-UA')} ₴</span>}
                          </div>
                          <span style={{ fontSize: '10px', fontWeight: 700, padding: '2px 7px', borderRadius: '20px', background: c.status === 'active' ? '#F0FDF4' : '#F1F5F9', color: c.status === 'active' ? '#15803D' : '#64748B' }}>
                            {c.status === 'active' ? 'Активний' : c.status === 'expired' ? 'Закінчився' : 'Неактивний'}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Footer actions */}
                <div style={{ display: 'flex', gap: '10px' }}>
                  <button onClick={() => { setViewingId(null); setExpandedId(vc.id); setEditingId(vc.id); setEditPhone(vc.phone ?? ''); setEditForm({ name: vc.name, company: vc.company ?? '', email: vc.email ?? '', city: vc.city ?? '', type: vc.type, credit_limit: vc.credit_limit ?? undefined, notes: vc.notes ?? '', legal_name: vc.legal_name ?? '', tax_number: vc.tax_number ?? '', legal_address: vc.legal_address ?? '', address: vc.address ?? '', bank_name: vc.bank_name ?? '', bank_iban: vc.bank_iban ?? '', bank_mfo: vc.bank_mfo ?? '' }); }}
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
          <div style={{ background: 'var(--bg-card)', borderRadius: '16px', padding: '28px 32px', width: '620px', maxHeight: '90vh', display: 'flex', flexDirection: 'column', boxShadow: '0 24px 60px rgba(0,0,0,0.4)', border: '1px solid var(--border)' }}>
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexShrink: 0 }}>
              <div style={{ fontSize: '17px', fontWeight: 800, color: 'var(--text-primary)' }}>Новий контрагент</div>
              <button onClick={() => setShowNew(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex' }}><X size={18} /></button>
            </div>

            {/* Type selector */}
            <div style={{ display: 'flex', gap: '8px', marginBottom: '20px', flexShrink: 0 }}>
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

            {/* Scrollable body */}
            <div style={{ overflowY: 'auto', flex: 1, paddingRight: '4px' }}>

              {/* — Основна інформація — */}
              <div style={{ fontSize: '10px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '8px' }}>Основна інформація</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '16px' }}>
                {[
                  { key: 'name',    label: "Ім'я / Назва *", placeholder: 'Іваненко Петро' },
                  { key: 'company', label: 'Компанія / ТОВ',  placeholder: 'ТОВ «Будівельник»' },
                  { key: 'email',   label: 'Email',           placeholder: 'email@...' },
                  { key: 'city',    label: 'Місто',           placeholder: 'Харків' },
                ].map(f => (
                  <div key={f.key}>
                    <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '3px', textTransform: 'uppercase' }}>{f.label}</div>
                    <input placeholder={f.placeholder} value={(newForm as Record<string, unknown>)[f.key] as string ?? ''}
                      onChange={e => setNewForm(prev => ({ ...prev, [f.key]: e.target.value }))} style={inp} />
                  </div>
                ))}
                <div>
                  <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '3px', textTransform: 'uppercase' }}>Телефон</div>
                  <input placeholder="+38 (0__) ___-__-__" value={newPhone}
                    onChange={e => setNewPhone(formatPhone(getLocalDigits(e.target.value)))}
                    onKeyDown={e => { if (e.key !== 'Backspace') return; e.preventDefault(); setNewPhone(formatPhone(getLocalDigits(newPhone).slice(0, -1))); }}
                    style={inp} />
                </div>
                {(newForm.type === 'wholesale' || newForm.type === 'dropship_partner') && (
                  <div>
                    <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '3px', textTransform: 'uppercase' }}>Кредитний ліміт ₴</div>
                    <input type="number" min={0} placeholder="0" value={newForm.credit_limit}
                      onChange={e => setNewForm(prev => ({ ...prev, credit_limit: e.target.value }))} style={inp} />
                  </div>
                )}
              </div>

              {/* — Юридичні реквізити — */}
              <div style={{ fontSize: '10px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '8px' }}>Юридичні реквізити</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '10px' }}>
                <div>
                  <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '3px', textTransform: 'uppercase' }}>Юридична назва</div>
                  <input placeholder="ТОВ «Назва» або ФОП Іваненко" value={newForm.legal_name}
                    onChange={e => setNewForm(prev => ({ ...prev, legal_name: e.target.value }))} style={inp} />
                </div>
                <div>
                  <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '3px', textTransform: 'uppercase' }}>ЄДРПОУ / ІПН</div>
                  <input placeholder="12345678" value={newForm.tax_number}
                    onChange={e => setNewForm(prev => ({ ...prev, tax_number: e.target.value }))} style={inp} />
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '16px' }}>
                <div>
                  <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '3px', textTransform: 'uppercase' }}>Юридична адреса</div>
                  <input placeholder="вул. Незалежності, 1, м. Харків" value={newForm.legal_address}
                    onChange={e => setNewForm(prev => ({ ...prev, legal_address: e.target.value }))} style={inp} />
                </div>
                <div>
                  <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '3px', textTransform: 'uppercase' }}>Фактична адреса</div>
                  <input placeholder="вул. Пушкіна, 5, офіс 3" value={newForm.address}
                    onChange={e => setNewForm(prev => ({ ...prev, address: e.target.value }))} style={inp} />
                </div>
              </div>

              {/* — Банківські реквізити — */}
              <div style={{ fontSize: '10px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '8px' }}>Банківські реквізити</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px', marginBottom: '16px' }}>
                <div style={{ gridColumn: '1 / 3' }}>
                  <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '3px', textTransform: 'uppercase' }}>IBAN / Р/С</div>
                  <input placeholder="UA213223130000026007233566001" value={newForm.bank_iban}
                    onChange={e => setNewForm(prev => ({ ...prev, bank_iban: e.target.value }))} style={inp} />
                </div>
                <div>
                  <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '3px', textTransform: 'uppercase' }}>МФО</div>
                  <input placeholder="322313" value={newForm.bank_mfo}
                    onChange={e => setNewForm(prev => ({ ...prev, bank_mfo: e.target.value }))} style={inp} />
                </div>
                <div style={{ gridColumn: '1 / -1' }}>
                  <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '3px', textTransform: 'uppercase' }}>Банк</div>
                  <input placeholder="АТ «ПриватБанк»" value={newForm.bank_name}
                    onChange={e => setNewForm(prev => ({ ...prev, bank_name: e.target.value }))} style={inp} />
                </div>
              </div>

              {/* — Умови договору (тільки для опту/дропу) — */}
              {(newForm.type === 'wholesale' || newForm.type === 'dropship_partner') && (
                <>
                  <div style={{ fontSize: '10px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '8px' }}>Умови договору</div>
                  <div style={{ background: '#F0F7FF', border: '1px solid #BFDBFE', borderRadius: '10px', padding: '12px 14px', marginBottom: '16px' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px' }}>
                      <div>
                        <div style={{ fontSize: '11px', fontWeight: 700, color: '#1E3A5F', marginBottom: '3px', textTransform: 'uppercase' }}>Умови оплати</div>
                        <select value={newForm.contract_payment_terms}
                          onChange={e => setNewForm(p => ({ ...p, contract_payment_terms: e.target.value }))}
                          style={{ ...inp, cursor: 'pointer' }}>
                          <option value="prepay">Передоплата</option>
                          <option value="deferred">Відстрочка</option>
                          <option value="consignment">Консигнація</option>
                        </select>
                      </div>
                      <div>
                        <div style={{ fontSize: '11px', fontWeight: 700, color: '#1E3A5F', marginBottom: '3px', textTransform: 'uppercase' }}>Днів відстрочки</div>
                        <input type="number" min={0} value={newForm.contract_credit_days}
                          onChange={e => setNewForm(p => ({ ...p, contract_credit_days: Number(e.target.value) }))}
                          disabled={newForm.contract_payment_terms !== 'deferred'}
                          style={{ ...inp, opacity: newForm.contract_payment_terms !== 'deferred' ? 0.4 : 1 }} />
                      </div>
                      <div>
                        <div style={{ fontSize: '11px', fontWeight: 700, color: '#1E3A5F', marginBottom: '3px', textTransform: 'uppercase' }}>Кредитний ліміт ₴</div>
                        <input type="number" min={0} value={newForm.contract_credit_limit}
                          onChange={e => setNewForm(p => ({ ...p, contract_credit_limit: Number(e.target.value) }))}
                          style={inp} />
                      </div>
                    </div>
                  </div>
                </>
              )}

              {/* — Нотатки — */}
              <div style={{ marginBottom: '8px' }}>
                <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '3px', textTransform: 'uppercase' }}>Нотатки</div>
                <input placeholder="Внутрішні примітки..." value={newForm.notes}
                  onChange={e => setNewForm(prev => ({ ...prev, notes: e.target.value }))} style={inp} />
              </div>

            </div>{/* end scroll */}

            {newError && <div style={{ color: '#DC2626', fontSize: '13px', margin: '10px 0 4px' }}>{newError}</div>}

            <div style={{ display: 'flex', gap: '10px', marginTop: '16px', flexShrink: 0 }}>
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
