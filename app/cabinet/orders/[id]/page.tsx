import { createClient } from '@supabase/supabase-js';
import { createSupabaseServer } from '../../../../lib/supabase-server';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ChevronLeft } from 'lucide-react';

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

const card: React.CSSProperties = {
  background: 'var(--bg-card)', border: '1px solid var(--border)',
  borderRadius: '14px', marginBottom: '16px',
};
const cardHeader: React.CSSProperties = {
  padding: '14px 20px', borderBottom: '1px solid var(--border)',
  fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)',
};
const row: React.CSSProperties = {
  display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
  padding: '9px 0', borderBottom: '1px solid var(--border-light)',
};
const label: React.CSSProperties = { fontSize: '12px', color: 'var(--text-muted)', minWidth: '140px' };
const value: React.CSSProperties = { fontSize: '13px', color: 'var(--text-primary)', fontWeight: 500, textAlign: 'right' };

export default async function CabinetOrderDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();

  const { data: customer } = await serviceClient
    .from('customers').select('id').eq('auth_user_id', user!.id).single();

  if (!customer) notFound();

  const { data: order } = await serviceClient
    .from('orders')
    .select('*')
    .eq('id', id)
    .eq('partner_code', customer.id)
    .single();

  if (!order) notFound();

  const st = STATUS[order.status] ?? { label: order.status, color: '#64748B', bg: '#F1F5F9' };
  const items = (order.items ?? []) as { name: string; qty: number; price: number; sku?: string }[];
  const totalSell = items.reduce((s, i) => s + (i.price ?? 0) * i.qty, 0);

  return (
    <div style={{ padding: '28px 32px 64px', maxWidth: '760px' }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '24px' }}>
        <Link href="/cabinet/orders" style={{ display: 'flex', alignItems: 'center', gap: '4px', color: 'var(--text-muted)', fontSize: '13px', textDecoration: 'none' }}>
          <ChevronLeft size={15} /> Назад
        </Link>
        <h1 style={{ fontSize: '20px', fontWeight: 800, color: 'var(--text-primary)', margin: 0 }}>
          Замовлення #{order.order_number}
        </h1>
        <span style={{ padding: '3px 12px', borderRadius: '20px', fontSize: '12px', fontWeight: 600, color: st.color, background: st.bg }}>
          {st.label}
        </span>
      </div>

      {/* Items */}
      <div style={card}>
        <div style={cardHeader}>Товари</div>
        <div style={{ padding: '0 20px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 60px 90px 90px', gap: '8px', padding: '8px 0', fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', borderBottom: '1px solid var(--border)' }}>
            <span>Назва</span>
            <span style={{ textAlign: 'center' }}>К-сть</span>
            <span style={{ textAlign: 'right' }}>Ціна</span>
            <span style={{ textAlign: 'right' }}>Сума</span>
          </div>
          {items.map((item, i) => (
            <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 60px 90px 90px', gap: '8px', padding: '10px 0', borderBottom: i < items.length - 1 ? '1px solid var(--border-light)' : 'none', alignItems: 'center' }}>
              <div>
                <div style={{ fontSize: '13px', color: 'var(--text-primary)', fontWeight: 500 }}>{item.name}</div>
                {item.sku && <div style={{ fontSize: '10px', color: 'var(--text-muted)', fontFamily: 'monospace' }}>{item.sku}</div>}
              </div>
              <div style={{ textAlign: 'center', fontSize: '13px', color: 'var(--text-secondary)' }}>{item.qty}</div>
              <div style={{ textAlign: 'right', fontSize: '13px', color: 'var(--text-secondary)' }}>{item.price ?? 0} ₴</div>
              <div style={{ textAlign: 'right', fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>
                {((item.price ?? 0) * item.qty).toFixed(2)} ₴
              </div>
            </div>
          ))}
          <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '10px 0', fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)' }}>
            Разом: {totalSell.toFixed(2)} ₴
          </div>
        </div>
      </div>

      {/* Delivery */}
      <div style={card}>
        <div style={cardHeader}>Отримувач та доставка</div>
        <div style={{ padding: '4px 20px 12px' }}>
          {[
            ['Отримувач',   order.contact],
            ['Телефон',     order.phone],
            ['Місто',       order.delivery_city_name],
            ['Відділення',  order.delivery_address?.split(', ').slice(1).join(', ') || order.delivery_address],
            ['Оплата',      order.payment_type === 'cod' ? 'Накладений платіж' : 'Вже оплачено'],
          ].map(([lbl, val]) => val ? (
            <div key={lbl} style={row}>
              <span style={label}>{lbl}</span>
              <span style={value}>{val}</span>
            </div>
          ) : null)}
        </div>
      </div>

      {/* TTN */}
      {order.tracking_number ? (
        <div style={card}>
          <div style={cardHeader}>ТТН Нової Пошти</div>
          <div style={{ padding: '16px 20px' }}>
            <div style={{ fontSize: '28px', fontWeight: 800, color: '#1E3A5F', letterSpacing: '1px', marginBottom: '6px' }}>
              {order.tracking_number}
            </div>
            <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
              Передайте цей номер клієнту для відстеження посилки
            </div>
          </div>
        </div>
      ) : (
        <div style={{ ...card, padding: '16px 20px', display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#F59E0B', flexShrink: 0 }} />
          <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
            ТТН ще не створено — замовлення опрацьовується
          </span>
        </div>
      )}

      {/* Comment */}
      {order.comment && (
        <div style={card}>
          <div style={cardHeader}>Коментар</div>
          <div style={{ padding: '14px 20px', fontSize: '13px', color: 'var(--text-secondary)' }}>{order.comment}</div>
        </div>
      )}

      {/* Meta */}
      <div style={{ fontSize: '12px', color: 'var(--text-muted)', textAlign: 'right' }}>
        Замовлення від {new Date(order.created_at).toLocaleDateString('uk-UA', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Kyiv' })}
      </div>
    </div>
  );
}
