'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { X, Search, MapPin, Loader2, Package, CreditCard, Truck, Banknote } from 'lucide-react';

type Settlement = { Ref: string; Present: string; MainDescription: string; Area: string; RegionsDescription: string };
type Warehouse  = { Ref: string; Description: string; Number: string; CityRef: string };
type SenderWH   = { ref: string; cityRef: string; description: string; number: string };

type SenderInfo = {
  ref: string; cityRef: string; contactRef: string; phone: string; warehouses: SenderWH[];
};

type WeightLine = { sku: string; volume: string | null; weightKg: number; qty: number; totalKg: number };

type OrderSnap = {
  id: string;
  contact: string;
  phone: string;
  total_price: number;
  payment_type: string;
  total_qty: number;
  items: { sku: string; qty: number; name: string }[];
  delivery_city_ref: string | null;
  delivery_city_name: string | null;
  delivery_warehouse_ref: string | null;
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
  height: '36px', padding: '0 10px', border: '1px solid #E2E8F0', borderRadius: '8px',
  fontSize: '13px', outline: 'none', boxSizing: 'border-box', width: '100%', color: '#0F172A',
};
const lbl: React.CSSProperties = {
  fontSize: '11px', fontWeight: 700, color: '#64748B', marginBottom: '4px', display: 'block',
  textTransform: 'uppercase', letterSpacing: '0.04em',
};
const secTitle: React.CSSProperties = {
  fontSize: '11px', fontWeight: 700, color: '#94A3B8', textTransform: 'uppercase',
  letterSpacing: '0.06em', marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '5px',
};
const dropStyle: React.CSSProperties = {
  position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0, zIndex: 100,
  background: '#fff', border: '1px solid #E2E8F0', borderRadius: '10px',
  boxShadow: '0 8px 24px rgba(0,0,0,0.12)', maxHeight: '200px', overflowY: 'auto',
};
const dropBtn: React.CSSProperties = {
  width: '100%', padding: '8px 12px', background: 'none', border: 'none',
  cursor: 'pointer', textAlign: 'left', borderBottom: '1px solid #F8FAFC', fontSize: '12px', color: '#374151',
};

export default function CreateTTNModal({ order, onClose, onCreated }: Props) {
  const initial = splitContact(order.contact);
  const isCod = order.payment_type === 'cod';

  // Recipient
  const [lastName,   setLastName]   = useState(initial.lastName);
  const [firstName,  setFirstName]  = useState(initial.firstName);
  const [middleName, setMiddleName] = useState(initial.middleName);
  const [phone,      setPhone]      = useState(order.phone);

  // Recipient city/warehouse
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

  // Sender
  const [senderInfo,    setSenderInfo]    = useState<SenderInfo | null>(null);
  const [senderLoading, setSenderLoading] = useState(true);
  const [senderError,   setSenderError]   = useState('');
  const [senderWH,      setSenderWH]      = useState<SenderWH | null>(null);
  const [senderWhQ,     setSenderWhQ]     = useState('');
  const [senderWhOpen,  setSenderWhOpen]  = useState(false);

  // Cargo
  const [weight,       setWeight]       = useState('');
  const [weightLines,  setWeightLines]  = useState<WeightLine[]>([]);
  const [weightLoading, setWeightLoading] = useState(false);
  const [seats,        setSeats]        = useState('1');
  const [cost,        setCost]        = useState(String(Math.ceil(order.total_price)));
  const [description, setDescription] = useState('Будівельні матеріали');

  // Delivery payment (хто платить за пересилку)
  const [payerType,     setPayerType]     = useState<'Sender' | 'Recipient'>('Recipient');
  const paymentMethod = 'Cash';

  // COD — накладений платіж
  const [codEnabled, setCodEnabled] = useState(isCod);
  const [codAmount,  setCodAmount]  = useState(String(Math.ceil(order.total_price)));

  // Submit
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
    if (!ref) return;
    const name = order.delivery_city_name ?? '';
    setSelectedCity({ Ref: ref, Present: name, MainDescription: name, Area: '', RegionsDescription: '' });
    setCityQuery(name);
    setWhLoading(true);
    npRequest('Address', 'getWarehouses', { SettlementRef: ref, Limit: 200, Page: 1 })
      .then((data: Warehouse[]) => {
        setWarehouses(data);
        const wRef = order.delivery_warehouse_ref;
        if (wRef) { const m = data.find(w => w.Ref === wRef); if (m) { setSelectedWH(m); setWhQuery(m.Description); } }
      }).finally(() => setWhLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Auto-calculate weight from product volumes
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
    npRequest('Address', 'getWarehouses', { SettlementRef: s.Ref, Limit: 200, Page: 1 })
      .then((data: Warehouse[]) => setWarehouses(data)).finally(() => setWhLoading(false));
  }

  const filteredWH       = warehouses.filter(w => w.Description.toLowerCase().includes(whQuery.toLowerCase()) || w.Number.includes(whQuery));
  const filteredSenderWH = (senderInfo?.warehouses ?? []).filter(w => w.description.toLowerCase().includes(senderWhQ.toLowerCase()) || w.number.includes(senderWhQ));

  async function handleSubmit() {
    if (!selectedCity)    { setError('Оберіть місто одержувача'); return; }
    if (!selectedWH)      { setError('Оберіть відділення одержувача'); return; }
    if (!senderInfo)      { setError('Дані відправника не завантажені'); return; }
    if (!senderWH && senderInfo.warehouses.length > 0) { setError('Оберіть відділення відправника'); return; }
    if (!lastName || !firstName) { setError('Вкажіть прізвище та ім\'я одержувача'); return; }
    if (!weight || parseFloat(weight) <= 0) { setError('Вкажіть вагу відправлення'); return; }
    if (codEnabled && (!codAmount || parseFloat(codAmount) <= 0)) { setError('Вкажіть суму накладеного платежу'); return; }

    setSubmitting(true); setError('');

    const res = await fetch('/api/admin/create-ttn', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        orderId: order.id,
        senderRef: senderInfo.ref,
        senderCityRef: senderWH?.cityRef ?? senderInfo.warehouses[0]?.cityRef ?? senderInfo.cityRef,
        senderWarehouseRef: senderWH?.ref ?? senderInfo.warehouses[0]?.ref,
        senderContactRef: senderInfo.contactRef, senderPhone: senderInfo.phone,
        lastName, firstName, middleName, recipientPhone: phone,
        cityRecipientRef: selectedWH.CityRef || selectedCity.Ref, recipientAddressRef: selectedWH.Ref,
        weight: parseFloat(weight), seatsAmount: parseInt(seats) || 1,
        cost: parseFloat(cost) || 0, description,
        payerType, paymentMethod,
        codEnabled, codAmount: codEnabled ? parseFloat(codAmount) : 0,
      }),
    });

    const data = await res.json();
    if (!res.ok || data.error) { setError(data.error ?? 'Помилка'); setSubmitting(false); return; }
    onCreated(data.ttn);
  }

  const radio = (active: boolean): React.CSSProperties => ({
    flex: 1, height: '34px', borderRadius: '7px',
    border: `1.5px solid ${active ? '#1E3A5F' : '#E2E8F0'}`,
    background: active ? '#EFF4FF' : '#fff', color: active ? '#1E3A5F' : '#64748B',
    fontSize: '12px', fontWeight: 600, cursor: 'pointer',
  });

  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.55)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{ background: '#fff', borderRadius: '16px', width: '100%', maxWidth: '540px', maxHeight: '92vh', overflowY: 'auto', boxShadow: '0 24px 80px rgba(0,0,0,0.22)' }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '18px 20px', borderBottom: '1px solid #F1F5F9', position: 'sticky', top: 0, background: '#fff', zIndex: 10 }}>
          <div>
            <div style={{ fontSize: '16px', fontWeight: 800, color: '#0F172A', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Truck size={18} color="#1E3A5F" /> Створити ТТН
            </div>
            <div style={{ fontSize: '12px', color: '#94A3B8', marginTop: '2px' }}>Нова Пошта — відділення → відділення</div>
          </div>
          <button onClick={onClose} style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#94A3B8', padding: '4px', display: 'flex' }}>
            <X size={20} />
          </button>
        </div>

        <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '20px' }}>

          {senderLoading && <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#94A3B8', fontSize: '13px' }}><Loader2 size={14} className="spin" /> Завантаження даних відправника...</div>}
          {senderError   && <div style={{ padding: '12px', background: '#FEF2F2', borderRadius: '8px', color: '#DC2626', fontSize: '13px' }}>{senderError}</div>}

          {/* Recipient */}
          <section>
            <div style={secTitle}><span>Одержувач</span></div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '8px' }}>
              <div><label style={lbl}>Прізвище</label><input style={inp} value={lastName}   onChange={e => setLastName(e.target.value)}   placeholder="Іванов" /></div>
              <div><label style={lbl}>Ім'я</label>    <input style={inp} value={firstName}  onChange={e => setFirstName(e.target.value)}  placeholder="Іван" /></div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
              <div><label style={lbl}>По батькові</label><input style={inp} value={middleName} onChange={e => setMiddleName(e.target.value)} placeholder="Іванович" /></div>
              <div><label style={lbl}>Телефон</label>    <input style={inp} value={phone}      onChange={e => setPhone(e.target.value)}      placeholder="0671234567" /></div>
            </div>
          </section>

          {/* City + Warehouse */}
          <section>
            <div style={secTitle}><MapPin size={11} /><span>Місто та відділення одержувача</span></div>
            <div ref={cityRef} style={{ position: 'relative', marginBottom: '8px' }}>
              <label style={lbl}>Місто</label>
              <div style={{ position: 'relative' }}>
                <div style={{ position: 'absolute', left: '9px', top: '50%', transform: 'translateY(-50%)', color: '#94A3B8', pointerEvents: 'none' }}>
                  {cityLoading ? <Loader2 size={14} className="spin" /> : <Search size={14} />}
                </div>
                <input style={{ ...inp, paddingLeft: '30px' }} placeholder="Харків, Київ, Одеса..." value={cityQuery}
                  onChange={e => handleCityInput(e.target.value)} onFocus={() => settlements.length > 0 && setCityDropOpen(true)} />
              </div>
              {cityDropOpen && settlements.length > 0 && (
                <div style={dropStyle}>
                  {settlements.map(s => (
                    <button key={s.Ref} onMouseDown={() => selectCity(s)} style={{ ...dropBtn, display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
                      <MapPin size={13} color="#94A3B8" style={{ flexShrink: 0, marginTop: '2px' }} />
                      <div>
                        <div style={{ fontWeight: 600, color: '#0F172A', fontSize: '13px' }}>{s.MainDescription}</div>
                        <div style={{ fontSize: '11px', color: '#94A3B8' }}>{s.RegionsDescription ? `${s.RegionsDescription} р-н, ` : ''}{s.Area} обл.</div>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div ref={whRef} style={{ position: 'relative' }}>
              <label style={lbl}>Відділення</label>
              {whLoading ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', ...inp, paddingLeft: '10px' }}>
                  <Loader2 size={13} className="spin" /><span style={{ color: '#94A3B8' }}>Завантаження відділень...</span>
                </div>
              ) : (
                <div style={{ position: 'relative' }}>
                  <div style={{ position: 'absolute', left: '9px', top: '50%', transform: 'translateY(-50%)', color: '#94A3B8', pointerEvents: 'none' }}><Search size={14} /></div>
                  <input style={{ ...inp, paddingLeft: '30px' }}
                    placeholder={selectedCity ? 'Номер або адреса відділення' : 'Спочатку оберіть місто'}
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
            </div>
          </section>

          {/* Sender warehouse */}
          {senderInfo && senderInfo.warehouses.length > 1 && (
            <section>
              <div style={secTitle}><Package size={11} /><span>Відділення відправника</span></div>
              <div ref={senderWhRef} style={{ position: 'relative' }}>
                <label style={lbl}>Відправляємо з відділення</label>
                <div style={{ position: 'relative' }}>
                  <div style={{ position: 'absolute', left: '9px', top: '50%', transform: 'translateY(-50%)', color: '#94A3B8', pointerEvents: 'none' }}><Search size={14} /></div>
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

          {/* Cargo */}
          <section>
            <div style={secTitle}><Package size={11} /><span>Вантаж</span></div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '8px' }}>
              <div>
                <label style={lbl}>
                  Вага, кг <span style={{ color: '#EF4444' }}>*</span>
                </label>
                <div style={{ position: 'relative' }}>
                  <input
                    style={{ ...inp, borderColor: !weight ? '#FCA5A5' : '#E2E8F0', background: !weight ? '#FFF5F5' : '#fff', paddingRight: weightLoading ? '32px' : '10px' }}
                    type="number" min="0.1" step="0.1" value={weight}
                    onChange={e => setWeight(e.target.value)}
                    placeholder="Введіть вагу"
                  />
                  {weightLoading && (
                    <div style={{ position: 'absolute', right: '9px', top: '50%', transform: 'translateY(-50%)' }}>
                      <Loader2 size={13} className="spin" color="#94A3B8" />
                    </div>
                  )}
                </div>
                {weightLines.length > 0 && (
                  <div style={{ marginTop: '6px', background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '6px', overflow: 'hidden' }}>
                    {weightLines.map(l => (
                      <div key={l.sku} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '4px 8px', borderBottom: '1px solid #F1F5F9', fontSize: '11px' }}>
                        <span style={{ color: '#64748B', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '140px' }}>
                          {order.items.find(i => i.sku === l.sku)?.name ?? l.sku}
                        </span>
                        <span style={{ color: l.weightKg > 0 ? '#374151' : '#FCA5A5', flexShrink: 0, marginLeft: '6px', fontWeight: 600 }}>
                          {l.weightKg > 0 ? `${l.qty}×${l.volume} = ${l.totalKg} кг` : `${l.qty} шт — вага невідома`}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div>
                <label style={lbl}>Місць</label>
                <input style={inp} type="number" min="1" step="1" value={seats} onChange={e => setSeats(e.target.value)} />
              </div>
            </div>
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
          </section>

          {/* COD — накладений платіж */}
          <section>
            <div
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '12px 14px', borderRadius: '10px', cursor: 'pointer',
                border: `1.5px solid ${codEnabled ? '#F59E0B' : '#E2E8F0'}`,
                background: codEnabled ? '#FFFBEB' : '#F8FAFC',
              }}
              onClick={() => setCodEnabled(v => !v)}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Banknote size={16} color={codEnabled ? '#D97706' : '#94A3B8'} />
                <span style={{ fontSize: '13px', fontWeight: 700, color: codEnabled ? '#92400E' : '#64748B' }}>
                  Накладений платіж (COD)
                </span>
                {isCod && <span style={{ fontSize: '11px', background: '#FDE68A', color: '#92400E', padding: '1px 6px', borderRadius: '4px', fontWeight: 600 }}>з замовлення</span>}
              </div>
              <div style={{
                width: '36px', height: '20px', borderRadius: '10px', position: 'relative', transition: 'background 0.2s',
                background: codEnabled ? '#F59E0B' : '#CBD5E1',
              }}>
                <div style={{
                  position: 'absolute', top: '2px', width: '16px', height: '16px', borderRadius: '50%', background: '#fff',
                  transition: 'left 0.2s', left: codEnabled ? '18px' : '2px',
                }} />
              </div>
            </div>
            {codEnabled && (
              <div style={{ marginTop: '8px', padding: '12px 14px', background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: '8px' }}>
                <label style={{ ...lbl, color: '#92400E' }}>Сума до стягнення з одержувача, грн</label>
                <input
                  style={{ ...inp, borderColor: '#FCD34D', background: '#fff' }}
                  type="number" min="1" step="0.01" value={codAmount}
                  onChange={e => setCodAmount(e.target.value)}
                />
                <div style={{ fontSize: '11px', color: '#A16207', marginTop: '4px' }}>
                  Одержувач сплачує цю суму готівкою при отриманні. Кошти повертаються вам через НП.
                </div>
              </div>
            )}
          </section>

          {/* Delivery payment */}
          <section>
            <div style={secTitle}><CreditCard size={11} /><span>Оплата доставки</span></div>
            <div>
              <label style={lbl}>Платник за пересилку</label>
              <div style={{ display: 'flex', gap: '6px' }}>
                <button style={radio(payerType === 'Sender')}    onClick={() => setPayerType('Sender')}>Відправник</button>
                <button style={radio(payerType === 'Recipient')} onClick={() => setPayerType('Recipient')}>Одержувач</button>
              </div>
            </div>
          </section>

          {error && <div style={{ padding: '10px 12px', background: '#FEF2F2', borderRadius: '8px', color: '#DC2626', fontSize: '13px' }}>{error}</div>}
        </div>

        {/* Footer */}
        <div style={{ padding: '16px 20px', borderTop: '1px solid #F1F5F9', display: 'flex', gap: '10px', justifyContent: 'flex-end', position: 'sticky', bottom: 0, background: '#fff' }}>
          <button onClick={onClose} style={{ height: '38px', padding: '0 18px', borderRadius: '8px', border: '1.5px solid #E2E8F0', background: '#fff', color: '#64748B', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}>
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
