'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { Search, MapPin, Loader2 } from 'lucide-react';

type Settlement = {
  Ref: string;
  MainDescription: string;
  Area: string;
  RegionsDescription: string;
  Present: string;
};

type Warehouse = {
  Ref: string;
  Description: string;
  ShortAddress: string;
  Number: string;
};

type Props = {
  mode: 'warehouse' | 'courier';
  onCityChange?: (city: string) => void;
  onWarehouseChange?: (warehouse: string) => void;
  onAddressChange?: (address: string) => void;
};

async function npRequest(modelName: string, calledMethod: string, methodProperties: object) {
  const res = await fetch('/api/novaposhta', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ modelName, calledMethod, methodProperties }),
  });
  const data = await res.json();
  if (!data.success) {
    console.error('[NovaPoshta]', data.errors ?? data.error ?? data);
  }
  return data.success ? data.data : [];
}

const inputStyle: React.CSSProperties = {
  width: '100%', height: '44px', padding: '0 14px 0 40px',
  border: '1px solid #E2E8F0', borderRadius: '10px',
  background: '#fff', fontSize: '14px', color: '#0F172A',
  outline: 'none', boxSizing: 'border-box',
};

const labelStyle: React.CSSProperties = {
  display: 'block', fontSize: '13px', fontWeight: 600,
  color: '#374151', marginBottom: '6px',
};

export default function NovaPoshtaSelect({ mode, onCityChange, onWarehouseChange, onAddressChange }: Props) {
  const [cityQuery,      setCityQuery]      = useState('');
  const [settlements,    setSettlements]    = useState<Settlement[]>([]);
  const [selectedCity,   setSelectedCity]   = useState<Settlement | null>(null);
  const [cityDropOpen,   setCityDropOpen]   = useState(false);
  const [cityLoading,    setCityLoading]    = useState(false);

  const [warehouses,     setWarehouses]     = useState<Warehouse[]>([]);
  const [warehouseQuery, setWarehouseQuery] = useState('');
  const [selectedWH,     setSelectedWH]     = useState<Warehouse | null>(null);
  const [whDropOpen,     setWhDropOpen]     = useState(false);
  const [whLoading,      setWhLoading]      = useState(false);

  const [courierAddress, setCourierAddress] = useState('');

  const cityRef = useRef<HTMLDivElement>(null);
  const whRef   = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Close dropdowns on outside click
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (cityRef.current && !cityRef.current.contains(e.target as Node)) setCityDropOpen(false);
      if (whRef.current   && !whRef.current.contains(e.target as Node))   setWhDropOpen(false);
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const searchCities = useCallback((q: string) => {
    if (q.length < 2) { setSettlements([]); return; }
    setCityLoading(true);
    npRequest('Address', 'searchSettlements', { CityName: q, Limit: 10, Page: 1 })
      .then((data: { Addresses: Settlement[] }[]) => {
        setSettlements(data[0]?.Addresses ?? []);
        setCityDropOpen(true);
      })
      .finally(() => setCityLoading(false));
  }, []);

  function handleCityInput(val: string) {
    setCityQuery(val);
    setSelectedCity(null);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => searchCities(val), 350);
  }

  function selectCity(s: Settlement) {
    setSelectedCity(s);
    setCityQuery(s.Present);
    setCityDropOpen(false);
    setSettlements([]);
    setSelectedWH(null);
    setWarehouseQuery('');
    onCityChange?.(s.Present);

    if (mode === 'warehouse') {
      setWhLoading(true);
      npRequest('Address', 'getWarehouses', { SettlementRef: s.Ref, Limit: 200, Page: 1 })
        .then((data: Warehouse[]) => setWarehouses(data))
        .finally(() => setWhLoading(false));
    }
  }

  function selectWarehouse(w: Warehouse) {
    setSelectedWH(w);
    setWarehouseQuery(w.Description);
    setWhDropOpen(false);
    onWarehouseChange?.(w.Description);
  }

  const filteredWH = warehouses.filter(w =>
    w.Description.toLowerCase().includes(warehouseQuery.toLowerCase()) ||
    w.Number.includes(warehouseQuery)
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>

      {/* City search */}
      <div ref={cityRef} style={{ position: 'relative' }}>
        <label style={labelStyle}>Місто / населений пункт</label>
        <div style={{ position: 'relative' }}>
          <div style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', color: '#94A3B8' }}>
            {cityLoading ? <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} /> : <Search size={16} />}
          </div>
          <input
            style={inputStyle}
            placeholder="Введіть назву міста..."
            value={cityQuery}
            onChange={e => handleCityInput(e.target.value)}
            onFocus={() => settlements.length > 0 && setCityDropOpen(true)}
          />
        </div>
        {cityDropOpen && settlements.length > 0 && (
          <div style={{
            position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0, zIndex: 50,
            background: '#fff', border: '1px solid #E2E8F0', borderRadius: '10px',
            boxShadow: '0 8px 24px rgba(0,0,0,0.1)', maxHeight: '240px', overflowY: 'auto',
          }}>
            {settlements.map(s => (
              <button
                key={s.Ref}
                onMouseDown={() => selectCity(s)}
                style={{
                  width: '100%', display: 'flex', alignItems: 'flex-start', gap: '8px',
                  padding: '10px 14px', background: 'none', border: 'none',
                  cursor: 'pointer', textAlign: 'left',
                  borderBottom: '1px solid #F8FAFC',
                }}
              >
                <MapPin size={14} color="#94A3B8" style={{ flexShrink: 0, marginTop: '2px' }} />
                <div>
                  <div style={{ fontSize: '14px', fontWeight: 600, color: '#0F172A' }}>{s.MainDescription}</div>
                  <div style={{ fontSize: '12px', color: '#94A3B8' }}>{s.RegionsDescription ? `${s.RegionsDescription} р-н, ` : ''}{s.Area} обл.</div>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Warehouse select */}
      {mode === 'warehouse' && selectedCity && (
        <div ref={whRef} style={{ position: 'relative' }}>
          <label style={labelStyle}>Відділення Нової Пошти</label>
          {whLoading ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '12px 14px', border: '1px solid #E2E8F0', borderRadius: '10px', fontSize: '14px', color: '#94A3B8' }}>
              <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} />
              Завантаження відділень...
            </div>
          ) : (
            <div style={{ position: 'relative' }}>
              <div style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', color: '#94A3B8' }}>
                <Search size={16} />
              </div>
              <input
                style={inputStyle}
                placeholder="Пошук відділення або номер..."
                value={warehouseQuery}
                onChange={e => { setWarehouseQuery(e.target.value); setWhDropOpen(true); setSelectedWH(null); }}
                onFocus={() => setWhDropOpen(true)}
              />
            </div>
          )}
          {whDropOpen && filteredWH.length > 0 && (
            <div style={{
              position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0, zIndex: 50,
              background: '#fff', border: '1px solid #E2E8F0', borderRadius: '10px',
              boxShadow: '0 8px 24px rgba(0,0,0,0.1)', maxHeight: '260px', overflowY: 'auto',
            }}>
              {filteredWH.slice(0, 50).map(w => (
                <button
                  key={w.Ref}
                  onMouseDown={() => selectWarehouse(w)}
                  style={{
                    width: '100%', display: 'flex', alignItems: 'flex-start', gap: '8px',
                    padding: '10px 14px', background: 'none', border: 'none',
                    cursor: 'pointer', textAlign: 'left',
                    borderBottom: '1px solid #F8FAFC',
                  }}
                >
                  <MapPin size={14} color="#94A3B8" style={{ flexShrink: 0, marginTop: '2px' }} />
                  <div style={{ fontSize: '13px', color: '#0F172A', lineHeight: 1.4 }}>{w.Description}</div>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Courier address */}
      {mode === 'courier' && selectedCity && (
        <div>
          <label style={labelStyle}>Адреса доставки</label>
          <input
            style={{ ...inputStyle, paddingLeft: '14px' }}
            placeholder="Вулиця, будинок, квартира"
            value={courierAddress}
            onChange={e => { setCourierAddress(e.target.value); onAddressChange?.(e.target.value); }}
          />
        </div>
      )}

      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
