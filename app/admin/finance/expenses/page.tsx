import { createClient } from '@supabase/supabase-js';
import { createSupabaseServer } from '../../../../lib/supabase-server';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

const EXPENSE_LABELS: Record<string, { label: string; color: string; bg: string }> = {
  logistics:       { label: 'Доставка',         color: '#1E3A5F', bg: '#EFF4FF' },
  loading:         { label: 'Навантаження',      color: '#0E7490', bg: '#ECFEFF' },
  customs:         { label: 'Мито / брокер',     color: '#7C3AED', bg: '#F5F3FF' },
  packaging:       { label: 'Пакування',         color: '#B45309', bg: '#FEF3C7' },
  acquiring_fee:   { label: 'Комісія еквайрингу',color: '#EA580C', bg: '#FFF7ED' },
  marketplace_fee: { label: 'Комісія маркетплейсу', color: '#DC2626', bg: '#FEF2F2' },
  rent:            { label: 'Оренда',            color: '#64748B', bg: '#F8FAFC' },
  salary:          { label: 'Зарплата',          color: '#15803D', bg: '#F0FDF4' },
  marketing:       { label: 'Маркетинг',         color: '#BE185D', bg: '#FDF2F8' },
  opex:            { label: 'Інші витрати',      color: '#64748B', bg: '#F8FAFC' },
};

function fmt(n: number) { return n.toLocaleString('uk-UA', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }

export default async function ExpensesPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || user.user_metadata?.role !== 'admin') redirect('/');

  const { from, to } = await searchParams;
  const today = new Date().toISOString().slice(0, 10);
  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10);
  const dateFrom = from ?? monthStart;
  const dateTo   = to   ?? today;

  let query = db.from('expenses').select('*').order('business_date', { ascending: false }).order('created_at', { ascending: false });
  if (dateFrom) query = query.gte('business_date', dateFrom);
  if (dateTo)   query = query.lte('business_date', dateTo);

  const { data: expenses } = await query.limit(500);

  const rows = expenses ?? [];
  const total = rows.reduce((s, r) => s + Number(r.amount), 0);

  // Grouped by type
  const byType = rows.reduce<Record<string, number>>((acc, r) => {
    acc[r.expense_type] = (acc[r.expense_type] ?? 0) + Number(r.amount);
    return acc;
  }, {});

  return (
    <div style={{ padding: '28px 32px', maxWidth: '1200px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '24px' }}>
        <Link href="/admin/finance" style={{ display: 'flex', alignItems: 'center', color: 'var(--text-secondary)', textDecoration: 'none' }}>
          <ArrowLeft size={16} />
        </Link>
        <div>
          <h1 style={{ fontSize: '22px', fontWeight: 800, color: 'var(--text-primary)', margin: 0 }}>Витрати</h1>
          <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginTop: '4px' }}>
            Всі операційні витрати зафіксовані в системі
          </p>
        </div>
      </div>

      {/* Date filter */}
      <form method="GET" style={{ display: 'flex', gap: '10px', alignItems: 'flex-end', marginBottom: '20px', flexWrap: 'wrap' }}>
        {[
          { name: 'from', label: 'З', value: dateFrom },
          { name: 'to',   label: 'По', value: dateTo },
        ].map(f => (
          <div key={f.name}>
            <label style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', display: 'block', marginBottom: '4px', textTransform: 'uppercase' }}>{f.label}</label>
            <input type="date" name={f.name} defaultValue={f.value}
              style={{ height: '36px', padding: '0 10px', border: '1.5px solid var(--border)', borderRadius: '8px', fontSize: '13px', outline: 'none', color: 'var(--text-primary)', background: 'var(--bg-soft)' }} />
          </div>
        ))}
        <button type="submit" style={{ height: '36px', padding: '0 18px', borderRadius: '8px', border: 'none', background: '#1E3A5F', color: '#fff', fontSize: '13px', fontWeight: 700, cursor: 'pointer' }}>
          Показати
        </button>
      </form>

      {/* Summary by type */}
      <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginBottom: '20px' }}>
        <div style={{ padding: '12px 18px', borderRadius: '10px', background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
          <div style={{ fontSize: '20px', fontWeight: 800, color: 'var(--text-primary)' }}>{fmt(total)} ₴</div>
          <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Всього витрат</div>
        </div>
        {Object.entries(byType).sort((a, b) => b[1] - a[1]).map(([type, amount]) => {
          const cfg = EXPENSE_LABELS[type] ?? { label: type, color: '#64748B', bg: '#F8FAFC' };
          return (
            <div key={type} style={{ padding: '12px 18px', borderRadius: '10px', background: cfg.bg }}>
              <div style={{ fontSize: '18px', fontWeight: 800, color: cfg.color }}>{fmt(amount)} ₴</div>
              <div style={{ fontSize: '11px', color: cfg.color, opacity: 0.8 }}>{cfg.label}</div>
            </div>
          );
        })}
      </div>

      {/* Table */}
      {rows.length === 0 ? (
        <div style={{ padding: '64px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '14px', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '12px' }}>
          Немає витрат за обраний період
        </div>
      ) : (
        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '12px', overflow: 'hidden' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '100px 130px 1fr 120px 130px', padding: '8px 16px', background: 'var(--bg-soft)', borderBottom: '1px solid var(--border)', fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
            <span>Дата</span><span>Категорія</span><span>Опис</span><span>Спосіб</span><span style={{ textAlign: 'right' }}>Сума</span>
          </div>
          {rows.map((row, idx) => {
            const cfg = EXPENSE_LABELS[row.expense_type] ?? { label: row.expense_type, color: '#64748B', bg: '#F8FAFC' };
            const pmLabel: Record<string, string> = { bank: '🏦 Банк', cash: '💵 Готівка', acquiring: '💳 Еквайринг' };
            return (
              <div key={row.id} style={{ display: 'grid', gridTemplateColumns: '100px 130px 1fr 120px 130px', padding: '10px 16px', alignItems: 'center', borderBottom: idx < rows.length - 1 ? '1px solid var(--border-light)' : 'none' }}>
                <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                  {new Date(row.business_date).toLocaleDateString('uk-UA')}
                </span>
                <span style={{ padding: '2px 8px', borderRadius: '20px', fontSize: '11px', fontWeight: 600, color: cfg.color, background: cfg.bg, display: 'inline-block' }}>
                  {cfg.label}
                </span>
                <div style={{ fontSize: '13px', color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {row.description}
                  {row.counterparty && <span style={{ color: 'var(--text-muted)', marginLeft: '6px', fontSize: '12px' }}>· {row.counterparty}</span>}
                </div>
                <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>{pmLabel[row.payment_method] ?? row.payment_method}</span>
                <span style={{ textAlign: 'right', fontSize: '13px', fontWeight: 700, color: '#DC2626' }}>
                  −{fmt(Number(row.amount))} ₴
                </span>
              </div>
            );
          })}
          <div style={{ padding: '10px 16px', borderTop: '2px solid var(--border)', display: 'flex', justifyContent: 'space-between', fontSize: '14px', fontWeight: 800, color: 'var(--text-primary)' }}>
            <span>Разом за період</span>
            <span style={{ color: '#DC2626' }}>−{fmt(total)} ₴</span>
          </div>
        </div>
      )}
    </div>
  );
}
