'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { Search, MapPin, Loader2, Clock } from 'lucide-react';

// Вибір точки видачі «ROZETKA Доставки» в чекауті.
//
// Відрізняється від NovaPoshtaSelect однією важливою деталлю: список точок
// залежить від ВАГИ замовлення. У кожної точки свій ліміт (по Харкову 30…500 кг),
// і показувати ту, яка посилку не прийме, не можна — відправлення зірветься вже
// після оплати. Тому вага йде в запит, а фільтрує сервер.

type City = { id: string; name: string; region_name: string; district_name?: string | null };
type Department = { id: string; label: string; schedule: string[]; limitKg: number | null };

type Props = {
  weightKg: number;
  lang?: 'uk' | 'ru';
  onCityChange?: (name: string) => void;
  onCityIdChange?: (id: string) => void;
  onDepartmentChange?: (label: string) => void;
  onDepartmentIdChange?: (id: string) => void;
};

const RZ_T = {
  uk: {
    cityLabel: 'Місто / населений пункт',
    cityPh: 'Введіть назву міста...',
    pointLabel: 'Точка видачі ROZETKA',
    pointPh: 'Пошук за адресою...',
    loading: 'Завантаження точок...',
    empty: 'У цьому місті немає точок, які приймуть посилку такої ваги',
    emptyCity: 'У цьому місті немає точок видачі',
    regionSuffix: 'обл.',
  },
  ru: {
    cityLabel: 'Город / населённый пункт',
    cityPh: 'Введите название города...',
    pointLabel: 'Точка выдачи ROZETKA',
    pointPh: 'Поиск по адресу...',
    loading: 'Загрузка точек...',
    empty: 'В этом городе нет точек, которые примут посылку такого веса',
    emptyCity: 'В этом городе нет точек выдачи',
    regionSuffix: 'обл.',
  },
} as const;

export default function RzDeliverySelect({
  weightKg, lang = 'uk',
  onCityChange, onCityIdChange, onDepartmentChange, onDepartmentIdChange,
}: Props) {
  const tr = RZ_T[lang];

  const [cityQuery,   setCityQuery]   = useState('');
  const [cities,      setCities]      = useState<City[]>([]);
  const [city,        setCity]        = useState<City | null>(null);
  const [cityOpen,    setCityOpen]    = useState(false);
  const [cityLoading, setCityLoading] = useState(false);

  const [departments, setDepartments] = useState<Department[]>([]);
  const [depQuery,    setDepQuery]    = useState('');
  const [depOpen,     setDepOpen]     = useState(false);
  const [depLoading,  setDepLoading]  = useState(false);
  const [depTotal,    setDepTotal]    = useState(0);
  const [selectedDep, setSelectedDep] = useState<Department | null>(null);

  const cityBoxRef = useRef<HTMLDivElement>(null);
  const depBoxRef  = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (cityBoxRef.current && !cityBoxRef.current.contains(e.target as Node)) setCityOpen(false);
      if (depBoxRef.current  && !depBoxRef.current.contains(e.target as Node))  setDepOpen(false);
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const loadDepartments = useCallback((cityId: string) => {
    setDepLoading(true);
    fetch(`/api/rz-delivery/departments?city=${encodeURIComponent(cityId)}&weight=${weightKg}`)
      .then(r => r.json())
      .then((d: { departments?: Department[]; total?: number }) => {
        setDepartments(d.departments ?? []);
        setDepTotal(d.total ?? 0);
      })
      .catch(() => { setDepartments([]); setDepTotal(0); })
      .finally(() => setDepLoading(false));
  }, [weightKg]);

  // Вага змінилась (покупець правив кошик у сусідній вкладці або міняв кількість) —
  // перезбираємо список і скидаємо вибір, якщо точка більше не підходить.
  useEffect(() => {
    if (city) loadDepartments(city.id);
  }, [city, loadDepartments]);

  useEffect(() => {
    if (selectedDep && departments.length && !departments.some(d => d.id === selectedDep.id)) {
      setSelectedDep(null);
      setDepQuery('');
      onDepartmentIdChange?.('');
      onDepartmentChange?.('');
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [departments]);

  function handleCityInput(val: string) {
    setCityQuery(val);
    setCity(null);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      const q = val.trim();
      if (q.length < 2) { setCities([]); return; }
      setCityLoading(true);
      fetch(`/api/rz-delivery/cities?q=${encodeURIComponent(q)}`)
        .then(r => r.json())
        .then((d: { cities?: City[] }) => { setCities(d.cities ?? []); setCityOpen(true); })
        .catch(() => setCities([]))
        .finally(() => setCityLoading(false));
    }, 350);
  }

  function selectCity(c: City) {
    setCity(c);
    setCityQuery(c.name);
    setCityOpen(false);
    setCities([]);
    setSelectedDep(null);
    setDepQuery('');
    onCityChange?.(c.name);
    onCityIdChange?.(c.id);
    onDepartmentChange?.('');
    onDepartmentIdChange?.('');
  }

  function selectDep(d: Department) {
    setSelectedDep(d);
    setDepQuery(d.label);
    setDepOpen(false);
    onDepartmentChange?.(d.label);
    onDepartmentIdChange?.(d.id);
  }

  const filteredDeps = departments.filter(d => d.label.toLowerCase().includes(depQuery.toLowerCase()));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>

      {/* Місто */}
      <div ref={cityBoxRef} style={{ position: 'relative' }}>
        <label className="rz-label">{tr.cityLabel}</label>
        <div style={{ position: 'relative' }}>
          <div className="rz-icon">
            {cityLoading ? <Loader2 size={16} style={{ animation: 'rzspin 1s linear infinite' }} /> : <Search size={16} />}
          </div>
          <input
            className="rz-input"
            placeholder={tr.cityPh}
            value={cityQuery}
            onChange={e => handleCityInput(e.target.value)}
            onFocus={() => cities.length > 0 && setCityOpen(true)}
          />
        </div>
        {cityOpen && cities.length > 0 && (
          <div className="rz-dropdown">
            {cities.map(c => (
              <button key={c.id} onMouseDown={() => selectCity(c)} className="rz-dropdown-item">
                <MapPin size={14} color="var(--text-secondary)" style={{ flexShrink: 0, marginTop: '2px' }} />
                <div>
                  <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)' }}>{c.name}</div>
                  <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                    {c.district_name ? `${c.district_name} р-н, ` : ''}{c.region_name} {tr.regionSuffix}
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Точка видачі */}
      {city && (
        <div ref={depBoxRef} style={{ position: 'relative' }}>
          <label className="rz-label">{tr.pointLabel}</label>
          {depLoading ? (
            <div className="rz-hint"><Loader2 size={16} style={{ animation: 'rzspin 1s linear infinite' }} />{tr.loading}</div>
          ) : departments.length === 0 ? (
            <div className="rz-hint">{depTotal > 0 ? tr.empty : tr.emptyCity}</div>
          ) : (
            <div style={{ position: 'relative' }}>
              <div className="rz-icon"><Search size={16} /></div>
              <input
                className="rz-input"
                placeholder={tr.pointPh}
                value={depQuery}
                onChange={e => { setDepQuery(e.target.value); setDepOpen(true); setSelectedDep(null); }}
                onFocus={() => setDepOpen(true)}
              />
            </div>
          )}
          {depOpen && filteredDeps.length > 0 && (
            <div className="rz-dropdown">
              {filteredDeps.slice(0, 50).map(d => (
                <button key={d.id} onMouseDown={() => selectDep(d)} className="rz-dropdown-item">
                  <MapPin size={14} color="var(--text-secondary)" style={{ flexShrink: 0, marginTop: '2px' }} />
                  <div>
                    <div style={{ fontSize: '13px', color: 'var(--text-primary)', lineHeight: 1.4 }}>{d.label}</div>
                    {d.schedule?.[0] && (
                      <div style={{ fontSize: '11px', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '4px', marginTop: '2px' }}>
                        <Clock size={11} />{d.schedule[0]}
                      </div>
                    )}
                  </div>
                </button>
              ))}
            </div>
          )}
          {selectedDep?.schedule?.length ? (
            <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '6px', lineHeight: 1.5 }}>
              {selectedDep.schedule.join(' · ')}
            </div>
          ) : null}
        </div>
      )}

      <style>{`
        @keyframes rzspin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        .rz-label { display: block; font-size: 13px; font-weight: 600; color: var(--text-secondary); margin-bottom: 6px; }
        .rz-icon { position: absolute; left: 12px; top: 50%; transform: translateY(-50%); pointer-events: none; color: var(--text-secondary); }
        .rz-input {
          width: 100%; height: 44px; padding: 0 14px 0 40px;
          border: 1px solid var(--border); border-radius: 10px;
          background: var(--bg-card); font-size: 14px; color: var(--text-primary);
          outline: none; box-sizing: border-box;
        }
        .rz-input::placeholder { color: var(--text-secondary); }
        .rz-input:focus { border-color: var(--accent, #4880B8); }
        .rz-hint {
          display: flex; align-items: center; gap: 8px; padding: 12px 14px;
          border: 1px solid var(--border); border-radius: 10px;
          font-size: 13px; color: var(--text-secondary); line-height: 1.4;
        }
        .rz-dropdown {
          position: absolute; top: calc(100% + 4px); left: 0; right: 0; z-index: 200;
          background: var(--bg-card); border: 1px solid var(--border); border-radius: 10px;
          box-shadow: 0 8px 24px rgba(0,0,0,0.15); max-height: 260px; overflow-y: auto;
        }
        .rz-dropdown-item {
          width: 100%; display: flex; align-items: flex-start; gap: 8px;
          padding: 10px 14px; background: none; border: none;
          cursor: pointer; text-align: left;
          border-bottom: 1px solid var(--border-light);
        }
        .rz-dropdown-item:hover { background: var(--bg-soft); }
        .rz-dropdown-item:last-child { border-bottom: none; }
      `}</style>
    </div>
  );
}
