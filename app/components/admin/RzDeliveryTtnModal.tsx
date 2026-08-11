'use client';

import { useEffect, useState } from 'react';
import { X } from 'lucide-react';

/**
 * Експрес-накладна «ROZETKA Доставки» для замовлення САЙТУ.
 *
 * Схоже на RozetkaDeliveryTtnModal, але це інший договір і інше API: там
 * маркетплейсні замовлення (Seller API, номер «RMP-…»), тут — власний кабінет
 * партнера. Спільного коду навмисно немає: злиття двох потоків в один компонент
 * дало б перемикач «а це який Rozetka?», у якому легко помилитись.
 *
 * Габарити питаємо, бо в каталозі їх немає взагалі — підставляємо «коробку за
 * замовчуванням» з налаштувань, менеджер править під конкретну посилку.
 */
type Props = {
  order: { id: string; order_number: number; items: { sku: string; qty: number; name: string }[] };
  onClose: () => void;
  onCreated: (ttn: string) => void;
};

type Sender = { point: string; city: string; limitKg: number | null };

export default function RzDeliveryTtnModal({ order, onClose, onCreated }: Props) {
  const [weight, setWeight] = useState('');
  const [length, setLength] = useState('');
  const [width,  setWidth]  = useState('');
  const [height, setHeight] = useState('');
  const [places, setPlaces] = useState('1');
  const [sender, setSender] = useState<Sender | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    fetch(`/api/admin/orders/${order.id}/rz-ttn`)
      .then(r => r.json())
      .then((d: { sender?: Sender | null; box?: { length: number; width: number; height: number } }) => {
        setSender(d.sender ?? null);
        if (d.box) { setLength(String(d.box.length)); setWidth(String(d.box.width)); setHeight(String(d.box.height)); }
      })
      .catch(() => setSender(null))
      .finally(() => setLoading(false));
  }, [order.id]);

  // Вага — тим самим роутом, що й для Нової Пошти (фасування з карток товарів)
  useEffect(() => {
    if (!order.items?.length) return;
    fetch('/api/admin/order-weight', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items: order.items.map(i => ({ sku: i.sku, qty: i.qty })) }),
    })
      .then(r => r.json())
      .then((d: { totalWeightKg?: number }) => { if ((d.totalWeightKg ?? 0) > 0) setWeight(String(d.totalWeightKg)); })
      .catch(() => { /* вагу введуть руками */ });
  }, [order.items]);

  const weightNum = parseFloat(weight);
  const overLimit = sender?.limitKg != null && Number.isFinite(weightNum) && weightNum > sender.limitKg;

  async function submit() {
    setError(''); setBusy(true);
    try {
      const res = await fetch(`/api/admin/orders/${order.id}/rz-ttn`, {
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

  const blocked = busy || !sender || overLimit;

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 10000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px', overflowY: 'auto' }}>
      <div className="adm-modal-box" style={{ background: 'var(--bg-card)', borderRadius: '16px', width: '460px', maxWidth: '96vw', maxHeight: '92vh', overflowY: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,0.25)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', borderBottom: '1px solid var(--border)' }}>
          <div>
            <div style={{ fontWeight: 800, fontSize: '16px', color: 'var(--text-primary)' }}>ROZETKA Доставка</div>
            <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Замовлення #{order.order_number} · відділення → відділення</div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'inline-flex' }}><X size={18} /></button>
        </div>

        <div style={{ padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div style={{ fontSize: '12px', lineHeight: 1.5, color: 'var(--text-secondary)', background: 'var(--bg-soft)', borderRadius: '9px', padding: '10px 12px' }}>
            Точку видачі покупець обрав у чекауті — адресу вводити не треба.
            {loading
              ? <div style={{ marginTop: '6px' }}>Завантажуємо відправника…</div>
              : sender
                ? <div style={{ marginTop: '6px' }}>
                    Здаємо з: <strong>{sender.point}</strong>{sender.city ? `, ${sender.city}` : ''}
                    {sender.limitKg != null && <> · ліміт <strong>{sender.limitKg} кг</strong></>}
                  </div>
                : <div style={{ marginTop: '6px', color: '#B45309' }}>Відправника не налаштовано — Налаштування → ROZETKA Доставка.</div>}
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

          {overLimit && (
            <div style={{ fontSize: '12px', color: '#B45309', background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: '9px', padding: '9px 11px' }}>
              ⚠ Точка здачі приймає до {sender?.limitKg} кг — цю посилку доведеться відправити Новою Поштою.
            </div>
          )}

          {error && (
            <div style={{ fontSize: '12px', color: '#DC2626', background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: '9px', padding: '9px 11px' }}>⚠ {error}</div>
          )}
        </div>

        <div style={{ display: 'flex', gap: '10px', padding: '0 20px 18px' }}>
          <button onClick={onClose} disabled={busy}
            style={{ flex: 1, height: '42px', borderRadius: '10px', border: '1.5px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text-secondary)', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}>
            Скасувати
          </button>
          <button onClick={submit} disabled={blocked}
            style={{ flex: 2, height: '42px', borderRadius: '10px', border: 'none', background: blocked ? '#94A3B8' : '#15803D', color: '#fff', fontSize: '13px', fontWeight: 700, cursor: blocked ? 'default' : 'pointer' }}>
            {busy ? 'Створюємо…' : 'Створити накладну'}
          </button>
        </div>
      </div>
    </div>
  );
}
