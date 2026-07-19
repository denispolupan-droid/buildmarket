'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, RefreshCw, AlertTriangle, CheckCircle } from 'lucide-react';

interface OrderRow {
  id: string;
  order_number: number | null;
  created_at: string;
  contact: string;
  total_price: string | number;
  status: string;
  rozetka_order_id: number | null;
}

interface Props {
  hasCredentials: boolean;
  recentOrders: OrderRow[];
  totalSynced: number;
}

export default function RozetkaOrdersClient({ hasCredentials, recentOrders, totalSynced }: Props) {
  const [syncing, setSyncing] = useState(false);
  const [result, setResult]  = useState<{ ok: boolean; text: string } | null>(null);

  async function syncNow() {
    setSyncing(true);
    setResult(null);
    try {
      const res  = await fetch('/api/admin/rozetka/sync', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) { setResult({ ok: false, text: data.error ?? 'Помилка синхронізації' }); return; }
      setResult({ ok: true, text: `Готово: створено ${data.created}, пропущено (вже є) ${data.skipped} з ${data.total ?? 0}` });
    } catch {
      setResult({ ok: false, text: 'Помилка з\'єднання' });
    } finally {
      setSyncing(false);
    }
  }

  return (
    <div style={{ padding: '28px 32px', maxWidth: 960, margin: '0 auto' }}>
      <Link href="/admin/rozetka" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, color: '#64748B', textDecoration: 'none', marginBottom: 16 }}>
        <ArrowLeft size={14} /> Rozetka
      </Link>
      <h1 style={{ fontSize: 22, fontWeight: 700, color: '#1E293B', margin: '0 0 24px' }}>Замовлення Rozetka</h1>

      {!hasCredentials && (
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '14px 16px', background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: 10, marginBottom: 20 }}>
          <AlertTriangle size={16} color="#D97706" style={{ flexShrink: 0, marginTop: 1 }} />
          <div style={{ fontSize: 13, color: '#92400E' }}>
            Логін і пароль Rozetka не налаштовані — синхронізація не працюватиме.{' '}
            <Link href="/admin/rozetka" style={{ color: '#1D4ED8', fontWeight: 600 }}>Налаштувати на сторінці Rozetka</Link>.
          </div>
        </div>
      )}

      <div style={{ background: '#fff', borderRadius: 12, padding: 20, border: '1px solid #E2E8F0', marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, color: '#1E293B' }}>Ручний запуск</div>
            <div style={{ fontSize: 12, color: '#64748B', marginTop: 2 }}>Синхронізація автоматична: GitHub Actions кожні 30 хв + щоденний резервний крон. Кнопка — для миттєвого запуску.</div>
          </div>
          <button
            onClick={syncNow}
            disabled={syncing || !hasCredentials}
            style={{
              display: 'flex', alignItems: 'center', gap: 8, padding: '10px 18px',
              background: hasCredentials ? '#1D4ED8' : '#E5E7EB', color: hasCredentials ? '#fff' : '#9CA3AF',
              border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600,
              cursor: hasCredentials && !syncing ? 'pointer' : 'not-allowed', flexShrink: 0,
            }}
          >
            <RefreshCw size={14} style={syncing ? { animation: 'spin 1s linear infinite' } : {}} />
            {syncing ? 'Синхронізуємо…' : 'Синхронізувати зараз'}
          </button>
        </div>
        {result && (
          <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', borderRadius: 7, fontSize: 12, background: result.ok ? '#ECFDF5' : '#FEF2F2', color: result.ok ? '#059669' : '#DC2626' }}>
            {result.ok ? <CheckCircle size={13} /> : <AlertTriangle size={13} />}
            {result.text}
          </div>
        )}
      </div>

      <div style={{ background: '#fff', borderRadius: 12, padding: 20, border: '1px solid #E2E8F0' }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: '#1E293B', marginBottom: 12 }}>
          Синхронізовані замовлення ({totalSynced})
        </div>
        {recentOrders.length === 0 ? (
          <div style={{ fontSize: 13, color: '#94A3B8', padding: '12px 0' }}>Ще жодного замовлення з Rozetka не синхронізовано.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            {recentOrders.map(o => (
              <Link
                key={o.id}
                href={`/admin?expand=${o.id}`}
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 4px', borderBottom: '1px solid #F1F5F9', textDecoration: 'none', color: 'inherit' }}
              >
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: '#1E293B' }}>№ {o.order_number ?? o.id.slice(0, 8)} — {o.contact}</div>
                  <div style={{ fontSize: 12, color: '#94A3B8' }}>Rozetka #{o.rozetka_order_id} · {new Date(o.created_at).toLocaleString('uk-UA')}</div>
                </div>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#1E293B' }}>{Number(o.total_price).toFixed(2)} грн</div>
              </Link>
            ))}
          </div>
        )}
      </div>

      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
