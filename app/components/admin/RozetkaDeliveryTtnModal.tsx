'use client';

import { useEffect, useRef, useState } from 'react';
import { X, Search, MapPin, Check } from 'lucide-react';
import type { RozetkaSenderPickup } from '../../../lib/rozetka-delivery';

/**
 * Створення накладної для доставки в точку видачі Rozetka.
 *
 * Відрізняється від вікна Нової Пошти тим, що адресу отримувача питати не треба:
 * її Rozetka бере із самого замовлення. Від нас потрібні лише габарити посилки
 * і місця — те, що ніде більше не зберігається.
 *
 * Відділення відправника обирається з довідника Seller API (місто → точки, куди
 * продавець може здати посилку). Вибір зберігається на сервері й діє для наступних
 * накладних; точка, що збігається з Налаштуваннями → «ROZETKA Доставка», знімає
 * перевизначення. Разом із точкою приходить її ліміт ваги — важчу посилку туди не
 * приймуть, тому кнопка створення блокується, поки не оберуть іншу точку.
 */
type RzSender = {
  type?: string; name: string; city: string; address: string;
  department: string; department_type?: number; phones: string[];
  city_name?: string; weight_limit_kg?: number | null;
};
type SendCity = { id: string; name: string; region: string; district: string | null };

type Props = {
  order: {
    id: string; order_number: number; items: { sku: string; qty: number; name: string }[];
    /** Об'єднана посилка: усі замовлення однією накладною (items тоді — сумарні) */
    mergedIds?: string[]; mergedNumbers?: number[];
  };
  onClose: () => void;
  onCreated: (ttn: string, warnings?: string[]) => void;
};

const caps: React.CSSProperties = { fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' };
const field: React.CSSProperties = { width: '100%', height: '36px', boxSizing: 'border-box', borderRadius: '8px', border: '1.5px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text-primary)', fontSize: '13px', outline: 'none' };
const linkBtn: React.CSSProperties = { background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: '#1D4ED8', fontSize: '12px', fontWeight: 600 };

export default function RozetkaDeliveryTtnModal({ order, onClose, onCreated }: Props) {
  const [weight, setWeight] = useState('');
  const [length, setLength] = useState('30');
  const [width,  setWidth]  = useState('20');
  const [height, setHeight] = useState('15');
  const [places, setPlaces] = useState('1');
  const [sender, setSender] = useState<RzSender | null>(null);
  const [contact, setContact] = useState<{ name: string; phones: string[] } | null>(null);
  const [settingsDep, setSettingsDep] = useState<string | null>(null);
  const [senderLoading, setSenderLoading] = useState(true);
  const [senderSaving, setSenderSaving] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  // Вибір відділення
  const [pickerOpen, setPickerOpen] = useState(false);
  const [cityQuery, setCityQuery] = useState('');
  const [cities, setCities] = useState<SendCity[]>([]);
  const [cityOpen, setCityOpen] = useState(false);
  const [city, setCity] = useState<{ id: string; name: string } | null>(null);
  const [pickups, setPickups] = useState<RozetkaSenderPickup[]>([]);
  const [pickupsBusy, setPickupsBusy] = useState(false);
  const [pickupFilter, setPickupFilter] = useState('');
  const cityBoxRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    fetch(`/api/admin/orders/${order.id}/rozetka-delivery-ttn`)
      .then(r => r.json())
      .then(d => { setSender(d.sender ?? null); setContact(d.contact ?? null); setSettingsDep(d.settingsDepartment ?? null); })
      .catch(() => setSender(null))
      .finally(() => setSenderLoading(false));
  }, [order.id]);

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (cityBoxRef.current && !cityBoxRef.current.contains(e.target as Node)) setCityOpen(false);
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // Точки міста — після вибору міста (і одразу при відкритті, якщо місто відоме)
  useEffect(() => {
    if (!pickerOpen || !city) { setPickups([]); return; }
    let cancelled = false;
    setPickupsBusy(true);
    fetch(`/api/admin/rozetka/sender-directory?city=${encodeURIComponent(city.id)}&name=${encodeURIComponent(city.name)}`)
      .then(r => r.json())
      .then((d: { pickups?: RozetkaSenderPickup[]; error?: string }) => {
        if (cancelled) return;
        setPickups(d.pickups ?? []);
        if (d.error) setError(d.error);
      })
      .catch(() => { if (!cancelled) setPickups([]); })
      .finally(() => { if (!cancelled) setPickupsBusy(false); });
    return () => { cancelled = true; };
  }, [pickerOpen, city]);

  /** Місто поточного відправника: збережена назва або перше слово адреси («Харків, вул. …») */
  function senderCityName(): string {
    if (sender?.city_name) return sender.city_name;
    const head = (sender?.address ?? '').split(',')[0].trim();
    return head.replace(/^м\.\s*/i, '');
  }

  async function openPicker() {
    setPickerOpen(true); setError(''); setPickupFilter('');
    const name = senderCityName();
    setCityQuery(name);
    if (!name) return;
    // Місто відправника шукаємо в довіднику одразу — щоб список точок був під рукою
    try {
      const res = await fetch(`/api/admin/rozetka/sender-directory?q=${encodeURIComponent(name)}`);
      const d = await res.json() as { cities?: SendCity[] };
      const list = d.cities ?? [];
      setCities(list);
      const exact = list.find(c => c.name.toLowerCase() === name.toLowerCase()) ?? (list.length === 1 ? list[0] : null);
      if (exact) setCity({ id: exact.id, name: exact.name });
    } catch { /* виберуть місто руками */ }
  }

  function searchCity(val: string) {
    setCityQuery(val);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      if (val.trim().length < 2) { setCities([]); return; }
      fetch(`/api/admin/rozetka/sender-directory?q=${encodeURIComponent(val.trim())}`)
        .then(r => r.json())
        .then((d: { cities?: SendCity[] }) => { setCities(d.cities ?? []); setCityOpen(true); })
        .catch(() => setCities([]));
    }, 350);
  }

  /** Вибір відділення: зберігаємо одразу — накладна і всі наступні підуть звідти */
  async function pickSender(p: RozetkaSenderPickup) {
    const who = sender ?? contact;
    if (!who) { setError('Немає ПІБ відправника — заповніть Налаштування → «ROZETKA Доставка»'); return; }
    if (p.id === sender?.department) { setPickerOpen(false); return; }
    const next: RzSender = {
      type: sender?.type ?? 'natural', name: who.name, phones: who.phones ?? [],
      city: p.cityId, city_name: p.cityName, address: p.address,
      department: p.id, department_type: p.typeMapped, weight_limit_kg: p.limitKg,
    };
    setSenderSaving(true); setError('');
    try {
      const res = await fetch(`/api/admin/orders/${order.id}/rozetka-delivery-ttn`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sender: next }),
      });
      const d = await res.json().catch(() => ({})) as { error?: string; sender?: RzSender | null };
      if (!res.ok) { setError(d.error ?? 'Не вдалося зберегти відправника'); return; }
      setSender(d.sender ?? next);
      setPickerOpen(false);
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
          ...(order.mergedIds?.length ? { mergedIds: order.mergedIds } : {}),
        }),
      });
      const d = await res.json();
      if (!res.ok || d.error) { setError(d.error ?? 'Помилка'); return; }
      onCreated(d.ttn, Array.isArray(d.warnings) ? d.warnings : undefined);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Збій мережі');
    } finally {
      setBusy(false);
    }
  }

  const limitKg = sender?.weight_limit_kg ?? null;
  const weightNum = parseFloat(weight);
  const overLimit = limitKg != null && Number.isFinite(weightNum) && weightNum > limitKg;
  const canSubmit = !busy && !!sender && !senderSaving && !overLimit;

  const num = (v: string, set: (s: string) => void, label: string, suffix: string, warn?: boolean) => (
    <label style={{ flex: 1, minWidth: 0 }}>
      <div style={{ ...caps, marginBottom: '5px' }}>{label}</div>
      <div style={{ position: 'relative' }}>
        <input value={v} onChange={e => set(e.target.value)} inputMode="decimal"
          style={{ width: '100%', height: '38px', padding: '0 34px 0 10px', boxSizing: 'border-box', borderRadius: '9px', border: `1.5px solid ${warn ? '#DC2626' : 'var(--border)'}`, background: 'var(--bg-card)', color: 'var(--text-primary)', fontSize: '14px' }} />
        <span style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', fontSize: '11px', color: 'var(--text-muted)' }}>{suffix}</span>
      </div>
    </label>
  );

  const filtered = pickupFilter.trim()
    ? pickups.filter(p => p.label.toLowerCase().includes(pickupFilter.trim().toLowerCase()))
    : pickups;

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 10000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px', overflowY: 'auto' }}>
      <div className="adm-modal-box" style={{ background: 'var(--bg-card)', borderRadius: '16px', width: '460px', maxWidth: '96vw', maxHeight: '92vh', overflowY: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,0.25)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', borderBottom: '1px solid var(--border)' }}>
          <div>
            <div style={{ fontWeight: 800, fontSize: '16px', color: 'var(--text-primary)' }}>Накладна Rozetka</div>
            <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
              {order.mergedNumbers && order.mergedNumbers.length > 1
                ? `Одна посилка: ${order.mergedNumbers.map(n => `#${n}`).join(' + ')}`
                : `Замовлення #${order.order_number}`} · точка видачі
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'inline-flex' }}><X size={18} /></button>
        </div>

        <div style={{ padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div style={{ fontSize: '12px', lineHeight: 1.5, color: 'var(--text-secondary)', background: 'var(--bg-soft)', borderRadius: '9px', padding: '10px 12px' }}>
            Адресу отримувача Rozetka бере із замовлення — вводити її не треба.
          </div>

          {/* Відділення відправника */}
          <div style={{ border: '1.5px solid var(--border)', borderRadius: '10px', padding: '10px 12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
              <div style={caps}>Відділення відправника</div>
              {!senderLoading && !pickerOpen && (
                <button type="button" onClick={openPicker} disabled={senderSaving} style={linkBtn}>
                  {sender ? 'Змінити' : 'Обрати'}
                </button>
              )}
              {pickerOpen && (
                <button type="button" onClick={() => setPickerOpen(false)} style={{ ...linkBtn, color: 'var(--text-muted)' }}>Згорнути</button>
              )}
            </div>

            {senderLoading ? (
              <div style={{ marginTop: '6px', fontSize: '12.5px', color: 'var(--text-muted)' }}>Завантажуємо відправника…</div>
            ) : sender ? (
              <div style={{ marginTop: '6px' }}>
                <div style={{ fontSize: '13.5px', fontWeight: 700, color: 'var(--text-primary)', lineHeight: 1.35 }}>
                  {sender.address}
                  {limitKg != null && <span style={{ fontWeight: 600, color: overLimit ? '#DC2626' : 'var(--text-muted)' }}> · до {limitKg} кг</span>}
                </div>
                <div style={{ marginTop: '3px', fontSize: '11.5px', color: 'var(--text-muted)', lineHeight: 1.45 }}>
                  {senderSaving
                    ? 'Зберігаємо…'
                    : <>{sender.name}{sender.department === settingsDep
                        ? ' · точка з Налаштувань → «ROZETKA Доставка»'
                        : ' · ручний вибір, діє й для наступних накладних'}</>}
                </div>
              </div>
            ) : (
              <div style={{ marginTop: '6px', fontSize: '12.5px', color: '#B45309', lineHeight: 1.45 }}>
                Відправника ще не обрано — виберіть відділення, звідки здаєте посилки.
                {!contact && ' ПІБ і телефон беруться з Налаштувань → «ROZETKA Доставка» — заповніть їх спочатку.'}
              </div>
            )}

            {pickerOpen && (
              <div style={{ marginTop: '10px', paddingTop: '10px', borderTop: '1px solid var(--border-light)', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <div ref={cityBoxRef} style={{ position: 'relative' }}>
                  <Search size={14} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                  <input value={cityQuery} onChange={e => searchCity(e.target.value)}
                    onFocus={() => cities.length > 0 && setCityOpen(true)}
                    placeholder="Місто відправлення" style={{ ...field, padding: '0 10px 0 30px' }} />
                  {cityOpen && cities.length > 0 && (
                    <div style={{ position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0, zIndex: 50, background: 'var(--bg-card)', border: '1.5px solid var(--border)', borderRadius: '9px', boxShadow: '0 8px 24px rgba(0,0,0,0.12)', maxHeight: '200px', overflowY: 'auto' }}>
                      {cities.map(c => (
                        <button key={c.id} type="button"
                          onMouseDown={() => { setCity({ id: c.id, name: c.name }); setCityQuery(c.name); setCityOpen(false); setPickupFilter(''); }}
                          style={{ width: '100%', display: 'flex', gap: '8px', alignItems: 'flex-start', padding: '8px 10px', background: 'none', border: 'none', borderBottom: '1px solid var(--border-light)', cursor: 'pointer', textAlign: 'left' }}>
                          <MapPin size={13} color="var(--text-muted)" style={{ marginTop: '2px', flexShrink: 0 }} />
                          <div>
                            <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>{c.name}</div>
                            <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>{[c.district, c.region ? `${c.region} обл.` : null].filter(Boolean).join(', ')}</div>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {city && pickups.length > 6 && (
                  <input value={pickupFilter} onChange={e => setPickupFilter(e.target.value)}
                    placeholder="Пошук за вулицею" style={{ ...field, padding: '0 10px' }} />
                )}

                <div style={{ maxHeight: '220px', overflowY: 'auto', border: '1px solid var(--border-light)', borderRadius: '8px' }}>
                  {!city ? (
                    <div style={{ padding: '10px', fontSize: '12px', color: 'var(--text-muted)' }}>Спочатку оберіть місто</div>
                  ) : pickupsBusy ? (
                    <div style={{ padding: '10px', fontSize: '12px', color: 'var(--text-muted)' }}>Завантажуємо точки…</div>
                  ) : filtered.length === 0 ? (
                    <div style={{ padding: '10px', fontSize: '12px', color: 'var(--text-muted)' }}>
                      {pickups.length === 0 ? 'У цьому місті немає точок, куди можна здати посилку' : 'Нічого не знайдено'}
                    </div>
                  ) : filtered.map(p => {
                    const active = p.id === sender?.department;
                    const tooLight = p.limitKg != null && Number.isFinite(weightNum) && weightNum > p.limitKg;
                    return (
                      <button key={p.id} type="button" disabled={senderSaving} onClick={() => pickSender(p)}
                        style={{ width: '100%', display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 10px', background: active ? 'var(--bg-soft)' : 'none', border: 'none', borderBottom: '1px solid var(--border-light)', cursor: senderSaving ? 'wait' : 'pointer', textAlign: 'left' }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: '13px', fontWeight: active ? 700 : 500, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.label}</div>
                          <div style={{ fontSize: '11px', color: tooLight ? '#DC2626' : 'var(--text-muted)' }}>
                            {p.limitKg != null ? `до ${p.limitKg} кг` : 'ліміт ваги не вказано'}
                            {p.typeMapped === 1 ? ' · міні-відділення' : p.typeMapped === 2 ? ' · поштомат' : ''}
                          </div>
                        </div>
                        {active && <Check size={15} color="#15803D" />}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          <div style={{ display: 'flex', gap: '10px' }}>
            {num(weight, setWeight, 'Вага', 'кг', overLimit)}
            {num(places, setPlaces, 'Місць', 'шт')}
          </div>
          {overLimit && (
            <div style={{ fontSize: '12px', color: '#DC2626', marginTop: '-6px' }}>
              Точка приймає до {limitKg} кг — зменште вагу або оберіть інше відділення.
            </div>
          )}
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
          <button onClick={submit} disabled={!canSubmit}
            style={{ flex: 2, height: '42px', borderRadius: '10px', border: 'none', background: canSubmit ? '#15803D' : '#94A3B8', color: '#fff', fontSize: '13px', fontWeight: 700, cursor: canSubmit ? 'pointer' : 'default' }}>
            {busy ? 'Створюємо…' : 'Створити накладну'}
          </button>
        </div>
      </div>
    </div>
  );
}
