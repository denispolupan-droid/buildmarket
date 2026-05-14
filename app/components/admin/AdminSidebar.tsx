'use client';

import { useState, useEffect } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import Link from 'next/link';
import { ShoppingBag, Package, Truck, Store, ChevronLeft, ChevronDown, ChevronUp, Settings, BookOpen, Warehouse, BarChart3, Users, Star, MessageSquare } from 'lucide-react';

const ORDER_STATUSES = [
  { value: 'new',             label: 'Нові' },
  { value: 'confirmed',       label: 'Підтверджено' },
  { value: 'shipped',         label: 'Відправлено' },
  { value: 'delivered',       label: 'Доставлено' },
  { value: 'cancelled',       label: 'Скасовано' },
  { value: '',                label: 'Всі' },
];

const NAV = [
  { href: '/admin/products',             label: 'Товари',        icon: Package,       exact: false },
  { href: '/admin/suppliers',            label: 'Постачальники', icon: Truck,         exact: false },
  { href: '/admin/partners',             label: 'Партнери',      icon: Users,         exact: false },
  { href: '/admin/finance',              label: 'Фінанси',       icon: BarChart3,     exact: false },
  { href: '/admin/accounting/documents', label: 'Облік',         icon: BookOpen,      exact: false },
  { href: '/admin/accounting/stock',     label: 'Залишки',       icon: Warehouse,     exact: false },
  { href: '/admin/reviews',              label: 'Відгуки',       icon: Star,          exact: false },
  { href: '/admin/chat',                 label: 'Чат',           icon: MessageSquare, exact: false },
  { href: '/admin/settings',             label: 'Налаштування',  icon: Settings,      exact: false },
];

type Props = { newOrdersCount: number; statusCounts?: Record<string, number>; chatUnreadCount?: number };

function SidebarInner({ newOrdersCount, statusCounts = {}, chatUnreadCount = 0 }: Props) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const currentStatus = searchParams.get('status') ?? '';
  const isOrders = pathname === '/admin';

  const [ordersOpen, setOrdersOpen] = useState(true);

  useEffect(() => {
    if (isOrders) setOrdersOpen(true);
  }, [isOrders]);

  return (
    <aside style={{
      width: '220px', flexShrink: 0, background: '#1E3A5F',
      display: 'flex', flexDirection: 'column',
      height: '100vh', position: 'sticky', top: 0,
    }}>
      {/* Logo */}
      <div style={{ padding: '22px 18px 18px', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <Store size={20} color="#93C5FD" />
          <div>
            <div style={{ fontSize: '14px', fontWeight: 800, color: '#fff', letterSpacing: '-0.01em' }}>BuildMarket</div>
            <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.38)', marginTop: '1px' }}>Панель менеджера</div>
          </div>
        </div>
      </div>

      {/* Nav items */}
      <nav style={{ flex: 1, padding: '10px 10px 0', display: 'flex', flexDirection: 'column', gap: '2px', overflowY: 'auto' }}>

        {/* Orders section */}
        <div>
          <button
            onClick={() => setOrdersOpen(o => !o)}
            style={{
              width: '100%', display: 'flex', alignItems: 'center', gap: '10px',
              padding: '9px 12px', borderRadius: '8px',
              background: isOrders ? 'rgba(255,255,255,0.12)' : 'transparent',
              color: isOrders ? '#fff' : 'rgba(255,255,255,0.5)',
              fontSize: '14px', fontWeight: isOrders ? 600 : 400,
              border: 'none', cursor: 'pointer', textAlign: 'left',
            }}
          >
            <ShoppingBag size={16} strokeWidth={isOrders ? 2.5 : 2} />
            <span style={{ flex: 1 }}>Замовлення</span>
            {newOrdersCount > 0 && !ordersOpen && (
              <span style={{
                background: '#EF4444', color: '#fff', fontSize: '11px', fontWeight: 700,
                borderRadius: '20px', padding: '1px 7px',
              }}>
                {newOrdersCount}
              </span>
            )}
            {ordersOpen
              ? <ChevronUp size={13} style={{ opacity: 0.5, flexShrink: 0 }} />
              : <ChevronDown size={13} style={{ opacity: 0.5, flexShrink: 0 }} />
            }
          </button>

          {/* Status subcategories */}
          {ordersOpen && (
            <div style={{ paddingLeft: '10px', marginTop: '2px', display: 'flex', flexDirection: 'column', gap: '1px' }}>
              {ORDER_STATUSES.map(s => {
                const active = isOrders && currentStatus === s.value;
                const count = s.value ? (statusCounts[s.value] ?? 0) : null;
                return (
                  <Link
                    key={s.value}
                    href={s.value ? `/admin?status=${s.value}` : '/admin'}
                    style={{
                      display: 'flex', alignItems: 'center',
                      padding: '6px 10px 6px 14px', borderRadius: '6px', textDecoration: 'none',
                      background: active ? 'rgba(255,255,255,0.1)' : 'transparent',
                      color: active ? '#fff' : 'rgba(255,255,255,0.45)',
                      fontSize: '13px', fontWeight: active ? 600 : 400,
                      borderLeft: `2px solid ${active ? 'rgba(255,255,255,0.5)' : 'rgba(255,255,255,0.1)'}`,
                      transition: 'all 0.12s',
                    }}
                  >
                    <span style={{ flex: 1 }}>{s.label}</span>
                    {count !== null && count > 0 && (
                      <span style={{
                        background: s.value === 'new' ? '#EF4444' : 'rgba(255,255,255,0.15)',
                        color: '#fff',
                        fontSize: '10px', fontWeight: 700,
                        borderRadius: '20px', padding: '1px 6px',
                        minWidth: '18px', textAlign: 'center',
                      }}>
                        {count}
                      </span>
                    )}
                  </Link>
                );
              })}
            </div>
          )}
        </div>

        {/* Other nav items */}
        {NAV.map(({ href, label, icon: Icon, exact }) => {
          const active = exact ? pathname === href : pathname.startsWith(href);
          const badge = href === '/admin/chat' && chatUnreadCount > 0 ? chatUnreadCount : null;
          return (
            <Link
              key={href}
              href={href}
              style={{
                display: 'flex', alignItems: 'center', gap: '10px',
                padding: '9px 12px', borderRadius: '8px', textDecoration: 'none',
                background: active ? 'rgba(255,255,255,0.12)' : 'transparent',
                color: active ? '#fff' : 'rgba(255,255,255,0.5)',
                fontSize: '14px', fontWeight: active ? 600 : 400,
              }}
            >
              <Icon size={16} strokeWidth={active ? 2.5 : 2} />
              <span style={{ flex: 1 }}>{label}</span>
              {badge !== null && (
                <span style={{
                  background: '#EF4444', color: '#fff', fontSize: '11px', fontWeight: 700,
                  borderRadius: '20px', padding: '1px 7px',
                }}>
                  {badge}
                </span>
              )}
            </Link>
          );
        })}
      </nav>

      {/* Back to site */}
      <div style={{ padding: '12px 10px', borderTop: '1px solid rgba(255,255,255,0.08)' }}>
        <Link
          href="/"
          style={{
            display: 'flex', alignItems: 'center', gap: '8px',
            padding: '8px 12px', borderRadius: '8px', textDecoration: 'none',
            color: 'rgba(255,255,255,0.35)', fontSize: '13px',
          }}
        >
          <ChevronLeft size={14} /> На сайт
        </Link>
      </div>
    </aside>
  );
}

export default function AdminSidebar(props: Props) {
  return (
    <Suspense fallback={null}>
      <SidebarInner {...props} />
    </Suspense>
  );
}
