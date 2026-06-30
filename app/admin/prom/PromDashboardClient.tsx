'use client';

import { useState } from 'react';
import { Copy, ExternalLink, CheckCircle, RefreshCw, Tag, Package, ShoppingBag, Percent, Key, Eye, EyeOff, Trash2 } from 'lucide-react';
import Link from 'next/link';

interface Props {
  hasToken:           boolean;
  maskedToken:        string | null;
  feedUrl:            string;
  totalOrders:        number;
  totalProducts:      number;
  enabledProducts:    number;
  catsWithCommission: number;
  totalCats:          number;
}

export default function PromDashboardClient({
  hasToken: initialHasToken,
  maskedToken: initialMaskedToken,
  feedUrl,
  totalOrders,
  totalProducts,
  enabledProducts,
  catsWithCommission,
  totalCats,
}: Props) {
  const [copied,      setCopied]      = useState(false);
  const [checking,    setChecking]    = useState(false);
  const [feedOk,      setFeedOk]      = useState<boolean | null>(null);
  const [syncing,     setSyncing]     = useState(false);
  const [syncMsg,     setSyncMsg]     = useState<string | null>(null);

  const [hasToken,    setHasToken]    = useState(initialHasToken);
  const [maskedToken, setMaskedToken] = useState(initialMaskedToken);
  const [tokenOpen,   setTokenOpen]   = useState(false);
  const [tokenInput,  setTokenInput]  = useState('');
  const [showToken,   setShowToken]   = useState(false);
  const [savingToken, setSavingToken] = useState(false);
  const [tokenMsg,    setTokenMsg]    = useState<{ ok: boolean; text: string } | null>(null);

  function copyFeed() {
    navigator.clipboard.writeText(feedUrl).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  async function checkFeed() {
    setChecking(true);
    setFeedOk(null);
    try {
      const res = await fetch(feedUrl);
      setFeedOk(res.ok && (res.headers.get('content-type')?.includes('xml') ?? false));
    } catch {
      setFeedOk(false);
    } finally {
      setChecking(false);
    }
  }

  async function doSync() {
    setSyncing(true);
    setSyncMsg(null);
    try {
      const res  = await fetch('/api/admin/prom/sync', { method: 'POST' });
      const data = await res.json();
      if (data.error) setSyncMsg(`Помилка: ${data.error}`);
      else setSyncMsg(`+${data.created} нових, пропущено ${data.skipped}`);
    } catch {
      setSyncMsg('Помилка запиту');
    } finally {
      setSyncing(false);
    }
  }

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

  const statCards = [
    {
      label: 'API токен',
      value: hasToken ? 'Налаштовано' : 'Не встановлено',
      ok:    hasToken,
      icon:  Key,
      clickable: true,
    },
    {
      label: 'Товарів у фіді',
      value: `${enabledProducts} / ${totalProducts}`,
      ok:    enabledProducts > 0,
      icon:  Package,
    },
    {
      label: 'Замовлень',
      value: String(totalOrders),
      ok:    totalOrders > 0,
      icon:  ShoppingBag,
    },
    {
      label: 'З комісією',
      value: `${catsWithCommission} / ${totalCats}`,
      ok:    catsWithCommission > 0,
      icon:  Percent,
    },
  ];

  const navLinks = [
    { href: '/admin/prom/products',    label: 'Товари',      desc: 'Увімкнути/вимкнути, наценки, ціни',     color: '#0EA5E9' },
    { href: '/admin/prom/commissions', label: 'Комісії',     desc: 'Плани та ставки комісій по категоріях', color: '#8B5CF6' },
    { href: '/admin/prom/orders',      label: 'Замовлення',  desc: 'Синхронізація та статус замовлень',     color: '#10B981' },
    { href: '/admin/prom/prices',      label: 'Ціни',        desc: 'Управління цінами для Prom',            color: '#F59E0B' },
  ];

  return (
    <div style={{ padding: '28px 32px', maxWidth: 960, margin: '0 auto' }}>
      <h1 style={{ fontSize: 22, fontWeight: 700, color: '#1E293B', margin: '0 0 24px' }}>Prom.ua</h1>

      {/* Status cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, marginBottom: tokenOpen ? 0 : 24 }}>
        {statCards.map(({ label, value, ok, icon: Icon, clickable }) => (
          <div
            key={label}
            onClick={clickable ? () => setTokenOpen(v => !v) : undefined}
            style={{
              background: '#fff', borderRadius: 10, padding: '14px 16px',
              border: `1.5px solid ${ok ? '#D1FAE5' : '#FEE2E2'}`,
              cursor: clickable ? 'pointer' : 'default',
              transition: 'box-shadow .15s',
              ...(clickable && tokenOpen ? { borderBottomLeftRadius: 0, borderBottomRightRadius: 0, borderBottom: '1.5px solid transparent' } : {}),
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
              <Icon size={13} color={ok ? '#059669' : '#DC2626'} />
              <span style={{ fontSize: 11, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '.04em' }}>{label}</span>
              {clickable && (
                <span style={{ marginLeft: 'auto', fontSize: 10, color: '#94A3B8' }}>{tokenOpen ? '▲' : '▼'}</span>
              )}
            </div>
            <div style={{ fontSize: 18, fontWeight: 700, color: ok ? '#059669' : '#DC2626' }}>{value}</div>
          </div>
        ))}
      </div>

      {/* Token panel — expands under first card */}
      {tokenOpen && (
        <div style={{
          background: '#fff', border: '1.5px solid #D1FAE5', borderTop: 'none',
          borderRadius: '0 10px 10px 10px', padding: '16px 18px', marginBottom: 24,
        }}>
          {hasToken && maskedToken && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
              <span style={{ fontSize: 13, color: '#6B7280' }}>Поточний:</span>
              <code style={{ fontSize: 13, background: '#F3F4F6', padding: '3px 10px', borderRadius: 6, letterSpacing: 2 }}>{maskedToken}</code>
              <button
                onClick={deleteToken}
                style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 4, padding: '4px 10px', border: '1px solid #FECACA', borderRadius: 6, background: '#FFF5F5', color: '#DC2626', fontSize: 12, cursor: 'pointer' }}
              >
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
                placeholder={hasToken ? 'Новий токен для заміни...' : 'Вставте токен з кабінету Prom.ua'}
                style={{ width: '100%', boxSizing: 'border-box', padding: '8px 36px 8px 12px', border: '1px solid #E5E7EB', borderRadius: 8, fontSize: 13, fontFamily: tokenInput ? 'monospace' : 'inherit', outline: 'none' }}
              />
              <button
                onClick={() => setShowToken(v => !v)}
                style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: '#9CA3AF', padding: 2 }}
              >
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
      )}

      {/* Nav links */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 24 }}>
        {navLinks.map(({ href, label, desc, color }) => (
          <Link key={label} href={href} style={{ textDecoration: 'none', display: 'block', height: '100%' }}>
            <div style={{
              background: '#fff', borderRadius: 10, padding: '16px 18px',
              border: '1px solid #E2E8F0', cursor: 'pointer',
              height: '100%', boxSizing: 'border-box',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                <div style={{ width: 6, height: 6, borderRadius: '50%', background: color }} />
                <span style={{ fontWeight: 600, fontSize: 14, color: '#1E293B' }}>{label}</span>
                <ExternalLink size={11} color="#CBD5E1" style={{ marginLeft: 'auto' }} />
              </div>
              <div style={{ fontSize: 12, color: '#64748B' }}>{desc}</div>
            </div>
          </Link>
        ))}
      </div>

      {/* Feed URL */}
      <div style={{ background: '#fff', borderRadius: 12, padding: 20, border: '1px solid #E2E8F0' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
          <h2 style={{ fontSize: 14, fontWeight: 700, color: '#1E293B', margin: 0 }}>YML-фід товарів</h2>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={doSync}
              disabled={syncing || !hasToken}
              style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px', background: '#F1F5F9', border: '1px solid #E2E8F0', borderRadius: 7, fontSize: 12, color: syncing || !hasToken ? '#CBD5E1' : '#475569', cursor: syncing || !hasToken ? 'not-allowed' : 'pointer' }}
            >
              <RefreshCw size={12} style={syncing ? { animation: 'spin 1s linear infinite' } : {}} />
              {syncing ? 'Синхронізую…' : 'Синхронізувати'}
            </button>
            <button onClick={checkFeed} disabled={checking} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px', background: '#F1F5F9', border: '1px solid #E2E8F0', borderRadius: 7, fontSize: 12, color: '#475569', cursor: 'pointer' }}>
              <RefreshCw size={12} style={checking ? { animation: 'spin 1s linear infinite' } : {}} />
              Перевірити
            </button>
            <a href={feedUrl} target="_blank" rel="noreferrer" style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px', background: '#F1F5F9', border: '1px solid #E2E8F0', borderRadius: 7, fontSize: 12, color: '#475569', textDecoration: 'none' }}>
              <ExternalLink size={12} /> Відкрити
            </a>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <div style={{ flex: 1, fontFamily: 'monospace', fontSize: 13, padding: '10px 14px', background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 8, color: '#334155', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {feedUrl}
          </div>
          <button onClick={copyFeed} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '10px 16px', background: copied ? '#ECFDF5' : '#0EA5E9', color: copied ? '#059669' : '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>
            {copied ? <CheckCircle size={14} /> : <Copy size={14} />}
            {copied ? 'Скопійовано' : 'Копіювати'}
          </button>
        </div>

        {syncMsg && (
          <div style={{ marginTop: 10, padding: '8px 12px', borderRadius: 7, fontSize: 12, background: syncMsg.startsWith('Помилка') ? '#FEF2F2' : '#ECFDF5', color: syncMsg.startsWith('Помилка') ? '#DC2626' : '#059669' }}>
            {syncMsg.startsWith('Помилка') ? `✗ ${syncMsg}` : `✓ Синхронізовано: ${syncMsg}`}
          </div>
        )}

        {feedOk !== null && (
          <div style={{ marginTop: 10, padding: '8px 12px', borderRadius: 7, fontSize: 12, background: feedOk ? '#ECFDF5' : '#FEF2F2', color: feedOk ? '#059669' : '#DC2626' }}>
            {feedOk ? '✓ Фід доступний і повертає валідний XML' : '✗ Фід недоступний або повертає помилку'}
          </div>
        )}

        <div style={{ marginTop: 12, padding: '10px 14px', background: '#FFF7ED', borderRadius: 8, border: '1px solid #FED7AA', fontSize: 12, color: '#92400E', lineHeight: 1.6 }}>
          Вкажи цю URL в кабінеті Prom.ua: <b>Товари → Імпорт товарів → Завантажити за посиланням</b>.
        </div>
      </div>

      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
