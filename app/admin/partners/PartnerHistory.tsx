'use client';

import { useAdminQuery } from '../../../lib/admin/api';
import Link from 'next/link';
import { fmtMoney, fmtDate } from '../../../lib/format';
import { STATUSES, CHANNEL_LABEL } from '../_orders/constants';

/**
 * Історія контрагента в картці «Контрагентів» (аудит 31.10, п. 22): останні
 * замовлення з переходом у журнал і сальдо леджера з переходом у
 * «Взаєморозрахунки». Вантажиться лише коли картку відкрили.
 */
type HistoryOrder = {
  id: string; order_number: number; created_at: string; status: string;
  total_price: number | null; channel_code: string | null; tracking_number: string | null; payment_confirmed: boolean | null;
};
type History = { orders: HistoryOrder[]; total: number; balances: Record<string, number> };

const STATUS = new Map(STATUSES.map(s => [s.value, s]));
const secLabel: React.CSSProperties = { fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '8px' };

export default function PartnerHistory({ customerId }: { customerId: string }) {
  const query = useAdminQuery<History>(`/api/admin/partners/${customerId}/history`);
  const data = query.data;
  const error = query.error?.message ?? null;

  const debt = data?.balances.customer ?? 0;
  const partner = data?.balances.partner;

  return (
    <>
      {/* Сальдо леджера: клієнт «+» = винен нам, «−» = ми йому (аванс/переплата) */}
      {data && (Math.abs(debt) >= 0.005 || partner != null) && (
        <div>
          <div style={secLabel}>Розрахунки
            <Link href={`/admin/finance/mutual?cp=c:${customerId}`} style={{ marginLeft: 'auto', fontSize: '11px', fontWeight: 600, color: 'var(--brand-blue)', textDecoration: 'none', textTransform: 'none', letterSpacing: 0 }}>взаєморозрахунки →</Link>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: partner != null ? '1fr 1fr' : '1fr', gap: '8px' }}>
            <div style={{ background: debt > 0.005 ? 'var(--bg-danger)' : 'var(--bg-soft)', borderRadius: '9px', padding: '10px 14px' }}>
              <div style={{ fontSize: '10px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '3px' }}>
                {debt > 0.005 ? 'Винен нам' : debt < -0.005 ? 'Ми винні (аванс)' : 'Борг'}
              </div>
              <div style={{ fontSize: '15px', fontWeight: 700, color: debt > 0.005 ? 'var(--color-danger)' : 'var(--text-primary)' }}>{fmtMoney(Math.abs(debt))} ₴</div>
            </div>
            {partner != null && (
              <div style={{ background: 'var(--bg-soft)', borderRadius: '9px', padding: '10px 14px' }}>
                <div style={{ fontSize: '10px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '3px' }}>Леджер партнера</div>
                <div style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text-primary)' }}>{fmtMoney(partner)} ₴</div>
              </div>
            )}
          </div>
        </div>
      )}

      <div>
        <div style={secLabel}>Замовлення
          {data && data.total > 0 && (
            <Link href={`/admin?status=&q=${encodeURIComponent(String(data.orders[0]?.order_number ?? ''))}`} style={{ marginLeft: 'auto', fontSize: '11px', fontWeight: 600, color: 'var(--brand-blue)', textDecoration: 'none', textTransform: 'none', letterSpacing: 0 }}>
              {data.total > data.orders.length ? `останні ${data.orders.length} з ${data.total}` : `усього ${data.total}`}
            </Link>
          )}
        </div>
        {error && <div style={{ fontSize: '12px', color: 'var(--color-danger)' }}>{error}</div>}
        {!data && !error && <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Завантаження…</div>}
        {data && data.orders.length === 0 && <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Замовлень ще не було</div>}
        {data && data.orders.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            {data.orders.map(o => {
              const st = STATUS.get(o.status);
              const ch = o.channel_code ? CHANNEL_LABEL[o.channel_code] : null;
              return (
                <Link key={o.id} href={`/admin?status=&q=${o.order_number}&expand=${o.id}`} className="partner-history-row"
                  style={{ display: 'grid', gridTemplateColumns: '92px 56px 1fr auto', alignItems: 'center', gap: '10px', padding: '8px 12px', borderRadius: '8px', background: 'var(--bg-soft)', textDecoration: 'none', color: 'var(--text-primary)', fontSize: '12.5px' }}>
                  <span style={{ fontWeight: 700 }}>#{o.order_number}</span>
                  <span style={{ color: 'var(--text-muted)' }}>{fmtDate(o.created_at)}</span>
                  <span style={{ display: 'flex', gap: '6px', alignItems: 'center', minWidth: 0 }}>
                    <span style={{ fontSize: '10.5px', fontWeight: 700, padding: '1px 7px', borderRadius: '999px', background: st?.bg ?? 'var(--bg-card)', color: st?.color ?? 'var(--text-secondary)', whiteSpace: 'nowrap' }}>{st?.label ?? o.status}</span>
                    {ch && <span style={{ fontSize: '10.5px', fontWeight: 700, color: ch.color, whiteSpace: 'nowrap' }}>{ch.label}</span>}
                    {o.tracking_number && <span style={{ fontSize: '11px', color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>ЕН {o.tracking_number}</span>}
                  </span>
                  <span style={{ fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{fmtMoney(Number(o.total_price ?? 0))} ₴</span>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </>
  );
}
