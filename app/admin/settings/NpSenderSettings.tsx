'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { Search, MapPin, Loader2, Truck, Check } from 'lucide-react';

type Settlement = { Ref: string; Present: string; MainDescription: string; Area: string; RegionsDescription: string };
type Warehouse  = { Ref: string; Description: string; Number: string; CityRef: string };

async function npRequest(modelName: string, calledMethod: string, methodProperties: object) {
  const res = await fetch('/api/novaposhta', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ modelName, calledMethod, methodProperties }),
  });
  const data = await res.json();
  return data.success ? data.data : [];
}

type Props = {
  initialCityRef: string;
  initialCityName: string;
  initialWarehouseRef: string;
  initialWarehouseDesc: string;
  initialPhone: string;
};

const inp: React.CSSProperties = {
  height: '38px', padding: '0 12px', border: '1px solid #E2E8F0', borderRadius: '8px',
  fontSize: '13px', outline: 'none', boxSizing: 'border-box', width: '100%',
};
const lbl: React.CSSProperties = {
  fontSize: '12px', fontWeight: 700, color: '#64748B', marginBottom: '5px', display: 'block',
  textTransform: 'uppercase', letterSpacing: '0.04em',
};
const drop: React.CSSProperties = {
  position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0, zIndex: 50,
  background: '#fff', border: '1px solid #E2E8F0', borderRadius: '10px',
  boxShadow: '0 8px 24px rgba(0,0,0,0.1)', maxHeight: '220px', overflowY: 'auto',
};

export default function NpSenderSettings({ initialCityRef, initialCityName, initialWarehouseRef, initialWarehouseDesc, initialPhone }: Props) {
  const [cityQuery,    setCityQuery]    = useState(initialCityName);
  const [settlements,  setSettlements]  = useState<Settlement[]>([]);
  const [selectedCity, setSelectedCity] = useState<Settlement | null>(
    initialCityRef ? { Ref: initialCityRef, Present: initialCityName, MainDescription: initialCityName, Area: '', RegionsDescription: '' } : null
  );
  const [cityDropOpen, setCityDropOpen] = useState(false);
  const [cityLoading,  setCityLoading]  = useState(false);

  const [warehouses,   setWarehouses]   = useState<Warehouse[]>([]);
  const [whQuery,      setWhQuery]      = useState(initialWarehouseDesc);
  const [selectedWH,   setSelectedWH]   = useState<Warehouse | null>(
    initialWarehouseRef ? { Ref: initialWarehouseRef, Description: initialWarehouseDesc, Number: '', CityRef: initialCityRef } : null
  );
  const [whDropOpen,   setWhDropOpen]   = useState(false);
  const [whLoading,    setWhLoading]    = useState(false);

  const [phone,   setPhone]   = useState(initialPhone);
  const [saving,  setSaving]  = useState(false);
  const [saved,   setSaved]   = useState(false);
  const [error,   setError]   = useState('');

  const cityRef = useRef<HTMLDivElement>(null);
  const whRef   = useRef<HTMLDivElement>(null);
  const debRef  = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    function h(e: MouseEvent) {
      if (cityRef.current && !cityRef.current.contains(e.target as Node)) setCityDropOpen(false);
      if (whRef.current   && !whRef.current.contains(e.target as Node))   setWhDropOpen(false);
    }
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  // Load warehouses for initial city
  useEffect(() => {
    if (!initialCityRef) return;
    npRequest('Address', 'getWarehouses', { SettlementRef: initialCityRef, Limit: 200, Page: 1 })
      .then((data: Warehouse[]) => setWarehouses(data));
  // eslint-disable-next-line react-hooks/exhaustive-deps
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

  const filteredWH = warehouses.filter(w =>
    w.Description.toLowerCase().includes(whQuery.toLowerCase()) || w.Number.includes(whQuery)
  );

  async function handleSave() {
    if (!selectedCity)  { setError('Оберіть місто відправника'); return; }
    if (!selectedWH)    { setError('Оберіть відділення відправника'); return; }

    setSaving(true); setError('');
    const res = await fetch('/api/admin/settings', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        np_sender_city_ref:      selectedCity.Ref,
        np_sender_city_name:     selectedCity.Present,
        np_sender_warehouse_ref: selectedWH.Ref,
        np_sender_warehouse_desc: selectedWH.Description,
        np_sender_phone:         phone,
      }),
    });
    setSaving(false);
    if (!res.ok) { setError('Помилка збереження'); return; }
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  }

  return (
    <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: '14px', overflow: 'hidden' }}>
      <div style={{ padding: '16px 20px', background: '#F8FAFC', borderBottom: '1px solid #E2E8F0', display: 'flex', alignItems: 'center', gap: '10px' }}>
        <Truck size={16} color="#1E3A5F" />
        <div>
          <div style={{ fontSize: '14px', fontWeight: 700, color: '#0F172A' }}>Нова Пошта — відправник</div>
          <div style={{ fontSize: '12px', color: '#64748B' }}>Відділення, з якого відправляються замовлення</div>
        </div>
      </div>

      <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>

        {/* City */}
        <div ref={cityRef} style={{ position: 'relative' }}>
          <label style={lbl}>Місто відправника</label>
          <div style={{ position: 'relative' }}>
            <div style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: '#94A3B8', pointerEvents: 'none' }}>
              {cityLoading ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <Search size={14} />}
            </div>
            <input style={{ ...inp, paddingLeft: '32px' }} placeholder="Харків, Київ..."
              value={cityQuery} onChange={e => handleCityInput(e.target.value)}
              onFocus={() => settlements.length > 0 && setCityDropOpen(true)} />
          </div>
          {cityDropOpen && settlements.length > 0 && (
            <div style={drop}>
              {settlements.map(s => (
                <button key={s.Ref} onMouseDown={() => selectCity(s)} style={{ width: '100%', display: 'flex', alignItems: 'flex-start', gap: '8px', padding: '8px 12px', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left', borderBottom: '1px solid #F8FAFC' }}>
                  <MapPin size={13} color="#94A3B8" style={{ flexShrink: 0, marginTop: '2px' }} />
                  <div>
                    <div style={{ fontSize: '13px', fontWeight: 600, color: '#0F172A' }}>{s.MainDescription}</div>
                    <div style={{ fontSize: '11px', color: '#94A3B8' }}>{s.RegionsDescription ? `${s.RegionsDescription} р-н, ` : ''}{s.Area} обл.</div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Warehouse */}
        <div ref={whRef} style={{ position: 'relative' }}>
          <label style={lbl}>Відділення відправки</label>
          {whLoading ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', ...inp, paddingLeft: '12px', color: '#94A3B8' }}>
              <Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} /> Завантаження...
            </div>
          ) : (
            <div style={{ position: 'relative' }}>
              <div style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: '#94A3B8', pointerEvents: 'none' }}><Search size={14} /></div>
              <input style={{ ...inp, paddingLeft: '32px' }}
                placeholder={selectedCity ? 'Номер або адреса відділення' : 'Спочатку оберіть місто'}
                value={whQuery} disabled={!selectedCity}
                onChange={e => { setWhQuery(e.target.value); setWhDropOpen(true); setSelectedWH(null); }}
                onFocus={() => filteredWH.length > 0 && setWhDropOpen(true)} />
            </div>
          )}
          {whDropOpen && filteredWH.length > 0 && (
            <div style={drop}>
              {filteredWH.slice(0, 50).map(w => (
                <button key={w.Ref} onMouseDown={() => { setSelectedWH(w); setWhQuery(w.Description); setWhDropOpen(false); }} style={{ width: '100%', padding: '8px 12px', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left', borderBottom: '1px solid #F8FAFC', fontSize: '12px', color: '#374151' }}>
                  {w.Description}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Phone */}
        <div>
          <label style={lbl}>Телефон відправника</label>
          <input style={inp} value={phone} onChange={e => setPhone(e.target.value)} placeholder="380671234567" />
          <div style={{ fontSize: '11px', color: '#94A3B8', marginTop: '4px' }}>Формат: 380XXXXXXXXX (без + і пробілів)</div>
        </div>

        {error && <div style={{ padding: '10px 12px', background: '#FEF2F2', borderRadius: '8px', color: '#DC2626', fontSize: '13px' }}>{error}</div>}

        <button
          onClick={handleSave} disabled={saving}
          style={{ height: '40px', padding: '0 24px', borderRadius: '8px', border: 'none', background: saved ? '#16A34A' : '#1E3A5F', color: '#fff', fontSize: '13px', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', alignSelf: 'flex-start', opacity: saving ? 0.6 : 1 }}
        >
          {saving ? <><Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} />Збереження...</> : saved ? <><Check size={14} />Збережено</> : 'Зберегти'}
        </button>
      </div>
      <style>{`@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}
