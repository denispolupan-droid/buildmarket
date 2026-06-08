import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { createSupabaseServer } from '../../lib/supabase-server';

export const metadata: Metadata = {
  title: 'Особистий кабінет | FIXLINE',
  robots: { index: false, follow: false },
};
import { createClient } from '@supabase/supabase-js';
import { getRole } from '../../lib/user-role';

const serviceClient = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);
import Footer from '../components/Footer';
import { Package, ShoppingBag, User, MapPin, CreditCard, XCircle, Truck } from 'lucide-react';
import RepeatOrderButton from './RepeatOrderButton';

const STATUS_LABEL: Record<string, { label: string; color: string; bg: string }> = {
  new:       { label: 'Нове',         color: '#1E3A5F', bg: '#EFF4FF' },
  confirmed: { label: 'Підтверджено', color: '#15803D', bg: '#DCFCE7' },
  shipped:   { label: 'Відправлено',  color: '#B45309', bg: '#FEF3C7' },
  delivered: { label: 'Доставлено',   color: '#15803D', bg: '#DCFCE7' },
  cancelled: { label: 'Скасовано',    color: '#DC2626', bg: '#FEE2E2' },
};

const DELIVERY_LABEL: Record<string, string> = {
  nova:    'Нова Пошта',
  kharkiv: 'Доставка по Харкову',
  pickup:  'Самовивіз',
};

const PAYMENT_LABEL: Record<string, string> = {
  invoice: 'Безготівковий розрахунок',
  cod:     'Оплата при отриманні',
};

type OrderItem = {
  sku: string;
  name: string;
  brand: string;
  qty: number;
  price: number;
};

type Order = {
  id: string;
  order_number: number;
  created_at: string;
  status: string;
  total_price: number;
  delivery_type: string;
  delivery_subtype: string | null;
  delivery_address: string | null;
  payment_type: string;
  contact: string;
  phone: string;
  tracking_number: string | null;
  items: OrderItem[];
};

export default async function AccountPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string }>;
}) {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) redirect('/login?next=/account');
  if (getRole(user) === 'dropship') redirect('/cabinet');

  const { filter } = await searchParams;

  // Баланс клієнта (якщо є запис в customers)
  const { data: customer } = await serviceClient
    .from('customers')
    .select('id, balance, balance_held, type')
    .eq('auth_user_id', user.id)
    .single();

  const balance      = Number(customer?.balance      ?? 0);
  const balanceHeld  = Number(customer?.balance_held ?? 0);
  const balanceAvail = balance - balanceHeld;

  const { data: orders } = await supabase
    .from('orders')
    .select('*')
    .order('created_at', { ascending: false });

  const companyName = user.user_metadata?.company_name as string | undefined;

  const totalCount     = orders?.length ?? 0;
  const activeCount    = orders?.filter(o => ['new','confirmed','shipped'].includes(o.status)).length ?? 0;
  const shippedCount   = orders?.filter(o => o.status === 'shipped').length ?? 0;
  const doneCount      = orders?.filter(o => o.status === 'delivered').length ?? 0;
  const cancelledCount = orders?.filter(o => o.status === 'cancelled').length ?? 0;

  const filteredOrders = orders?.filter(o => {
    if (filter === 'active')    return ['new','confirmed','shipped'].includes(o.status);
    if (filter === 'shipped')   return o.status === 'shipped';
    if (filter === 'delivered') return o.status === 'delivered';
    if (filter === 'cancelled') return o.status === 'cancelled';
    return true;
  }) ?? [];

  return (
    <>
      <div style={{ background: 'var(--bg-soft)', minHeight: '100vh' }}>
        <div className="mobile-pad" style={{ maxWidth: '960px', margin: '0 auto', padding: '40px 32px 64px' }}>

          {/* Header */}
          <div style={{ marginBottom: '32px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                <div style={{
                  width: '48px', height: '48px', borderRadius: '12px',
                  background: '#1E3A5F', color: '#fff',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: '20px', fontWeight: 800, flexShrink: 0,
                }}>
                  {(companyName ?? user.email ?? '?').charAt(0).toUpperCase()}
                </div>
                <div>
                  <h1 style={{ fontSize: '22px', fontWeight: 800, color: 'var(--text-primary)', margin: 0 }}>
                    {companyName ?? 'Особистий кабінет'}
                  </h1>
                  <p style={{ fontSize: '13px', color: '#64748B', margin: 0 }}>{user.email}</p>
                </div>
              </div>

              {/* Баланс — показуємо якщо є запис в customers */}
              {customer && (
                <div style={{
                  background: 'var(--bg-card)', border: '1px solid var(--border)',
                  borderRadius: '14px', padding: '16px 24px',
                  display: 'flex', alignItems: 'center', gap: '20px',
                }}>
                  <div>
                    <div style={{ fontSize: '11px', fontWeight: 700, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '4px' }}>
                      Баланс рахунку
                    </div>
                    <div style={{ fontSize: '24px', fontWeight: 800, color: balanceAvail >= 0 ? '#15803D' : '#DC2626' }}>
                      {balanceAvail.toFixed(2)} ₴
                    </div>
                    {balanceHeld > 0 && (
                      <div style={{ fontSize: '11px', color: '#B45309', marginTop: '2px' }}>
                        {balanceHeld.toFixed(2)} ₴ зарезервовано
                      </div>
                    )}
                  </div>
                  <div style={{ borderLeft: '1px solid var(--border)', paddingLeft: '20px' }}>
                    <div style={{ fontSize: '12px', color: '#64748B', marginBottom: '8px' }}>
                      Для поповнення зверніться до менеджера
                    </div>
                    <Link href="/contacts" style={{
                      fontSize: '13px', fontWeight: 600, color: '#4880B8', textDecoration: 'none',
                    }}>
                      Зв&apos;язатись →
                    </Link>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Stats */}
          <div className="account-stats" style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '12px', marginBottom: '32px' }}>
            {[
              { label: 'Всього',      value: totalCount,     icon: Package,     href: '/account',                  filterKey: undefined   },
              { label: 'Активних',    value: activeCount,    icon: ShoppingBag, href: '/account?filter=active',    filterKey: 'active'    },
              { label: 'Відправлено', value: shippedCount,   icon: Truck,       href: '/account?filter=shipped',   filterKey: 'shipped'   },
              { label: 'Виконаних',   value: doneCount,      icon: User,        href: '/account?filter=delivered', filterKey: 'delivered' },
              { label: 'Скасовано',   value: cancelledCount, icon: XCircle,     href: '/account?filter=cancelled', filterKey: 'cancelled' },
            ].map(({ label, value, icon: Icon, href, filterKey }) => {
              const isActive = filter === filterKey || (!filter && !filterKey);
              return (
                <Link key={label} href={href} style={{
                  background: isActive ? '#1E3A5F' : 'var(--bg-card)',
                  border: `1px solid ${isActive ? '#1E3A5F' : 'var(--border)'}`,
                  borderRadius: '14px', padding: '20px 24px',
                  display: 'flex', alignItems: 'center', gap: '14px',
                  textDecoration: 'none', transition: 'all 0.15s',
                }}>
                  <div style={{
                    width: '40px', height: '40px', borderRadius: '10px',
                    background: isActive ? 'rgba(255,255,255,0.15)' : '#E8EEF5',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                  }}>
                    <Icon size={18} color={isActive ? '#fff' : '#1E3A5F'} strokeWidth={2} />
                  </div>
                  <div>
                    <div style={{ fontSize: '24px', fontWeight: 800, color: isActive ? '#fff' : 'var(--text-primary)', lineHeight: 1 }}>{value}</div>
                    <div style={{ fontSize: '12px', color: isActive ? 'rgba(255,255,255,0.7)' : '#64748B', marginTop: '2px' }}>{label}</div>
                  </div>
                </Link>
              );
            })}
          </div>

          {/* Orders */}
          <h2 style={{ fontSize: '16px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '16px' }}>
            Мої замовлення
          </h2>

          {filteredOrders.length === 0 ? (
            <div style={{
              background: '#fff', border: '1px solid #E2E8F0', borderRadius: '14px',
              padding: '48px', textAlign: 'center',
            }}>
              <Package size={40} color="#CBD5E1" strokeWidth={1} style={{ marginBottom: '12px' }} />
              <p style={{ fontSize: '15px', color: '#64748B', marginBottom: '16px' }}>Замовлень ще немає</p>
              <Link href="/catalog" style={{
                display: 'inline-flex', alignItems: 'center', gap: '6px',
                height: '40px', padding: '0 20px', borderRadius: '8px',
                background: '#1E3A5F', color: '#fff', fontSize: '14px', fontWeight: 600,
              }}>
                Перейти до каталогу
              </Link>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {filteredOrders.map((order: Order) => {
                const status = STATUS_LABEL[order.status] ?? STATUS_LABEL.new;
                const short = order.order_number;
                const date = new Date(order.created_at).toLocaleDateString('uk-UA', {
                  day: '2-digit', month: '2-digit', year: 'numeric',
                });
                const deliveryLabel = DELIVERY_LABEL[order.delivery_type] ?? order.delivery_type;
                const subtypeLabel = order.delivery_subtype === 'courier' ? ' — кур\'єр' : order.delivery_subtype === 'warehouse' ? ' — відділення' : '';

                return (
                  <div key={order.id} style={{
                    background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '14px',
                    overflow: 'hidden',
                  }}>
                    {/* Order header */}
                    <div style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      padding: '14px 20px', background: 'var(--bg-soft)',
                      borderBottom: '1px solid var(--border)', flexWrap: 'wrap', gap: '8px',
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <span style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text-primary)' }}>#{short}</span>
                        <span style={{ fontSize: '12px', color: '#94A3B8' }}>{date}</span>
                        <span style={{
                          fontSize: '12px', fontWeight: 600, padding: '3px 10px', borderRadius: '20px',
                          color: status.color, background: status.bg,
                        }}>
                          {status.label}
                        </span>
                      </div>
                      <span style={{ fontSize: '15px', fontWeight: 800, color: '#1E3A5F' }}>
                        {order.total_price.toFixed(2)} грн
                      </span>
                    </div>

                    {/* Items */}
                    <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)' }}>
                      {(order.items as OrderItem[]).map((item, i) => (
                        <div key={item.sku} style={{
                          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                          padding: i > 0 ? '6px 0 0' : '0',
                          fontSize: '13px',
                        }}>
                          <span style={{ color: 'var(--text-secondary)' }}>
                            <span style={{ color: '#94A3B8', marginRight: '6px' }}>{item.brand}</span>
                            {item.name}
                          </span>
                          <span style={{ color: '#64748B', flexShrink: 0, marginLeft: '16px' }}>
                            {item.qty} шт × {item.price.toFixed(2)} грн
                          </span>
                        </div>
                      ))}
                    </div>

                    {/* Delivery & Payment */}
                    <div style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      padding: '12px 20px', fontSize: '12px', color: '#64748B',
                      flexWrap: 'wrap', gap: '10px',
                    }}>
                      <div style={{ display: 'flex', gap: '20px', flexWrap: 'wrap', flex: 1, minWidth: 0 }}>
                        <span style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                          <MapPin size={12} />
                          {deliveryLabel}{subtypeLabel}
                          {order.delivery_address ? `: ${order.delivery_address}` : ''}
                        </span>
                        <span style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                          <CreditCard size={12} />
                          {PAYMENT_LABEL[order.payment_type] ?? order.payment_type}
                        </span>
                        {order.tracking_number && (
                          <a
                            href={`https://novaposhta.ua/tracking/?cargo_number=${order.tracking_number}`}
                            target="_blank" rel="noopener noreferrer"
                            style={{ display: 'flex', alignItems: 'center', gap: '5px', color: '#4880B8', fontWeight: 600, textDecoration: 'none' }}
                          >
                            🚚 ТТН: {order.tracking_number}
                          </a>
                        )}
                      </div>
                      <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexShrink: 0 }}>
                        <RepeatOrderButton items={order.items as OrderItem[]} />
                        <a href={`/invoice/${order.id}`} target="_blank" style={{
                          display: 'inline-flex', alignItems: 'center', gap: '6px',
                          fontSize: '12px', fontWeight: 700, color: '#1E3A5F',
                          padding: '6px 14px', borderRadius: '8px',
                          background: '#EFF4FF', border: '1.5px solid #C7D9F5',
                          whiteSpace: 'nowrap',
                        }}>
                          <CreditCard size={12} />Переглянути рахунок
                        </a>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
      <Footer />
    </>
  );
}
