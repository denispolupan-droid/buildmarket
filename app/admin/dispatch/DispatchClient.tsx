'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import './dispatch.css';
import { FileText, Printer, Mail, X, Loader2, Check, Truck, RefreshCw, ArrowLeft, ChevronDown, Plus } from 'lucide-react';
import { Modal } from '../../components/admin/ui/Modal';
import { fmtMoney, fmtInt } from '../../../lib/format';
import type { RegisterView } from '../../../lib/np-registers';

type Order = {
  id: string;
  order_number: number;
  contact: string;
  phone: string;
  total_price: number;
  payment_type: string;
  tracking_number: string;
  status: string;
  delivery_city_name: string | null;
  created_at: string;
  carrier_accepted_at: string | null;
};

type OlderSheet = { ref: string; number: string; dateTime: string; npCount: number };

function fmt(dateStr: string): string {
  if (!dateStr) return '';
  const d = new Date(dateStr.replace(' ', 'T'));
  if (isNaN(d.getTime())) return '';
  return d.toLocaleDateString('uk-UA', { day: '2-digit', month: '2-digit', year: 'numeric' });
}
const fmtShort = (dateStr: string) => fmt(dateStr).slice(0, 5);

const STATUS_LABEL: Record<string, { label: string; color: string; bg: string }> = {
  new:            { label: 'Нове',            color: '#1E3A5F', bg: '#EFF4FF' },
  confirmed:      { label: 'Підтверджено',    color: '#15803D', bg: '#DCFCE7' },
  awaiting_stock: { label: 'Очікуємо товар',  color: '#7C3AED', bg: '#F5F3FF' },
  picking:        { label: 'Збирається',      color: '#0E7490', bg: '#ECFEFF' },
  shipped:        { label: 'Відправлено',     color: '#B45309', bg: '#FEF3C7' },
};

/**
 * Реєстри НП списком (06.11.2026). Раніше сторінка показувала лише ОСТАННІЙ
 * реєстр і додавала посилки саме в нього — навіть коли його вже забрав кур'єр
 * (звідси «Document cannot be added…»). Тепер: усі реєстри за 2 тижні рядками,
 * розгортаються; додаємо у відкритий (не переданий) реєстр або НП створює новий.
 */
export default function DispatchClient({ orders }: { orders: Order[] }) {
  const [registers,     setRegisters]     = useState<RegisterView[]>([]);
  const [older,         setOlder]         = useState<OlderSheet[]>([]);
  const [olderOpen,     setOlderOpen]     = useState(false);
  const [loading,       setLoading]       = useState(true);
  const [expanded,      setExpanded]      = useState<Set<string>>(new Set());
  const [loadingRef,    setLoadingRef]    = useState<string | null>(null);
  const [adding,        setAdding]        = useState<string | null>(null);
  const [error,         setError]         = useState('');
  const [sendFor,       setSendFor]       = useState<RegisterView | null>(null);
  const [sendEmail,     setSendEmail]     = useState('');
  const [sendName,      setSendName]      = useState('');
  const [sending,       setSending]       = useState(false);
  const [sendDone,      setSendDone]      = useState(false);
  const [removingTtn,   setRemovingTtn]   = useState<string | null>(null);
  const [deletingRef,   setDeletingRef]   = useState<string | null>(null);
  const [bulkModal,     setBulkModal]     = useState(false);
  const [bulkSelected,  setBulkSelected]  = useState<Set<string>>(new Set());
  const [bulkAdding,    setBulkAdding]    = useState(false);
  const [bulkProgress,  setBulkProgress]  = useState(0);
  const [showAll,       setShowAll]       = useState(false);

  const loadRegisters = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/registers');
      const data = await res.json() as { registers?: RegisterView[]; older?: OlderSheet[]; error?: string };
      if (!res.ok) throw new Error(data.error ?? 'Помилка');
      const list = data.registers ?? [];
      setRegisters(list);
      setOlder(data.older ?? []);
      // Розгорнутий за замовчуванням — лише відкритий (не переданий) реєстр
      const open = list.find(r => !r.handedOver);
      setExpanded(open ? new Set([open.ref]) : new Set());
    } catch { setError('Помилка завантаження реєстрів НП'); }
    setLoading(false);
  }, []);

  useEffect(() => { loadRegisters(); }, [loadRegisters]);

  const openReg = registers.find(r => !r.handedOver) ?? null;
  const inRegister = new Set(registers.flatMap(r => r.ttns.map(t => t.ttn)));
  // Додати можна лише посилку, якої ще немає в реєстрі і яку не прийняв перевізник:
  // прийняту НП не пустить у жоден реєстр («Document cannot be added…»)
  const addable = orders.filter(o => o.tracking_number && !inRegister.has(o.tracking_number) && !o.carrier_accepted_at);
  const shownOrders = showAll ? orders : addable;

  function toggle(ref: string) {
    setExpanded(prev => { const s = new Set(prev); if (s.has(ref)) s.delete(ref); else s.add(ref); return s; });
  }

  // Старий реєстр (поза 2 тижнями) — посилки довантажуються при розгортанні
  async function openOlder(sheet: OlderSheet) {
    if (registers.some(r => r.ref === sheet.ref)) { toggle(sheet.ref); return; }
    setLoadingRef(sheet.ref);
    try {
      const res = await fetch(`/api/admin/registers?ref=${encodeURIComponent(sheet.ref)}`);
      const data = await res.json() as { register?: RegisterView; error?: string };
      if (!res.ok || !data.register) { setError(data.error ?? 'Не вдалося завантажити реєстр'); return; }
      setRegisters(prev => [...prev, data.register!]);
      setOlder(prev => prev.filter(s => s.ref !== sheet.ref));
      setExpanded(prev => new Set([...prev, sheet.ref]));
    } catch { setError('Мережева помилка'); }
    finally { setLoadingRef(null); }
  }

  /** Додати посилку у відкритий реєстр (або НП створить новий). Повертає true при успіху. */
  async function addToRegister(order: Order, targetRef: string | null = openReg?.ref ?? null): Promise<boolean> {
    setAdding(order.tracking_number);
    setError('');
    try {
      const res = await fetch('/api/admin/registers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ttnNumber: order.tracking_number, registerRef: targetRef }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? 'Помилка'); return false; }
      const ttn = { ttn: order.tracking_number, contact: order.contact, amount: Number(order.total_price) || 0, orderId: order.id, orderNumber: order.order_number, accepted: false };
      const ref: string | null = targetRef ?? data.ref ?? null;
      if (ref && registers.some(r => r.ref === ref)) {
        setRegisters(prev => prev.map(r => r.ref === ref ? { ...r, ttns: [...r.ttns, ttn], total: Math.round((r.total + ttn.amount) * 100) / 100 } : r));
      } else if (ref) {
        // НП створила новий реєстр — ставимо його першим і розгортаємо
        setRegisters(prev => [{ ref, number: data.number ?? '', dateTime: new Date().toISOString(), npCount: 1, printed: false, ttns: [ttn], total: ttn.amount, handedOver: false }, ...prev]);
        setExpanded(e => new Set([...e, ref]));
      }
      return true;
    } catch { setError('Мережева помилка'); return false; }
    finally { setAdding(null); }
  }

  async function removeTtn(reg: RegisterView, ttn: string) {
    setRemovingTtn(ttn);
    setError('');
    try {
      const res = await fetch('/api/admin/registers', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ttnNumber: ttn, registerRef: reg.ref }),
      });
      const data = await res.json();
      if (res.ok) {
        setRegisters(prev => prev.map(r => r.ref === reg.ref
          ? { ...r, ttns: r.ttns.filter(t => t.ttn !== ttn), total: Math.round(r.ttns.filter(t => t.ttn !== ttn).reduce((s, t) => s + t.amount, 0) * 100) / 100 }
          : r));
      } else {
        setError(data.error ?? 'Помилка видалення з НП');
      }
    } catch { setError('Мережева помилка'); }
    finally { setRemovingTtn(null); }
  }

  async function deleteSheet(reg: RegisterView) {
    if (!confirm(`Розформувати реєстр НП #${reg.number}?\n\nЯкщо реєстр вже забрав кур'єр НП — він залишиться в кабінеті НП.`)) return;
    setDeletingRef(reg.ref);
    setError('');
    try {
      const res = await fetch('/api/admin/registers', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ registerRef: reg.ref, ttnNumbers: reg.ttns.map(t => t.ttn) }),
      });
      const data = await res.json();
      if (!res.ok && data.error) setError(`Помилка НП: ${data.error}`);
      await loadRegisters();
    } catch { setError('Мережева помилка'); }
    finally { setDeletingRef(null); }
  }

  function openBulkModal() {
    setBulkSelected(new Set(addable.map(o => o.tracking_number)));
    setBulkProgress(0);
    setBulkModal(true);
  }

  async function confirmBulkAdd() {
    const toAdd = orders.filter(o => bulkSelected.has(o.tracking_number));
    setBulkAdding(true);
    setBulkProgress(0);
    // Перша посилка може створити новий реєстр — далі додаємо в нього ж
    let target = openReg?.ref ?? null;
    for (let i = 0; i < toAdd.length; i++) {
      const res = await fetch('/api/admin/registers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ttnNumber: toAdd[i].tracking_number, registerRef: target }),
      }).then(r => r.json().then(d => ({ ok: r.ok, d }))).catch(() => ({ ok: false, d: { error: 'Мережева помилка' } }));
      if (!res.ok) setError(`${toAdd[i].tracking_number}: ${res.d.error ?? 'помилка'}`);
      else if (!target && res.d.ref) target = res.d.ref;
      setBulkProgress(i + 1);
    }
    setBulkAdding(false);
    setBulkModal(false);
    await loadRegisters();
  }

  async function handleSend() {
    if (!sendEmail.trim() || !sendFor) return;
    setSending(true);
    try {
      const res = await fetch('/api/admin/registers/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ toEmail: sendEmail.trim(), toName: sendName.trim(), registerNumber: sendFor.number, registerRef: sendFor.ref, ttns: sendFor.ttns }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? 'Помилка відправки'); return; }
      setSendDone(true);
      setTimeout(() => { setSendFor(null); setSendDone(false); }, 2000);
    } catch { setError('Мережева помилка'); }
    finally { setSending(false); }
  }

  const btn: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: '5px', height: '32px', padding: '0 14px', borderRadius: '7px', fontSize: '12px', fontWeight: 600, cursor: 'pointer' };

  return (
    <div className="dsp-page" style={{ padding: '28px 32px', maxWidth: '1100px' }}>
      <div className="dsp-head" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <Link href="/admin" style={{ display: 'flex', alignItems: 'center', color: 'var(--text-secondary)', textDecoration: 'none' }}>
            <ArrowLeft size={16} />
          </Link>
          <Truck size={18} color="#1E3A5F" />
          <div>
            <h1 style={{ fontSize: '20px', fontWeight: 800, color: 'var(--text-primary)', margin: 0 }}>Реєстри НП</h1>
            <p className="dsp-sub" style={{ fontSize: '13px', color: 'var(--text-muted)', marginTop: '2px' }}>
              Реєстри відправлень Нової Пошти за 2 тижні
            </p>
          </div>
        </div>
        <button onClick={loadRegisters} disabled={loading} className="dsp-refresh" aria-label="Оновити" title="Оновити"
          style={{ ...btn, height: '34px', fontSize: '13px', border: '1.5px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text-secondary)', borderRadius: '8px' }}>
          <RefreshCw size={14} style={{ animation: loading ? 'spin 1s linear infinite' : 'none' }} />
          <span className="dsp-refresh__text">Оновити</span>
        </button>
      </div>

      {error && (
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', marginBottom: '12px', padding: '9px 12px', borderRadius: '10px', background: 'var(--bg-danger)', border: '1px solid #FECACA', color: 'var(--color-danger)', fontSize: '12.5px' }}>
          <span style={{ flex: 1 }}>{error}</span>
          <button onClick={() => setError('')} aria-label="Закрити" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'inherit', display: 'flex' }}><X size={14} /></button>
        </div>
      )}

      {/* Реєстри — рядками, розгортаються */}
      <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '14px', marginBottom: '24px', overflow: 'hidden' }}>
        {loading && registers.length === 0 ? (
          <div style={{ padding: '18px 16px', fontSize: '13px', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> Завантаження реєстрів з НП…
          </div>
        ) : registers.length === 0 ? (
          <div style={{ padding: '18px 16px', fontSize: '13px', color: 'var(--text-muted)' }}>
            За 2 тижні реєстрів немає — додайте посилки з таблиці нижче, НП створить реєстр.
          </div>
        ) : registers.map((reg, idx) => {
          const isOpen = expanded.has(reg.ref);
          const missing = reg.npCount > reg.ttns.length ? reg.npCount - reg.ttns.length : 0;
          return (
            <div key={reg.ref} className={`dsp-reg${isOpen ? ' is-open' : ''}`} style={{ borderTop: idx ? '1px solid var(--border-light)' : 'none' }}>
              <button type="button" className="dsp-reg-row" onClick={() => toggle(reg.ref)} aria-expanded={isOpen}>
                <ChevronDown size={16} className="dsp-reg-chev" aria-hidden />
                <FileText size={15} color={reg.handedOver ? 'var(--text-muted)' : 'var(--brand-blue)'} aria-hidden />
                <span className="dsp-reg-num">#{reg.number}</span>
                <span className="dsp-reg-meta">{fmtShort(reg.dateTime)} · {Math.max(reg.ttns.length, reg.npCount)} ТТН{reg.total > 0 ? ` · ${fmtInt(reg.total)} ₴` : ''}</span>
                <span className={`dsp-reg-badge${reg.handedOver ? ' is-done' : ''}`} title={reg.handedOver ? 'Усі посилки прийняті перевізником' : 'Можна додавати й прибирати посилки'}>{reg.handedOver ? <><Check size={12} strokeWidth={3} aria-hidden /><span className="dsp-reg-badge__text">Передано НП</span></> : 'Відкритий'}</span>
              </button>

              {isOpen && (
                <div className="dsp-reg-body">
                  {reg.ttns.length === 0 ? (
                    <div style={{ fontSize: '12.5px', color: 'var(--text-muted)', padding: '4px 0 8px' }}>
                      {reg.npCount > 0 ? `У НП ${reg.npCount} ТТН, але за останні тижні їх не знайдено в списку відправлень.` : 'Порожній реєстр.'}
                    </div>
                  ) : reg.ttns.map(t => (
                    <div key={t.ttn} className="dsp-ttn-row">
                      <span className="dsp-t-ttn">{t.ttn}</span>
                      <span className="dsp-t-contact">{t.contact}{t.orderNumber ? <span className="dsp-t-order"> · #{t.orderNumber}</span> : null}</span>
                      <span className="dsp-t-sum">{t.amount > 0 ? `${fmtMoney(t.amount)} ₴` : '—'}</span>
                      {reg.handedOver || t.accepted ? (
                        <span className="dsp-t-x dsp-t-ok" title="Прийнято перевізником"><Check size={13} /></span>
                      ) : (
                        <button className="dsp-t-x" aria-label="Прибрати з реєстру" title="Прибрати з реєстру"
                          disabled={removingTtn === t.ttn} onClick={() => removeTtn(reg, t.ttn)}>
                          {removingTtn === t.ttn ? <Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} /> : <X size={13} />}
                        </button>
                      )}
                    </div>
                  ))}
                  {missing > 0 && reg.ttns.length > 0 && (
                    <div style={{ fontSize: '11.5px', color: 'var(--text-muted)', padding: '4px 0' }}>+ ще {missing} ТТН у НП, створені раніше за 3 тижні</div>
                  )}
                  <div className="dsp-reg-actions">
                    <button onClick={() => window.open(`/api/admin/registers/${reg.ref}/pdf`, '_blank')}
                      style={{ ...btn, border: '1.5px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text-primary)' }}>
                      <Printer size={13} /> Роздрукувати
                    </button>
                    <button onClick={() => { setSendFor(reg); setError(''); }}
                      style={{ ...btn, border: 'none', background: 'var(--navy)', color: '#fff' }}>
                      <Mail size={13} /> Відправити
                    </button>
                    {!reg.handedOver && (
                      <button onClick={() => deleteSheet(reg)} disabled={deletingRef === reg.ref} title="Розформувати реєстр в НП"
                        style={{ ...btn, padding: '0 12px', border: '1.5px solid #FECACA', background: 'var(--bg-danger)', color: 'var(--color-danger)', opacity: deletingRef === reg.ref ? 0.5 : 1 }}>
                        {deletingRef === reg.ref ? <Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} /> : <X size={13} />}
                        <span className="dsp-unform-text">Розформувати</span>
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })}

        {older.length > 0 && (
          <div style={{ borderTop: '1px solid var(--border-light)' }}>
            <button type="button" className="dsp-older-toggle" onClick={() => setOlderOpen(v => !v)} aria-expanded={olderOpen}>
              {olderOpen ? 'Сховати старіші' : `Показати старіші (${older.length})`}
            </button>
            {olderOpen && older.map(s => (
              <button key={s.ref} type="button" className="dsp-reg-row dsp-reg-row--older" onClick={() => openOlder(s)}>
                {loadingRef === s.ref ? <Loader2 size={15} style={{ animation: 'spin 1s linear infinite' }} /> : <ChevronDown size={16} className="dsp-reg-chev" style={{ transform: 'rotate(-90deg)' }} aria-hidden />}
                <FileText size={15} color="var(--text-muted)" aria-hidden />
                <span className="dsp-reg-num">#{s.number}</span>
                <span className="dsp-reg-meta">{fmtShort(s.dateTime)} · {s.npCount} ТТН</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Замовлення з ТТН — за замовчуванням лише ті, які можна додати в реєстр */}
      <div className="dsp-orders-head" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px', marginBottom: '12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
          <h2 style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>Замовлення з ТТН</h2>
          <div className="dsp-seg" role="group" aria-label="Які замовлення показати">
            <button type="button" className={showAll ? '' : 'is-on'} onClick={() => setShowAll(false)}>Можна додати {addable.length}</button>
            <button type="button" className={showAll ? 'is-on' : ''} onClick={() => setShowAll(true)}>Усі {orders.length}</button>
          </div>
        </div>
        {addable.length > 0 && (
          <button onClick={openBulkModal}
            style={{ ...btn, border: '1.5px solid var(--navy)', background: '#EFF4FF', color: 'var(--navy)', fontWeight: 700 }}>
            <Plus size={13} /> Додати до реєстру ({addable.length})
          </button>
        )}
      </div>

      {shownOrders.length === 0 ? (
        <div style={{ padding: '32px 16px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '14px', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '12px' }}>
          {showAll ? 'Немає замовлень з ТТН. Створіть ТТН у розділі Замовлення.' : 'Усі посилки вже в реєстрах або прийняті перевізником.'}
        </div>
      ) : (
        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '12px', overflow: 'hidden' }}>
          <div className="dsp-thead" style={{ display: 'grid', gridTemplateColumns: '80px 1fr 160px 90px 85px 80px 120px', padding: '8px 16px', background: 'var(--bg-soft)', borderBottom: '1px solid var(--border)', fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
            <span>№</span><span>Клієнт</span><span>ТТН</span><span>Статус</span><span>Дата</span><span style={{ textAlign: 'right' }}>Сума</span><span style={{ textAlign: 'center' }}>Реєстр</span>
          </div>
          {shownOrders.map((order, idx) => {
            const st = STATUS_LABEL[order.status] ?? { label: order.status, color: 'var(--text-secondary)', bg: '#F1F5F9' };
            const inReg = inRegister.has(order.tracking_number);
            const isAdding = adding === order.tracking_number;
            return (
              <div key={order.id} className="dsp-row" style={{ display: 'grid', gridTemplateColumns: '80px 1fr 160px 90px 85px 80px 120px', padding: '10px 16px', alignItems: 'center', borderBottom: idx < shownOrders.length - 1 ? '1px solid var(--border-light)' : 'none', opacity: inReg || order.carrier_accepted_at ? 0.7 : 1 }}>
                <span className="dsp-c-num" style={{ fontWeight: 700, color: 'var(--text-primary)', fontSize: '13px' }}>#{order.order_number}</span>
                <div className="dsp-c-client">
                  <div style={{ fontSize: '13px', color: 'var(--text-primary)', fontWeight: 500 }}>{order.contact}</div>
                  {order.delivery_city_name && <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{order.delivery_city_name}</div>}
                </div>
                <span className="dsp-c-ttn" style={{ fontFamily: 'monospace', fontSize: '12px', color: 'var(--navy)', fontWeight: 600 }}>{order.tracking_number}</span>
                <span className="dsp-c-status" style={{ display: 'inline-block', justifySelf: 'start', padding: '2px 8px', borderRadius: '20px', fontSize: '11px', fontWeight: 600, color: st.color, background: st.bg }}>{st.label}</span>
                <span className="dsp-c-date" style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{fmt(order.created_at)}</span>
                <span className="dsp-c-sum" style={{ textAlign: 'right', fontSize: '13px', fontWeight: 600 }}>{fmtMoney(Number(order.total_price) || 0)} ₴</span>
                <div className="dsp-c-reg" style={{ display: 'flex', justifyContent: 'center' }}>
                  {inReg ? (
                    <span style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '12px', color: 'var(--color-success)', fontWeight: 600 }}>
                      <Check size={13} /> В реєстрі
                    </span>
                  ) : order.carrier_accepted_at ? (
                    <span title="Перевізник уже прийняв посилку — у реєстр її не додати" style={{ fontSize: '12px', color: 'var(--text-muted)', fontWeight: 600 }}>Прийнято НП</span>
                  ) : (
                    <button onClick={() => addToRegister(order)} disabled={isAdding}
                      title={openReg ? `Додати в реєстр #${openReg.number}` : 'НП створить новий реєстр'}
                      style={{ display: 'flex', alignItems: 'center', gap: '5px', height: '28px', padding: '0 12px', borderRadius: '6px', border: '1.5px solid var(--navy)', background: '#EFF4FF', color: 'var(--navy)', fontSize: '11px', fontWeight: 700, cursor: 'pointer' }}>
                      {isAdding ? <Loader2 size={12} style={{ animation: 'spin 1s linear infinite' }} /> : <Truck size={12} />}
                      {isAdding ? '...' : '+ до реєстру'}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Bulk add modal */}
      {bulkModal && (() => {
        const candidates = addable;
        const allChecked = candidates.every(o => bulkSelected.has(o.tracking_number));
        return (
          <Modal open onClose={() => { if (!bulkAdding) setBulkModal(false); }} width={620} padding={0} dismissible={!bulkAdding} aria-label="Додати в реєстр">
            <div style={{ background: 'var(--bg-card)', maxHeight: '80vh', display: 'flex', flexDirection: 'column', width: '100%' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '18px 20px', borderBottom: '1px solid var(--border-light)' }}>
                <div>
                  <div style={{ fontSize: '16px', fontWeight: 800, color: 'var(--text-primary)' }}>
                    {openReg ? `Додати в реєстр #${openReg.number}` : 'Новий реєстр НП'}
                  </div>
                  <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>Зніміть галочку з ТТН, які не потрібно додавати</div>
                </div>
                {!bulkAdding && <button onClick={() => setBulkModal(false)} aria-label="Закрити" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex' }}><X size={20} /></button>}
              </div>

              <div style={{ overflowY: 'auto', flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '10px 20px', background: 'var(--bg-soft)', borderBottom: '1px solid var(--border)' }}>
                  <input type="checkbox" checked={allChecked}
                    onChange={() => setBulkSelected(allChecked ? new Set() : new Set(candidates.map(o => o.tracking_number)))}
                    style={{ width: '15px', height: '15px', cursor: 'pointer' }} />
                  <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                    {bulkSelected.size} з {candidates.length} обрано
                  </span>
                </div>

                {candidates.map(order => {
                  const checked = bulkSelected.has(order.tracking_number);
                  const st = STATUS_LABEL[order.status] ?? { label: order.status, color: 'var(--text-secondary)', bg: '#F1F5F9' };
                  return (
                    <label key={order.id} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '10px 20px', borderBottom: '1px solid var(--border-light)', cursor: 'pointer', background: checked ? 'var(--brand-blue-light)' : 'var(--bg-card)' }}>
                      <input type="checkbox" checked={checked}
                        onChange={() => setBulkSelected(prev => {
                          const s = new Set(prev);
                          if (checked) s.delete(order.tracking_number); else s.add(order.tracking_number);
                          return s;
                        })}
                        style={{ width: '15px', height: '15px', cursor: 'pointer', flexShrink: 0 }} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                          <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)' }}>#{order.order_number}</span>
                          <span style={{ fontSize: '13px', color: 'var(--text-primary)' }}>{order.contact}</span>
                          <span style={{ padding: '1px 6px', borderRadius: '20px', fontSize: '11px', fontWeight: 600, color: st.color, background: st.bg }}>{st.label}</span>
                        </div>
                        <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px', fontFamily: 'monospace' }}>{order.tracking_number}</div>
                      </div>
                      <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)', flexShrink: 0 }}>{fmtMoney(Number(order.total_price) || 0)} ₴</span>
                    </label>
                  );
                })}
              </div>

              {bulkAdding && (
                <div style={{ padding: '8px 20px', background: '#EFF4FF', borderTop: '1px solid #BFDBFE' }}>
                  <div style={{ fontSize: '12px', color: 'var(--navy)', marginBottom: '4px' }}>Додавання {bulkProgress} / {bulkSelected.size}...</div>
                  <div style={{ height: '4px', background: '#BFDBFE', borderRadius: '2px' }}>
                    <div style={{ height: '100%', background: 'var(--navy)', borderRadius: '2px', width: `${(bulkProgress / Math.max(1, bulkSelected.size)) * 100}%`, transition: 'width 0.3s' }} />
                  </div>
                </div>
              )}

              <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', padding: '14px 20px', borderTop: '1px solid var(--border-light)' }}>
                {!bulkAdding && <button onClick={() => setBulkModal(false)} style={{ height: '36px', padding: '0 16px', borderRadius: '8px', border: '1.5px solid var(--border)', background: 'var(--bg-card)', fontSize: '13px', fontWeight: 600, cursor: 'pointer', color: 'var(--text-secondary)' }}>Скасувати</button>}
                <button onClick={confirmBulkAdd} disabled={bulkAdding || bulkSelected.size === 0}
                  style={{ height: '36px', padding: '0 20px', borderRadius: '8px', border: 'none', background: 'var(--navy)', color: '#fff', fontSize: '13px', fontWeight: 700, cursor: bulkSelected.size === 0 ? 'default' : 'pointer', opacity: bulkSelected.size === 0 ? 0.5 : 1, display: 'flex', alignItems: 'center', gap: '7px' }}>
                  {bulkAdding ? <><Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> Додаємо...</> : `✓ Додати ${bulkSelected.size} ТТН`}
                </button>
              </div>
            </div>
          </Modal>
        );
      })()}

      {/* Send modal */}
      {sendFor && (
        <Modal open onClose={() => setSendFor(null)} width={420} padding={0} dismissible={false} aria-label="Надіслати реєстр">
          <div style={{ background: 'var(--bg-card)', padding: '24px', width: '100%' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <div style={{ fontSize: '16px', fontWeight: 800, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Mail size={18} color="#1E3A5F" /> Відправити реєстр
              </div>
              <button onClick={() => setSendFor(null)} aria-label="Закрити" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex' }}><X size={20} /></button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div style={{ background: 'var(--bg-soft)', borderRadius: '10px', padding: '12px 14px', fontSize: '13px', color: 'var(--text-secondary)' }}>
                Реєстр #{sendFor.number} · {sendFor.ttns.length} посилок
              </div>
              <div>
                <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: '5px' }}>Ім&apos;я одержувача</label>
                <input value={sendName} onChange={e => setSendName(e.target.value)} placeholder="Назва компанії або ПІБ"
                  style={{ width: '100%', height: '38px', padding: '0 12px', border: '1.5px solid var(--border)', borderRadius: '8px', fontSize: '13px', outline: 'none', boxSizing: 'border-box' }} />
              </div>
              <div>
                <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: '5px' }}>Email *</label>
                <input value={sendEmail} onChange={e => setSendEmail(e.target.value)} placeholder="supplier@example.com" type="email"
                  style={{ width: '100%', height: '38px', padding: '0 12px', border: '1.5px solid var(--border)', borderRadius: '8px', fontSize: '13px', outline: 'none', boxSizing: 'border-box' }} />
              </div>
            </div>
            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '20px' }}>
              <button onClick={() => setSendFor(null)} style={{ height: '36px', padding: '0 16px', borderRadius: '8px', border: '1.5px solid var(--border)', background: 'var(--bg-card)', fontSize: '13px', fontWeight: 600, cursor: 'pointer', color: 'var(--text-secondary)' }}>Скасувати</button>
              <button onClick={handleSend} disabled={sending || !sendEmail.trim()}
                style={{ height: '36px', padding: '0 20px', borderRadius: '8px', border: 'none', background: sendDone ? 'var(--status-instock)' : 'var(--navy)', color: '#fff', fontSize: '13px', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', opacity: !sendEmail.trim() ? 0.5 : 1 }}>
                {sending ? <><Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} />Відправляємо...</>
                         : sendDone ? <><Check size={14} />Відправлено!</>
                         : <><Mail size={14} />Відправити</>}
              </button>
            </div>
          </div>
        </Modal>
      )}
      <style>{`@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}
