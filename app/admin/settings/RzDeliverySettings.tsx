'use client';

import { useState, useEffect, useRef } from 'react';
import { Search, MapPin, Loader2, Check, AlertCircle, Eye, EyeOff } from 'lucide-react';
import { rzPhone } from '../../../lib/rz-delivery';

/**
 * Налаштування «ROZETKA Доставки» (rz-delivery.rozetka.ua) — перевізника сайту.
 *
 * Ключове рішення екрана: точка ЗДАЧІ вибирається тут, і разом з нею
 * зберігається її ліміт ваги. Саме цей ліміт вирішує, чи покажеться доставка в
 * чекауті: у Rozetka обмеження є в обох кінців, і найслабше з них — наш склад
 * (Б.Хмельницького приймає до 30 кг, Аерокосмічний 167 — до 150). Тримати цю
 * цифру в коді не можна: змінили точку — стеля має поїхати за нею сама.
 */
type City  = { id: string; name: string; region_name: string };
type Point = { id: string; label: string; limitKg: number | null; selfService: boolean };

type Props = {
  initialToken: string;
  initialSender: string;   // JSON app_settings.rz_delivery_sender
  initialBox: string;      // JSON app_settings.rz_delivery_box
  initialEnabled: boolean;
};

type Sender = {
  city: string; city_name?: string;
  department: string; department_label?: string; weight_limit_kg?: number | null;
  first_name: string; last_name: string; middle_name?: string; phone: string;
};

const inp: React.CSSProperties = {
  height: '42px', padding: '0 12px', border: '1.5px solid var(--border)', borderRadius: '10px',
  fontSize: '14px', outline: 'none', boxSizing: 'border-box', width: '100%',
  color: 'var(--text-primary)', background: 'var(--bg-card)',
};
const lbl: React.CSSProperties = {
  fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '6px', display: 'block',
};
const drop: React.CSSProperties = {
  position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0, zIndex: 50,
  background: 'var(--bg-card)', border: '1.5px solid var(--border)', borderRadius: '10px',
  boxShadow: '0 8px 24px rgba(0,0,0,0.12)', maxHeight: '240px', overflowY: 'auto',
};
const card: React.CSSProperties = {
  border: '1px solid var(--border)', borderRadius: '14px', padding: '18px',
  background: 'var(--bg-card)', display: 'flex', flexDirection: 'column', gap: '14px',
};

function parseJson<T>(raw: string, fallback: T): T {
  try { return raw ? JSON.parse(raw) as T : fallback; } catch { return fallback; }
}

export default function RzDeliverySettings({ initialToken, initialSender, initialBox, initialEnabled }: Props) {
  const saved = parseJson<Partial<Sender>>(initialSender, {});
  const box0  = parseJson<{ length?: number; width?: number; height?: number }>(initialBox, {});

  const [enabled,  setEnabled]  = useState(initialEnabled);
  const [token,    setToken]    = useState(initialToken);
  const [showKey,  setShowKey]  = useState(false);
  const [check,    setCheck]    = useState<{ state: 'idle' | 'busy' | 'ok' | 'error'; text: string }>({ state: 'idle', text: '' });

  const [cityQuery, setCityQuery] = useState(saved.city_name ?? '');
  const [cities,    setCities]    = useState<City[]>([]);
  const [cityOpen,  setCityOpen]  = useState(false);
  const [cityId,    setCityId]    = useState(saved.city ?? '');
  const [cityName,  setCityName]  = useState(saved.city_name ?? '');

  const [points,   setPoints]   = useState<Point[]>([]);
  const [pointsBusy, setPointsBusy] = useState(false);
  const [pointId,  setPointId]  = useState(saved.department ?? '');

  const [lastName,   setLastName]   = useState(saved.last_name ?? '');
  const [firstName,  setFirstName]  = useState(saved.first_name ?? '');
  const [middleName, setMiddleName] = useState(saved.middle_name ?? '');
  const [phone,      setPhone]      = useState(saved.phone ?? '');

  const [length, setLength] = useState(String(box0.length ?? 40));
  const [width,  setWidth]  = useState(String(box0.width  ?? 30));
  const [height, setHeight] = useState(String(box0.height ?? 30));

  const [saving, setSaving] = useState(false);
  const [saved_, setSaved]  = useState(false);
  const [error,  setError]  = useState('');

  const cityBoxRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (cityBoxRef.current && !cityBoxRef.current.contains(e.target as Node)) setCityOpen(false);
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // Точки здачі підвантажуємо і при першому відкритті (щоб показати вже збережену
  // з її лімітом), і після зміни міста.
  useEffect(() => {
    if (!cityId) { setPoints([]); return; }
    setPointsBusy(true);
    fetch(`/api/admin/rz-delivery?action=points&city=${encodeURIComponent(cityId)}`)
      .then(r => r.json())
      .then((d: { points?: Point[] }) => setPoints(d.points ?? []))
      .catch(() => setPoints([]))
      .finally(() => setPointsBusy(false));
  }, [cityId]);

  function searchCity(val: string) {
    setCityQuery(val);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      if (val.trim().length < 2) { setCities([]); return; }
      fetch(`/api/rz-delivery/cities?q=${encodeURIComponent(val.trim())}`)
        .then(r => r.json())
        .then((d: { cities?: City[] }) => { setCities(d.cities ?? []); setCityOpen(true); })
        .catch(() => setCities([]));
    }, 350);
  }

  async function verify() {
    setCheck({ state: 'busy', text: '' });
    try {
      const res = await fetch('/api/admin/rz-delivery?action=verify');
      const d = await res.json();
      if (!d.ok) { setCheck({ state: 'error', text: d.error ?? 'Токен не працює' }); return; }
      const bal = d.balance == null ? '—' : `${d.balance} грн`;
      setCheck({ state: 'ok', text: `${d.partner.name} · статус ${d.partner.status} · логістичний баланс ${bal}` });
    } catch (err) {
      setCheck({ state: 'error', text: err instanceof Error ? err.message : 'Збій мережі' });
    }
  }

  const point = points.find(p => p.id === pointId) ?? null;

  async function save() {
    setError(''); setSaved(false);
    if (!cityId || !pointId) { setError('Оберіть місто і точку здачі'); return; }
    if (!lastName.trim() || !firstName.trim()) { setError('Вкажіть прізвище та ім\'я відправника'); return; }
    // Rozetka приймає рівно «380XXXXXXXXX» рядком — нормалізуємо тут, щоб у
    // налаштуваннях лежав уже готовий до відправки формат
    const phone380 = rzPhone(phone);
    if (!phone380) { setError('Невірний телефон відправника'); return; }
    const dims = [length, width, height].map(v => parseFloat(v));
    if (!dims.every(n => Number.isFinite(n) && n > 0)) { setError('Габарити коробки мають бути додатними'); return; }

    const sender: Sender = {
      city: cityId, city_name: cityName,
      department: pointId,
      department_label: point?.label ?? '',
      // Ліміт зберігаємо разом із точкою: чекаут питає стелю у налаштувань, а не
      // лізе щоразу в довідник Rozetka заради одного числа.
      weight_limit_kg: point?.limitKg ?? null,
      last_name: lastName.trim(), first_name: firstName.trim(),
      ...(middleName.trim() ? { middle_name: middleName.trim() } : {}),
      phone: phone380,
    };

    setSaving(true);
    try {
      const res = await fetch('/api/admin/settings', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rz_delivery_enabled: enabled ? 'true' : 'false',
          rz_delivery_token:  token.trim(),
          rz_delivery_sender: JSON.stringify(sender),
          rz_delivery_box:    JSON.stringify({ length: dims[0], width: dims[1], height: dims[2] }),
        }),
      });
      const d = await res.json();
      if (!res.ok || d.error) { setError(d.error ?? 'Не вдалось зберегти'); return; }
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Збій мережі');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>

      <div style={{ ...card, gap: '10px' }}>
        <label style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', cursor: 'pointer' }}>
          <input type="checkbox" checked={enabled} onChange={e => setEnabled(e.target.checked)}
            style={{ width: '18px', height: '18px', marginTop: '1px', flexShrink: 0, accentColor: '#15803D', cursor: 'pointer' }} />
          <span>
            <span style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)' }}>
              Показувати покупцям у кошику
            </span>
            <span style={{ display: 'block', fontSize: '12px', color: 'var(--text-secondary)', lineHeight: 1.5, marginTop: '3px' }}>
              Знята галочка ховає спосіб доставки на сайті. Створення накладних в адмінці
              працює в будь-якому разі — вже оформлені замовлення не зависнуть.
            </span>
          </span>
        </label>
        {!enabled && (
          <div style={{ fontSize: '12.5px', color: '#B45309', background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: '9px', padding: '9px 11px', lineHeight: 1.5 }}>
            Зараз доставка прихована — покупці бачать лише Нову Пошту.
          </div>
        )}
      </div>

      <div style={card}>
        <div>
          <label style={lbl}>Токен API</label>
          <div style={{ display: 'flex', gap: '8px' }}>
            <div style={{ position: 'relative', flex: 1 }}>
              <input
                type={showKey ? 'text' : 'password'}
                value={token}
                onChange={e => { setToken(e.target.value); setCheck({ state: 'idle', text: '' }); }}
                placeholder="Кабінет → Налаштування → Ідентифікатори API"
                style={{ ...inp, paddingRight: '38px' }}
              />
              <button type="button" onClick={() => setShowKey(v => !v)}
                style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'inline-flex' }}>
                {showKey ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
            <button type="button" onClick={verify} disabled={check.state === 'busy'}
              style={{ height: '42px', padding: '0 16px', borderRadius: '10px', border: '1.5px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text-secondary)', fontSize: '13px', fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' }}>
              {check.state === 'busy' ? <Loader2 size={15} style={{ animation: 'spin 1s linear infinite' }} /> : 'Перевірити'}
            </button>
          </div>
          {check.state === 'ok' && (
            <div style={{ marginTop: '8px', fontSize: '12.5px', color: '#15803D', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Check size={14} />{check.text}
            </div>
          )}
          {check.state === 'error' && (
            <div style={{ marginTop: '8px', fontSize: '12.5px', color: '#DC2626', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <AlertCircle size={14} />{check.text}
            </div>
          )}
          <p style={{ margin: '8px 0 0', fontSize: '12px', color: 'var(--text-muted)', lineHeight: 1.5 }}>
            Перевірка зчитує збережений токен — щоб побачити щойно вставлений, спершу збережіть.
          </p>
        </div>
      </div>

      <div style={card}>
        <div ref={cityBoxRef} style={{ position: 'relative' }}>
          <label style={lbl}>Місто складу здачі</label>
          <div style={{ position: 'relative' }}>
            <Search size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
            <input value={cityQuery} onChange={e => searchCity(e.target.value)}
              onFocus={() => cities.length > 0 && setCityOpen(true)}
              placeholder="Харків" style={{ ...inp, paddingLeft: '38px' }} />
          </div>
          {cityOpen && cities.length > 0 && (
            <div style={drop}>
              {cities.map(c => (
                <button key={c.id} type="button"
                  onMouseDown={() => {
                    setCityId(c.id); setCityName(c.name); setCityQuery(c.name);
                    setCityOpen(false); setPointId('');
                  }}
                  style={{ width: '100%', display: 'flex', gap: '8px', padding: '10px 12px', background: 'none', border: 'none', borderBottom: '1px solid var(--border-light)', cursor: 'pointer', textAlign: 'left' }}>
                  <MapPin size={14} color="var(--text-muted)" style={{ marginTop: '2px', flexShrink: 0 }} />
                  <div>
                    <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)' }}>{c.name}</div>
                    <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>{c.region_name} обл.</div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        <div>
          <label style={lbl}>Точка здачі відправлень</label>
          {pointsBusy ? (
            <div style={{ ...inp, display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-secondary)' }}>
              <Loader2 size={15} style={{ animation: 'spin 1s linear infinite' }} /> Завантаження…
            </div>
          ) : (
            <select value={pointId} onChange={e => setPointId(e.target.value)} style={inp}>
              <option value="">— оберіть точку —</option>
              {points.map(p => (
                <option key={p.id} value={p.id}>
                  {p.label}{p.limitKg != null ? ` · до ${p.limitKg} кг` : ''}{p.selfService ? ' · самообслуговування' : ''}
                </option>
              ))}
            </select>
          )}
          {point && (
            <p style={{ margin: '8px 0 0', fontSize: '12px', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
              {point.limitKg != null
                ? <>Стеля відправлення — <strong>{point.limitKg} кг</strong>. Замовлення важче за це в чекауті цю доставку не побачать.</>
                : <>Ліміт ваги для точки не вказано — обмеження ставитиме лише точка отримувача.</>}
            </p>
          )}
        </div>

        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
          <div style={{ flex: '1 1 140px' }}>
            <label style={lbl}>Прізвище</label>
            <input value={lastName} onChange={e => setLastName(e.target.value)} style={inp} />
          </div>
          <div style={{ flex: '1 1 140px' }}>
            <label style={lbl}>Ім&apos;я</label>
            <input value={firstName} onChange={e => setFirstName(e.target.value)} style={inp} />
          </div>
          <div style={{ flex: '1 1 140px' }}>
            <label style={lbl}>По батькові</label>
            <input value={middleName} onChange={e => setMiddleName(e.target.value)} style={inp} />
          </div>
          <div style={{ flex: '1 1 160px' }}>
            <label style={lbl}>Телефон</label>
            <input value={phone} onChange={e => setPhone(e.target.value)} placeholder="380991997788" style={inp} />
          </div>
        </div>
      </div>

      <div style={card}>
        <div>
          <label style={lbl}>Коробка за замовчуванням</label>
          <p style={{ margin: '0 0 10px', fontSize: '12px', color: 'var(--text-muted)', lineHeight: 1.5 }}>
            Габарити обов&apos;язкові для накладної, а в каталозі їх немає — ці значення підставляються
            у вікно створення ЕН, менеджер править під конкретну посилку.
          </p>
          <div style={{ display: 'flex', gap: '10px' }}>
            {([['Довжина', length, setLength], ['Ширина', width, setWidth], ['Висота', height, setHeight]] as const).map(([label, val, set]) => (
              <div key={label} style={{ flex: 1 }}>
                <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '4px' }}>{label}, см</div>
                <input value={val} onChange={e => set(e.target.value)} inputMode="decimal" style={inp} />
              </div>
            ))}
          </div>
        </div>
      </div>

      {error && (
        <div style={{ fontSize: '13px', color: '#DC2626', background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: '10px', padding: '10px 12px' }}>
          {error}
        </div>
      )}
      {saved_ && (
        <div style={{ fontSize: '13px', color: '#15803D', background: '#F0FDF4', border: '1px solid #BBF7D0', borderRadius: '10px', padding: '10px 12px' }}>
          Збережено
        </div>
      )}

      <button onClick={save} disabled={saving}
        style={{ height: '46px', borderRadius: '12px', border: 'none', background: saving ? '#94A3B8' : '#1E3A5F', color: '#fff', fontSize: '14px', fontWeight: 700, cursor: saving ? 'default' : 'pointer' }}>
        {saving ? 'Зберігаємо…' : 'Зберегти'}
      </button>

      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
