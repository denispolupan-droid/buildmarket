import { createClient } from '@supabase/supabase-js';
import { createSupabaseServer } from '../../../../lib/supabase-server';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, AlertCircle } from 'lucide-react';

const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

function fmt(n: number) { return n.toLocaleString('uk-UA', { maximumFractionDigits: 0 }); }

const BUCKET_CFG: Record<string, { label: string; color: string; bg: string }> = {
  current: { label: 'Поточна',  color: '#15803D', bg: '#F0FDF4' },
  '1_30':  { label: '1–30 дн.', color: '#B45309', bg: '#FEF3C7' },
  '31_60': { label: '31–60 дн.',color: '#EA580C', bg: '#FFF7ED' },
  '61_90': { label: '61–90 дн.',color: '#DC2626', bg: '#FEF2F2' },
  '90_plus':{ label: '90+ дн.', color: '#7F1D1D', bg: '#FEE2E2' },
};

export default async function AgingPage() {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || user.user_metadata?.role !== 'admin') redirect('/');

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
    <div style={{ padding: '28px 32px', maxWidth: '1200px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '24px' }}>
        <Link href="/admin/finance" style={{ display: 'flex', alignItems: 'center', color: 'var(--text-secondary)', textDecoration: 'none' }}>
          <ArrowLeft size={16} />
        </Link>
        <div>
          <h1 style={{ fontSize: '22px', fontWeight: 800, color: 'var(--text-primary)', margin: 0 }}>Реєстр старіння боргу</h1>
          <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginTop: '4px' }}>
            AR Aging — станом на {new Date().toLocaleDateString('uk-UA')}
          </p>
        </div>
      </div>

      {/* Bucket summary */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '10px', marginBottom: '20px' }}>
        {Object.entries(BUCKET_CFG).map(([key, cfg]) => {
          const bRows = byBucket[key] ?? [];
          const bTotal = bRows.reduce((s, r) => s + Number(r.balance), 0);
          return (
            <div key={key} style={{ padding: '14px 16px', borderRadius: '10px', background: cfg.bg, border: `1px solid ${cfg.color}22` }}>
              <div style={{ fontSize: '18px', fontWeight: 800, color: cfg.color }}>{fmt(bTotal)} ₴</div>
              <div style={{ fontSize: '11px', color: cfg.color, opacity: 0.8, marginTop: '2px' }}>{cfg.label}</div>
              <div style={{ fontSize: '11px', color: cfg.color, opacity: 0.6 }}>{bRows.length} договорів</div>
            </div>
          );
        })}
      </div>

      {/* Total */}
      <div style={{ padding: '14px 20px', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '10px', marginBottom: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)' }}>Загальна дебіторська заборгованість</span>
        <span style={{ fontSize: '22px', fontWeight: 800, color: total > 0 ? '#DC2626' : '#15803D' }}>{fmt(total)} ₴</span>
      </div>

      {/* Table */}
      {aging.length === 0 ? (
        <div style={{ padding: '64px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '14px', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '12px' }}>
          Немає активної дебіторської заборгованості
        </div>
      ) : (
        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '12px', overflow: 'hidden' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '160px 1fr 80px 120px 100px 100px 100px', padding: '8px 16px', background: 'var(--bg-soft)', borderBottom: '1px solid var(--border)', fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
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
                background: overdue > 0 ? `${cfg.bg}88` : 'transparent',
              }}>
                <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)' }}>
                  {row.contract_number}
                </div>
                <div>
                  <div style={{ fontSize: '13px', color: 'var(--text-primary)' }}>{row.customer_name || row.customer_id}</div>
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontFamily: 'monospace' }}>{row.customer_id}</div>
                </div>
                <span style={{ textAlign: 'right', fontSize: '12px', color: 'var(--text-secondary)' }}>{row.credit_days} дн.</span>
                <span style={{ textAlign: 'right', fontSize: '13px', fontWeight: 700, color: '#DC2626' }}>
                  {fmt(Number(row.balance))} ₴
                </span>
                <span style={{ textAlign: 'right', fontSize: '12px', color: 'var(--text-secondary)' }}>
                  {row.days_since_shipment ?? '—'}
                </span>
                <span style={{ textAlign: 'right', fontSize: '13px', fontWeight: overdue > 0 ? 700 : 400, color: overdue > 0 ? cfg.color : 'var(--text-muted)' }}>
                  {overdue > 0 ? `${overdue} дн.` : '—'}
                </span>
                <div style={{ display: 'flex', justifyContent: 'center' }}>
                  {overdue > 0 && <AlertCircle size={14} color={cfg.color} />}
                  <span style={{ marginLeft: '4px', fontSize: '11px', fontWeight: 600, color: cfg.color }}>{cfg.label}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
