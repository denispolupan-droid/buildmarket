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
  onCityRefChange?: (ref: string) => void;
  onWarehouseRefChange?: (ref: string) => void;
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

export default function NovaPoshtaSelect({ mode, onCityChange, onWarehouseChange, onAddressChange, onCityRefChange, onWarehouseRefChange }: Props) {
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
    const sanitized = q.replace(/[^а-яіїєґёА-ЯІЇЄҐЁa-zA-Z\s\-''ʼ]/g, '').trim();
    if (sanitized.length < 2) { setSettlements([]); return; }
    setCityLoading(true);
    npRequest('Address', 'searchSettlements', { CityName: sanitized, Limit: 10, Page: 1 })
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
    onCityRefChange?.(s.Ref);

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
    onWarehouseRefChange?.(w.Ref);
  }

  const filteredWH = warehouses.filter(w =>
    w.Description.toLowerCase().includes(warehouseQuery.toLowerCase()) ||
    w.Number.includes(warehouseQuery)
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>

      {/* City search */}
      <div ref={cityRef} style={{ position: 'relative' }}>
        <label className="np-label">Місто / населений пункт</label>
        <div style={{ position: 'relative' }}>
          <div style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', color: 'var(--text-secondary)' }}>
            {cityLoading ? <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} /> : <Search size={16} />}
          </div>
          <input
            className="np-input"
            placeholder="Введіть назву міста..."
            value={cityQuery}
            onChange={e => handleCityInput(e.target.value)}
            onFocus={() => settlements.length > 0 && setCityDropOpen(true)}
          />
        </div>
        {cityDropOpen && settlements.length > 0 && (
          <div className="np-dropdown">
            {settlements.map(s => (
              <button key={s.Ref} onMouseDown={() => selectCity(s)} className="np-dropdown-item">
                <MapPin size={14} color="var(--text-secondary)" style={{ flexShrink: 0, marginTop: '2px' }} />
                <div>
                  <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)' }}>{s.MainDescription}</div>
                  <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>{s.RegionsDescription ? `${s.RegionsDescription} р-н, ` : ''}{s.Area} обл.</div>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Warehouse select */}
      {mode === 'warehouse' && selectedCity && (
        <div ref={whRef} style={{ position: 'relative' }}>
          <label className="np-label">Відділення Нової Пошти</label>
          {whLoading ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '12px 14px', border: '1px solid var(--border)', borderRadius: '10px', fontSize: '14px', color: 'var(--text-secondary)' }}>
              <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} />
              Завантаження відділень...
            </div>
          ) : (
            <div style={{ position: 'relative' }}>
              <div style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', color: 'var(--text-secondary)' }}>
                <Search size={16} />
              </div>
              <input
                className="np-input"
                placeholder="Пошук відділення або номер..."
                value={warehouseQuery}
                onChange={e => { setWarehouseQuery(e.target.value); setWhDropOpen(true); setSelectedWH(null); }}
                onFocus={() => setWhDropOpen(true)}
              />
            </div>
          )}
          {whDropOpen && filteredWH.length > 0 && (
            <div className="np-dropdown">
              {filteredWH.slice(0, 50).map(w => (
                <button key={w.Ref} onMouseDown={() => selectWarehouse(w)} className="np-dropdown-item">
                  <MapPin size={14} color="var(--text-secondary)" style={{ flexShrink: 0, marginTop: '2px' }} />
                  <div style={{ fontSize: '13px', color: 'var(--text-primary)', lineHeight: 1.4 }}>{w.Description}</div>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Courier address */}
      {mode === 'courier' && selectedCity && (
        <div>
          <label className="np-label">Адреса доставки</label>
          <input
            className="np-input"
            style={{ paddingLeft: '14px' }}
            placeholder="Вулиця, будинок, квартира"
            value={courierAddress}
            onChange={e => { setCourierAddress(e.target.value); onAddressChange?.(e.target.value); }}
          />
        </div>
      )}

      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        .np-label {
          display: block; font-size: 13px; font-weight: 600;
          color: var(--text-secondary); margin-bottom: 6px;
        }
        .np-input {
          width: 100%; height: 44px; padding: 0 14px 0 40px;
          border: 1px solid var(--border); border-radius: 10px;
          background: var(--bg-card); font-size: 14px; color: var(--text-primary);
          outline: none; box-sizing: border-box;
        }
        .np-input::placeholder { color: var(--text-secondary); }
        .np-input:focus { border-color: var(--accent, #4880B8); }
        .np-dropdown {
          position: absolute; top: calc(100% + 4px); left: 0; right: 0; z-index: 200;
          background: var(--bg-card); border: 1px solid var(--border); border-radius: 10px;
          box-shadow: 0 8px 24px rgba(0,0,0,0.15); max-height: 260px; overflow-y: auto;
        }
        .np-dropdown-item {
          width: 100%; display: flex; align-items: flex-start; gap: 8px;
          padding: 10px 14px; background: none; border: none;
          cursor: pointer; text-align: left;
          border-bottom: 1px solid var(--border-light);
        }
        .np-dropdown-item:hover { background: var(--bg-soft); }
        .np-dropdown-item:last-child { border-bottom: none; }
      `}</style>
    </div>
  );
}
