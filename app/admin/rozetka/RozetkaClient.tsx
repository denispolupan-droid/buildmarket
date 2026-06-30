'use client';

import { useState } from 'react';
import { Copy, ExternalLink, CheckCircle, RefreshCw, Tag, Package, Percent, ShoppingBag } from 'lucide-react';
import Link from 'next/link';

interface Props {
  feedUrl: string;
  hasApiKey: boolean;
  totalProducts: number;
  enabledProducts: number;
  catsWithId: number;
  catsWithCommission: number;
  totalCats: number;
}

export default function RozetkaClient({ feedUrl, hasApiKey, totalProducts, enabledProducts, catsWithId, catsWithCommission, totalCats }: Props) {
  const [copied,   setCopied]   = useState(false);
  const [checking, setChecking] = useState(false);
  const [feedOk,   setFeedOk]   = useState<boolean | null>(null);

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
      setFeedOk(res.ok && res.headers.get('content-type')?.includes('xml') === true);
    } catch {
      setFeedOk(false);
    } finally {
      setChecking(false);
    }
  }

  const cards = [
    { label: 'API токен',        value: hasApiKey ? 'Налаштовано' : 'Відсутній', ok: hasApiKey,                  icon: CheckCircle },
    { label: 'Товарів у фіді',   value: `${enabledProducts} / ${totalProducts}`, ok: enabledProducts > 0,        icon: Package     },
    { label: 'Категорій rz_id',  value: `${catsWithId} / ${totalCats}`,          ok: catsWithId > 0,             icon: Tag         },
    { label: 'З комісією',       value: `${catsWithCommission} / ${totalCats}`,  ok: catsWithCommission > 0,     icon: Percent     },
  ];

  const navLinks = [
    { href: '/admin/rozetka/products',    label: 'Товари',      desc: 'Увімкнути/вимкнути, наценки, ціни',                color: '#0EA5E9' },
    { href: '/admin/rozetka/commissions', label: 'Комісії',     desc: 'Комісії та категорії Rozetka по категоріях',        color: '#8B5CF6' },
    { href: '/admin/rozetka/audit',       label: 'Аудит назв',  desc: 'Перевірити відповідність назв вимогам Rozetka',     color: '#F59E0B' },
    { href: '/admin/rozetka/orders',      label: 'Замовлення',  desc: 'Синхронізація замовлень з Rozetka',                 color: '#10B981', disabled: true },
  ];

  return (
    <div style={{ padding: '28px 32px', maxWidth: 960, margin: '0 auto' }}>
      <h1 style={{ fontSize: 22, fontWeight: 700, color: '#1E293B', margin: '0 0 24px' }}>Rozetka</h1>

      {/* Status cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, marginBottom: 24 }}>
        {cards.map(({ label, value, ok, icon: Icon }) => (
          <div key={label} style={{
            background: '#fff', borderRadius: 10, padding: '14px 16px',
            border: `1.5px solid ${ok ? '#D1FAE5' : '#FEE2E2'}`,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
              <Icon size={13} color={ok ? '#059669' : '#DC2626'} />
              <span style={{ fontSize: 11, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '.04em' }}>{label}</span>
            </div>
            <div style={{ fontSize: 18, fontWeight: 700, color: ok ? '#059669' : '#DC2626' }}>{String(value)}</div>
          </div>
        ))}
      </div>

      {/* Navigation */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 24 }}>
        {navLinks.map(({ href, label, desc, color, disabled }) => (
          disabled
            ? (
              <div key={label} style={{
                background: '#F8FAFC', borderRadius: 10, padding: '16px 18px',
                border: '1px solid #E2E8F0', opacity: 0.5,
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                  <ShoppingBag size={15} color={color} />
                  <span style={{ fontWeight: 600, fontSize: 14, color: '#1E293B' }}>{label}</span>
                  <span style={{ fontSize: 10, padding: '1px 5px', borderRadius: 3, background: '#F1F5F9', color: '#94A3B8' }}>скоро</span>
                </div>
                <div style={{ fontSize: 12, color: '#94A3B8' }}>{desc}</div>
              </div>
            )
            : (
              <Link key={label} href={href} style={{ textDecoration: 'none', display: 'block', height: '100%' }}>
                <div style={{
                  background: '#fff', borderRadius: 10, padding: '16px 18px',
                  border: `1px solid #E2E8F0`, cursor: 'pointer',
                  transition: 'box-shadow .15s', height: '100%', boxSizing: 'border-box',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                    <div style={{ width: 6, height: 6, borderRadius: '50%', background: color }} />
                    <span style={{ fontWeight: 600, fontSize: 14, color: '#1E293B' }}>{label}</span>
                    <ExternalLink size={11} color="#CBD5E1" style={{ marginLeft: 'auto' }} />
                  </div>
                  <div style={{ fontSize: 12, color: '#64748B' }}>{desc}</div>
                </div>
              </Link>
            )
        ))}
      </div>

      {/* Feed URL */}
      <div style={{ background: '#fff', borderRadius: 12, padding: 20, border: '1px solid #E2E8F0' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
          <h2 style={{ fontSize: 14, fontWeight: 700, color: '#1E293B', margin: 0 }}>YML-фід для Rozetka</h2>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={checkFeed} disabled={checking} style={{
              display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px',
              background: '#F1F5F9', border: '1px solid #E2E8F0', borderRadius: 7,
              fontSize: 12, color: '#475569', cursor: 'pointer',
            }}>
              <RefreshCw size={12} style={checking ? { animation: 'spin 1s linear infinite' } : {}} />
              Перевірити
            </button>
            <a href={feedUrl} target="_blank" rel="noreferrer" style={{
              display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px',
              background: '#F1F5F9', border: '1px solid #E2E8F0', borderRadius: 7,
              fontSize: 12, color: '#475569', textDecoration: 'none',
            }}>
              <ExternalLink size={12} /> Відкрити
            </a>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <div style={{
            flex: 1, fontFamily: 'monospace', fontSize: 13, padding: '10px 14px',
            background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 8,
            color: '#334155', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {feedUrl}
          </div>
          <button onClick={copyFeed} style={{
            display: 'flex', alignItems: 'center', gap: 6, padding: '10px 16px',
            background: copied ? '#ECFDF5' : '#0EA5E9', color: copied ? '#059669' : '#fff',
            border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 600,
          }}>
            {copied ? <CheckCircle size={14} /> : <Copy size={14} />}
            {copied ? 'Скопійовано' : 'Копіювати'}
          </button>
        </div>

        {feedOk !== null && (
          <div style={{
            marginTop: 10, padding: '8px 12px', borderRadius: 7, fontSize: 12,
            background: feedOk ? '#ECFDF5' : '#FEF2F2',
            color: feedOk ? '#059669' : '#DC2626',
          }}>
            {feedOk ? '✓ Фід доступний і повертає валідний XML' : '✗ Фід недоступний або повертає помилку'}
          </div>
        )}

        <div style={{ marginTop: 12, padding: '10px 14px', background: '#FFF7ED', borderRadius: 8, border: '1px solid #FED7AA', fontSize: 12, color: '#92400E', lineHeight: 1.6 }}>
          Вкажи цю URL в кабінеті Rozetka: <b>Управління товарами → Завантаження прайс-листа → XML/YML</b>.
        </div>
      </div>
    </div>
  );
}
