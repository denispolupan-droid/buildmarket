'use client';

import { useEffect, useRef, useState } from 'react';
import { Search, MapPin, Loader2 } from 'lucide-react';

// Кур'єрська доставка Meest у кошику (14.11.2026): місто (лише ті, куди Meest
// возить кур'єром), вулиця з довідника Meest (накладну виписуємо на її id),
// будинок і квартира. Стилі — ті самі класи, що й у RzDeliverySelect (rz-*).

type City = { id: string; name: string; region_name: string; district_name?: string | null };
type Street = { addressID: string; name: string };

export type MeestCourierValue = {
  cityId: string; cityName: string; streetId: string; streetName: string; building: string; flat: string;
};

const T = {
  uk: { city: 'Місто / населений пункт', cityPh: 'Введіть назву міста...', street: 'Вулиця', streetPh: 'Почніть вводити назву вулиці...', building: 'Будинок', flat: 'Квартира / офіс', noStreet: 'Вулицю не знайдено — перевірте назву', regionSuffix: 'обл.' },
  ru: { city: 'Город / населённый пункт', cityPh: 'Введите название города...', street: 'Улица', streetPh: 'Начните вводить название улицы...', building: 'Дом', flat: 'Квартира / офис', noStreet: 'Улица не найдена — проверьте название', regionSuffix: 'обл.' },
} as const;

export default function MeestCourierSelect({ lang = 'uk', initial, onChange }: {
  lang?: 'uk' | 'ru';
  initial?: Partial<MeestCourierValue>;
  onChange: (v: MeestCourierValue) => void;
}) {
  const tr = T[lang];
  const [v, setV] = useState<MeestCourierValue>({
    cityId: initial?.cityId ?? '', cityName: initial?.cityName ?? '', streetId: initial?.streetId ?? '',
    streetName: initial?.streetName ?? '', building: initial?.building ?? '', flat: initial?.flat ?? '',
  });
  const [cityQ, setCityQ] = useState(v.cityName);
  const [cities, setCities] = useState<City[]>([]);
  const [cityOpen, setCityOpen] = useState(false);
  const [cityLoading, setCityLoading] = useState(false);
  const [streetQ, setStreetQ] = useState(v.streetName);
  const [streets, setStreets] = useState<Street[]>([]);
  const [streetOpen, setStreetOpen] = useState(false);
  const [streetLoading, setStreetLoading] = useState(false);
  const [streetSearched, setStreetSearched] = useState(false);
  const cityBox = useRef<HTMLDivElement>(null);
  const streetBox = useRef<HTMLDivElement>(null);
  const deb = useRef<ReturnType<typeof setTimeout> | null>(null);

  const update = (patch: Partial<MeestCourierValue>) => setV(prev => { const next = { ...prev, ...patch }; onChange(next); return next; });

  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (cityBox.current && !cityBox.current.contains(e.target as Node)) setCityOpen(false);
      if (streetBox.current && !streetBox.current.contains(e.target as Node)) setStreetOpen(false);
    };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  function searchCity(val: string) {
    setCityQ(val);
    if (v.cityId) update({ cityId: '', cityName: '', streetId: '', streetName: '' });
    setStreetQ('');
    if (deb.current) clearTimeout(deb.current);
    deb.current = setTimeout(() => {
      const q = val.trim();
      if (q.length < 2) { setCities([]); return; }
      setCityLoading(true);
      fetch(`/api/meest/cities?courier=1&q=${encodeURIComponent(q)}`).then(r => r.json())
        .then((d: { cities?: City[] }) => { setCities(d.cities ?? []); setCityOpen(true); })
        .catch(() => setCities([])).finally(() => setCityLoading(false));
    }, 350);
  }

  function searchStreet(val: string) {
    setStreetQ(val);
    if (v.streetId) update({ streetId: '', streetName: '' });
    if (deb.current) clearTimeout(deb.current);
    deb.current = setTimeout(() => {
      const q = val.trim();
      if (q.length < 2 || !v.cityId) { setStreets([]); setStreetSearched(false); return; }
      setStreetLoading(true);
      fetch(`/api/meest/streets?city=${encodeURIComponent(v.cityId)}&q=${encodeURIComponent(q)}`).then(r => r.json())
        .then((d: { streets?: Street[] }) => { setStreets(d.streets ?? []); setStreetOpen(true); setStreetSearched(true); })
        .catch(() => setStreets([])).finally(() => setStreetLoading(false));
    }, 350);
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
      <div ref={cityBox} style={{ position: 'relative' }}>
        <label className="rz-label">{tr.city}</label>
        <div style={{ position: 'relative' }}>
          <div className="rz-icon">{cityLoading ? <Loader2 size={16} style={{ animation: 'rzspin 1s linear infinite' }} /> : <Search size={16} />}</div>
          <input className="rz-input" placeholder={tr.cityPh} value={cityQ} onChange={e => searchCity(e.target.value)} onFocus={() => cities.length > 0 && setCityOpen(true)} />
        </div>
        {cityOpen && cities.length > 0 && (
          <div className="rz-dropdown">
            {cities.map(c => (
              <button key={c.id} type="button" className="rz-dropdown-item"
                onMouseDown={() => { setCityQ(c.name); setCityOpen(false); setCities([]); update({ cityId: c.id, cityName: c.name, streetId: '', streetName: '' }); setStreetQ(''); }}>
                <MapPin size={14} color="var(--text-secondary)" style={{ flexShrink: 0, marginTop: '2px' }} />
                <div>
                  <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)' }}>{c.name}</div>
                  <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>{c.district_name ? `${c.district_name} р-н, ` : ''}{c.region_name} {tr.regionSuffix}</div>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {v.cityId && (
        <>
          <div ref={streetBox} style={{ position: 'relative' }}>
            <label className="rz-label">{tr.street}</label>
            <div style={{ position: 'relative' }}>
              <div className="rz-icon">{streetLoading ? <Loader2 size={16} style={{ animation: 'rzspin 1s linear infinite' }} /> : <Search size={16} />}</div>
              <input className="rz-input" placeholder={tr.streetPh} value={streetQ} onChange={e => searchStreet(e.target.value)} onFocus={() => streets.length > 0 && setStreetOpen(true)} />
            </div>
            {streetOpen && streets.length > 0 && (
              <div className="rz-dropdown">
                {streets.map(s => (
                  <button key={s.addressID} type="button" className="rz-dropdown-item"
                    onMouseDown={() => { setStreetQ(s.name); setStreetOpen(false); update({ streetId: s.addressID, streetName: s.name }); }}>
                    <MapPin size={14} color="var(--text-secondary)" style={{ flexShrink: 0, marginTop: '2px' }} />
                    <div style={{ fontSize: '13px', color: 'var(--text-primary)' }}>{s.name}</div>
                  </button>
                ))}
              </div>
            )}
            {streetSearched && !streetLoading && !streets.length && !v.streetId && streetQ.trim().length >= 2 && (
              <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '6px' }}>{tr.noStreet}</div>
            )}
          </div>
          <div style={{ display: 'flex', gap: '10px' }}>
            <div style={{ flex: 1 }}>
              <label className="rz-label">{tr.building}</label>
              <input className="rz-input" style={{ paddingLeft: '14px' }} value={v.building} maxLength={20} onChange={e => update({ building: e.target.value })} />
            </div>
            <div style={{ flex: 1 }}>
              <label className="rz-label">{tr.flat}</label>
              <input className="rz-input" style={{ paddingLeft: '14px' }} value={v.flat} maxLength={20} onChange={e => update({ flat: e.target.value })} />
            </div>
          </div>
        </>
      )}

      <style>{`
        @keyframes rzspin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        .rz-label { display: block; font-size: 13px; font-weight: 600; color: var(--text-secondary); margin-bottom: 6px; }
        .rz-icon { position: absolute; left: 12px; top: 50%; transform: translateY(-50%); pointer-events: none; color: var(--text-secondary); }
        .rz-input { width: 100%; height: 44px; padding: 0 14px 0 40px; border: 1px solid var(--border); border-radius: 10px; background: var(--bg-card); font-size: 14px; color: var(--text-primary); outline: none; box-sizing: border-box; }
        .rz-input::placeholder { color: var(--text-secondary); }
        .rz-input:focus { border-color: var(--accent, #4880B8); }
        .rz-dropdown { position: absolute; top: calc(100% + 4px); left: 0; right: 0; z-index: 200; background: var(--bg-card); border: 1px solid var(--border); border-radius: 10px; box-shadow: 0 8px 24px rgba(0,0,0,0.15); max-height: 260px; overflow-y: auto; }
        .rz-dropdown-item { width: 100%; display: flex; align-items: flex-start; gap: 8px; padding: 10px 14px; background: none; border: none; cursor: pointer; text-align: left; border-bottom: 1px solid var(--border-light); }
        .rz-dropdown-item:hover { background: var(--bg-soft); }
        .rz-dropdown-item:last-child { border-bottom: none; }
      `}</style>
    </div>
  );
}
