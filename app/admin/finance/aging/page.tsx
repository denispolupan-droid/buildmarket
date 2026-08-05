import { createClient } from '@supabase/supabase-js';
import { createSupabaseServer } from '../../../../lib/supabase-server';
import { redirect } from 'next/navigation';
import { AlertCircle } from 'lucide-react';
import FinanceTabs from '../FinanceTabs';

const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

function fmt(n: number) { return n.toLocaleString('uk-UA', { maximumFractionDigits: 0 }); }

const BUCKET_CFG: Record<string, { label: string; color: string }> = {
  current:  { label: 'Поточна',   color: '#15803D' },
  '1_30':   { label: '1–30 дн.',  color: '#B45309' },
  '31_60':  { label: '31–60 дн.', color: '#B45309' },
  '61_90':  { label: '61–90 дн.', color: '#DC2626' },
  '90_plus':{ label: '90+ дн.',   color: '#DC2626' },
};

export default async function AgingPage() {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || user.app_metadata?.role !== 'admin') redirect('/');

  const { data: rows } = await db
    .from('ar_aging')
    .select('*')
    .order('days_overdue', { ascending: false });

  const aging = rows ?? [];
  const total = aging.reduce((s, r) => s + Number(r.balance), 0);

  const byBucket = Object.fromEntries(
    Object.keys(BUCKET_CFG).map(k => [k, aging.filter(r => r.aging_bucket === k)])
  );

  return (
    <div style={{ padding: '28px 32px 64px', maxWidth: '1400px' }}>

      {/* Header */}
      <div style={{ marginBottom: '14px' }}>
        <h1 style={{ fontSize: '22px', fontWeight: 800, color: 'var(--text-primary)', margin: 0 }}>Старіння дебіторки</h1>
        <p style={{ fontSize: '13px', color: 'var(--text-muted)', margin: '4px 0 0' }}>
          AR Aging — станом на {new Date().toLocaleDateString('uk-UA')}
        </p>
      </div>

      <FinanceTabs />

      {/* Bucket summary */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '12px', margin: '20px 0' }}>
        {Object.entries(BUCKET_CFG).map(([key, cfg]) => {
          const bRows = byBucket[key] ?? [];
          const bTotal = bRows.reduce((s, r) => s + Number(r.balance), 0);
          return (
            <div key={key} className="fin-card" style={{ padding: '14px 18px' }}>
              <div className="fin-kpi-label">{cfg.label}</div>
              <div className="fin-money-val" style={{ color: bTotal > 0 ? cfg.color : 'var(--text-primary)' }}>{fmt(bTotal)} ₴</div>
              <div className="fin-money-sub">{bRows.length} договорів</div>
            </div>
          );
        })}
      </div>

      {/* Total */}
      <div className="fin-card" style={{ padding: '14px 20px', marginBottom: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)' }}>Загальна дебіторська заборгованість</span>
        <span style={{ fontSize: '22px', fontWeight: 800, fontVariantNumeric: 'tabular-nums', color: total > 0 ? '#DC2626' : '#15803D' }}>{fmt(total)} ₴</span>
      </div>

      {/* Table */}
      {aging.length === 0 ? (
        <div className="fin-card" style={{ padding: '64px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '14px' }}>
          Немає активної дебіторської заборгованості
        </div>
      ) : (
        <div className="fin-card" style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '160px 1fr 80px 120px 100px 100px 100px', padding: '8px 16px', borderBottom: '1px solid var(--border)', fontSize: '12px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            <span>Договір</span><span>Клієнт</span><span style={{ textAlign: 'right' }}>Відстр.</span>
            <span style={{ textAlign: 'right' }}>Борг</span><span style={{ textAlign: 'right' }}>Дн. від відв.</span>
            <span style={{ textAlign: 'right' }}>Прострочено</span><span style={{ textAlign: 'center' }}>Стан</span>
          </div>
          {aging.map((row, idx) => {
            const cfg = BUCKET_CFG[row.aging_bucket] ?? BUCKET_CFG['90_plus'];
            const overdue = Number(row.days_overdue ?? 0);
            return (
              <div key={row.contract_id} style={{
                display: 'grid', gridTemplateColumns: '160px 1fr 80px 120px 100px 100px 100px',
                padding: '10px 16px', alignItems: 'center',
                borderBottom: idx < aging.length - 1 ? '1px solid var(--border-light)' : 'none',
              }}>
                <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)' }}>
                  {row.contract_number}
                </div>
                <div>
                  <div style={{ fontSize: '13px', color: 'var(--text-primary)' }}>{row.customer_name || row.customer_id}</div>
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontFamily: 'monospace' }}>{row.customer_id}</div>
                </div>
                <span style={{ textAlign: 'right', fontSize: '12px', color: 'var(--text-secondary)', fontVariantNumeric: 'tabular-nums' }}>{row.credit_days} дн.</span>
                <span style={{ textAlign: 'right', fontSize: '13px', fontWeight: 700, color: overdue > 0 ? '#DC2626' : 'var(--text-primary)', fontVariantNumeric: 'tabular-nums' }}>
                  {fmt(Number(row.balance))} ₴
                </span>
                <span style={{ textAlign: 'right', fontSize: '12px', color: 'var(--text-secondary)', fontVariantNumeric: 'tabular-nums' }}>
                  {row.days_since_shipment ?? '—'}
                </span>
                <span style={{ textAlign: 'right', fontSize: '13px', fontWeight: overdue > 0 ? 700 : 400, color: overdue > 0 ? cfg.color : 'var(--text-muted)', fontVariantNumeric: 'tabular-nums' }}>
                  {overdue > 0 ? `${overdue} дн.` : '—'}
                </span>
                <div style={{ display: 'flex', justifyContent: 'center' }}>
                  {overdue > 0 && <AlertCircle size={14} color={cfg.color} />}
                  <span style={{ marginLeft: '4px', fontSize: '11px', fontWeight: 600, color: overdue > 0 ? cfg.color : 'var(--text-muted)' }}>{cfg.label}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
