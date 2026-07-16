'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { X, Search, MapPin, Loader2, Package, CreditCard, Truck, Banknote } from 'lucide-react';

type Settlement = { Ref: string; Present: string; MainDescription: string; Area: string; RegionsDescription: string };
type Warehouse  = { Ref: string; Description: string; Number: string; CityRef: string };
type SenderWH   = { ref: string; cityRef: string; description: string; number: string };

type SenderInfo = {
  ref: string; cityRef: string; contactRef: string; phone: string;
  warehouses: SenderWH[];
  senderType: 'warehouse' | 'address';
  senderStreet: string;
  addressRef: string;
  addressDesc: string;
};

type WeightLine = { sku: string; volume: string | null; weightKg: number; qty: number; totalKg: number };

type OrderSnap = {
  id: string;
  mergedIds?: string[];
  contact: string;
  phone: string;
  total_price: number;
  payment_type: string;
  total_qty: number;
  items: { sku: string; qty: number; name: string }[];
  delivery_city_ref: string | null;
  delivery_city_name: string | null;
  delivery_warehouse_ref: string | null;
  delivery_subtype?: string | null;
  delivery_address?: string | null;
};

type Props = { order: OrderSnap; onClose: () => void; onCreated: (ttn: string) => void };

async function npRequest(modelName: string, calledMethod: string, methodProperties: object) {
  const res = await fetch('/api/novaposhta', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ modelName, calledMethod, methodProperties }),
  });
  const data = await res.json();
  return data.success ? data.data : [];
}

function splitContact(contact: string) {
  const parts = contact.trim().split(/\s+/);
  return { lastName: parts[0] ?? '', firstName: parts[1] ?? '', middleName: parts[2] ?? '' };
}

const inp: React.CSSProperties = {
  height: '36px', padding: '0 10px',
  border: '1px solid var(--border)', borderRadius: '8px',
  fontSize: '13px', outline: 'none', boxSizing: 'border-box', width: '100%',
  color: 'var(--text-primary)', background: 'var(--bg-soft)',
};
const lbl: React.CSSProperties = {
  fontSize: '11px', fontWeight: 700, color: 'var(--text-secondary)',
  marginBottom: '4px', display: 'block',
  textTransform: 'uppercase', letterSpacing: '0.04em',
};
const secTitle: React.CSSProperties = {
  fontSize: '10px', fontWeight: 700, color: 'var(--text-muted)',
  textTransform: 'uppercase', letterSpacing: '0.06em',
  marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '5px',
};
const dropStyle: React.CSSProperties = {
  position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0, zIndex: 100,
  background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '10px',
  boxShadow: '0 8px 24px rgba(0,0,0,0.22)', maxHeight: '200px', overflowY: 'auto',
};
const dropBtn: React.CSSProperties = {
  width: '100%', padding: '8px 12px', background: 'none', border: 'none',
  cursor: 'pointer', textAlign: 'left', borderBottom: '1px solid var(--border-light)',
  fontSize: '12px', color: 'var(--text-primary)',
};

export default function CreateTTNModal({ order, onClose, onCreated }: Props) {
  const initial = splitContact(order.contact);
  const isCod = order.payment_type === 'cod';

  const initialSubtype: 'warehouse' | 'postomat' | 'courier' =
    order.delivery_subtype === 'postomat' ? 'postomat'
    : order.delivery_subtype === 'courier' ? 'courier'
    : 'warehouse';
  const [deliverySubtype, setDeliverySubtype] = useState<'warehouse' | 'postomat' | 'courier'>(initialSubtype);
  const isPostomat = deliverySubtype === 'postomat';
  const isCourier  = deliverySubtype === 'courier';

  const [recipientAddress, setRecipientAddress] = useState('');

  // Sender type override — null means "use whatever senderInfo says"
  const [senderTypeOverride, setSenderTypeOverride] = useState<'warehouse' | 'address' | null>(null);

  const [lastName,   setLastName]   = useState(initial.lastName);
  const [firstName,  setFirstName]  = useState(initial.firstName);
  const [middleName, setMiddleName] = useState(initial.middleName);
  const [phone,      setPhone]      = useState(order.phone);

  const [cityQuery,    setCityQuery]    = useState('');
  const [settlements,  setSettlements]  = useState<Settlement[]>([]);
  const [selectedCity, setSelectedCity] = useState<Settlement | null>(null);
  const [cityDropOpen, setCityDropOpen] = useState(false);
  const [cityLoading,  setCityLoading]  = useState(false);
  const [warehouses,   setWarehouses]   = useState<Warehouse[]>([]);
  const [whQuery,      setWhQuery]      = useState('');
  const [selectedWH,   setSelectedWH]   = useState<Warehouse | null>(null);
  const [whDropOpen,   setWhDropOpen]   = useState(false);
  const [whLoading,    setWhLoading]    = useState(false);

  const [senderInfo,    setSenderInfo]    = useState<SenderInfo | null>(null);
  const [senderLoading, setSenderLoading] = useState(true);
  const [senderError,   setSenderError]   = useState('');
  const [senderWH,      setSenderWH]      = useState<SenderWH | null>(null);
  const [senderWhQ,     setSenderWhQ]     = useState('');
  const [senderWhOpen,  setSenderWhOpen]  = useState(false);

  const [weight,        setWeight]        = useState('');
  const [weightLines,   setWeightLines]   = useState<WeightLine[]>([]);
  const [weightLoading, setWeightLoading] = useState(false);
  const [seats,         setSeats]         = useState('1');
  const [cost,          setCost]          = useState(String(Math.ceil(order.total_price)));
  const [description,   setDescription]   = useState('Будівельні матеріали');
  const [dimWidth,  setDimWidth]  = useState('');
  const [dimHeight, setDimHeight] = useState('');
  const [dimLength, setDimLength] = useState('');

  const [payerType, setPayerType] = useState<'Sender' | 'Recipient'>('Recipient');
  const paymentMethod = 'Cash';

  const [codEnabled, setCodEnabled] = useState(isCod);
  const [codAmount,  setCodAmount]  = useState(String(Math.ceil(order.total_price)));

  const [submitting, setSubmitting] = useState(false);
  const [error,      setError]      = useState('');

  const cityRef     = useRef<HTMLDivElement>(null);
  const whRef       = useRef<HTMLDivElement>(null);
  const senderWhRef = useRef<HTMLDivElement>(null);
  const debRef      = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    fetch('/api/admin/np-sender').then(r => r.json()).then(d => {
      if (d.error) { setSenderError(d.error); return; }
      setSenderInfo(d);
      if (d.warehouses?.length === 1) setSenderWH(d.warehouses[0]);
    }).catch(() => setSenderError('Не вдалося завантажити дані відправника'))
      .finally(() => setSenderLoading(false));
  }, []);

  useEffect(() => {
    const ref = order.delivery_city_ref;
    const name = order.delivery_city_name ?? '';

    if (ref) {
      setSelectedCity({ Ref: ref, Present: name, MainDescription: name, Area: '', RegionsDescription: '' });
      setCityQuery(name);
      setWhLoading(true);
      npRequest('Address', 'getWarehouses', { SettlementRef: ref, Limit: 500, Page: 1 })
        .then((data: Warehouse[]) => {
          const filtered = isPostomat ? data.filter(w => w.Description.toLowerCase().includes('поштомат')) : data;
          setWarehouses(filtered);
          const wRef = order.delivery_warehouse_ref;
          if (wRef) { const m = data.find(w => w.Ref === wRef); if (m) { setSelectedWH(m); setWhQuery(m.Description); } }
        }).finally(() => setWhLoading(false));
      return;
    }

    // No stored NP ref (Rozetka/Prom orders only give us a human-readable city name, not a
    // real Nova Poshta SettlementRef — confirmed live, their own ref_id doesn't resolve via
    // getWarehouses) — resolve the city by name via a live search instead, and prefill the
    // warehouse/postomat number parsed out of the free-text delivery address so the admin only
    // has to confirm a match rather than search from scratch.
    if (!name) return;
    setCityLoading(true);
    npRequest('Address', 'searchSettlements', { CityName: name, Limit: 5, Page: 1 })
      .then((data: { Addresses: Settlement[] }[]) => {
        const match = data[0]?.Addresses?.[0];
        if (!match) return;
        setSelectedCity(match);
        setCityQuery(match.Present);
        setWhLoading(true);
        return npRequest('Address', 'getWarehouses', { SettlementRef: match.Ref, Limit: 500, Page: 1 })
          .then((whData: Warehouse[]) => {
            const filtered = isPostomat ? whData.filter(w => w.Description.toLowerCase().includes('поштомат')) : whData;
            setWarehouses(filtered);
            const numMatch = order.delivery_address?.match(/№\s*(\d+)/);
            if (numMatch) setWhQuery(numMatch[1]);
          }).finally(() => setWhLoading(false));
      })
      .finally(() => setCityLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!order.items?.length) return;
    setWeightLoading(true);
    fetch('/api/admin/order-weight', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items: order.items.map(i => ({ sku: i.sku, qty: i.qty })) }),
    })
      .then(r => r.json())
      .then(d => {
        setWeightLines(d.lines ?? []);
        if (d.totalWeightKg > 0) setWeight(String(d.totalWeightKg));
      })
      .finally(() => setWeightLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    function h(e: MouseEvent) {
      if (cityRef.current     && !cityRef.current.contains(e.target as Node))     setCityDropOpen(false);
      if (whRef.current       && !whRef.current.contains(e.target as Node))       setWhDropOpen(false);
      if (senderWhRef.current && !senderWhRef.current.contains(e.target as Node)) setSenderWhOpen(false);
    }
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  const searchCities = useCallback((q: string) => {
    if (q.length < 2) { setSettlements([]); return; }
    setCityLoading(true);
    npRequest('Address', 'searchSettlements', { CityName: q, Limit: 10, Page: 1 })
      .then((data: { Addresses: Settlement[] }[]) => { setSettlements(data[0]?.Addresses ?? []); setCityDropOpen(true); })
      .finally(() => setCityLoading(false));
  }, []);

  function handleCityInput(val: string) {
    setCityQuery(val); setSelectedCity(null);
    if (debRef.current) clearTimeout(debRef.current);
    debRef.current = setTimeout(() => searchCities(val), 350);
  }

  function selectCity(s: Settlement) {
    setSelectedCity(s); setCityQuery(s.Present); setCityDropOpen(false); setSettlements([]);
    setSelectedWH(null); setWhQuery(''); setWhLoading(true);
    npRequest('Address', 'getWarehouses', { SettlementRef: s.Ref, Limit: 500, Page: 1 })
      .then((data: Warehouse[]) => {
        const filtered = deliverySubtype === 'postomat'
          ? data.filter(w => w.Description.toLowerCase().includes('поштомат'))
          : data.filter(w => !w.Description.toLowerCase().includes('поштомат'));
        setWarehouses(filtered);
      }).finally(() => setWhLoading(false));
  }

  const filteredWH       = warehouses.filter(w => w.Description.toLowerCase().includes(whQuery.toLowerCase()) || w.Number.includes(whQuery));
  const filteredSenderWH = (senderInfo?.warehouses ?? []).filter(w => w.description.toLowerCase().includes(senderWhQ.toLowerCase()) || w.number.includes(senderWhQ));

  async function handleSubmit() {
    if (!selectedCity)    { setError('Оберіть місто одержувача'); return; }
    if (!isCourier && !selectedWH) { setError('Оберіть відділення одержувача'); return; }
    if (isCourier && !recipientAddress.trim()) { setError('Вкажіть адресу доставки кур\'єром'); return; }
    if (!senderInfo)      { setError('Дані відправника не завантажені'); return; }
    if (senderInfo.senderType === 'warehouse' && !senderWH && senderInfo.warehouses.length > 0) { setError('Оберіть відділення відправника'); return; }
    if (!lastName || !firstName) { setError('Вкажіть прізвище та ім\'я одержувача'); return; }
    if (!weight || parseFloat(weight) <= 0) { setError('Вкажіть вагу відправлення'); return; }
    if (isPostomat && (!dimWidth || !dimHeight || !dimLength)) { setError('Для поштомату вкажіть габарити посилки (ш × в × д)'); return; }
    if (codEnabled && (!codAmount || parseFloat(codAmount) <= 0)) { setError('Вкажіть суму накладеного платежу'); return; }

    setSubmitting(true); setError('');

    const effectiveSenderType = senderTypeOverride ?? senderInfo.senderType;
    const isAddress = effectiveSenderType === 'address';
    const serviceType = isCourier
      ? (isAddress ? 'DoorsDoors' : 'WarehouseDoors')
      : (isAddress ? 'DoorsWarehouse' : 'WarehouseWarehouse');

    const res = await fetch('/api/admin/create-ttn', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        orderId: order.id,
        senderRef:          senderInfo.ref,
        senderCityRef:      isAddress ? senderInfo.cityRef : (senderWH?.cityRef ?? senderInfo.warehouses[0]?.cityRef ?? senderInfo.cityRef),
        senderWarehouseRef: isAddress ? senderInfo.addressRef : (senderWH?.ref ?? senderInfo.warehouses[0]?.ref),
        senderContactRef:   senderInfo.contactRef,
        senderPhone:        senderInfo.phone,
        lastName, firstName, middleName, recipientPhone: phone,
        cityRecipientRef: isCourier ? selectedCity.Ref : (selectedWH?.CityRef || selectedCity.Ref),
        recipientAddressRef: isCourier ? '' : selectedWH?.Ref,
        recipientAddress: isCourier ? recipientAddress : undefined,
        weight: parseFloat(weight), seatsAmount: parseInt(seats) || 1,
        cost: parseFloat(cost) || 0, description,
        serviceType, payerType, paymentMethod,
        codEnabled, codAmount: codEnabled ? parseFloat(codAmount) : 0,
        ...(isPostomat && { dimensions: { width: parseFloat(dimWidth), height: parseFloat(dimHeight), length: parseFloat(dimLength) } }),
      }),
    });

    const data = await res.json();
    if (!res.ok || data.error) { setError(data.error ?? 'Помилка'); setSubmitting(false); return; }

    const idsToUpdate = order.mergedIds ?? [order.id];
    await Promise.all(idsToUpdate.map(id =>
      fetch(`/api/admin/orders/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tracking_number: data.ttn, tracking_ref: data.ref }),
      })
    ));

    onCreated(data.ttn);
  }

  const radio = (active: boolean): React.CSSProperties => ({
    flex: 1, height: '34px', borderRadius: '7px',
    border: `1.5px solid ${active ? '#1E3A5F' : 'var(--border)'}`,
    background: active ? '#1E3A5F' : 'var(--bg-soft)',
    color: active ? '#fff' : 'var(--text-secondary)',
    fontSize: '12px', fontWeight: 600, cursor: 'pointer',
  });

  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{ background: 'var(--bg-card)', borderRadius: '16px', width: '100%', maxWidth: '540px', maxHeight: '92vh', overflowY: 'auto', boxShadow: '0 24px 80px rgba(0,0,0,0.4)', border: '1px solid var(--border)' }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', borderBottom: '1px solid var(--border)', position: 'sticky', top: 0, background: 'var(--bg-card)', zIndex: 10 }}>
          <div>
            <div style={{ fontSize: '15px', fontWeight: 800, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Truck size={16} color="#4880B8" /> Створити ТТН
            </div>
            <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>
              {isPostomat ? 'Нова Пошта — відділення → поштомат' : isCourier ? 'Нова Пошта — відділення → кур\'єр' : 'Нова Пошта — відділення → відділення'}
            </div>
          </div>
          <button onClick={onClose} style={{ border: 'none', background: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: '4px', display: 'flex', borderRadius: '6px' }}>
            <X size={18} />
          </button>
        </div>

        <div style={{ padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: '18px' }}>

          {senderLoading && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-muted)', fontSize: '13px', padding: '10px 12px', background: 'var(--bg-soft)', borderRadius: '8px' }}>
              <Loader2 size={14} className="spin" /> Завантаження даних відправника...
            </div>
          )}
          {senderError && (
            <div style={{ padding: '10px 12px', background: '#FEF2F2', borderRadius: '8px', color: '#DC2626', fontSize: '13px', border: '1px solid #FECACA' }}>
              {senderError}
            </div>
          )}

          {/* Тип доставки одержувачу */}
          <section>
            <div style={secTitle}><Truck size={11} /><span>Тип доставки одержувачу</span></div>
            <div style={{ display: 'flex', gap: '6px' }}>
              {([
                { value: 'warehouse', label: '🏢 Відділення' },
                { value: 'postomat',  label: '📦 Поштомат' },
                { value: 'courier',   label: '🚚 Кур\'єр' },
              ] as const).map(({ value, label }) => (
                <button
                  key={value}
                  style={{
                    ...radio(deliverySubtype === value),
                    flex: 1, fontSize: '11px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px',
                  }}
                  onClick={() => {
                    setDeliverySubtype(value);
                    setSelectedWH(null); setWhQuery('');
                    if (selectedCity) {
                      setWhLoading(true);
                      npRequest('Address', 'getWarehouses', { SettlementRef: selectedCity.Ref, Limit: 500, Page: 1 })
                        .then((data: Warehouse[]) => {
                          const filtered = value === 'postomat'
                            ? data.filter(w => w.Description.toLowerCase().includes('поштомат'))
                            : data.filter(w => !w.Description.toLowerCase().includes('поштомат'));
                          setWarehouses(filtered);
                        }).finally(() => setWhLoading(false));
                    }
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
          </section>

          {/* Одержувач */}
          <section>
            <div style={secTitle}><span>Одержувач</span></div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '8px' }}>
              <div>
                <label style={lbl}>Прізвище</label>
                <input style={inp} value={lastName} onChange={e => setLastName(e.target.value)} placeholder="Іванов" />
              </div>
              <div>
                <label style={lbl}>Ім&apos;я</label>
                <input style={inp} value={firstName} onChange={e => setFirstName(e.target.value)} placeholder="Іван" />
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
              <div>
                <label style={lbl}>По батькові</label>
                <input style={inp} value={middleName} onChange={e => setMiddleName(e.target.value)} placeholder="Іванович" />
              </div>
              <div>
                <label style={lbl}>Телефон</label>
                <input style={inp} value={phone} onChange={e => setPhone(e.target.value)} placeholder="0671234567" />
              </div>
            </div>
          </section>

          {/* Місто + відділення / адреса */}
          <section>
            <div style={secTitle}><MapPin size={11} /><span>{isPostomat ? 'Місто та поштомат одержувача' : isCourier ? 'Місто та адреса доставки' : 'Місто та відділення одержувача'}</span></div>
            <div ref={cityRef} style={{ position: 'relative', marginBottom: '8px' }}>
              <label style={lbl}>Місто</label>
              <div style={{ position: 'relative' }}>
                <div style={{ position: 'absolute', left: '9px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', pointerEvents: 'none' }}>
                  {cityLoading ? <Loader2 size={14} className="spin" /> : <Search size={14} />}
                </div>
                <input style={{ ...inp, paddingLeft: '30px' }} placeholder="Харків, Київ, Одеса..." value={cityQuery}
                  onChange={e => handleCityInput(e.target.value)} onFocus={() => settlements.length > 0 && setCityDropOpen(true)} />
              </div>
              {cityDropOpen && settlements.length > 0 && (
                <div style={dropStyle}>
                  {settlements.map(s => (
                    <button key={s.Ref} onMouseDown={() => selectCity(s)} style={{ ...dropBtn, display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
                      <MapPin size={13} color="var(--text-muted)" style={{ flexShrink: 0, marginTop: '2px' }} />
                      <div>
                        <div style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: '13px' }}>{s.MainDescription}</div>
                        <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{s.RegionsDescription ? `${s.RegionsDescription} р-н, ` : ''}{s.Area} обл.</div>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
            {isCourier ? (
              <div>
                <label style={lbl}>Адреса доставки <span style={{ color: '#EF4444' }}>*</span></label>
                <input
                  style={inp} placeholder="вул. Шевченка, 12, кв. 5"
                  value={recipientAddress} onChange={e => setRecipientAddress(e.target.value)}
                />
                <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>
                  Вкажіть вулицю, номер будинку та квартиру. НП узгодить деталі з одержувачем.
                </div>
              </div>
            ) : null}
            {!isCourier && <div ref={whRef} style={{ position: 'relative' }}>
              <label style={lbl}>{isPostomat ? 'Поштомат' : 'Відділення'}</label>
              {whLoading ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', ...inp, paddingLeft: '10px' }}>
                  <Loader2 size={13} className="spin" /><span style={{ color: 'var(--text-muted)' }}>Завантаження відділень...</span>
                </div>
              ) : (
                <div style={{ position: 'relative' }}>
                  <div style={{ position: 'absolute', left: '9px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', pointerEvents: 'none' }}><Search size={14} /></div>
                  <input style={{ ...inp, paddingLeft: '30px' }}
                    placeholder={selectedCity ? (isPostomat ? 'Номер або адреса поштомату' : 'Номер або адреса відділення') : 'Спочатку оберіть місто'}
                    value={whQuery} disabled={!selectedCity}
                    onChange={e => { setWhQuery(e.target.value); setWhDropOpen(true); setSelectedWH(null); }}
                    onFocus={() => filteredWH.length > 0 && setWhDropOpen(true)} />
                </div>
              )}
              {whDropOpen && filteredWH.length > 0 && (
                <div style={dropStyle}>
                  {filteredWH.slice(0, 50).map(w => (
                    <button key={w.Ref} onMouseDown={() => { setSelectedWH(w); setWhQuery(w.Description); setWhDropOpen(false); }} style={dropBtn}>{w.Description}</button>
                  ))}
                </div>
              )}
            </div>}
          </section>

          {/* ── Відправник: спосіб забору ── */}
          {senderInfo && (
            <section>
              <div style={secTitle}><Package size={11} /><span>Спосіб відправки (звідки)</span></div>
              <div style={{ display: 'flex', gap: '6px', marginBottom: '10px' }}>
                {([
                  { value: 'warehouse' as const, label: '🏢 Я несу у відділення НП' },
                  { value: 'address'   as const, label: '🚚 Кур\'єр забирає зі складу' },
                ] as const).map(({ value, label }) => {
                  const active = (senderTypeOverride ?? senderInfo.senderType) === value;
                  return (
                    <button
                      key={value}
                      style={{ ...radio(active), flex: 1, fontSize: '11px' }}
                      onClick={() => setSenderTypeOverride(value)}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>

              {/* Показуємо інфо залежно від ефективного типу */}
              {(senderTypeOverride ?? senderInfo.senderType) === 'address' ? (
                senderInfo.addressRef ? (
                  <div style={{ padding: '10px 14px', background: '#F0FDF4', border: '1px solid #86EFAC', borderRadius: '8px', fontSize: '13px', color: '#15803D' }}>
                    🏭 Забір зі складу: <strong>{senderInfo.addressDesc || senderInfo.addressRef}</strong>
                    <div style={{ fontSize: '11px', color: '#16A34A', marginTop: '2px' }}>НП приїде за товаром на зареєстровану адресу</div>
                  </div>
                ) : (
                  <div style={{ padding: '10px 14px', background: '#FEF3C7', border: '1px solid #FCD34D', borderRadius: '8px', fontSize: '13px', color: '#92400E' }}>
                    ⚠ Адреса забору не налаштована. Перейдіть у Налаштування → НП Відправник.
                  </div>
                )
              ) : null}
            </section>
          )}

          {/* Вибір відділення відправника (якщо warehouse і кілька відділень) */}
          {senderInfo && (senderTypeOverride ?? senderInfo.senderType) === 'warehouse' && senderInfo.warehouses.length > 1 && (
            <section>
              <div style={secTitle}><Package size={11} /><span>Відділення відправника</span></div>
              <div ref={senderWhRef} style={{ position: 'relative' }}>
                <label style={lbl}>Відправляємо з відділення</label>
                <div style={{ position: 'relative' }}>
                  <div style={{ position: 'absolute', left: '9px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', pointerEvents: 'none' }}><Search size={14} /></div>
                  <input style={{ ...inp, paddingLeft: '30px' }} placeholder="Оберіть відділення відправки..."
                    value={senderWH ? senderWH.description : senderWhQ}
                    onChange={e => { setSenderWhQ(e.target.value); setSenderWH(null); setSenderWhOpen(true); }}
                    onFocus={() => setSenderWhOpen(true)} />
                </div>
                {senderWhOpen && filteredSenderWH.length > 0 && (
                  <div style={dropStyle}>
                    {filteredSenderWH.slice(0, 50).map(w => (
                      <button key={w.ref} onMouseDown={() => { setSenderWH(w); setSenderWhOpen(false); setSenderWhQ(''); }} style={dropBtn}>{w.description}</button>
                    ))}
                  </div>
                )}
              </div>
            </section>
          )}

          {/* Вантаж */}
          <section>
            <div style={secTitle}><Package size={11} /><span>Вантаж</span></div>

            {/* Вага + місць в одному рядку */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 80px', gap: '8px', marginBottom: '8px' }}>
              <div>
                <label style={lbl}>
                  Вага, кг <span style={{ color: '#EF4444' }}>*</span>
                  {weightLoading && <Loader2 size={11} className="spin" style={{ marginLeft: '6px', verticalAlign: 'middle' }} />}
                </label>
                <input
                  style={{ ...inp, borderColor: !weight ? '#FCA5A5' : undefined, background: !weight ? 'rgba(239,68,68,0.06)' : undefined }}
                  type="number" min="0.1" step="0.1" value={weight}
                  onChange={e => setWeight(e.target.value)}
                  placeholder="кг"
                />
              </div>
              <div>
                <label style={lbl}>Місць</label>
                <input style={inp} type="number" min="1" step="1" value={seats} onChange={e => setSeats(e.target.value)} />
              </div>
            </div>

            {/* Breakdown ваги по товарам */}
            {weightLines.length > 0 && (
              <div style={{ marginBottom: '8px', background: 'var(--bg-soft)', border: '1px solid var(--border)', borderRadius: '6px', overflow: 'hidden' }}>
                {weightLines.map(l => (
                  <div key={l.sku} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '4px 8px', borderBottom: '1px solid var(--border-light)', fontSize: '11px' }}>
                    <span style={{ color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '140px' }}>
                      {order.items.find(i => i.sku === l.sku)?.name ?? l.sku}
                    </span>
                    <span style={{ color: l.weightKg > 0 ? 'var(--text-primary)' : '#FCA5A5', flexShrink: 0, marginLeft: '6px', fontWeight: 600 }}>
                      {l.weightKg > 0 ? `${l.qty}×${l.volume} = ${l.totalKg} кг` : `${l.qty} шт — вага невідома`}
                    </span>
                  </div>
                ))}
              </div>
            )}

            {/* Вартість + опис */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
              <div>
                <label style={lbl}>Оголошена вартість, грн</label>
                <input style={inp} type="number" min="0" value={cost} onChange={e => setCost(e.target.value)} />
              </div>
              <div>
                <label style={lbl}>Опис вантажу</label>
                <input style={inp} value={description} onChange={e => setDescription(e.target.value)} />
              </div>
            </div>

            {/* Габарити для поштомату */}
            {isPostomat && (
              <div style={{ marginTop: '10px', padding: '10px 12px', background: 'var(--brand-blue-light)', border: '1.5px solid var(--border)', borderRadius: '8px' }}>
                <div style={{ ...lbl, color: 'var(--brand-blue)', marginBottom: '8px' }}>📐 Габарити, см <span style={{ color: '#EF4444' }}>*</span></div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px' }}>
                  <div><label style={lbl}>Ширина</label><input style={inp} type="number" min="1" step="1" placeholder="см" value={dimWidth}  onChange={e => setDimWidth(e.target.value)} /></div>
                  <div><label style={lbl}>Висота</label> <input style={inp} type="number" min="1" step="1" placeholder="см" value={dimHeight} onChange={e => setDimHeight(e.target.value)} /></div>
                  <div><label style={lbl}>Довжина</label><input style={inp} type="number" min="1" step="1" placeholder="см" value={dimLength} onChange={e => setDimLength(e.target.value)} /></div>
                </div>
                <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '6px' }}>Поштомат вимагає габарити для створення ТТН</div>
              </div>
            )}
          </section>

          {/* Накладений платіж (COD) */}
          <section>
            <div
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '11px 14px', borderRadius: '10px', cursor: 'pointer',
                border: `1.5px solid ${codEnabled ? '#F59E0B' : 'var(--border)'}`,
                background: codEnabled ? '#FFFBEB' : 'var(--bg-soft)',
              }}
              onClick={() => setCodEnabled(v => !v)}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Banknote size={15} color={codEnabled ? '#D97706' : 'var(--text-muted)'} />
                <span style={{ fontSize: '13px', fontWeight: 600, color: codEnabled ? '#92400E' : 'var(--text-secondary)' }}>
                  Накладений платіж (COD)
                </span>
                {isCod && <span style={{ fontSize: '11px', background: '#FDE68A', color: '#92400E', padding: '1px 6px', borderRadius: '4px', fontWeight: 600 }}>з замовлення</span>}
              </div>
              <div style={{
                width: '34px', height: '18px', borderRadius: '9px', position: 'relative', transition: 'background 0.2s',
                background: codEnabled ? '#F59E0B' : 'var(--border)',
              }}>
                <div style={{
                  position: 'absolute', top: '2px', width: '14px', height: '14px', borderRadius: '50%', background: '#fff',
                  transition: 'left 0.2s', left: codEnabled ? '18px' : '2px',
                }} />
              </div>
            </div>
            {codEnabled && (
              <div style={{ marginTop: '8px', padding: '12px 14px', background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: '8px' }}>
                <label style={{ ...lbl, color: '#92400E' }}>Сума до стягнення з одержувача, грн</label>
                <input
                  style={{ ...inp, borderColor: '#FCD34D' }}
                  type="number" min="1" step="0.01" value={codAmount}
                  onChange={e => setCodAmount(e.target.value)}
                />
                <div style={{ fontSize: '11px', color: '#A16207', marginTop: '4px' }}>
                  Одержувач сплачує цю суму готівкою при отриманні. Кошти повертаються вам через НП.
                </div>
              </div>
            )}
          </section>

          {/* Оплата доставки */}
          <section>
            <div style={secTitle}><CreditCard size={11} /><span>Оплата доставки</span></div>
            <label style={lbl}>Платник за пересилку</label>
            <div style={{ display: 'flex', gap: '6px' }}>
              <button style={radio(payerType === 'Sender')}    onClick={() => setPayerType('Sender')}>Відправник</button>
              <button style={radio(payerType === 'Recipient')} onClick={() => setPayerType('Recipient')}>Одержувач</button>
            </div>
          </section>

          {error && (
            <div style={{ padding: '10px 12px', background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: '8px', color: '#DC2626', fontSize: '13px' }}>
              {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{ padding: '14px 20px', borderTop: '1px solid var(--border)', display: 'flex', gap: '10px', justifyContent: 'flex-end', position: 'sticky', bottom: 0, background: 'var(--bg-card)' }}>
          <button onClick={onClose} style={{ height: '38px', padding: '0 18px', borderRadius: '8px', border: '1.5px solid var(--border)', background: 'var(--bg-soft)', color: 'var(--text-secondary)', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}>
            Скасувати
          </button>
          <button onClick={handleSubmit} disabled={submitting || senderLoading || !!senderError}
            style={{ height: '38px', padding: '0 20px', borderRadius: '8px', border: 'none', background: '#1E3A5F', color: '#fff', fontSize: '13px', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '7px', opacity: (submitting || senderLoading || !!senderError) ? 0.5 : 1 }}>
            {submitting ? <><Loader2 size={14} className="spin" />Створення...</> : <><Truck size={14} />Створити ТТН</>}
          </button>
        </div>
      </div>
      <style>{`@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}.spin{animation:spin 1s linear infinite}`}</style>
    </div>
  );
}
