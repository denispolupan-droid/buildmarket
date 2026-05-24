import { createClient } from '@supabase/supabase-js';
import { createSupabaseServer } from '../../../../lib/supabase-server';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { ArrowRight, Plus } from 'lucide-react';

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

function fmt(n: number) { return n.toLocaleString('uk-UA', { maximumFractionDigits: 0 }); }

export default async function ReceiptsPage() {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || user.user_metadata?.role !== 'admin') redirect('/');

  const { data: receipts } = await db
    .from('acc_documents')
    .select('id, doc_number, doc_date, status, total_cost, notes, parent_doc_id, landed_cost_total, warehouse:warehouse_id(name), supplier:supplier_id(name)')
    .in('doc_type', ['receipt', 'stock_in'])
    .eq('status', 'confirmed')
    .order('doc_date', { ascending: false })
    .limit(300);

  const rows = receipts ?? [];
  const totalCost   = rows.reduce((s, r) => s + Number(r.total_cost ?? 0), 0);
  const totalLanded = rows.reduce((s, r) => s + Number(r.landed_cost_total ?? 0), 0);

  return (
    <div style={{ padding: '28px 32px', maxWidth: '1200px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '24px' }}>
        <div>
          <h1 style={{ fontSize: '22px', fontWeight: 800, color: 'var(--text-primary)', margin: 0 }}>Приходи товару</h1>
          <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginTop: '4px' }}>Всі підтверджені приходи на склад</p>
        </div>
        <Link href="/admin/accounting/documents/new?type=stock_in"
          style={{ display: 'flex', alignItems: 'center', gap: '6px', height: '38px', padding: '0 18px', borderRadius: '8px', border: 'none', background: '#1E3A5F', color: '#fff', fontSize: '13px', fontWeight: 700, textDecoration: 'none' }}>
          <Plus size={15} /> Новий прихід
        </Link>
      </div>

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: '12px', marginBottom: '20px' }}>
        {[
          { label: 'Всього приходів',    value: rows.length,               suffix: 'шт', color: 'var(--brand-blue)', accent: '#4880B8' },
          { label: 'Сума закупівель',    value: `${fmt(totalCost)} ₴`,    suffix: '',   color: '#16A34A',           accent: '#16A34A' },
          { label: 'Landed Cost всього', value: `${fmt(totalLanded)} ₴`,  suffix: '',   color: '#7C3AED',           accent: '#7C3AED' },
        ].map(s => (
          <div key={s.label} style={{ padding: '14px 18px', borderRadius: '10px', background: 'var(--bg-card)', border: '1px solid var(--border)', borderLeft: `3px solid ${s.accent}` }}>
            <div style={{ fontSize: '22px', fontWeight: 800, color: s.color }}>{s.value} <span style={{ fontSize: '13px', fontWeight: 500 }}>{s.suffix}</span></div>
            <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>{s.label}</div>
          </div>
        ))}
      </div>

      {rows.length === 0 ? (
        <div style={{ padding: '64px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '14px', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '12px' }}>
          Немає приходів товару. Вони створюються через розділ Закупівля → Замовлення.
        </div>
      ) : (
        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '12px', overflow: 'hidden' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '130px 120px 1fr 130px 120px 120px 40px', padding: '8px 16px', background: 'var(--bg-soft)', borderBottom: '1px solid var(--border)', fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', columnGap: '16px' }}>
            <span>Документ</span><span>Дата</span><span>Примітка</span>
            <span>Склад</span>
            <span style={{ textAlign: 'right' }}>Собівартість</span>
            <span style={{ textAlign: 'right' }}>Landed Cost</span>
            <span />
          </div>
          {rows.map((r, idx) => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const wh  = (r.warehouse as any)?.name ?? '—';
            const lc  = Number(r.landed_cost_total ?? 0);
            return (
              <Link key={r.id} href={`/admin/procurement/receipts/${r.id}`} style={{
                display: 'grid', gridTemplateColumns: '130px 120px 1fr 130px 120px 120px 40px',
                padding: '11px 16px', alignItems: 'center', textDecoration: 'none',
                borderBottom: idx < rows.length - 1 ? '1px solid var(--border-light)' : 'none',
                columnGap: '16px', cursor: 'pointer',
              }}>
                <div>
                  <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)' }}>{r.doc_number}</div>
                  {r.parent_doc_id && (
                    <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>до замовлення</div>
                  )}
                </div>
                <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                  {new Date(r.doc_date).toLocaleDateString('uk-UA')}
                </span>
                <span style={{ fontSize: '12px', color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {r.notes || '—'}
                </span>
                <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>{wh}</span>
                <span style={{ textAlign: 'right', fontSize: '13px', fontWeight: 600, color: '#15803D' }}>
                  {r.total_cost ? `${fmt(Number(r.total_cost))} ₴` : '—'}
                </span>
                <span style={{ textAlign: 'right', fontSize: '13px', fontWeight: lc > 0 ? 700 : 400, color: lc > 0 ? '#7C3AED' : 'var(--text-muted)' }}>
                  {lc > 0 ? `+${fmt(lc)} ₴` : '—'}
                </span>
                <div style={{ display: 'flex', justifyContent: 'center', color: 'var(--text-muted)' }}>
                  <ArrowRight size={15} />
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
