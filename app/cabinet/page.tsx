import { createClient } from '@supabase/supabase-js';
import { createSupabaseServer } from '../../lib/supabase-server';
import { Wallet, ShoppingBag, TrendingUp, AlertCircle } from 'lucide-react';
import Link from 'next/link';

const serviceClient = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

export default async function CabinetPage() {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();

  const { data: customer } = await serviceClient
    .from('customers')
    .select('id, name, balance, balance_held, created_at')
    .eq('auth_user_id', user!.id)
    .single();

  const { data: recentOrders } = customer ? await serviceClient
    .from('orders')
    .select('id, order_number, status, total_price, created_at, tracking_number')
    .eq('partner_code', customer.id)
    .order('created_at', { ascending: false })
    .limit(5) : { data: [] };

  const { data: recentTx } = customer ? await serviceClient
    .from('partner_balance_transactions')
    .select('id, tx_type, amount, description, created_at')
    .eq('customer_id', customer.id)
    .order('created_at', { ascending: false })
    .limit(5) : { data: [] };

  const balance        = Number(customer?.balance ?? 0);
  const balanceHeld    = Number(customer?.balance_held ?? 0);
  const balanceAvail   = balance - balanceHeld;
  const totalOrders    = recentOrders?.length ?? 0;

  const TX_LABELS: Record<string, string> = {
    top_up:        'Поповнення',
    charge:        'Списання (замовлення)',
    cod_credit:    'Нарахування COD',
    np_fee:        'Комісія НП',
    return_refund: 'Повернення товару',
    return_fee:    'Повернення доставка',
    payout:        'Виплата',
    goods_offset:  'Товарний залік',
    adjustment:    'Коригування',
  };

  const STATUS_LABEL: Record<string, { label: string; color: string }> = {
    new:       { label: 'Нове',         color: '#4880B8' },
    confirmed: { label: 'Підтверджено', color: '#15803D' },
    shipped:   { label: 'Відправлено',  color: '#B45309' },
    delivered: { label: 'Доставлено',   color: '#15803D' },
    cancelled: { label: 'Скасовано',    color: '#DC2626' },
  };

  return (
    <div style={{ padding: '28px 32px 64px', maxWidth: '1100px' }}>
      <div style={{ marginBottom: '28px' }}>
        <h1 style={{ fontSize: '22px', fontWeight: 800, color: 'var(--text-primary)', margin: 0 }}>
          Вітаємо, {customer?.name ?? 'Партнере'}!
        </h1>
        <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginTop: '4px' }}>
          Особистий кабінет дропшипера FIXLINE
        </p>
      </div>

      {/* Повідомлення якщо балансу немає */}
      {balance === 0 && (
        <div style={{
          display: 'flex', gap: '12px', alignItems: 'flex-start',
          background: '#FEF3C7', border: '1px solid #FCD34D',
          borderRadius: '12px', padding: '16px 20px', marginBottom: '24px',
        }}>
          <AlertCircle size={18} color="#B45309" style={{ flexShrink: 0, marginTop: '1px' }} />
          <div>
            <div style={{ fontSize: '14px', fontWeight: 700, color: '#B45309' }}>
              Поповніть баланс, щоб розпочати
            </div>
            <div style={{ fontSize: '13px', color: '#92400E', marginTop: '4px' }}>
              Для оформлення замовлень потрібен баланс не менше закупочної ціни товару.
              Реквізити для поповнення — у розділі{' '}
              <Link href="/cabinet/balance" style={{ color: '#B45309', fontWeight: 700 }}>Баланс</Link>.
            </div>
          </div>
        </div>
      )}

      {/* Summary cards */}
      <div className="cabinet-grid-3">
        {[
          {
            label: 'Доступний баланс',
            value: `${balanceAvail.toFixed(2)} ₴`,
            sub:   balanceHeld > 0 ? `${balanceHeld.toFixed(2)} ₴ зарезервовано` : 'Готовий до використання',
            icon: Wallet, color: balanceAvail >= 0 ? '#15803D' : '#DC2626', bg: '#F0FDF4',
          },
          {
            label: 'Замовлень',
            value: String(totalOrders),
            sub:   'Останні 5 замовлень',
            icon: ShoppingBag, color: '#4880B8', bg: '#EFF6FF',
          },
          {
            label: 'Загальний баланс',
            value: `${balance.toFixed(2)} ₴`,
            sub:   'Включно з резервом',
            icon: TrendingUp, color: '#6366F1', bg: '#EEF2FF',
          },
        ].map(card => {
          const Icon = card.icon;
          return (
            <div key={card.label} style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '14px', padding: '20px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '8px' }}>
                    {card.label}
                  </div>
                  <div style={{ fontSize: '24px', fontWeight: 800, color: card.color }}>{card.value}</div>
                  <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '5px' }}>{card.sub}</div>
                </div>
                <div style={{ width: '40px', height: '40px', borderRadius: '10px', background: card.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <Icon size={18} color={card.color} />
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="cabinet-grid-2">

        {/* Recent orders */}
        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '14px', overflow: 'hidden' }}>
          <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h2 style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>Останні замовлення</h2>
            <Link href="/cabinet/orders" style={{ fontSize: '13px', color: '#4880B8', textDecoration: 'none' }}>Всі →</Link>
          </div>
          {!recentOrders?.length ? (
            <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '13px' }}>
              Замовлень ще немає.{' '}
              <Link href="/cabinet/orders/new" style={{ color: '#4880B8' }}>Оформити перше</Link>
            </div>
          ) : (
            recentOrders.map((o, i) => {
              const st = STATUS_LABEL[o.status] ?? { label: o.status, color: '#64748B' };
              return (
                <div key={o.id} style={{ padding: '12px 20px', borderBottom: i < recentOrders.length - 1 ? '1px solid var(--border-light)' : 'none', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>#{o.order_number}</div>
                    <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>
                      {new Date(o.created_at).toLocaleDateString('uk-UA')}
                      {o.tracking_number && ` · ТТН: ${o.tracking_number}`}
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)' }}>{o.total_price} ₴</div>
                    <div style={{ fontSize: '11px', fontWeight: 600, color: st.color }}>{st.label}</div>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Recent transactions */}
        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '14px', overflow: 'hidden' }}>
          <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h2 style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>Рух балансу</h2>
            <Link href="/cabinet/balance" style={{ fontSize: '13px', color: '#4880B8', textDecoration: 'none' }}>Детально →</Link>
          </div>
          {!recentTx?.length ? (
            <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '13px' }}>
              Транзакцій ще немає.{' '}
              <Link href="/cabinet/balance" style={{ color: '#4880B8' }}>Поповнити баланс</Link>
            </div>
          ) : (
            recentTx.map((tx, i) => (
              <div key={tx.id} style={{ padding: '12px 20px', borderBottom: i < recentTx.length - 1 ? '1px solid var(--border-light)' : 'none', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ fontSize: '13px', fontWeight: 500, color: 'var(--text-primary)' }}>
                    {TX_LABELS[tx.tx_type] ?? tx.tx_type}
                  </div>
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>
                    {new Date(tx.created_at).toLocaleDateString('uk-UA')}
                  </div>
                </div>
                <div style={{ fontSize: '14px', fontWeight: 700, color: tx.amount >= 0 ? '#15803D' : '#DC2626' }}>
                  {tx.amount >= 0 ? '+' : ''}{tx.amount.toFixed(2)} ₴
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
