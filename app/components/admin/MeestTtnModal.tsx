'use client';

import { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { Modal } from './ui/Modal';

/**
 * Накладна Meest нашим договором 10031120 (13.11.2026) — замовлення сайту,
 * Rozetka й Prom з доставкою Meest. Пункт одержувача підбирається за адресою
 * замовлення (місто + №), інакше — пошук міста й список відділень/поштоматів.
 * Вага й коробка — як у Нової Пошти (/api/admin/order-weight).
 */
type City = { cityID: string; name: string; region: string; district: string };
type Branch = { branchID: string; cityID: string; number: string; type: string; title: string; address: string; postomat: boolean; limits: { weightPlaceMax?: number; length?: number; width?: number; height?: number } | null };
type Info = {
  sender: { name: string; phone: string } | null; senderBranch: string;
  box: { length: number; width: number; height: number }; declared: number; cod: number;
  address: string | null; recipient: { name: string | null; phone: string | null };
  point: { city: City; branch: Branch } | null; cityHint: string | null;
  /** Кур'єр до дверей (замовлення сайту з підтипом courier, 14.11.2026) */
  door: { cityID: string; cityName: string | null; addressID: string; street: string; building: string; flat: string | null } | null;
};
type Props = {
  order: { id: string; order_number: number; items: { sku: string; qty: number; name: string }[] };
  onClose: () => void;
  onCreated: (ttn: string) => void;
};

export default function MeestTtnModal({ order, onClose, onCreated }: Props) {
  const api = `/api/admin/orders/${order.id}/meest-ttn`;
  const [info, setInfo] = useState<Info | null>(null);
  const [loadError, setLoadError] = useState('');
  const [cityQ, setCityQ] = useState('');
  const [cities, setCities] = useState<City[]>([]);
  const [city, setCity] = useState<City | null>(null);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [branchQ, setBranchQ] = useState('');
  const [branch, setBranch] = useState<Branch | null>(null);
  const [weight, setWeight] = useState('');
  const [length, setLength] = useState('');
  const [width, setWidth] = useState('');
  const [height, setHeight] = useState('');
  const [declared, setDeclared] = useState('');
  const [cod, setCod] = useState('');
  const [receiverPays, setReceiverPays] = useState(true);
  const [calc, setCalc] = useState<{ cost: number | null; deliveryDate: string | null } | null>(null);
  const [busy, setBusy] = useState(false);
  const [doorBuilding, setDoorBuilding] = useState('');
  const [doorFlat, setDoorFlat] = useState('');
  const door = info?.door ?? null;
  const [error, setError] = useState('');
  const [autoBox, setAutoBox] = useState<{ dims: [number, number, number]; label: string } | null>(null);
  const dimsTouched = useRef(false);

  useEffect(() => {
    fetch(api).then(r => r.json()).then((d: Info & { error?: string }) => {
      if (d.error) { setLoadError(d.error); return; }
      setInfo(d);
      setLength(String(d.box.length)); setWidth(String(d.box.width)); setHeight(String(d.box.height));
      setDeclared(String(d.declared)); setCod(String(d.cod));
      if (d.door) { setDoorBuilding(d.door.building); setDoorFlat(d.door.flat ?? ''); }
      if (d.point) { setCity(d.point.city); setBranch(d.point.branch); setCityQ(d.point.city.name); }
      else if (d.cityHint) setCityQ(d.cityHint);
    }).catch(() => setLoadError('Не вдалося завантажити дані'));
  }, [api]);

  useEffect(() => {
    if (!order.items?.length) return;
    fetch('/api/admin/order-weight', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items: order.items.map(i => ({ sku: i.sku, qty: i.qty })) }),
    }).then(r => r.json()).then((d: { totalWeightKg?: number; box?: { dims: [number, number, number]; label: string } | null }) => {
      if ((d.totalWeightKg ?? 0) > 0) setWeight(String(d.totalWeightKg));
      if (d.box) setAutoBox(d.box);
    }).catch(() => { /* вагу введуть руками */ });
  }, [order.items]);

  useEffect(() => {
    if (!autoBox || !info || dimsTouched.current) return;
    setLength(String(autoBox.dims[0])); setWidth(String(autoBox.dims[1])); setHeight(String(autoBox.dims[2]));
  }, [autoBox, info]);

  // Пошук міста (лише поки місто не обрано або текст змінили)
  useEffect(() => {
    if (city && cityQ === city.name) return;
    if (cityQ.trim().length < 2) { setCities([]); return; }
    const t = setTimeout(() => {
      fetch(`${api}?cities=${encodeURIComponent(cityQ.trim())}`).then(r => r.json()).then(d => setCities(d.cities ?? [])).catch(() => setCities([]));
    }, 300);
    return () => clearTimeout(t);
  }, [cityQ, city, api]);

  useEffect(() => {
    if (!city) { setBranches([]); return; }
    fetch(`${api}?branches=${encodeURIComponent(city.cityID)}`).then(r => r.json()).then(d => setBranches(d.branches ?? [])).catch(() => setBranches([]));
  }, [city, api]);

  const n = (s: string) => parseFloat(s.replace(',', '.'));
  const place = { weight: n(weight), length: n(length), width: n(width), height: n(height) };
  const placeOk = place.weight > 0 && place.length > 0 && place.width > 0 && place.height > 0;
  const lim = branch?.limits;
  const limitProblem = branch && lim && placeOk
    ? (lim.weightPlaceMax && place.weight > lim.weightPlaceMax ? `Відділення приймає до ${lim.weightPlaceMax} кг на місце`
      : lim.length && lim.width && lim.height && [place.length, place.width, place.height].sort((a, b) => b - a).some((v, i) => v > [lim.length!, lim.width!, lim.height!].sort((a, b) => b - a)[i])
        ? `Не влазить у габарити пункту (${lim.length}×${lim.width}×${lim.height} см)` : null)
    : null;
  const blocked = busy || !info?.sender || (door ? !doorBuilding.trim() : !branch) || !placeOk || (!door && !!limitProblem);
  const body = () => ({
    ...(door
      ? { cityID: door.cityID, cityName: door.cityName ?? undefined, door: { addressID: door.addressID, street: door.street, building: doorBuilding, flat: doorFlat || null } }
      : { branchID: branch?.branchID, cityID: city?.cityID ?? branch?.cityID, cityName: city?.name, branchTitle: branch?.title }),
    weight: place.weight, length: place.length, width: place.width, height: place.height,
    declared: n(declared) || 0, cod: n(cod) || 0, receiverPays,
  });

  // Розрахунок вартості — щойно є пункт і місце
  useEffect(() => {
    setCalc(null);
    if ((!branch && !door) || !placeOk) return;
    const t = setTimeout(() => {
      fetch(api, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...body(), calc: true }) })
        .then(r => r.json()).then(d => { if (!d.error) setCalc(d); }).catch(() => {});
    }, 400);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [branch?.branchID, door?.addressID, doorBuilding, weight, length, width, height, cod, declared]);

  async function submit() {
    setError(''); setBusy(true);
    try {
      const res = await fetch(api, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body()) });
      const d = await res.json();
      if (!res.ok || d.error) { setError(d.error ?? 'Помилка'); return; }
      onCreated(d.ttn);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Збій мережі');
    } finally {
      setBusy(false);
    }
  }

  const lbl = (t: string) => <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '5px' }}>{t}</div>;
  const inputStyle: React.CSSProperties = { width: '100%', height: '38px', padding: '0 10px', boxSizing: 'border-box', borderRadius: '9px', border: '1.5px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text-primary)', fontSize: '14px' };
  const field = (v: string, set: (s: string) => void, label: string, suffix: string, dim = false) => (
    <label style={{ flex: 1, minWidth: 0 }}>
      {lbl(label)}
      <div style={{ position: 'relative' }}>
        <input value={v} onChange={e => { if (dim) dimsTouched.current = true; set(e.target.value); }} inputMode="decimal" style={{ ...inputStyle, paddingRight: '34px' }} />
        <span style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', fontSize: '11px', color: 'var(--text-muted)' }}>{suffix}</span>
      </div>
    </label>
  );
  const shownBranches = branches.filter(b => {
    const q = branchQ.trim().toLowerCase();
    return !q || b.number === q.replace(/\D/g, '') || `${b.title} ${b.address}`.toLowerCase().includes(q);
  }).slice(0, 60);

  return (
    <Modal open onClose={onClose} width={520} padding={0} dismissible={false} aria-label="Накладна Meest">
      <div style={{ background: 'var(--bg-card)', maxHeight: '92vh', overflowY: 'auto', width: '100%' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', borderBottom: '1px solid var(--border)' }}>
          <div>
            <div style={{ fontWeight: 800, fontSize: '16px', color: 'var(--text-primary)' }}>Накладна Meest</div>
            <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Замовлення #{order.order_number} · договір 10031120</div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'inline-flex' }}><X size={18} /></button>
        </div>

        <div style={{ padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div style={{ fontSize: '12px', lineHeight: 1.5, color: 'var(--text-secondary)', background: 'var(--bg-soft)', borderRadius: '9px', padding: '10px 12px' }}>
            {loadError ? <span style={{ color: 'var(--color-danger)' }}>{loadError}</span>
              : !info ? 'Завантажуємо…'
              : <>
                  <div>Адреса в замовленні: <strong>{info.address ?? '—'}</strong></div>
                  <div style={{ marginTop: '4px' }}>Одержувач: <strong>{info.recipient.name ?? '—'}</strong>, {info.recipient.phone ?? '—'}</div>
                  {info.sender
                    ? <div style={{ marginTop: '4px' }}>Здаємо: <strong>{info.senderBranch}</strong> · {info.sender.name}, {info.sender.phone}</div>
                    : <div style={{ marginTop: '4px', color: 'var(--color-warn)' }}>Немає ПІБ/телефону відправника — Налаштування → ROZETKA Доставка</div>}
                  {!info.point && !info.door && <div style={{ marginTop: '4px', color: 'var(--color-warn)' }}>Пункт за адресою не знайдено — оберіть місто й відділення нижче.</div>}
                </>}
          </div>

          {door ? (
            <div>
              {lbl('Кур\x27єр до дверей')}
              <div style={{ fontSize: '13px', color: 'var(--text-primary)', marginBottom: '8px' }}><strong>{door.cityName}</strong>, {door.street}</div>
              <div style={{ display: 'flex', gap: '10px' }}>
                <label style={{ flex: 1 }}>{lbl('Будинок')}<input value={doorBuilding} onChange={e => setDoorBuilding(e.target.value)} style={inputStyle} /></label>
                <label style={{ flex: 1 }}>{lbl('Квартира / офіс')}<input value={doorFlat} onChange={e => setDoorFlat(e.target.value)} style={inputStyle} /></label>
              </div>
            </div>
          ) : (<>
          <div style={{ position: 'relative' }}>
            {lbl('Місто')}
            <input value={cityQ} onChange={e => { setCityQ(e.target.value); if (city && e.target.value !== city.name) { setCity(null); setBranch(null); } }} placeholder="Почніть вводити назву" style={inputStyle} />
            {!city && cities.length > 0 && (
              <div style={{ position: 'absolute', zIndex: 5, left: 0, right: 0, top: '100%', marginTop: '4px', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '9px', boxShadow: '0 6px 20px rgba(15,23,42,0.16)', maxHeight: '220px', overflowY: 'auto' }}>
                {cities.slice(0, 20).map(c => (
                  <button key={c.cityID} type="button" onClick={() => { setCity(c); setCityQ(c.name); setBranch(null); setBranchQ(''); }}
                    style={{ display: 'block', width: '100%', textAlign: 'left', padding: '8px 10px', border: 'none', background: 'none', cursor: 'pointer', fontSize: '13px', color: 'var(--text-primary)' }}>
                    {c.name} <span style={{ color: 'var(--text-muted)', fontSize: '11.5px' }}>{[c.district, c.region].filter(Boolean).join(', ')}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {city && (
            <div>
              {lbl(`Відділення / поштомат${branches.length ? ` (${branches.length})` : ''}`)}
              {branch ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 10px', borderRadius: '9px', border: '1.5px solid var(--border)', fontSize: '13px' }}>
                  <span style={{ flex: 1 }}><strong>{branch.title}</strong> <span style={{ color: 'var(--text-muted)' }}>· {branch.type}</span></span>
                  <button type="button" onClick={() => setBranch(null)} style={{ border: 'none', background: 'none', color: 'var(--brand-blue)', cursor: 'pointer', fontSize: '12px', fontWeight: 600 }}>Змінити</button>
                </div>
              ) : (
                <>
                  <input value={branchQ} onChange={e => setBranchQ(e.target.value)} placeholder="№ або вулиця" style={inputStyle} />
                  <div style={{ marginTop: '4px', border: '1px solid var(--border-light)', borderRadius: '9px', maxHeight: '200px', overflowY: 'auto' }}>
                    {shownBranches.map(b => (
                      <button key={b.branchID} type="button" onClick={() => setBranch(b)}
                        style={{ display: 'block', width: '100%', textAlign: 'left', padding: '7px 10px', border: 'none', borderBottom: '1px solid var(--border-light)', background: 'none', cursor: 'pointer', fontSize: '12.5px', color: 'var(--text-primary)' }}>
                        {b.title} <span style={{ color: 'var(--text-muted)', fontSize: '11px' }}>· {b.type}</span>
                      </button>
                    ))}
                    {!shownBranches.length && <div style={{ padding: '8px 10px', fontSize: '12px', color: 'var(--text-muted)' }}>{branches.length ? 'Нічого не знайдено' : 'Завантажуємо…'}</div>}
                  </div>
                </>
              )}
            </div>
          )}
          </>)}

          <div style={{ display: 'flex', gap: '10px' }}>
            {field(weight, setWeight, 'Вага', 'кг')}
            {field(declared, setDeclared, 'Оцінка', '₴')}
            {field(cod, setCod, 'Післяплата', '₴')}
          </div>
          <div style={{ display: 'flex', gap: '10px' }}>
            {field(length, setLength, 'Довжина', 'см', true)}
            {field(width, setWidth, 'Ширина', 'см', true)}
            {field(height, setHeight, 'Висота', 'см', true)}
          </div>
          {autoBox && <div style={{ fontSize: '11.5px', color: 'var(--text-muted)', marginTop: '-6px' }}>Коробка {autoBox.label} ({autoBox.dims.join('×')} см) — підібрана за габаритами товарів.</div>}

          <div style={{ display: 'flex', gap: '6px', fontSize: '12.5px' }}>
            {[{ v: true, t: 'Доставку платить одержувач' }, { v: false, t: 'Платимо ми' }].map(o => (
              <button key={String(o.v)} type="button" onClick={() => setReceiverPays(o.v)}
                style={{ flex: 1, height: '34px', borderRadius: '8px', cursor: 'pointer', fontWeight: 600,
                  border: `1.5px solid ${receiverPays === o.v ? 'var(--navy)' : 'var(--border)'}`,
                  background: receiverPays === o.v ? 'var(--blue-bg)' : 'var(--bg-card)', color: receiverPays === o.v ? 'var(--navy)' : 'var(--text-secondary)' }}>
                {o.t}
              </button>
            ))}
          </div>

          {calc && (
            <div style={{ fontSize: '12.5px', color: 'var(--text-secondary)' }}>
              Доставка: <strong>{calc.cost != null ? `${calc.cost} ₴` : '—'}</strong>{calc.deliveryDate ? <> · орієнтовно <strong>{calc.deliveryDate}</strong></> : null}
            </div>
          )}
          {!door && limitProblem && <div style={{ fontSize: '12px', color: 'var(--color-warn)', background: 'var(--bg-warn)', border: '1px solid var(--amber-border)', borderRadius: '9px', padding: '9px 11px' }}>⚠ {limitProblem}</div>}
          {error && <div style={{ fontSize: '12px', color: 'var(--color-danger)', background: 'var(--bg-danger)', border: '1px solid var(--danger-border)', borderRadius: '9px', padding: '9px 11px' }}>⚠ {error}</div>}
        </div>

        <div style={{ display: 'flex', gap: '10px', padding: '0 20px 18px' }}>
          <button onClick={onClose} disabled={busy}
            style={{ flex: 1, height: '42px', borderRadius: '10px', border: '1.5px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text-secondary)', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}>
            Скасувати
          </button>
          <button onClick={submit} disabled={blocked}
            style={{ flex: 2, height: '42px', borderRadius: '10px', border: 'none', background: blocked ? 'var(--text-muted)' : 'var(--violet)', color: 'var(--surface)', fontSize: '13px', fontWeight: 700, cursor: blocked ? 'default' : 'pointer' }}>
            {busy ? 'Створюємо…' : 'Створити накладну Meest'}
          </button>
        </div>
      </div>
    </Modal>
  );
}
