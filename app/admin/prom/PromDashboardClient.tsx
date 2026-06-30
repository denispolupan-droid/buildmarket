'use client';

import { useState } from 'react';
import { RefreshCw, Copy, CheckCircle, Package, TableProperties, Key, Eye, EyeOff, Trash2 } from 'lucide-react';
import Link from 'next/link';

interface Props {
  hasToken:          boolean;
  maskedToken:       string | null;
  feedUrl:           string;
  totalOrders:       number;
  totalProducts:     number;
  enabledProducts:   number;
  catsWithCommission: number;
  totalCats:         number;
}

export default function PromDashboardClient({ hasToken: initialHasToken, maskedToken: initialMaskedToken, feedUrl, totalOrders, totalProducts, enabledProducts, catsWithCommission, totalCats }: Props) {
  const [syncing, setSyncing]         = useState(false);
  const [syncMsg, setSyncMsg]         = useState<string | null>(null);
  const [copied,  setCopied]          = useState(false);

  // Token management
  const [hasToken,     setHasToken]     = useState(initialHasToken);
  const [maskedToken,  setMaskedToken]  = useState(initialMaskedToken);
  const [tokenInput,   setTokenInput]   = useState('');
  const [showToken,    setShowToken]    = useState(false);
  const [savingToken,  setSavingToken]  = useState(false);
  const [tokenMsg,     setTokenMsg]     = useState<{ ok: boolean; text: string } | null>(null);

  async function saveToken() {
    if (!tokenInput.trim()) return;
    setSavingToken(true);
    setTokenMsg(null);
    try {
      const res  = await fetch('/api/admin/prom/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: tokenInput.trim() }),
      });
      const data = await res.json();
      if (!res.ok) { setTokenMsg({ ok: false, text: data.error ?? 'Помилка' }); return; }
      setHasToken(true);
      setMaskedToken(data.maskedToken);
      setTokenInput('');
      setTokenMsg({ ok: true, text: 'Токен збережено і перевірено ✓' });
    } catch {
      setTokenMsg({ ok: false, text: 'Помилка з\'єднання' });
    } finally {
      setSavingToken(false);
    }
  }

  async function deleteToken() {
    if (!confirm('Видалити токен Prom?')) return;
    await fetch('/api/admin/prom/token', { method: 'DELETE' });
    setHasToken(false);
    setMaskedToken(null);
    setTokenMsg({ ok: true, text: 'Токен видалено' });
  }

  async function doSync() {
    setSyncing(true);
    setSyncMsg(null);
    try {
      const res  = await fetch('/api/admin/prom/sync', { method: 'POST' });
      const data = await res.json();
      if (data.error) setSyncMsg(`Помилка: ${data.error}`);
      else setSyncMsg(`Готово: +${data.created} нових, пропущено ${data.skipped}`);
    } catch {
      setSyncMsg('Помилка запиту');
    } finally {
      setSyncing(false);
    }
  }

  function copyFeed() {
    navigator.clipboard.writeText(feedUrl).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <div style={{ padding: '28px 32px 64px', maxWidth: 1100 }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: '#111' }}>Prom.ua</h1>
          <p style={{ margin: '4px 0 0', color: '#6B7280', fontSize: 14 }}>
            Синхронізація товарів та замовлень
          </p>
        </div>
        <button
          onClick={doSync}
          disabled={syncing || !hasToken}
          style={{
            display: 'flex', alignItems: 'center', gap: 8,
            padding: '10px 20px', borderRadius: 10,
            background: syncing || !hasToken ? '#E5E7EB' : '#1D4ED8',
            color: syncing || !hasToken ? '#9CA3AF' : '#fff',
            border: 'none', cursor: syncing || !hasToken ? 'not-allowed' : 'pointer',
            fontWeight: 600, fontSize: 14,
          }}
        >
          <RefreshCw size={16} style={syncing ? { animation: 'spin 1s linear infinite' } : {}} />
          {syncing ? 'Синхронізую…' : 'Синхронізувати зараз'}
        </button>
      </div>

      {/* Nav cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 24 }}>
        {[
          { href: '/admin/prom/products', label: 'Товари', desc: `${enabledProducts} / ${totalProducts} увімкнено`, color: '#0EA5E9' },
          { href: '/admin/prom/commissions', label: 'Комісії', desc: `${catsWithCommission} / ${totalCats} категорій`, color: '#F59E0B' },
          { href: '/admin/prom/orders', label: 'Замовлення', desc: `${totalOrders} всього`, color: '#10B981', disabled: false },
        ].map(({ href, label, desc, color }) => (
          <Link key={label} href={href} style={{ textDecoration: 'none', display: 'block', height: '100%' }}>
            <div style={{ background: '#fff', borderRadius: 10, padding: '14px 18px', border: '1px solid #E5E7EB', cursor: 'pointer', height: '100%', boxSizing: 'border-box' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                <div style={{ width: 6, height: 6, borderRadius: '50%', background: color }} />
                <span style={{ fontWeight: 600, fontSize: 14, color: '#1E293B' }}>{label}</span>
              </div>
              <div style={{ fontSize: 12, color: '#6B7280' }}>{desc}</div>
            </div>
          </Link>
        ))}
      </div>

      {/* Token settings */}
      <div style={{ background: '#fff', border: '1px solid #E5E7EB', borderRadius: 12, padding: '18px 20px', marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
          <Key size={15} color="#6B7280" />
          <span style={{ fontSize: 14, fontWeight: 600, color: '#111' }}>API токен Prom.ua</span>
          {hasToken
            ? <span style={{ marginLeft: 'auto', fontSize: 12, padding: '2px 8px', borderRadius: 20, background: '#D1FAE5', color: '#065F46', fontWeight: 600 }}>Активний</span>
            : <span style={{ marginLeft: 'auto', fontSize: 12, padding: '2px 8px', borderRadius: 20, background: '#FEE2E2', color: '#991B1B', fontWeight: 600 }}>Не встановлено</span>
          }
        </div>

        {hasToken && maskedToken && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
            <span style={{ fontSize: 13, color: '#6B7280' }}>Поточний:</span>
            <code style={{ fontSize: 13, background: '#F3F4F6', padding: '3px 10px', borderRadius: 6, letterSpacing: 2 }}>{maskedToken}</code>
            <button onClick={deleteToken} style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 4, padding: '4px 10px', border: '1px solid #FECACA', borderRadius: 6, background: '#FFF5F5', color: '#DC2626', fontSize: 12, cursor: 'pointer' }}>
              <Trash2 size={12} /> Видалити
            </button>
          </div>
        )}

        <div style={{ display: 'flex', gap: 8 }}>
          <div style={{ position: 'relative', flex: 1 }}>
            <input
              type={showToken ? 'text' : 'password'}
              value={tokenInput}
              onChange={e => setTokenInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && saveToken()}
              placeholder={hasToken ? 'Новий токен (залиште порожнім щоб не змінювати)' : 'Вставте токен з кабінету Prom.ua'}
              style={{ width: '100%', boxSizing: 'border-box', padding: '8px 36px 8px 12px', border: '1px solid #E5E7EB', borderRadius: 8, fontSize: 13, fontFamily: tokenInput ? 'monospace' : 'inherit', outline: 'none' }}
            />
            <button onClick={() => setShowToken(v => !v)} style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: '#9CA3AF', padding: 2 }}>
              {showToken ? <EyeOff size={14} /> : <Eye size={14} />}
            </button>
          </div>
          <button
            onClick={saveToken}
            disabled={savingToken || !tokenInput.trim()}
            style={{ padding: '8px 18px', background: tokenInput.trim() ? '#1D4ED8' : '#E5E7EB', color: tokenInput.trim() ? '#fff' : '#9CA3AF', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: tokenInput.trim() ? 'pointer' : 'not-allowed' }}
          >
            {savingToken ? 'Перевіряємо…' : 'Зберегти'}
          </button>
        </div>

        {tokenMsg && (
          <div style={{ marginTop: 8, fontSize: 13, color: tokenMsg.ok ? '#065F46' : '#DC2626' }}>
            {tokenMsg.text}
          </div>
        )}
      </div>

      {/* Sync result */}
      {syncMsg && (
        <div style={{
          marginBottom: 20, padding: '12px 16px', borderRadius: 10,
          background: syncMsg.startsWith('Помилка') ? '#FEF2F2' : '#F0FDF4',
          border: `1px solid ${syncMsg.startsWith('Помилка') ? '#FCA5A5' : '#BBF7D0'}`,
          color: syncMsg.startsWith('Помилка') ? '#991B1B' : '#15803D',
          fontSize: 14, fontWeight: 600,
        }}>
          {syncMsg}
        </div>
      )}

      {/* Product Feed URL */}
      <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #E5E7EB', padding: 20, marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Package size={18} color="#6B7280" />
            <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>YML-фід товарів</h2>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <Link href="/admin/prom/prices" style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              padding: '6px 12px', borderRadius: 8, textDecoration: 'none',
              background: '#F0FDF4', border: '1px solid #BBF7D0',
              color: '#16A34A', fontSize: 13, fontWeight: 600,
            }}>
              Ціни Prom
            </Link>
            <Link href="/admin/prom/commissions" style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              padding: '6px 12px', borderRadius: 8, textDecoration: 'none',
              background: '#F5F3FF', border: '1px solid #DDD6FE',
              color: '#6D28D9', fontSize: 13, fontWeight: 600,
            }}>
              <TableProperties size={13} /> Таблиця комісій
            </Link>
          </div>
        </div>
        <p style={{ margin: '0 0 12px', fontSize: 13, color: '#6B7280' }}>
          Додайте цей URL у кабінеті Prom.ua → «Товари» → «Імпорт» → «Завантажити за посиланням».
          Prom буде автоматично оновлювати ціни та залишки.
        </p>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <code style={{
            flex: 1, padding: '8px 12px', borderRadius: 8,
            background: '#F8FAFC', border: '1px solid #E5E7EB',
            fontSize: 12, color: '#374151', wordBreak: 'break-all',
          }}>
            {feedUrl}
          </code>
          <button
            onClick={copyFeed}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '8px 14px', borderRadius: 8,
              background: copied ? '#F0FDF4' : '#F8FAFC',
              border: `1px solid ${copied ? '#BBF7D0' : '#E5E7EB'}`,
              color: copied ? '#15803D' : '#374151',
              cursor: 'pointer', fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap',
            }}
          >
            {copied ? <CheckCircle size={14} /> : <Copy size={14} />}
            {copied ? 'Скопійовано' : 'Копіювати'}
          </button>
        </div>
      </div>

      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
