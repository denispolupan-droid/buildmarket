'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { Search, MapPin, Loader2, Check, AlertCircle, Eye, EyeOff } from 'lucide-react';

type Settlement = { Ref: string; Present: string; MainDescription: string; Area: string; RegionsDescription: string };
type Warehouse  = { Ref: string; Description: string; Number: string; CityRef: string };
type NpAddress  = { Ref: string; Description: string };

async function npRequest(modelName: string, calledMethod: string, methodProperties: object, apiKey: string) {
  const res = await fetch('/api/novaposhta', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ modelName, calledMethod, methodProperties, _apiKeyOverride: apiKey }),
  });
  const data = await res.json();
  return data.success ? data.data : [];
}

type Props = {
  initialApiKey:       string;
  initialCityRef:      string;
  initialCityName:     string;
  initialSenderType:   'warehouse' | 'address';
  initialWarehouseRef: string;
  initialWarehouseDesc: string;
  initialAddressRef:   string;
  initialAddressDesc:  string;
};

const inp: React.CSSProperties = {
  height: '42px', padding: '0 12px', border: '1.5px solid var(--border)', borderRadius: '10px',
  fontSize: '14px', outline: 'none', boxSizing: 'border-box', width: '100%', color: 'var(--text-primary)',
  background: 'var(--bg-card)',
};
const lbl: React.CSSProperties = {
  fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '6px', display: 'block',
};
const drop: React.CSSProperties = {
  position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0, zIndex: 50,
  background: 'var(--bg-card)', border: '1.5px solid var(--border)', borderRadius: '10px',
  boxShadow: '0 8px 24px rgba(0,0,0,0.12)', maxHeight: '240px', overflowY: 'auto',
};

export default function NpSenderSettings({
  initialApiKey, initialCityRef, initialCityName,
  initialSenderType, initialWarehouseRef, initialWarehouseDesc,
  initialAddressRef, initialAddressDesc,
}: Props) {

  // Step 1: API Key
  const [apiKey,      setApiKey]      = useState(initialApiKey);
  const [showKey,     setShowKey]     = useState(false);
  const [keyStatus,   setKeyStatus]   = useState<'idle' | 'checking' | 'ok' | 'error'>(initialApiKey ? 'ok' : 'idle');
  const [senderName,  setSenderName]  = useState('');

  // Step 2: City
  const [cityQuery,    setCityQuery]    = useState(initialCityName);
  const [settlements,  setSettlements]  = useState<Settlement[]>([]);
  const [selectedCity, setSelectedCity] = useState<Settlement | null>(
    initialCityRef ? { Ref: initialCityRef, Present: initialCityName, MainDescription: initialCityName, Area: '', RegionsDescription: '' } : null
  );
  const [cityDropOpen, setCityDropOpen] = useState(false);
  const [cityLoading,  setCityLoading]  = useState(false);

  // Step 3a: Warehouse
  const [senderType,   setSenderType]   = useState<'warehouse' | 'address'>(initialSenderType);
  const [warehouses,   setWarehouses]   = useState<Warehouse[]>([]);
  const [whQuery,      setWhQuery]      = useState(initialWarehouseDesc);
  const [selectedWH,   setSelectedWH]   = useState<Warehouse | null>(
    initialWarehouseRef ? { Ref: initialWarehouseRef, Description: initialWarehouseDesc, Number: '', CityRef: initialCityRef } : null
  );
  const [whDropOpen,   setWhDropOpen]   = useState(false);
  const [whLoading,    setWhLoading]    = useState(false);

  // Step 3b: Pickup address
  const [npAddresses,  setNpAddresses]  = useState<NpAddress[]>([]);
  const [addrLoading,  setAddrLoading]  = useState(false);
  const [selectedAddr, setSelectedAddr] = useState<NpAddress | null>(
    initialAddressRef ? { Ref: initialAddressRef, Description: initialAddressDesc } : null
  );

  const [saving, setSaving] = useState(false);
  const [saved,  setSaved]  = useState(false);
  const [error,  setError]  = useState('');

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

  // Load warehouses if city already selected
  useEffect(() => {
    if (!initialCityRef || !initialApiKey) return;
    npRequest('Address', 'getWarehouses', { SettlementRef: initialCityRef, Limit: 200, Page: 1 }, initialApiKey)
      .then((data: Warehouse[]) => setWarehouses(data));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Load pickup addresses if address mode
  useEffect(() => {
    if (senderType !== 'address' || !apiKey) return;
    setAddrLoading(true);
    fetch('/api/admin/np-addresses')
      .then(r => r.json())
      .then(d => setNpAddresses(d.addresses ?? []))
      .finally(() => setAddrLoading(false));
  }, [senderType, apiKey]);

  async function checkApiKey(key: string) {
    if (!key.trim()) return;
    setKeyStatus('checking'); setSenderName('');
    const data = await npRequest('Counterparty', 'getCounterparties', { CounterpartyProperty: 'Sender', Page: '1' }, key.trim());
    if (data?.[0]?.Description) {
      setKeyStatus('ok');
      setSenderName(data[0].Description);
    } else {
      setKeyStatus('error');
    }
  }

  const searchCities = useCallback((q: string) => {
    if (q.length < 2 || !apiKey) { setSettlements([]); return; }
    setCityLoading(true);
    npRequest('Address', 'searchSettlements', { CityName: q, Limit: 10, Page: 1 }, apiKey)
      .then((data: { Addresses: Settlement[] }[]) => { setSettlements(data[0]?.Addresses ?? []); setCityDropOpen(true); })
      .finally(() => setCityLoading(false));
  }, [apiKey]);

  function handleCityInput(val: string) {
    setCityQuery(val); setSelectedCity(null);
    if (debRef.current) clearTimeout(debRef.current);
    debRef.current = setTimeout(() => searchCities(val), 350);
  }

  function selectCity(s: Settlement) {
    setSelectedCity(s); setCityQuery(s.Present); setCityDropOpen(false); setSettlements([]);
    setSelectedWH(null); setWhQuery(''); setWhLoading(true);
    npRequest('Address', 'getWarehouses', { SettlementRef: s.Ref, Limit: 200, Page: 1 }, apiKey)
      .then((data: Warehouse[]) => setWarehouses(data)).finally(() => setWhLoading(false));
  }

  const filteredWH = warehouses.filter(w =>
    w.Description.toLowerCase().includes(whQuery.toLowerCase()) || w.Number.includes(whQuery)
  );

  async function handleSave() {
    if (!apiKey.trim())  { setError('Введіть API ключ Нової Пошти'); return; }
    if (!selectedCity)   { setError('Оберіть місто відправлення'); return; }
    if (senderType === 'warehouse' && !selectedWH)   { setError('Оберіть відділення'); return; }
    if (senderType === 'address'   && !selectedAddr) { setError('Оберіть адресу забору'); return; }

    setSaving(true); setError('');
    const res = await fetch('/api/admin/settings', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        np_api_key:               apiKey.trim(),
        np_sender_city_ref:       selectedCity.Ref,
        np_sender_city_name:      selectedCity.Present,
        np_sender_type:           senderType,
        np_sender_warehouse_ref:  selectedWH?.Ref ?? '',
        np_sender_warehouse_desc: selectedWH?.Description ?? '',
        np_sender_address_ref:    selectedAddr?.Ref ?? '',
        np_sender_address_desc:   selectedAddr?.Description ?? '',
        // Clear manual overrides — let NP API resolve automatically
        np_sender_ref:         '',
        np_sender_contact_ref: '',
        np_sender_phone:       '',
      }),
    });
    setSaving(false);
    if (!res.ok) { const d = await res.json(); setError(d.error ?? 'Помилка збереження'); return; }
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  }

  const step2Active = keyStatus === 'ok' || !!initialApiKey;
  const step3Active = step2Active && !!selectedCity;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>

      {/* ── Крок 1: API ключ ──────────────────────────────────────────── */}
      <div style={{ background: 'var(--bg-card)', border: '1.5px solid var(--border)', borderRadius: '14px', overflow: 'hidden' }}>
        <div style={{ padding: '14px 20px', background: 'var(--bg-soft)', borderBottom: '1px solid var(--border)', fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)' }}>
          1. API ключ Нової Пошти
        </div>
        <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <label style={lbl}>Ключ доступу до НП API</label>
          <div style={{ display: 'flex', gap: '8px' }}>
            <div style={{ flex: 1, position: 'relative' }}>
              <input
                style={{ ...inp, paddingRight: '40px', fontFamily: showKey ? 'inherit' : 'monospace', letterSpacing: showKey ? 'normal' : '2px' }}
                type={showKey ? 'text' : 'password'}
                value={apiKey}
                onChange={e => { setApiKey(e.target.value); setKeyStatus('idle'); setSenderName(''); }}
                placeholder="Вставте API ключ з кабінету НП"
              />
              <button onClick={() => setShowKey(v => !v)} style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 0, display: 'flex' }}>
                {showKey ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
            <button
              onClick={() => checkApiKey(apiKey)}
              disabled={!apiKey.trim() || keyStatus === 'checking'}
              style={{ height: '42px', padding: '0 16px', borderRadius: '10px', border: '1.5px solid var(--border)', background: 'var(--bg-card)', fontSize: '13px', fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap', color: 'var(--text-primary)', opacity: !apiKey.trim() ? 0.5 : 1 }}
            >
              {keyStatus === 'checking' ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> : 'Перевірити'}
            </button>
          </div>
          {keyStatus === 'ok' && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '7px', fontSize: '13px', color: '#15803D' }}>
              <Check size={15} /> Підключено{senderName ? `: ${senderName}` : ''}
            </div>
          )}
          {keyStatus === 'error' && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '7px', fontSize: '13px', color: '#DC2626' }}>
              <AlertCircle size={15} /> Невірний ключ або немає відправника в кабінеті НП
            </div>
          )}
          <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
            Знайти в: my.novaposhta.ua → Особистий кабінет → Налаштування → API
          </div>
        </div>
      </div>

      {/* ── Крок 2: Місто ─────────────────────────────────────────────── */}
      <div style={{ background: 'var(--bg-card)', border: `1.5px solid ${step2Active ? 'var(--border)' : 'var(--border-light)'}`, borderRadius: '14px', overflow: 'hidden', opacity: step2Active ? 1 : 0.5 }}>
        <div style={{ padding: '14px 20px', background: 'var(--bg-soft)', borderBottom: '1px solid var(--border)', fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)' }}>
          2. Місто відправлення
        </div>
        <div style={{ padding: '20px' }}>
          <div ref={cityRef} style={{ position: 'relative' }}>
            <div style={{ position: 'relative' }}>
              <div style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', pointerEvents: 'none' }}>
                {cityLoading ? <Loader2 size={15} style={{ animation: 'spin 1s linear infinite' }} /> : <Search size={15} />}
              </div>
              <input
                style={{ ...inp, paddingLeft: '38px', border: selectedCity ? '1.5px solid #86EFAC' : '1.5px solid var(--border)', background: selectedCity ? 'rgba(134,239,172,0.08)' : 'var(--bg-soft)' }}
                placeholder="Введіть назву міста..."
                value={cityQuery}
                disabled={!step2Active}
                onChange={e => handleCityInput(e.target.value)}
                onFocus={() => settlements.length > 0 && setCityDropOpen(true)}
              />
              {selectedCity && <div style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)' }}><Check size={15} color="#15803D" /></div>}
            </div>
            {cityDropOpen && settlements.length > 0 && (
              <div style={drop}>
                {settlements.map(s => (
                  <button key={s.Ref} onMouseDown={() => selectCity(s)} style={{ width: '100%', display: 'flex', gap: '8px', padding: '10px 14px', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left', borderBottom: '1px solid var(--border-light)', alignItems: 'flex-start' }}>
                    <MapPin size={14} color="#94A3B8" style={{ flexShrink: 0, marginTop: '2px' }} />
                    <div>
                      <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)' }}>{s.MainDescription}</div>
                      <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{s.RegionsDescription ? `${s.RegionsDescription} р-н, ` : ''}{s.Area} обл.</div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Крок 3: Звідки відправляємо ───────────────────────────────── */}
      <div style={{ background: 'var(--bg-card)', border: `1.5px solid ${step3Active ? 'var(--border)' : 'var(--border-light)'}`, borderRadius: '14px', overflow: 'hidden', opacity: step3Active ? 1 : 0.5 }}>
        <div style={{ padding: '14px 20px', background: 'var(--bg-soft)', borderBottom: '1px solid var(--border)', fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)' }}>
          3. Звідки відправляємо
        </div>
        <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '14px' }}>

          {/* Type toggle */}
          <div style={{ display: 'flex', gap: '8px' }}>
            {(['warehouse', 'address'] as const).map(t => (
              <button
                key={t}
                disabled={!step3Active}
                onClick={() => { setSenderType(t); setSelectedWH(null); setWhQuery(''); setSelectedAddr(null); }}
                style={{
                  flex: 1, height: '40px', borderRadius: '10px', fontSize: '13px', fontWeight: 600, cursor: step3Active ? 'pointer' : 'not-allowed',
                  border: `1.5px solid ${senderType === t ? '#1E3A5F' : 'var(--border)'}`,
                  background: senderType === t ? '#1E3A5F' : 'var(--bg-soft)',
                  color: senderType === t ? '#fff' : 'var(--text-secondary)',
                }}
              >
                {t === 'warehouse' ? '📦 Відділення НП' : '🏭 Адресний забір'}
              </button>
            ))}
          </div>

          {/* Warehouse */}
          {senderType === 'warehouse' && (
            <div ref={whRef} style={{ position: 'relative' }}>
              {whLoading ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', ...inp, paddingLeft: '12px', color: 'var(--text-muted)' }}>
                  <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> Завантаження відділень...
                </div>
              ) : (
                <div style={{ position: 'relative' }}>
                  <div style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', pointerEvents: 'none' }}><Search size={15} /></div>
                  <input
                    style={{ ...inp, paddingLeft: '38px', paddingRight: '36px', border: selectedWH ? '1.5px solid #86EFAC' : '1.5px solid var(--border)', background: selectedWH ? 'rgba(134,239,172,0.08)' : 'var(--bg-soft)' }}
                    placeholder={selectedCity ? 'Номер або адреса відділення...' : 'Спочатку оберіть місто'}
                    value={whQuery}
                    disabled={!selectedCity}
                    onChange={e => { setWhQuery(e.target.value); setWhDropOpen(true); setSelectedWH(null); }}
                    onFocus={() => filteredWH.length > 0 && setWhDropOpen(true)}
                  />
                  {selectedWH && <div style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)' }}><Check size={15} color="#15803D" /></div>}
                </div>
              )}
              {whDropOpen && filteredWH.length > 0 && (
                <div style={drop}>
                  {filteredWH.slice(0, 50).map(w => (
                    <button key={w.Ref} onMouseDown={() => { setSelectedWH(w); setWhQuery(w.Description); setWhDropOpen(false); }}
                      style={{ width: '100%', padding: '9px 14px', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left', borderBottom: '1px solid var(--border-light)', fontSize: '13px', color: 'var(--text-primary)' }}>
                      {w.Description}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Address pickup */}
          {senderType === 'address' && (
            addrLoading ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-muted)', fontSize: '13px' }}>
                <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> Завантаження адрес з НП...
              </div>
            ) : npAddresses.length === 0 ? (
              <div style={{ padding: '12px 14px', background: '#FEF3C7', borderRadius: '10px', fontSize: '13px', color: '#92400E', border: '1px solid #FCD34D' }}>
                ⚠ Адрес забору не знайдено. Зареєструйте адресу в кабінеті НП: my.novaposhta.ua → Адреси відправника.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {npAddresses.map(addr => (
                  <label key={addr.Ref} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '12px 14px', border: `1.5px solid ${selectedAddr?.Ref === addr.Ref ? '#1E3A5F' : 'var(--border)'}`, borderRadius: '10px', cursor: 'pointer', background: selectedAddr?.Ref === addr.Ref ? 'var(--brand-blue-light)' : 'var(--bg-soft)' }}>
                    <input type="radio" name="np_address" checked={selectedAddr?.Ref === addr.Ref} onChange={() => setSelectedAddr(addr)} style={{ accentColor: '#1E3A5F', width: '16px', height: '16px' }} />
                    <span style={{ fontSize: '13px', color: 'var(--text-primary)', fontWeight: selectedAddr?.Ref === addr.Ref ? 600 : 400 }}>{addr.Description}</span>
                  </label>
                ))}
              </div>
            )
          )}
        </div>
      </div>

      {/* Error */}
      {error && (
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', padding: '10px 14px', background: '#FEF2F2', border: '1px solid #FCA5A5', borderRadius: '10px', fontSize: '13px', color: '#DC2626' }}>
          <AlertCircle size={15} /> {error}
        </div>
      )}

      {/* Save */}
      <button
        onClick={handleSave} disabled={saving}
        style={{ height: '44px', padding: '0 28px', borderRadius: '10px', border: 'none', background: saved ? '#16A34A' : '#1E3A5F', color: '#fff', fontSize: '14px', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', alignSelf: 'flex-start', opacity: saving ? 0.6 : 1 }}
      >
        {saving ? <><Loader2 size={15} style={{ animation: 'spin 1s linear infinite' }} />Збереження...</>
               : saved ? <><Check size={15} />Збережено</>
               : 'Зберегти налаштування'}
      </button>

      <style>{`@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}
