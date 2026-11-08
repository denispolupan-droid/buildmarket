'use client';

import Link from 'next/link';
import { ArrowLeft, ExternalLink, RefreshCw, ShoppingBag } from 'lucide-react';
import { useState } from 'react';

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

interface StatRow { status: string; count: number; amount: number; }

interface Props {
  orders:       Order[];
  totalOrders:  number;
  stats:        StatRow[];
  totalRevenue: number;
}

const STATUS_LABELS: Record<string, { label: string; color: string; bg: string }> = {
  new:       { label: 'Нові',         color: 'var(--color-warn)', bg: 'var(--amber-bg)' },
  confirmed: { label: 'Підтверджені', color: '#0369A1', bg: '#E0F2FE' },
  shipped:   { label: 'Відправлені',  color: 'var(--violet)', bg: 'var(--violet-bg)' },
  delivered: { label: 'Доставлені',   color: 'var(--color-success)', bg: 'var(--bg-success)' },
  cancelled: { label: 'Скасовані',    color: '#9CA3AF', bg: 'var(--surface-soft)' },
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

export default function PromOrdersClient({ orders, totalOrders, stats, totalRevenue }: Props) {
  const [syncing, setSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState<string | null>(null);

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

  return (
    <div style={{ padding: '28px 32px 64px', maxWidth: 1100 }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <Link href="/admin/prom" style={{ display: 'flex', alignItems: 'center', color: 'var(--text-gray)', textDecoration: 'none' }}>
            <ArrowLeft size={18} />
          </Link>
          <div>
            <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: 'var(--ink-strong)' }}>Замовлення Prom.ua</h1>
            <p style={{ margin: '2px 0 0', fontSize: 13, color: 'var(--text-gray)' }}>Всього: {totalOrders}</p>
          </div>
        </div>
        <button
          onClick={doSync}
          disabled={syncing}
          style={{
            display: 'flex', alignItems: 'center', gap: 8,
            padding: '10px 18px', borderRadius: 10,
            background: syncing ? 'var(--line)' : 'var(--color-info)',
            color: syncing ? 'var(--text-gray-light)' : 'var(--surface)',
            border: 'none', cursor: syncing ? 'not-allowed' : 'pointer',
            fontWeight: 600, fontSize: 14,
          }}
        >
          <RefreshCw size={15} style={syncing ? { animation: 'spin 1s linear infinite' } : {}} />
          {syncing ? 'Синхронізую…' : 'Синхронізувати'}
        </button>
      </div>

      {syncMsg && (
        <div style={{
          marginBottom: 20, padding: '12px 16px', borderRadius: 10,
          background: syncMsg.startsWith('Помилка') ? 'var(--bg-danger)' : 'var(--bg-success)',
          border: `1px solid ${syncMsg.startsWith('Помилка') ? 'var(--border-danger)' : 'var(--ok-border)'}`,
          color: syncMsg.startsWith('Помилка') ? '#991B1B' : 'var(--color-success)',
          fontSize: 14, fontWeight: 600,
        }}>
          {syncMsg}
        </div>
      )}

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 12, marginBottom: 28 }}>
        <div style={{ background: 'var(--surface)', borderRadius: 12, border: '1px solid var(--line)', padding: '16px 18px' }}>
          <div style={{ fontSize: 12, color: 'var(--text-gray)', fontWeight: 600, marginBottom: 6 }}>Всього замовлень</div>
          <div style={{ fontSize: 26, fontWeight: 800, color: 'var(--ink-strong)' }}>{totalOrders}</div>
          <div style={{ fontSize: 13, color: 'var(--color-success)', fontWeight: 600, marginTop: 4 }}>{fmt(totalRevenue)}</div>
        </div>
        {stats.map(s => {
          const cfg = STATUS_LABELS[s.status] ?? { label: s.status, color: '#6B7280', bg: 'var(--surface-soft)' };
          return (
            <div key={s.status} style={{ background: 'var(--surface)', borderRadius: 12, border: '1px solid var(--line)', padding: '16px 18px' }}>
              <div style={{ fontSize: 12, color: cfg.color, fontWeight: 700, marginBottom: 6, display: 'flex', alignItems: 'center', gap: 5 }}>
                <span style={{ width: 7, height: 7, borderRadius: '50%', background: cfg.color, display: 'inline-block' }} />
                {cfg.label}
              </div>
              <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--ink-strong)' }}>{s.count}</div>
              {s.amount > 0 && <div style={{ fontSize: 12, color: 'var(--text-gray)', marginTop: 4 }}>{fmt(s.amount)}</div>}
            </div>
          );
        })}
      </div>

      {/* Orders table */}
      <div style={{ background: 'var(--surface)', borderRadius: 12, border: '1px solid var(--line)', overflow: 'hidden' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '16px 20px', borderBottom: '1px solid var(--line)' }}>
          <ShoppingBag size={18} color="#6B7280" />
          <h2 style={{ margin: 0, fontSize: 15, fontWeight: 700 }}>Останні замовлення</h2>
          <Link href="/admin?channel=prom" style={{ marginLeft: 'auto', fontSize: 13, color: 'var(--color-info)', textDecoration: 'none', fontWeight: 600 }}>
            Всі в адмін →
          </Link>
        </div>

        {orders.length === 0 ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-gray-light)' }}>
            Замовлень з Prom.ua ще немає. Натисніть «Синхронізувати».
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: 'var(--surface-soft)' }}>
                {['№', 'Клієнт', 'Статус', 'Сума', 'Prom ID', 'Час'].map(h => (
                  <th key={h} style={{ padding: '10px 16px', textAlign: 'left', fontSize: 12, fontWeight: 700, color: 'var(--text-gray)', textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: '1px solid var(--line)' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {orders.map(order => {
                const cfg = STATUS_LABELS[order.status] ?? { label: order.status, color: '#6B7280', bg: 'var(--surface-soft)' };
                return (
                  <tr key={order.id} style={{ borderBottom: '1px solid var(--surface-muted)' }}>
                    <td style={{ padding: '10px 16px', fontWeight: 700, fontSize: 13 }}>
                      <Link href={`/admin?expand=${order.id}`} style={{ color: 'var(--color-info)', textDecoration: 'none' }}>
                        #{order.order_number}
                      </Link>
                    </td>
                    <td style={{ padding: '10px 16px', fontSize: 13 }}>
                      <div style={{ fontWeight: 600 }}>{order.contact}</div>
                      <div style={{ color: 'var(--text-gray)', fontSize: 12 }}>{order.phone}</div>
                    </td>
                    <td style={{ padding: '10px 16px' }}>
                      <span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: 20, fontSize: 12, fontWeight: 600, color: cfg.color, background: cfg.bg }}>
                        {cfg.label}
                      </span>
                    </td>
                    <td style={{ padding: '10px 16px', fontWeight: 700, fontSize: 13 }}>
                      {fmt(Number(order.total_price))}
                    </td>
                    <td style={{ padding: '10px 16px', fontSize: 12, color: 'var(--text-gray)' }}>
                      {order.prom_order_id ? (
                        <a href={`https://my.prom.ua/orders/${order.prom_order_id}`} target="_blank" rel="noreferrer"
                          style={{ color: 'var(--orange)', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 3 }}>
                          {order.prom_order_id} <ExternalLink size={11} />
                        </a>
                      ) : '—'}
                    </td>
                    <td style={{ padding: '10px 16px', fontSize: 12, color: 'var(--text-gray-light)' }}>
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
