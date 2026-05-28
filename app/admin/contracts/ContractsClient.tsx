'use client';

import { useState, useRef } from 'react';
import { Plus, X, Check, Loader2, FileText, Banknote, ExternalLink, Users, Search } from 'lucide-react';
import Link from 'next/link';

type Contract = {
  id: string;
  contract_number: string;
  customer_id: string;
  customer_name: string | null;
  customer_number?: number | null;
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

type CustomerResult = {
  id: string;
  name: string;
  company: string | null;
  phone: string | null;
  customer_number: number | null;
  type: string;
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

const EMPTY: Omit<Contract, 'id' | 'balance' | 'customer_number'> = {
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

function fmtCustomerNum(n: number | null | undefined) {
  if (n == null) return null;
  return `#${String(n).padStart(4, '0')}`;
}

export default function ContractsClient({ initialContracts }: { initialContracts: Contract[] }) {
  const [contracts, setContracts] = useState(initialContracts);
  const [modal, setModal]         = useState<'create' | 'edit' | null>(null);
  const [editing, setEditing]     = useState<Contract | null>(null);
  const [form, setForm]           = useState<Omit<Contract, 'id' | 'balance' | 'customer_number'>>(EMPTY);
  const [saving, setSaving]       = useState(false);
  const [error, setError]         = useState('');
  const [search, setSearch]       = useState('');

  // Customer search in form modal
  const [custSearch,   setCustSearch]   = useState('');
  const [custResults,  setCustResults]  = useState<CustomerResult[]>([]);
  const [custLoading,  setCustLoading]  = useState(false);
  const [custOpen,     setCustOpen]     = useState(false);
  const custTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // Payment modal
  const [payModal, setPayModal]   = useState<Contract | null>(null);
  const [payAmount, setPayAmount] = useState('');
  const [payMethod, setPayMethod] = useState<'bank' | 'cash' | 'acquiring'>('bank');
  const [payDate, setPayDate]     = useState(new Date().toISOString().slice(0, 10));
  const [payDesc, setPayDesc]     = useState('');
  const [payAdvance, setPayAdvance] = useState(false);
  const [paying, setPaying]       = useState(false);
  const [payError, setPayError]   = useState('');

  // ── Customer search ────────────────────────────────────────────────────────
  function handleCustSearch(val: string) {
    setCustSearch(val);
    clearTimeout(custTimer.current);
    if (val.trim().length < 1) { setCustResults([]); setCustOpen(false); return; }
    setCustLoading(true);
    custTimer.current = setTimeout(async () => {
      const res = await fetch(`/api/admin/customers/search?q=${encodeURIComponent(val.trim())}&limit=20`);
      const data: CustomerResult[] = res.ok ? await res.json() : [];
      setCustResults(data);
      setCustOpen(data.length > 0);
      setCustLoading(false);
    }, 200);
  }

  function selectCustomer(c: CustomerResult) {
    setForm(prev => ({
      ...prev,
      customer_id:   c.id,
      customer_name: c.company?.trim() || c.name,
    }));
    setCustSearch(c.company?.trim() || c.name);
    setCustResults([]);
    setCustOpen(false);
  }

  function clearCustomer() {
    setForm(prev => ({ ...prev, customer_id: '', customer_name: '' }));
    setCustSearch('');
    setCustResults([]);
  }

  // ── Next contract number ───────────────────────────────────────────────────
  function nextContractNumber() {
    const year = new Date().getFullYear();
    const prefix = `ДГ-${year}-`;
    const yearContracts = contracts.filter(c => c.contract_number?.startsWith(prefix));
    // Find max sequential number used this year
    let max = yearContracts.length;
    for (const c of yearContracts) {
      const suffix = c.contract_number.slice(prefix.length);
      const n = parseInt(suffix, 10);
      if (!isNaN(n) && n > max) max = n;
    }
    return `${prefix}${String(max + 1).padStart(4, '0')}`;
  }

  // ── Modal open ─────────────────────────────────────────────────────────────
  function openCreate() {
    setForm({ ...EMPTY, contract_number: nextContractNumber() });
    setEditing(null); setError('');
    setCustSearch(''); setCustResults([]); setCustOpen(false);
    setModal('create');
  }

  function openEdit(c: Contract) {
    setForm({ ...c });
    setEditing(c); setError('');
    setCustSearch(c.customer_name || '');
    setCustResults([]); setCustOpen(false);
    setModal('edit');
  }

  function set<K extends keyof typeof form>(key: K, value: typeof form[K]) {
    setForm(prev => ({ ...prev, [key]: value }));
  }

  // ── Save ───────────────────────────────────────────────────────────────────
  async function handleSave() {
    if (!form.customer_id.trim()) { setError('Оберіть клієнта'); return; }
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

  // ── Payment ────────────────────────────────────────────────────────────────
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
      {/* Breadcrumb */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '20px' }}>
        <Link href="/admin/partners"
          style={{ display: 'flex', alignItems: 'center', gap: '6px', height: '30px', padding: '0 12px', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text-secondary)', fontSize: '12px', fontWeight: 500, textDecoration: 'none' }}>
          <Users size={12} /> Контрагенти
        </Link>
        <span style={{ color: 'var(--text-muted)', fontSize: '13px' }}>/</span>
        <span style={{ height: '30px', padding: '0 12px', borderRadius: '8px', border: '1px solid #1E3A5F', background: '#1E3A5F', color: '#fff', fontSize: '12px', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '6px' }}>
          <FileText size={12} /> Договори
        </span>
      </div>

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

      {/* Summary cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px', marginBottom: '20px' }}>
        {[
          { label: 'Активних',      value: contracts.filter(c => c.status === 'active').length,    color: '#16A34A',           accent: '#16A34A' },
          { label: 'Призупинено',   value: contracts.filter(c => c.status === 'suspended').length, color: '#D97706',           accent: '#D97706' },
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
            const custNum = fmtCustomerNum(c.customer_number);
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
                {/* Contract number */}
                <div>
                  <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)' }}>{c.contract_number}</div>
                  {c.end_date && <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>до {c.end_date}</div>}
                </div>
                {/* Customer */}
                <div>
                  <div style={{ fontSize: '13px', color: 'var(--text-primary)' }}>{c.customer_name || '—'}</div>
                  {custNum && (
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 600 }}>
                      {custNum}
                    </div>
                  )}
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

      {/* ── Create / Edit Modal ────────────────────────────────────────────── */}
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

              {/* Номер + Статус */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={lbl}>Номер договору</label>
                  <input style={inp} value={form.contract_number}
                    onChange={e => set('contract_number', e.target.value)}
                    placeholder="ДГ-2026-0001 (авто)" />
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '3px' }}>
                    Залиште порожнім — номер присвоїться автоматично
                  </div>
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

              {/* Клієнт — пошук */}
              <div style={{ position: 'relative' }}>
                <label style={lbl}>Клієнт *</label>
                <div style={{ position: 'relative' }}>
                  <Search size={13} color="#94A3B8" style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} />
                  <input
                    style={{ ...inp, paddingLeft: '32px', paddingRight: form.customer_id ? '36px' : '12px',
                      borderColor: !form.customer_id && error ? '#FCA5A5' : form.customer_id ? '#86EFAC' : undefined }}
                    value={custSearch}
                    onChange={e => handleCustSearch(e.target.value)}
                    placeholder="Пошук за ім'ям, компанією, телефоном..."
                    autoComplete="off"
                  />
                  {custLoading && (
                    <Loader2 size={13} style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', animation: 'spin 1s linear infinite', color: '#94A3B8' }} />
                  )}
                  {form.customer_id && !custLoading && (
                    <button onClick={clearCustomer}
                      style={{ position: 'absolute', right: '8px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: '#94A3B8', display: 'flex', padding: '2px' }}>
                      <X size={13} />
                    </button>
                  )}
                </div>
                {/* Customer number badge */}
                {form.customer_id && (
                  <div style={{ marginTop: '5px', fontSize: '12px', color: '#15803D', display: 'flex', alignItems: 'center', gap: '5px' }}>
                    <Check size={12} />
                    <span>{form.customer_name}</span>
                    <span style={{ fontSize: '11px', color: 'var(--text-muted)', background: 'var(--bg-soft)', padding: '1px 7px', borderRadius: '4px', fontWeight: 600 }}>
                      Клієнт обрано
                    </span>
                  </div>
                )}
                {/* Dropdown */}
                {custOpen && custResults.length > 0 && (
                  <div style={{ position: 'absolute', top: 'calc(100% + 2px)', left: 0, right: 0, zIndex: 50, background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '10px', boxShadow: '0 8px 24px rgba(0,0,0,0.15)', maxHeight: '220px', overflowY: 'auto' }}>
                    {custResults.map((c, i) => (
                      <button key={c.id} onMouseDown={() => selectCustomer(c)}
                        style={{ width: '100%', padding: '9px 12px', background: 'none', border: 'none', borderBottom: i < custResults.length - 1 ? '1px solid var(--border-light)' : 'none', cursor: 'pointer', textAlign: 'left', display: 'flex', alignItems: 'center', gap: '10px' }}
                        onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-soft)')}
                        onMouseLeave={e => (e.currentTarget.style.background = 'none')}
                      >
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)' }}>
                            {c.company || c.name}
                          </div>
                          {c.phone && <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{c.phone}</div>}
                        </div>
                        {c.customer_number != null && (
                          <span style={{ fontSize: '11px', fontWeight: 700, color: '#1E3A5F', background: '#EFF4FF', padding: '2px 7px', borderRadius: '5px', flexShrink: 0 }}>
                            #{String(c.customer_number).padStart(4, '0')}
                          </span>
                        )}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Кредитні умови */}
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

      {/* ── Payment Modal ──────────────────────────────────────────────────── */}
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
              <div style={{ padding: '10px 14px', background: 'var(--bg-soft)', borderRadius: '8px', fontSize: '13px', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <div style={{ flex: 1 }}>
                  <span style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{payModal.contract_number}</span>
                  {' · '}
                  {payModal.customer_name || payModal.customer_id}
                </div>
                {payModal.customer_number != null && (
                  <span style={{ fontSize: '11px', fontWeight: 700, color: '#1E3A5F', background: '#EFF4FF', padding: '2px 8px', borderRadius: '5px', flexShrink: 0 }}>
                    {fmtCustomerNum(payModal.customer_number)}
                  </span>
                )}
                {(payModal.balance ?? 0) > 0 && (
                  <span style={{ color: '#DC2626', fontWeight: 700, fontSize: '13px', flexShrink: 0 }}>
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
