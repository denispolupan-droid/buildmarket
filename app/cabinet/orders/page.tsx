import { createClient } from '@supabase/supabase-js';
import { createSupabaseServer } from '../../../lib/supabase-server';
import Link from 'next/link';
import { Plus, ChevronRight } from 'lucide-react';

const serviceClient = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

const STATUS: Record<string, { label: string; color: string; bg: string }> = {
  new:       { label: 'Нове',         color: '#1E3A5F', bg: '#EFF4FF' },
  confirmed: { label: 'Підтверджено', color: '#15803D', bg: '#DCFCE7' },
  shipped:   { label: 'Відправлено',  color: '#B45309', bg: '#FEF3C7' },
  delivered: { label: 'Доставлено',   color: '#15803D', bg: '#DCFCE7' },
  cancelled: { label: 'Скасовано',    color: '#DC2626', bg: '#FEE2E2' },
};

export default async function CabinetOrdersPage() {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();

  const { data: customer } = await serviceClient
    .from('customers').select('id').eq('auth_user_id', user!.id).single();

  const { data: orders } = customer ? await serviceClient
    .from('orders')
    .select('id, order_number, status, total_price, created_at, tracking_number, items')
    .eq('partner_code', customer.id)
    .order('created_at', { ascending: false })
    .limit(100) : { data: [] };

  return (
    <div style={{ padding: '28px 32px 64px', maxWidth: '1100px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '28px' }}>
        <div>
          <h1 style={{ fontSize: '22px', fontWeight: 800, color: 'var(--text-primary)', margin: 0 }}>Мої замовлення</h1>
          <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginTop: '4px' }}>{orders?.length ?? 0} замовлень</p>
        </div>
        <Link href="/cabinet/orders/new" style={{
          display: 'inline-flex', alignItems: 'center', gap: '7px',
          height: '40px', padding: '0 20px', borderRadius: '9px',
          background: '#1E3A5F', color: '#fff', fontSize: '13px', fontWeight: 700, textDecoration: 'none',
        }}>
          <Plus size={15} /> Нове замовлення
        </Link>
      </div>

      <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '14px', overflow: 'hidden' }}>
        {!orders?.length ? (
          <div style={{ padding: '60px', textAlign: 'center', color: 'var(--text-muted)' }}>
            <div style={{ fontSize: '32px', marginBottom: '12px' }}>📦</div>
            <div style={{ fontSize: '15px', fontWeight: 600, marginBottom: '8px', color: 'var(--text-primary)' }}>Замовлень ще немає</div>
            <Link href="/cabinet/orders/new" style={{ color: '#4880B8', fontSize: '13px' }}>Оформити перше замовлення →</Link>
          </div>
        ) : (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: '80px 1fr 100px 160px 110px 32px', padding: '10px 20px', background: 'var(--bg-soft)', borderBottom: '1px solid var(--border)', fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              <span>№</span><span>Товари</span><span>Сума</span><span>ТТН</span><span style={{ textAlign: 'center' }}>Статус</span><span />
            </div>
            {orders.map((order, i) => {
              const st = STATUS[order.status] ?? { label: order.status, color: '#64748B', bg: '#F1F5F9' };
              const items = order.items as { name: string; qty: number }[] ?? [];
              return (
                <Link
                  key={order.id}
                  href={`/cabinet/orders/${order.id}`}
                  style={{ display: 'grid', gridTemplateColumns: '80px 1fr 100px 160px 110px 32px', padding: '14px 20px', borderBottom: i < orders.length - 1 ? '1px solid var(--border-light)' : 'none', alignItems: 'center', textDecoration: 'none', color: 'inherit', cursor: 'pointer' }}
                >
                  <div>
                    <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)' }}>#{order.order_number}</div>
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{new Date(order.created_at).toLocaleDateString('uk-UA')}</div>
                  </div>
                  <div style={{ paddingRight: '16px' }}>
                    {items.slice(0, 2).map((item, ii) => (
                      <div key={ii} style={{ fontSize: '12px', color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {item.name} × {item.qty}
                      </div>
                    ))}
                    {items.length > 2 && <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>+{items.length - 2} поз.</div>}
                  </div>
                  <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)' }}>{order.total_price} ₴</div>
                  <div style={{ fontSize: '12px', fontFamily: 'monospace', color: order.tracking_number ? '#4880B8' : 'var(--text-muted)' }}>
                    {order.tracking_number ?? '—'}
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'center' }}>
                    <span style={{ padding: '3px 10px', borderRadius: '20px', fontSize: '11px', fontWeight: 600, color: st.color, background: st.bg }}>{st.label}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'center', color: 'var(--text-muted)' }}>
                    <ChevronRight size={15} />
                  </div>
                </Link>
              );
            })}
          </>
        )}
      </div>
    </div>
  );
}
