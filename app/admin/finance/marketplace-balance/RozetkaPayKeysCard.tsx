'use client';

import { useState } from 'react';
import { Key, Eye, EyeOff, Trash2 } from 'lucide-react';

/**
 * Ключі RozetkaPay Reports API. Усі виплати площадок (Rozetka Pay, наложка через
 * Rozetka Доставка, Пром-оплата) приходять від «РОЗЕТКА ПЕЙ» одним переказом за
 * день; реєстр з API розкладає їх по замовленнях. Поки ключів немає — виплати
 * лежать на «RozetkaPay — отримано, не рознесено».
 */
export default function RozetkaPayKeysCard({ hasKeys: initialHasKeys, login: initialLogin }: { hasKeys: boolean; login: string | null }) {
  const [hasKeys, setHasKeys] = useState(initialHasKeys);
  const [maskedLogin, setMaskedLogin] = useState(initialLogin);
  const [login, setLogin] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function save() {
    if (!login.trim() || !password.trim()) return;
    setBusy(true); setMsg(null);
    try {
      const res = await fetch('/api/admin/rozetkapay/keys', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ login: login.trim(), password: password.trim() }),
      });
      const data = await res.json();
      if (!res.ok) { setMsg({ ok: false, text: data.error ?? 'Помилка' }); return; }
      setHasKeys(true); setMaskedLogin(data.login); setLogin(''); setPassword('');
      setMsg({ ok: true, text: 'Ключі перевірено запитом merchants/v1/me і збережено ✓' });
    } catch {
      setMsg({ ok: false, text: 'Помилка з’єднання' });
    } finally { setBusy(false); }
  }

  async function remove() {
    if (!confirm('Видалити ключі RozetkaPay?')) return;
    await fetch('/api/admin/rozetkapay/keys', { method: 'DELETE' });
    setHasKeys(false); setMaskedLogin(null); setMsg({ ok: true, text: 'Ключі видалено' });
  }

  const canSave = !!login.trim() && !!password.trim() && !busy;

  return (
    <div className="fin-card">
      <div className="fin-card-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <Key size={14} color={hasKeys ? '#15803D' : '#B45309'} />
        RozetkaPay · Reports API
        <span className="fin-card-sub">· {hasKeys ? `підключено (${maskedLogin})` : 'ключі не налаштовані'}</span>
      </div>
      <p style={{ fontSize: '12.5px', color: 'var(--text-muted)', margin: '0 0 12px', lineHeight: 1.5 }}>
        Виплати Rozetka Pay, наложки через Rozetka Доставка і Пром-оплати приходять від «РОЗЕТКА ПЕЙ» одним переказом за день.
        З виписки вони проводяться в банк одразу, а реєстр Reports API розкладає їх по замовленнях на Prom і Rozetka.
        Логін і пароль видає підтримка RozetkaPay (підходять і API_KEY / API_SECRET).
      </p>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: '8px', alignItems: 'center' }}>
        <input value={login} onChange={e => setLogin(e.target.value)} placeholder={hasKeys ? 'Новий логін для заміни…' : 'Логін (API_KEY)'}
          style={{ height: '36px', padding: '0 12px', border: '1.5px solid var(--border)', borderRadius: '8px', fontSize: '13px', background: 'var(--bg-soft)', color: 'var(--text-primary)', outline: 'none' }} />
        <div style={{ position: 'relative' }}>
          <input type={show ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)} onKeyDown={e => e.key === 'Enter' && canSave && save()}
            placeholder="Пароль (API_SECRET)"
            style={{ height: '36px', width: '100%', boxSizing: 'border-box', padding: '0 34px 0 12px', border: '1.5px solid var(--border)', borderRadius: '8px', fontSize: '13px', background: 'var(--bg-soft)', color: 'var(--text-primary)', outline: 'none' }} />
          <button type="button" onClick={() => setShow(v => !v)} style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 2 }}>
            {show ? <EyeOff size={14} /> : <Eye size={14} />}
          </button>
        </div>
        <div style={{ display: 'flex', gap: '6px' }}>
          <button onClick={save} disabled={!canSave}
            style={{ height: '36px', padding: '0 16px', border: 'none', borderRadius: '8px', fontSize: '13px', fontWeight: 600, cursor: canSave ? 'pointer' : 'not-allowed', background: canSave ? '#1D4ED8' : 'var(--bg-soft)', color: canSave ? '#fff' : 'var(--text-muted)' }}>
            {busy ? 'Перевіряємо…' : 'Зберегти'}
          </button>
          {hasKeys && (
            <button onClick={remove} title="Видалити ключі"
              style={{ height: '36px', padding: '0 10px', border: '1px solid #FECACA', borderRadius: '8px', background: '#FFF5F5', color: '#DC2626', cursor: 'pointer' }}>
              <Trash2 size={13} />
            </button>
          )}
        </div>
      </div>
      {msg && <div style={{ marginTop: '8px', fontSize: '12.5px', color: msg.ok ? '#15803D' : '#DC2626' }}>{msg.text}</div>}
    </div>
  );
}
