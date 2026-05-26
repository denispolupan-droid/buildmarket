'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { FileText, Printer, Mail, X, Loader2, Check, Truck, RefreshCw, ArrowLeft } from 'lucide-react';

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
};

type RegisterTtn = { ttn: string; contact: string; amount: number };
type ScanSheet = { Ref: string; Number: string; Count: number; DateTime: string };

const STATUS_LABEL: Record<string, { label: string; color: string; bg: string }> = {
  new:            { label: 'Нове',            color: '#1E3A5F', bg: '#EFF4FF' },
  confirmed:      { label: 'Підтверджено',    color: '#15803D', bg: '#DCFCE7' },
  awaiting_stock: { label: 'Очікуємо товар',  color: '#7C3AED', bg: '#F5F3FF' },
  picking:        { label: 'Збирається',      color: '#0E7490', bg: '#ECFEFF' },
  shipped:        { label: 'Відправлено',     color: '#B45309', bg: '#FEF3C7' },
};

export default function DispatchClient({ orders }: { orders: Order[] }) {
  const [sheets,        setSheets]        = useState<ScanSheet[]>([]);
  const [sheetsLoading, setSheetsLoading] = useState(true);
  const [currentRef,    setCurrentRef]    = useState<string | null>(null);
  const [currentNumber, setCurrentNumber] = useState<string>('');
  const [ttns,          setTtns]          = useState<RegisterTtn[]>([]);
  const [adding,        setAdding]        = useState<string | null>(null);
  const [addedSet,      setAddedSet]      = useState<Set<string>>(new Set());
  const [error,         setError]         = useState('');
  const [sendModal,     setSendModal]     = useState(false);
  const [sendEmail,     setSendEmail]     = useState('');
  const [sendName,      setSendName]      = useState('');
  const [sending,       setSending]       = useState(false);
  const [sendDone,      setSendDone]      = useState(false);
  const [refreshing,    setRefreshing]    = useState(false);
  const [removingTtn,   setRemovingTtn]   = useState<string | null>(null);
  const [deletingSheet, setDeletingSheet] = useState(false);
  const [bulkModal,     setBulkModal]     = useState(false);
  const [bulkSelected,  setBulkSelected]  = useState<Set<string>>(new Set());
  const [bulkAdding,    setBulkAdding]    = useState(false);
  const [bulkProgress,  setBulkProgress]  = useState(0);

  const loadSheetTtns = useCallback(async (ref: string) => {
    const res = await fetch(`/api/admin/registers?ref=${ref}`);
    const data = await res.json();
    if (data.ttns?.length > 0) {
      const loaded: RegisterTtn[] = data.ttns.map((t: RegisterTtn) => ({
        ttn: t.ttn, contact: t.contact, amount: Number(t.amount) || 0,
      }));
      setTtns(loaded);
      setAddedSet(new Set(loaded.map(t => t.ttn)));
    }
  }, []);

  const loadSheets = useCallback(async () => {
    setSheetsLoading(true);
    try {
      const res = await fetch('/api/admin/registers');
      const data = await res.json();
      const list: ScanSheet[] = data.sheets ?? [];
      setSheets(list);
      if (list.length > 0) {
        const first = list[0];
        setCurrentRef(first.Ref);
        setCurrentNumber(first.Number ?? '');
        await loadSheetTtns(first.Ref);
      }
    } catch { setError('Помилка завантаження реєстрів'); }
    setSheetsLoading(false);
  }, [loadSheetTtns]);

  useEffect(() => { loadSheets(); }, [loadSheets]);

  async function addToRegister(order: Order) {
    if (!order.tracking_number || addedSet.has(order.tracking_number)) return;
    setAdding(order.tracking_number);
    setError('');
    try {
      const res = await fetch('/api/admin/registers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ttnNumber: order.tracking_number, registerRef: currentRef }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? 'Помилка'); return; }
      if (!currentRef) {
        setCurrentRef(data.ref);
        setCurrentNumber(data.number ?? '');
      }
      const newTtn: RegisterTtn = { ttn: order.tracking_number, contact: order.contact, amount: order.total_price };
      setTtns(prev => [...prev, newTtn]);
      setAddedSet(prev => new Set([...prev, order.tracking_number]));
    } catch { setError('Мережева помилка'); }
    finally { setAdding(null); }
  }

  function openBulkModal() {
    const toAdd = orders.filter(o => o.tracking_number && !addedSet.has(o.tracking_number));
    setBulkSelected(new Set(toAdd.map(o => o.tracking_number)));
    setBulkProgress(0);
    setBulkModal(true);
  }

  async function confirmBulkAdd() {
    const toAdd = orders.filter(o => bulkSelected.has(o.tracking_number));
    setBulkAdding(true);
    setBulkProgress(0);
    for (let i = 0; i < toAdd.length; i++) {
      await addToRegister(toAdd[i]);
      setBulkProgress(i + 1);
    }
    setBulkAdding(false);
    setBulkModal(false);
  }

  async function deleteSheet() {
    if (!currentRef) return;
    if (!confirm(`Розформувати реєстр НП #${currentNumber}?\n\nЯкщо реєстр вже забрав кур'єр НП — він залишиться в кабінеті НП, але буде очищено в адмінці.`)) return;
    setDeletingSheet(true);
    setError('');
    try {
      const res = await fetch('/api/admin/registers', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ registerRef: currentRef, ttnNumbers: ttns.map(t => t.ttn) }),
      });
      const data = await res.json();
      // Always clear local state — even if NP returned error (register might be locked after pickup)
      setTtns([]); setAddedSet(new Set()); setCurrentRef(null); setCurrentNumber('');
      if (!res.ok && data.error) {
        setError(`⚠ В адмінці очищено. Помилка НП: ${data.error}`);
      }
      await loadSheets();
    } catch { setError('Мережева помилка'); }
    finally { setDeletingSheet(false); }
  }

  async function handleRefresh() {
    setRefreshing(true);
    setTtns([]); setAddedSet(new Set()); setCurrentRef(null); setCurrentNumber('');
    await loadSheets();
    setRefreshing(false);
  }

  async function handleSend() {
    if (!sendEmail.trim()) return;
    setSending(true);
    try {
      const res = await fetch('/api/admin/registers/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ toEmail: sendEmail.trim(), toName: sendName.trim(), registerNumber: currentNumber, registerRef: currentRef, ttns }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? 'Помилка відправки'); return; }
      setSendDone(true);
      setTimeout(() => { setSendModal(false); setSendDone(false); }, 2000);
    } catch { setError('Мережева помилка'); }
    setSending(false);
  }

  const hasRegister = ttns.length > 0 || !!currentRef;
  const ordersNotAdded = orders.filter(o => o.tracking_number && !addedSet.has(o.tracking_number));

  return (
    <div style={{ padding: '28px 32px', maxWidth: '1100px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <Link href="/admin" style={{ display: 'flex', alignItems: 'center', color: 'var(--text-secondary)', textDecoration: 'none' }}>
            <ArrowLeft size={16} />
          </Link>
          <Truck size={18} color="#1E3A5F" />
          <div>
            <h1 style={{ fontSize: '20px', fontWeight: 800, color: 'var(--text-primary)', margin: 0 }}>Відправлення</h1>
            <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginTop: '2px' }}>
              Управління реєстром Нової Пошти та статусами відправлень
            </p>
          </div>
        </div>
        <button onClick={handleRefresh} disabled={refreshing}
          style={{ display: 'flex', alignItems: 'center', gap: '6px', height: '34px', padding: '0 14px', borderRadius: '8px', border: '1.5px solid var(--border)', background: 'var(--bg-card)', fontSize: '13px', fontWeight: 600, cursor: 'pointer', color: 'var(--text-secondary)' }}>
          <RefreshCw size={14} style={{ animation: refreshing ? 'spin 1s linear infinite' : 'none' }} />
          Оновити
        </button>
      </div>

      {/* Register block */}
      <div style={{ background: hasRegister ? 'var(--brand-blue-light)' : 'var(--bg-soft)', border: `1.5px solid ${hasRegister ? '#BFDBFE' : 'var(--border)'}`, borderRadius: '14px', marginBottom: '24px', overflow: 'hidden' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <FileText size={18} color={hasRegister ? 'var(--brand-blue)' : 'var(--text-muted)'} />
            <span style={{ fontSize: '15px', fontWeight: 700, color: hasRegister ? 'var(--brand-blue)' : 'var(--text-secondary)' }}>
              {sheetsLoading ? 'Завантаження...' : currentNumber ? `Реєстр НП #${currentNumber}` : 'Реєстр НП'}
            </span>
            {ttns.length > 0 && (
              <span style={{ background: '#1E3A5F', color: '#fff', fontSize: '11px', fontWeight: 700, padding: '2px 8px', borderRadius: '20px' }}>
                {ttns.length} ТТН
              </span>
            )}
            {!hasRegister && !sheetsLoading && (
              <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Порожньо — додайте ТТН з таблиці нижче</span>
            )}
          </div>
          {hasRegister && (
            <div style={{ display: 'flex', gap: '8px' }}>
              <button onClick={() => currentRef && window.open(`/api/admin/registers/${currentRef}/pdf`, '_blank')}
                style={{ display: 'flex', alignItems: 'center', gap: '5px', height: '32px', padding: '0 14px', borderRadius: '7px', border: '1.5px solid var(--border)', background: 'var(--bg-card)', fontSize: '12px', fontWeight: 600, cursor: 'pointer', color: 'var(--text-primary)' }}>
                <Printer size={13} /> Роздрукувати
              </button>
              <button onClick={() => { setSendModal(true); setError(''); }}
                style={{ display: 'flex', alignItems: 'center', gap: '5px', height: '32px', padding: '0 14px', borderRadius: '7px', border: 'none', background: '#1E3A5F', fontSize: '12px', fontWeight: 600, cursor: 'pointer', color: '#fff' }}>
                <Mail size={13} /> Відправити
              </button>
              <button onClick={deleteSheet} disabled={deletingSheet}
                title="Розформувати реєстр в НП"
                style={{ display: 'flex', alignItems: 'center', gap: '5px', height: '32px', padding: '0 12px', borderRadius: '7px', border: '1.5px solid #FECACA', background: '#FEF2F2', fontSize: '12px', fontWeight: 600, cursor: 'pointer', color: '#DC2626', opacity: deletingSheet ? 0.5 : 1 }}>
                {deletingSheet ? <Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} /> : <X size={13} />}
                Розформувати
              </button>
            </div>
          )}
        </div>

        {ttns.length > 0 && (
          <div style={{ borderTop: '1px solid #BFDBFE', padding: '8px 20px 12px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '160px 1fr 100px 32px', gap: '8px', padding: '4px 0 6px', fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', borderBottom: '1px solid var(--border)', marginBottom: '4px' }}>
              <span>ТТН</span><span>Отримувач</span><span style={{ textAlign: 'right' }}>Сума</span><span />
            </div>
            {ttns.map(t => (
              <div key={t.ttn} style={{ display: 'grid', gridTemplateColumns: '160px 1fr 100px 32px', gap: '8px', padding: '5px 0', alignItems: 'center', borderBottom: '1px solid var(--border-light)' }}>
                <span style={{ fontFamily: 'monospace', fontSize: '12px', color: '#1E3A5F', fontWeight: 600 }}>{t.ttn}</span>
                <span style={{ fontSize: '12px', color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.contact}</span>
                <span style={{ fontSize: '12px', color: '#15803D', fontWeight: 600, textAlign: 'right' }}>{t.amount} ₴</span>
                <button
                  disabled={removingTtn === t.ttn}
                  onClick={async () => {
                    if (!currentRef) return;
                    setRemovingTtn(t.ttn);
                    setError('');
                    try {
                      const res = await fetch('/api/admin/registers', {
                        method: 'DELETE',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ ttnNumber: t.ttn, registerRef: currentRef }),
                      });
                      const data = await res.json();
                      if (res.ok) {
                        setTtns(prev => prev.filter(x => x.ttn !== t.ttn));
                        setAddedSet(prev => { const s = new Set(prev); s.delete(t.ttn); return s; });
                      } else {
                        setError(data.error ?? 'Помилка видалення з НП');
                      }
                    } catch { setError('Мережева помилка'); }
                    finally { setRemovingTtn(null); }
                  }}
                  style={{ background: 'none', border: 'none', cursor: removingTtn === t.ttn ? 'wait' : 'pointer', color: '#EF4444', display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: removingTtn === t.ttn ? 0.4 : 1 }}>
                  {removingTtn === t.ttn ? <Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} /> : <X size={13} />}
                </button>
              </div>
            ))}
          </div>
        )}
        {error && <div style={{ padding: '8px 20px', background: '#FEF2F2', color: '#DC2626', fontSize: '12px' }}>{error}</div>}
      </div>

      {/* Orders table */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
        <h2 style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
          Замовлення з ТТН
          <span style={{ marginLeft: '8px', fontSize: '13px', fontWeight: 500, color: 'var(--text-secondary)' }}>
            {orders.length} всього · {ordersNotAdded.length} не в реєстрі
          </span>
        </h2>
        {ordersNotAdded.length > 0 && (
          <button onClick={openBulkModal}
            style={{ display: 'flex', alignItems: 'center', gap: '6px', height: '32px', padding: '0 14px', borderRadius: '7px', border: '1.5px solid #1E3A5F', background: '#EFF4FF', color: '#1E3A5F', fontSize: '12px', fontWeight: 700, cursor: 'pointer' }}>
            + Додати до реєстру ({ordersNotAdded.length})
          </button>
        )}
      </div>

      {orders.length === 0 ? (
        <div style={{ padding: '48px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '14px', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '12px' }}>
          Немає замовлень з ТТН. Створіть ТТН у розділі Замовлення.
        </div>
      ) : (
        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '12px', overflow: 'hidden' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '80px 1fr 160px 90px 80px 120px', padding: '8px 16px', background: 'var(--bg-soft)', borderBottom: '1px solid var(--border)', fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
            <span>№</span><span>Клієнт</span><span>ТТН</span><span>Статус</span><span style={{ textAlign: 'right' }}>Сума</span><span style={{ textAlign: 'center' }}>Реєстр</span>
          </div>
          {orders.map((order, idx) => {
            const st = STATUS_LABEL[order.status] ?? { label: order.status, color: 'var(--text-secondary)', bg: '#F1F5F9' };
            const inReg = addedSet.has(order.tracking_number);
            const isAdding = adding === order.tracking_number;
            return (
              <div key={order.id} style={{ display: 'grid', gridTemplateColumns: '80px 1fr 160px 90px 80px 120px', padding: '10px 16px', alignItems: 'center', borderBottom: idx < orders.length - 1 ? '1px solid var(--border-light)' : 'none', opacity: inReg ? 0.7 : 1 }}>
                <span style={{ fontWeight: 700, color: 'var(--text-primary)', fontSize: '13px' }}>#{order.order_number}</span>
                <div>
                  <div style={{ fontSize: '13px', color: 'var(--text-primary)', fontWeight: 500 }}>{order.contact}</div>
                  {order.delivery_city_name && <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{order.delivery_city_name}</div>}
                </div>
                <span style={{ fontFamily: 'monospace', fontSize: '12px', color: '#1E3A5F', fontWeight: 600 }}>{order.tracking_number}</span>
                <span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: '20px', fontSize: '11px', fontWeight: 600, color: st.color, background: st.bg }}>{st.label}</span>
                <span style={{ textAlign: 'right', fontSize: '13px', fontWeight: 600 }}>{order.total_price} ₴</span>
                <div style={{ display: 'flex', justifyContent: 'center' }}>
                  {inReg ? (
                    <span style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '12px', color: '#15803D', fontWeight: 600 }}>
                      <Check size={13} /> В реєстрі
                    </span>
                  ) : (
                    <button onClick={() => addToRegister(order)} disabled={isAdding}
                      style={{ display: 'flex', alignItems: 'center', gap: '5px', height: '28px', padding: '0 12px', borderRadius: '6px', border: '1.5px solid #1E3A5F', background: '#EFF4FF', color: '#1E3A5F', fontSize: '11px', fontWeight: 700, cursor: 'pointer' }}>
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
        const candidates = orders.filter(o => o.tracking_number && !addedSet.has(o.tracking_number));
        const allChecked = candidates.every(o => bulkSelected.has(o.tracking_number));
        return (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.55)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}
            onClick={e => { if (!bulkAdding && e.target === e.currentTarget) setBulkModal(false); }}>
            <div style={{ background: 'var(--bg-card)', borderRadius: '16px', width: '100%', maxWidth: '620px', maxHeight: '80vh', display: 'flex', flexDirection: 'column', boxShadow: '0 24px 80px rgba(0,0,0,0.22)' }}>

              {/* Header */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '18px 20px', borderBottom: '1px solid var(--border-light)' }}>
                <div>
                  <div style={{ fontSize: '16px', fontWeight: 800, color: 'var(--text-primary)' }}>Додати до реєстру</div>
                  <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>Зніміть галочку з ТТН які не потрібно додавати</div>
                </div>
                {!bulkAdding && <button onClick={() => setBulkModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex' }}><X size={20} /></button>}
              </div>

              {/* Table */}
              <div style={{ overflowY: 'auto', flex: 1 }}>
                {/* Select all row */}
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
                          checked ? s.delete(order.tracking_number) : s.add(order.tracking_number);
                          return s;
                        })}
                        style={{ width: '15px', height: '15px', cursor: 'pointer', flexShrink: 0 }} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)' }}>#{order.order_number}</span>
                          <span style={{ fontSize: '13px', color: 'var(--text-primary)' }}>{order.contact}</span>
                          <span style={{ padding: '1px 6px', borderRadius: '20px', fontSize: '11px', fontWeight: 600, color: st.color, background: st.bg }}>{st.label}</span>
                        </div>
                        <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px', fontFamily: 'monospace' }}>{order.tracking_number}</div>
                      </div>
                      <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)', flexShrink: 0 }}>{order.total_price} ₴</span>
                    </label>
                  );
                })}
              </div>

              {/* Progress */}
              {bulkAdding && (
                <div style={{ padding: '8px 20px', background: '#EFF4FF', borderTop: '1px solid #BFDBFE' }}>
                  <div style={{ fontSize: '12px', color: '#1E3A5F', marginBottom: '4px' }}>Додавання {bulkProgress} / {bulkSelected.size}...</div>
                  <div style={{ height: '4px', background: '#BFDBFE', borderRadius: '2px' }}>
                    <div style={{ height: '100%', background: '#1E3A5F', borderRadius: '2px', width: `${(bulkProgress / bulkSelected.size) * 100}%`, transition: 'width 0.3s' }} />
                  </div>
                </div>
              )}

              {/* Footer */}
              <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', padding: '14px 20px', borderTop: '1px solid var(--border-light)' }}>
                {!bulkAdding && <button onClick={() => setBulkModal(false)} style={{ height: '36px', padding: '0 16px', borderRadius: '8px', border: '1.5px solid var(--border)', background: 'var(--bg-card)', fontSize: '13px', fontWeight: 600, cursor: 'pointer', color: 'var(--text-secondary)' }}>Скасувати</button>}
                <button onClick={confirmBulkAdd} disabled={bulkAdding || bulkSelected.size === 0}
                  style={{ height: '36px', padding: '0 20px', borderRadius: '8px', border: 'none', background: '#1E3A5F', color: '#fff', fontSize: '13px', fontWeight: 700, cursor: bulkSelected.size === 0 ? 'default' : 'pointer', opacity: bulkSelected.size === 0 ? 0.5 : 1, display: 'flex', alignItems: 'center', gap: '7px' }}>
                  {bulkAdding ? <><Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> Додаємо...</> : `✓ Додати ${bulkSelected.size} ТТН до реєстру`}
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Send modal */}
      {sendModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}
          onClick={e => { if (e.target === e.currentTarget) setSendModal(false); }}>
          <div style={{ background: 'var(--bg-card)', borderRadius: '14px', width: '100%', maxWidth: '420px', padding: '24px', boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <div style={{ fontSize: '16px', fontWeight: 800, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Mail size={18} color="#1E3A5F" /> Відправити реєстр
              </div>
              <button onClick={() => setSendModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex' }}><X size={20} /></button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div style={{ background: 'var(--bg-soft)', borderRadius: '10px', padding: '12px 14px', fontSize: '13px', color: 'var(--text-secondary)' }}>
                Реєстр #{currentNumber} · {ttns.length} посилок
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
            {error && <div style={{ marginTop: '12px', fontSize: '12px', color: '#DC2626' }}>{error}</div>}
            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '20px' }}>
              <button onClick={() => setSendModal(false)} style={{ height: '36px', padding: '0 16px', borderRadius: '8px', border: '1.5px solid var(--border)', background: 'var(--bg-card)', fontSize: '13px', fontWeight: 600, cursor: 'pointer', color: 'var(--text-secondary)' }}>Скасувати</button>
              <button onClick={handleSend} disabled={sending || !sendEmail.trim()}
                style={{ height: '36px', padding: '0 20px', borderRadius: '8px', border: 'none', background: sendDone ? '#16A34A' : '#1E3A5F', color: '#fff', fontSize: '13px', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', opacity: !sendEmail.trim() ? 0.5 : 1 }}>
                {sending ? <><Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} />Відправляємо...</>
                         : sendDone ? <><Check size={14} />Відправлено!</>
                         : <><Mail size={14} />Відправити</>}
              </button>
            </div>
          </div>
        </div>
      )}
      <style>{`@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}
