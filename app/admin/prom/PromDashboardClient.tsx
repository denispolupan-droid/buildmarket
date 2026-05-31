'use client';

import { useState } from 'react';
import { RefreshCw, ExternalLink, Copy, CheckCircle, Package, ShoppingBag } from 'lucide-react';
import Link from 'next/link';

interface Order {
  id: string;
  order_number: number;
  created_at: string;
  status: string;
  contact: string;
  phone: string;
  total_price: number;
  prom_order_id: number | null;
}

interface StatRow {
  status: string;
  count: number;
  amount: number;
}

interface Props {
  hasToken:      boolean;
  feedUrl:       string;
  recentOrders:  Order[];
  totalOrders:   number;
  stats:         StatRow[];
  totalRevenue:  number;
}

const STATUS_LABELS: Record<string, { label: string; color: string; bg: string }> = {
  new:       { label: 'Нові',        color: '#B45309', bg: '#FEF3C7' },
  confirmed: { label: 'Підтверджені', color: '#0369A1', bg: '#E0F2FE' },
  shipped:   { label: 'Відправлені', color: '#7C3AED', bg: '#F5F3FF' },
  delivered: { label: 'Доставлені',  color: '#15803D', bg: '#F0FDF4' },
  cancelled: { label: 'Скасовані',   color: '#9CA3AF', bg: '#F9FAFB' },
};

function fmt(n: number) {
  return n.toLocaleString('uk-UA', { maximumFractionDigits: 0 }) + ' ₴';
}

function relTime(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const h = Math.floor(diff / 3_600_000);
  if (h < 1)  return 'щойно';
  if (h < 24) return `${h} год тому`;
  return `${Math.floor(h / 24)} дн тому`;
}

export default function PromDashboardClient({ hasToken, feedUrl, recentOrders, totalOrders, stats, totalRevenue }: Props) {
  const [syncing, setSyncing]   = useState(false);
  const [syncMsg, setSyncMsg]   = useState<string | null>(null);
  const [copied,  setCopied]    = useState(false);

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

      {/* Token warning */}
      {!hasToken && (
        <div style={{
          marginBottom: 20, padding: '14px 18px', borderRadius: 10,
          background: '#FFF7ED', border: '1px solid #FED7AA',
          color: '#92400E', fontSize: 14,
        }}>
          <strong>Токен не налаштовано.</strong> Додайте змінну оточення{' '}
          <code style={{ background: '#FEF3C7', padding: '1px 5px', borderRadius: 4 }}>PROM_API_TOKEN</code>{' '}
          у Vercel, щоб увімкнути синхронізацію замовлень та статусів.
        </div>
      )}

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

      {/* Stats cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 12, marginBottom: 24 }}>
        <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #E5E7EB', padding: '16px 18px' }}>
          <div style={{ fontSize: 12, color: '#6B7280', fontWeight: 600, marginBottom: 6 }}>Всього замовлень</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#111' }}>{totalOrders}</div>
          <div style={{ fontSize: 13, color: '#15803D', fontWeight: 600, marginTop: 4 }}>{fmt(totalRevenue)}</div>
        </div>
        {stats.map(s => {
          const cfg = STATUS_LABELS[s.status] ?? { label: s.status, color: '#6B7280', bg: '#F9FAFB' };
          return (
            <div key={s.status} style={{ background: '#fff', borderRadius: 12, border: '1px solid #E5E7EB', padding: '16px 18px' }}>
              <div style={{ fontSize: 12, color: cfg.color, fontWeight: 700, marginBottom: 6, display: 'flex', alignItems: 'center', gap: 5 }}>
                <span style={{ width: 7, height: 7, borderRadius: '50%', background: cfg.color, display: 'inline-block' }} />
                {cfg.label}
              </div>
              <div style={{ fontSize: 22, fontWeight: 800, color: '#111' }}>{s.count}</div>
              {s.amount > 0 && <div style={{ fontSize: 12, color: '#6B7280', marginTop: 4 }}>{fmt(s.amount)}</div>}
            </div>
          );
        })}
      </div>

      {/* Product Feed URL */}
      <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #E5E7EB', padding: 20, marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
          <Package size={18} color="#6B7280" />
          <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>YML-фід товарів</h2>
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

      {/* Recent Prom orders */}
      <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #E5E7EB', overflow: 'hidden' }}>
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '16px 20px', borderBottom: '1px solid #E5E7EB',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <ShoppingBag size={18} color="#6B7280" />
            <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>Останні замовлення з Prom.ua</h2>
          </div>
          <Link
            href="/admin?channel=prom"
            style={{ fontSize: 13, color: '#1D4ED8', textDecoration: 'none', fontWeight: 600 }}
          >
            Всі замовлення →
          </Link>
        </div>

        {recentOrders.length === 0 ? (
          <div style={{ padding: 40, textAlign: 'center', color: '#9CA3AF' }}>
            Замовлень з Prom.ua ще немає. Натисніть «Синхронізувати зараз».
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: '#F9FAFB' }}>
                {['№', 'Клієнт', 'Статус', 'Сума', 'Prom ID', 'Час'].map(h => (
                  <th key={h} style={{
                    padding: '10px 16px', textAlign: 'left',
                    fontSize: 12, fontWeight: 700, color: '#6B7280',
                    textTransform: 'uppercase', letterSpacing: '0.05em',
                    borderBottom: '1px solid #E5E7EB',
                  }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {recentOrders.map(order => {
                const cfg = STATUS_LABELS[order.status] ?? { label: order.status, color: '#6B7280', bg: '#F9FAFB' };
                return (
                  <tr key={order.id} style={{ borderBottom: '1px solid #F3F4F6' }}>
                    <td style={{ padding: '10px 16px', fontWeight: 700, fontSize: 13 }}>
                      <Link href={`/admin?expand=${order.id}`} style={{ color: '#1D4ED8', textDecoration: 'none' }}>
                        #{order.order_number}
                      </Link>
                    </td>
                    <td style={{ padding: '10px 16px', fontSize: 13 }}>
                      <div style={{ fontWeight: 600 }}>{order.contact}</div>
                      <div style={{ color: '#6B7280', fontSize: 12 }}>{order.phone}</div>
                    </td>
                    <td style={{ padding: '10px 16px' }}>
                      <span style={{
                        display: 'inline-block', padding: '2px 8px', borderRadius: 20,
                        fontSize: 12, fontWeight: 600,
                        color: cfg.color, background: cfg.bg,
                      }}>{cfg.label}</span>
                    </td>
                    <td style={{ padding: '10px 16px', fontWeight: 700, fontSize: 13 }}>
                      {fmt(Number(order.total_price))}
                    </td>
                    <td style={{ padding: '10px 16px', fontSize: 12, color: '#6B7280' }}>
                      {order.prom_order_id ? (
                        <a
                          href={`https://my.prom.ua/orders/${order.prom_order_id}`}
                          target="_blank" rel="noreferrer"
                          style={{ color: '#C2410C', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 3 }}
                        >
                          {order.prom_order_id} <ExternalLink size={11} />
                        </a>
                      ) : '—'}
                    </td>
                    <td style={{ padding: '10px 16px', fontSize: 12, color: '#9CA3AF' }}>
                      {relTime(order.created_at)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
