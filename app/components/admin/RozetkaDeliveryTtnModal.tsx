'use client';

import { useEffect, useState } from 'react';
import { X } from 'lucide-react';

/**
 * Створення накладної для доставки в точку видачі Rozetka.
 *
 * Відрізняється від вікна Нової Пошти тим, що адресу отримувача питати не треба:
 * її Rozetka бере із самого замовлення. Від нас потрібні лише габарити посилки
 * і місця — те, що ніде більше не зберігається.
 *
 * Відправник обирається зі списку відділень, з яких уже відправляли (інших
 * довідників API Rozetka не дає — нове відділення з'являється після першої
 * накладної з нього в кабінеті). Вибір зберігається і діє для наступних накладних.
 */
type RzSender = {
  type?: string; name: string; city: string; address: string;
  department: string; department_type?: number; phones: string[];
};

type Props = {
  order: { id: string; order_number: number; items: { sku: string; qty: number; name: string }[] };
  onClose: () => void;
  onCreated: (ttn: string) => void;
};

export default function RozetkaDeliveryTtnModal({ order, onClose, onCreated }: Props) {
  const [weight, setWeight] = useState('');
  const [length, setLength] = useState('30');
  const [width,  setWidth]  = useState('20');
  const [height, setHeight] = useState('15');
  const [places, setPlaces] = useState('1');
  const [sender, setSender] = useState<RzSender | null>(null);
  const [senderOptions, setSenderOptions] = useState<RzSender[]>([]);
  const [senderLoading, setSenderLoading] = useState(true);
  const [senderSaving, setSenderSaving] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    fetch(`/api/admin/orders/${order.id}/rozetka-delivery-ttn`)
      .then(r => r.json())
      .then(d => { setSender(d.sender ?? null); setSenderOptions(d.options ?? []); })
      .catch(() => setSender(null))
      .finally(() => setSenderLoading(false));
  }, [order.id]);

  /** Вибір відділення: зберігаємо одразу — накладна і всі наступні підуть звідти */
  async function pickSender(department: string) {
    const next = senderOptions.find(o => o.department === department);
    if (!next || next.department === sender?.department) return;
    setSenderSaving(true); setError('');
    try {
      const res = await fetch(`/api/admin/orders/${order.id}/rozetka-delivery-ttn`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sender: next }),
      });
      if (!res.ok) { const d = await res.json().catch(() => ({})); setError(d.error ?? 'Не вдалося зберегти відправника'); return; }
      setSender(next);
    } catch { setError('Збій мережі при збереженні відправника'); }
    finally { setSenderSaving(false); }
  }

  // Вага рахується з карток товарів тим самим роутом, що й для Нової Пошти
  useEffect(() => {
    if (!order.items?.length) return;
    fetch('/api/admin/order-weight', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items: order.items.map(i => ({ sku: i.sku, qty: i.qty })) }),
    })
      .then(r => r.json())
      .then(d => { if (d.totalWeightKg > 0) setWeight(String(d.totalWeightKg)); })
      .catch(() => { /* вагу введуть руками */ });
  }, [order.items]);

  async function submit() {
    setError(''); setBusy(true);
    try {
      const res = await fetch(`/api/admin/orders/${order.id}/rozetka-delivery-ttn`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          weight: parseFloat(weight), length: parseFloat(length),
          width: parseFloat(width), height: parseFloat(height),
          places: parseInt(places) || 1,
        }),
      });
      const d = await res.json();
      if (!res.ok || d.error) { setError(d.error ?? 'Помилка'); return; }
      onCreated(d.ttn);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Збій мережі');
    } finally {
      setBusy(false);
    }
  }

  const num = (v: string, set: (s: string) => void, label: string, suffix: string) => (
    <label style={{ flex: 1, minWidth: 0 }}>
      <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '5px' }}>{label}</div>
      <div style={{ position: 'relative' }}>
        <input value={v} onChange={e => set(e.target.value)} inputMode="decimal"
          style={{ width: '100%', height: '38px', padding: '0 34px 0 10px', boxSizing: 'border-box', borderRadius: '9px', border: '1.5px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text-primary)', fontSize: '14px' }} />
        <span style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', fontSize: '11px', color: 'var(--text-muted)' }}>{suffix}</span>
      </div>
    </label>
  );

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 10000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px', overflowY: 'auto' }}>
      <div className="adm-modal-box" style={{ background: 'var(--bg-card)', borderRadius: '16px', width: '460px', maxWidth: '96vw', maxHeight: '92vh', overflowY: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,0.25)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', borderBottom: '1px solid var(--border)' }}>
          <div>
            <div style={{ fontWeight: 800, fontSize: '16px', color: 'var(--text-primary)' }}>Накладна Rozetka</div>
            <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Замовлення #{order.order_number} · точка видачі</div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'inline-flex' }}><X size={18} /></button>
        </div>

        <div style={{ padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div style={{ fontSize: '12px', lineHeight: 1.5, color: 'var(--text-secondary)', background: 'var(--bg-soft)', borderRadius: '9px', padding: '10px 12px' }}>
            Адресу отримувача Rozetka бере із замовлення — вводити її не треба.
            {senderLoading
              ? <div style={{ marginTop: '6px' }}>Завантажуємо відправника…</div>
              : sender
                ? senderOptions.length > 1
                  ? (
                    <div style={{ marginTop: '8px' }}>
                      <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '4px' }}>
                        Відділення відправника
                      </div>
                      <select value={sender.department} disabled={senderSaving}
                        onChange={e => pickSender(e.target.value)}
                        title="Вибір запам'ятовується — наступні накладні підуть з цього відділення"
                        style={{ width: '100%', height: '34px', padding: '0 8px', borderRadius: '8px', border: '1.5px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text-primary)', fontSize: '12.5px', cursor: senderSaving ? 'wait' : 'pointer' }}>
                        {senderOptions.map(o => (
                          <option key={o.department} value={o.department}>{o.address || o.name}</option>
                        ))}
                      </select>
                      <div style={{ marginTop: '4px', fontSize: '11px', color: 'var(--text-muted)' }}>
                        {senderSaving ? 'Зберігаємо…' : `Відправник: ${sender.name}. Вибір діє і для наступних накладних.`}
                      </div>
                    </div>
                  )
                  : <div style={{ marginTop: '6px' }}>Відправник: <strong>{sender.name}</strong>, {sender.address}</div>
                : <div style={{ marginTop: '6px', color: '#B45309' }}>Відправника не знайдено — створіть одну накладну в кабінеті Rozetka, далі братимемо дані звідти.</div>}
          </div>

          <div style={{ display: 'flex', gap: '10px' }}>
            {num(weight, setWeight, 'Вага', 'кг')}
            {num(places, setPlaces, 'Місць', 'шт')}
          </div>
          <div style={{ display: 'flex', gap: '10px' }}>
            {num(length, setLength, 'Довжина', 'см')}
            {num(width, setWidth, 'Ширина', 'см')}
            {num(height, setHeight, 'Висота', 'см')}
          </div>

          {error && (
            <div style={{ fontSize: '12px', color: '#DC2626', background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: '9px', padding: '9px 11px' }}>⚠ {error}</div>
          )}
        </div>

        <div style={{ display: 'flex', gap: '10px', padding: '0 20px 18px' }}>
          <button onClick={onClose} disabled={busy}
            style={{ flex: 1, height: '42px', borderRadius: '10px', border: '1.5px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text-secondary)', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}>
            Скасувати
          </button>
          <button onClick={submit} disabled={busy || !sender || senderSaving}
            style={{ flex: 2, height: '42px', borderRadius: '10px', border: 'none', background: busy || !sender || senderSaving ? '#94A3B8' : '#15803D', color: '#fff', fontSize: '13px', fontWeight: 700, cursor: busy || !sender || senderSaving ? 'default' : 'pointer' }}>
            {busy ? 'Створюємо…' : 'Створити накладну'}
          </button>
        </div>
      </div>
    </div>
  );
}
