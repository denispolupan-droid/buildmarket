'use client';

import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { Modal } from './ui/Modal';
import { EPICENTR_MEEST_LABEL, meestSeatProblem, type EpicentrMeestProvider, type ParcelBoxCell } from '../../../lib/epicentr-meest';

/**
 * Накладна Meest для доставки в поштомат чи пункт видачі Епіцентру.
 *
 * Виписує її Епіцентр за нашим договором Meest (як кнопка в кабінеті), доставку
 * платимо ми, післяплати немає. Вага — з карток товарів, коробка — та сама «за
 * замовчуванням», що й для ROZETKA Доставки; для поштомата одразу перевіряємо,
 * чи влізе в комірку (розмір приходить із картки замовлення).
 */
type Props = {
  order: { id: string; order_number: number; items: { sku: string; qty: number; name: string }[] };
  onClose: () => void;
  onCreated: (ttn: string | null, warning?: string) => void;
};

type Info = {
  provider: EpicentrMeestProvider;
  sender: { name: string; phone: string; office: string; city: string } | null;
  senderProblem: string | null;
  box: { length: number; width: number; height: number };
  declared: number;
  cell: ParcelBoxCell;
  point: string | null;
};

export default function EpicentrMeestTtnModal({ order, onClose, onCreated }: Props) {
  const [info, setInfo] = useState<Info | null>(null);
  const [loadError, setLoadError] = useState('');
  const [weight, setWeight] = useState('');
  const [length, setLength] = useState('');
  const [width, setWidth] = useState('');
  const [height, setHeight] = useState('');
  const [declared, setDeclared] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    fetch(`/api/admin/orders/${order.id}/epicentr-meest-ttn`)
      .then(r => r.json())
      .then((d: Info & { error?: string }) => {
        if (d.error) { setLoadError(d.error); return; }
        setInfo(d);
        setLength(String(d.box.length)); setWidth(String(d.box.width)); setHeight(String(d.box.height));
        setDeclared(String(d.declared));
      })
      .catch(() => setLoadError('Не вдалося завантажити дані'));
  }, [order.id]);

  // Вага — тим самим роутом, що й для Нової Пошти (фасування з карток товарів)
  useEffect(() => {
    if (!order.items?.length) return;
    fetch('/api/admin/order-weight', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items: order.items.map(i => ({ sku: i.sku, qty: i.qty })) }),
    })
      .then(r => r.json())
      .then((d: { totalWeightKg?: number }) => { if ((d.totalWeightKg ?? 0) > 0) setWeight(String(d.totalWeightKg)); })
      .catch(() => { /* вагу введуть руками */ });
  }, [order.items]);

  const n = (s: string) => parseFloat(s.replace(',', '.'));
  const seat = { weightKg: n(weight), lengthCm: n(length), widthCm: n(width), heightCm: n(height) };
  const problem = info ? meestSeatProblem(seat, info.provider, info.cell) : null;
  const declaredNum = n(declared);
  const declaredBad = !Number.isFinite(declaredNum) || declaredNum < 0;
  const blocked = busy || !info?.sender || !!problem || declaredBad;

  async function submit() {
    setError(''); setBusy(true);
    try {
      const res = await fetch(`/api/admin/orders/${order.id}/epicentr-meest-ttn`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ weight: seat.weightKg, length: seat.lengthCm, width: seat.widthCm, height: seat.heightCm, declared: declaredNum }),
      });
      const d = await res.json();
      if (!res.ok || d.error) { setError(d.error ?? 'Помилка'); return; }
      onCreated(d.ttn ?? null, d.warning);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Збій мережі');
    } finally {
      setBusy(false);
    }
  }

  const field = (v: string, set: (s: string) => void, label: string, suffix: string) => (
    <label style={{ flex: 1, minWidth: 0 }}>
      <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '5px' }}>{label}</div>
      <div style={{ position: 'relative' }}>
        <input value={v} onChange={e => set(e.target.value)} inputMode="decimal"
          style={{ width: '100%', height: '38px', padding: '0 34px 0 10px', boxSizing: 'border-box', borderRadius: '9px', border: '1.5px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text-primary)', fontSize: '14px' }} />
        <span style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', fontSize: '11px', color: 'var(--text-muted)' }}>{suffix}</span>
      </div>
    </label>
  );

  const cellCm = info?.cell && info.cell.width && info.cell.height && info.cell.length
    ? [info.cell.width, info.cell.height, info.cell.length].map(v => Math.round(v / 10)).join('×') : null;

  return (
    <Modal open onClose={onClose} width={460} padding={0} dismissible={false} aria-label="Накладна Meest-Епіцентр">
      <div style={{ background: 'var(--bg-card)', maxHeight: '92vh', overflowY: 'auto', width: '100%' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', borderBottom: '1px solid var(--border)' }}>
          <div>
            <div style={{ fontWeight: 800, fontSize: '16px', color: 'var(--text-primary)' }}>Накладна Meest через Епіцентр</div>
            <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
              Замовлення #{order.order_number}{info ? ` · ${EPICENTR_MEEST_LABEL[info.provider]}` : ''}
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'inline-flex' }}><X size={18} /></button>
        </div>

        <div style={{ padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div style={{ fontSize: '12px', lineHeight: 1.5, color: 'var(--text-secondary)', background: 'var(--bg-soft)', borderRadius: '9px', padding: '10px 12px' }}>
            {loadError ? <span style={{ color: 'var(--color-danger)' }}>{loadError}</span>
              : !info ? 'Завантажуємо…'
              : <>
                  <div>Куди: <strong>{info.point ?? '—'}</strong>{cellCm && <> · комірка <strong>{cellCm} см</strong></>}</div>
                  {info.sender
                    ? <div style={{ marginTop: '4px' }}>Здаємо: <strong>Meest {info.sender.office}</strong>, {info.sender.city} · {info.sender.name}, +{info.sender.phone}</div>
                    : <div style={{ marginTop: '4px', color: 'var(--color-warn)' }}>{info.senderProblem ?? 'Відправника не налаштовано'}</div>}
                  <div style={{ marginTop: '4px' }}>Доставку платимо ми (для покупця безкоштовно), без післяплати.</div>
                </>}
          </div>

          <div style={{ display: 'flex', gap: '10px' }}>
            {field(weight, setWeight, 'Вага', 'кг')}
            {field(declared, setDeclared, 'Оцінка', '₴')}
          </div>
          <div style={{ display: 'flex', gap: '10px' }}>
            {field(length, setLength, 'Довжина', 'см')}
            {field(width, setWidth, 'Ширина', 'см')}
            {field(height, setHeight, 'Висота', 'см')}
          </div>
          <div style={{ fontSize: '11.5px', color: 'var(--text-muted)', lineHeight: 1.45, marginTop: '-6px' }}>
            Оцінка — сума замовлення; від неї Meest рахує страхування (0,5 % понад 200 ₴).
          </div>

          {info && problem && (weight || length) && (
            <div style={{ fontSize: '12px', color: 'var(--color-warn)', background: 'var(--bg-warn)', border: '1px solid var(--amber-border)', borderRadius: '9px', padding: '9px 11px' }}>⚠ {problem}</div>
          )}
          {error && (
            <div style={{ fontSize: '12px', color: 'var(--color-danger)', background: 'var(--bg-danger)', border: '1px solid var(--danger-border)', borderRadius: '9px', padding: '9px 11px' }}>⚠ {error}</div>
          )}
        </div>

        <div style={{ display: 'flex', gap: '10px', padding: '0 20px 18px' }}>
          <button onClick={onClose} disabled={busy}
            style={{ flex: 1, height: '42px', borderRadius: '10px', border: '1.5px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text-secondary)', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}>
            Скасувати
          </button>
          <button onClick={submit} disabled={blocked}
            style={{ flex: 2, height: '42px', borderRadius: '10px', border: 'none', background: blocked ? 'var(--text-muted)' : 'var(--color-success)', color: 'var(--surface)', fontSize: '13px', fontWeight: 700, cursor: blocked ? 'default' : 'pointer' }}>
            {busy ? 'Створюємо…' : 'Створити накладну'}
          </button>
        </div>
      </div>
    </Modal>
  );
}
