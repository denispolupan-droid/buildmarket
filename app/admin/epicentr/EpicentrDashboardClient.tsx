'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Copy, ExternalLink, CheckCircle, RefreshCw, Package, ShoppingBag, Percent, Key, Eye, EyeOff, Trash2, Upload } from 'lucide-react';

interface Props {
  hasToken:           boolean;
  maskedToken:        string | null;
  feedUrl:            string;
  totalOrders:        number;
  totalProducts:      number;
  enabledProducts:    number;
  catsWithCommission: number;
  catsWithCode:       number;
  totalCats:          number;
  fallbackPct:        number;
}

const btn = (disabled: boolean): React.CSSProperties => ({
  display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px', background: '#F1F5F9',
  border: '1px solid #E2E8F0', borderRadius: 7, fontSize: 12, color: disabled ? '#CBD5E1' : '#475569',
  cursor: disabled ? 'not-allowed' : 'pointer', textDecoration: 'none',
});

export default function EpicentrDashboardClient({
  hasToken: initialHasToken, maskedToken: initialMaskedToken, feedUrl,
  totalOrders, totalProducts, enabledProducts, catsWithCommission, catsWithCode, totalCats, fallbackPct: initialFallback,
}: Props) {
  const [copied,      setCopied]      = useState(false);
  const [checking,    setChecking]    = useState(false);
  const [feedOk,      setFeedOk]      = useState<boolean | null>(null);
  const [busy,        setBusy]        = useState<'sync' | 'push' | null>(null);
  const [msg,         setMsg]         = useState<{ ok: boolean; text: string } | null>(null);

  const [hasToken,    setHasToken]    = useState(initialHasToken);
  const [maskedToken, setMaskedToken] = useState(initialMaskedToken);
  const [tokenOpen,   setTokenOpen]   = useState(!initialHasToken);
  const [tokenInput,  setTokenInput]  = useState('');
  const [showToken,   setShowToken]   = useState(false);
  const [savingToken, setSavingToken] = useState(false);
  const [tokenMsg,    setTokenMsg]    = useState<{ ok: boolean; text: string } | null>(null);

  const [fallbackPct, setFallbackPct] = useState(String(initialFallback));
  const [savingPct,   setSavingPct]   = useState(false);

  function copyFeed() {
    navigator.clipboard.writeText(feedUrl).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); });
  }

  async function checkFeed() {
    setChecking(true); setFeedOk(null);
    try {
      const res = await fetch(feedUrl);
      setFeedOk(res.ok && (res.headers.get('content-type')?.includes('xml') ?? false));
    } catch { setFeedOk(false); } finally { setChecking(false); }
  }

  async function doSync() {
    setBusy('sync'); setMsg(null);
    try {
      const res  = await fetch('/api/admin/epicentr/sync', { method: 'POST' });
      const data = await res.json();
      if (data.error) setMsg({ ok: false, text: data.error });
      else setMsg({ ok: true, text: `Замовлення: +${data.created} нових, пропущено ${data.skipped}, допушено статусів ${data.repushed}, ТТН ${data.ttnRepushed}, скасовано ${data.cancelled} (усього в вікні ${data.total})` });
    } catch { setMsg({ ok: false, text: 'Помилка запиту' }); } finally { setBusy(null); }
  }

  async function doPush() {
    setBusy('push'); setMsg(null);
    try {
      const res  = await fetch('/api/admin/epicentr/push-offers', { method: 'POST' });
      const data = await res.json();
      if (data.error) setMsg({ ok: false, text: data.error });
      else if (data.skipped) setMsg({ ok: false, text: `Пуш пропущено: ${data.skipped}` });
      else setMsg({ ok: data.errors === 0, text: `Офери: надіслано ${data.total}, прийнято ${data.enqueued}, без змін ${data.noop}, невідомих кабінету ${data.unknown}, помилок ${data.errors}${data.error_sample ? ` (${data.error_sample})` : ''}` });
    } catch { setMsg({ ok: false, text: 'Помилка запиту' }); } finally { setBusy(null); }
  }

  async function saveToken() {
    if (!tokenInput.trim()) return;
    setSavingToken(true); setTokenMsg(null);
    try {
      const res  = await fetch('/api/admin/epicentr/token', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: tokenInput.trim() }),
      });
      const data = await res.json();
      if (!res.ok) { setTokenMsg({ ok: false, text: data.error ?? 'Помилка' }); return; }
      setHasToken(true); setMaskedToken(data.maskedToken); setTokenInput('');
      setTokenMsg({ ok: true, text: 'Ключ збережено і перевірено ✓' });
    } catch { setTokenMsg({ ok: false, text: 'Помилка з\'єднання' }); } finally { setSavingToken(false); }
  }

  async function deleteToken() {
    if (!confirm('Видалити ключ API Епіцентру?')) return;
    await fetch('/api/admin/epicentr/token', { method: 'DELETE' });
    setHasToken(false); setMaskedToken(null);
    setTokenMsg({ ok: true, text: 'Ключ видалено' });
  }

  async function saveFallbackPct() {
    setSavingPct(true);
    try {
      const res = await fetch('/api/admin/settings', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ epicentr_commission_pct: fallbackPct }),
      });
      setMsg(res.ok ? { ok: true, text: 'Базову комісію збережено' } : { ok: false, text: 'Не вдалося зберегти комісію' });
    } finally { setSavingPct(false); }
  }

  const statCards = [
    { label: 'Ключ API',        value: hasToken ? 'Налаштовано' : 'Не встановлено', ok: hasToken,             icon: Key, clickable: true },
    { label: 'Товарів у фіді',  value: `${enabledProducts} / ${totalProducts}`,       ok: enabledProducts > 0,  icon: Package },
    { label: 'Замовлень',       value: String(totalOrders),                          ok: totalOrders > 0,      icon: ShoppingBag },
    { label: 'Категорій з кодом / комісією', value: `${catsWithCode} / ${catsWithCommission} з ${totalCats}`, ok: catsWithCommission > 0, icon: Percent },
  ];

  return (
    <div style={{ padding: '28px 32px', maxWidth: 960, margin: '0 auto' }}>
      <h1 style={{ fontSize: 22, fontWeight: 700, color: '#1E293B', margin: '0 0 24px' }}>Епіцентр Маркетплейс</h1>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, marginBottom: tokenOpen ? 0 : 24 }}>
        {statCards.map(({ label, value, ok, icon: Icon, clickable }) => (
          <div key={label} onClick={clickable ? () => setTokenOpen(v => !v) : undefined}
            style={{
              background: '#fff', borderRadius: 10, padding: '14px 16px', border: `1.5px solid ${ok ? '#D1FAE5' : '#FEE2E2'}`,
              cursor: clickable ? 'pointer' : 'default',
              ...(clickable && tokenOpen ? { borderBottomLeftRadius: 0, borderBottomRightRadius: 0, borderBottom: '1.5px solid transparent' } : {}),
            }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
              <Icon size={13} color={ok ? '#059669' : '#DC2626'} />
              <span style={{ fontSize: 11, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '.04em' }}>{label}</span>
              {clickable && <span style={{ marginLeft: 'auto', fontSize: 10, color: '#94A3B8' }}>{tokenOpen ? '▲' : '▼'}</span>}
            </div>
            <div style={{ fontSize: 18, fontWeight: 700, color: ok ? '#059669' : '#DC2626' }}>{value}</div>
          </div>
        ))}
      </div>

      {tokenOpen && (
        <div style={{ background: '#fff', border: '1.5px solid #D1FAE5', borderTop: 'none', borderRadius: '0 10px 10px 10px', padding: '16px 18px', marginBottom: 24 }}>
          {hasToken && maskedToken && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
              <span style={{ fontSize: 13, color: '#6B7280' }}>Поточний:</span>
              <code style={{ fontSize: 13, background: '#F3F4F6', padding: '3px 10px', borderRadius: 6, letterSpacing: 2 }}>{maskedToken}</code>
              <button onClick={deleteToken}
                style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 4, padding: '4px 10px', border: '1px solid #FECACA', borderRadius: 6, background: '#FFF5F5', color: '#DC2626', fontSize: 12, cursor: 'pointer' }}>
                <Trash2 size={12} /> Видалити
              </button>
            </div>
          )}
          <div style={{ display: 'flex', gap: 8 }}>
            <div style={{ position: 'relative', flex: 1 }}>
              <input type={showToken ? 'text' : 'password'} value={tokenInput} onChange={e => setTokenInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && saveToken()}
                placeholder={hasToken ? 'Новий ключ для заміни…' : 'Вставте ключ mp_… з кабінету (Налаштування компанії → API)'}
                style={{ width: '100%', boxSizing: 'border-box', padding: '8px 36px 8px 12px', border: '1px solid #E5E7EB', borderRadius: 8, fontSize: 13, fontFamily: tokenInput ? 'monospace' : 'inherit', outline: 'none' }} />
              <button onClick={() => setShowToken(v => !v)}
                style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: '#9CA3AF', padding: 2 }}>
                {showToken ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
            </div>
            <button onClick={saveToken} disabled={savingToken || !tokenInput.trim()}
              style={{ padding: '8px 18px', background: tokenInput.trim() ? '#1D4ED8' : '#E5E7EB', color: tokenInput.trim() ? '#fff' : '#9CA3AF', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: tokenInput.trim() ? 'pointer' : 'not-allowed' }}>
              {savingToken ? 'Перевіряємо…' : 'Зберегти'}
            </button>
          </div>
          {tokenMsg && <div style={{ marginTop: 8, fontSize: 13, color: tokenMsg.ok ? '#065F46' : '#DC2626' }}>{tokenMsg.text}</div>}
          <div style={{ marginTop: 10, fontSize: 12, color: '#64748B', lineHeight: 1.6 }}>
            Ключ генерує лише адміністратор компанії в кабінеті продавця: <b>Налаштування → Налаштування компанії → вкладка API → Згенерувати</b>.
            Термін дії необмежений. Документація: <a href="https://supportm.epicentrk.ua/robotazapi" target="_blank" rel="noreferrer">робота з API</a>,{' '}
            <a href="https://merchant-api.epicentrm.com.ua/swagger/" target="_blank" rel="noreferrer">Swagger</a>.
          </div>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12, marginBottom: 24 }}>
        <Link href="/admin/epicentr/products" style={{ textDecoration: 'none' }}>
          <div style={{ background: '#fff', borderRadius: 10, padding: '16px 18px', border: '1px solid #E2E8F0', cursor: 'pointer' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
              <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#F97316' }} />
              <span style={{ fontWeight: 600, fontSize: 14, color: '#1E293B' }}>Товари та категорії</span>
              <ExternalLink size={11} color="#CBD5E1" style={{ marginLeft: 'auto' }} />
            </div>
            <div style={{ fontSize: 12, color: '#64748B' }}>Увімкнути товари, націнки, комісії й коди категорій Епіцентру</div>
          </div>
        </Link>
        <div style={{ background: '#fff', borderRadius: 10, padding: '16px 18px', border: '1px solid #E2E8F0' }}>
          <div style={{ fontWeight: 600, fontSize: 14, color: '#1E293B', marginBottom: 6 }}>Базова комісія, %</div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <input value={fallbackPct} onChange={e => setFallbackPct(e.target.value)} inputMode="decimal"
              style={{ width: 80, padding: '6px 10px', border: '1px solid #E5E7EB', borderRadius: 7, fontSize: 13 }} />
            <button onClick={saveFallbackPct} disabled={savingPct} style={btn(savingPct)}>Зберегти</button>
            <span style={{ fontSize: 11.5, color: '#64748B' }}>для категорій без своєї ставки</span>
          </div>
        </div>
      </div>

      <div style={{ background: '#fff', borderRadius: 12, padding: 20, border: '1px solid #E2E8F0' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
          <h2 style={{ fontSize: 14, fontWeight: 700, color: '#1E293B', margin: 0 }}>XML-фід товарів</h2>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={doSync} disabled={busy !== null || !hasToken} style={btn(busy !== null || !hasToken)}>
              <RefreshCw size={12} style={busy === 'sync' ? { animation: 'spin 1s linear infinite' } : {}} />
              {busy === 'sync' ? 'Синхронізую…' : 'Синхронізувати замовлення'}
            </button>
            <button onClick={doPush} disabled={busy !== null || !hasToken} style={btn(busy !== null || !hasToken)}
              title="Проштовхнути ціни й наявність у кабінет через API (не чекаючи добового перечитування фіда)">
              <Upload size={12} style={busy === 'push' ? { animation: 'spin 1s linear infinite' } : {}} />
              {busy === 'push' ? 'Пуш…' : 'Пуш цін і наявності'}
            </button>
            <button onClick={checkFeed} disabled={checking} style={btn(checking)}>
              <RefreshCw size={12} style={checking ? { animation: 'spin 1s linear infinite' } : {}} /> Перевірити
            </button>
            <a href={feedUrl} target="_blank" rel="noreferrer" style={btn(false)}><ExternalLink size={12} /> Відкрити</a>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <div style={{ flex: 1, fontFamily: 'monospace', fontSize: 13, padding: '10px 14px', background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 8, color: '#334155', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {feedUrl}
          </div>
          <button onClick={copyFeed}
            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '10px 16px', background: copied ? '#ECFDF5' : '#F97316', color: copied ? '#059669' : '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>
            {copied ? <CheckCircle size={14} /> : <Copy size={14} />}
            {copied ? 'Скопійовано' : 'Копіювати'}
          </button>
        </div>

        {msg && (
          <div style={{ marginTop: 10, padding: '8px 12px', borderRadius: 7, fontSize: 12, background: msg.ok ? '#ECFDF5' : '#FEF2F2', color: msg.ok ? '#059669' : '#DC2626' }}>
            {msg.ok ? '✓ ' : '✗ '}{msg.text}
          </div>
        )}
        {feedOk !== null && (
          <div style={{ marginTop: 10, padding: '8px 12px', borderRadius: 7, fontSize: 12, background: feedOk ? '#ECFDF5' : '#FEF2F2', color: feedOk ? '#059669' : '#DC2626' }}>
            {feedOk ? '✓ Фід доступний і повертає валідний XML' : '✗ Фід недоступний або повертає помилку'}
          </div>
        )}

        <div style={{ marginTop: 12, padding: '10px 14px', background: '#FFF7ED', borderRadius: 8, border: '1px solid #FED7AA', fontSize: 12, color: '#92400E', lineHeight: 1.6 }}>
          Кабінет продавця: <b>Товари → Імпорт товарів → за посиланням</b> (перший імпорт карток — вони проходять модерацію),
          далі те саме посилання в <b>Автооновлення цін і наявності</b> (перечитується раз на добу).
          <code>offer id</code> = наш артикул = поле «Артикул» картки — за ним працює і автооновлення, і пуш через API.
          Каталог через API Епіцентр не приймає; API — лише замовлення та ціни/наявність.
        </div>
      </div>

      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
