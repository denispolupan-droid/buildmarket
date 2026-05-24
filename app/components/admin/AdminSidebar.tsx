'use client';

import { useState, useEffect } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import Link from 'next/link';
import {
  ShoppingBag, Package, Truck, Store, ChevronDown, ChevronUp,
  Settings, BookOpen, Warehouse, BarChart3, Users, Star,
  MessageSquare, Send, FileText, ShoppingCart, Mail, ExternalLink,
} from 'lucide-react';

const ORDER_STATUSES = [
  { value: 'new',             label: 'Нові' },
  { value: 'confirmed',       label: 'Підтверджено' },
  { value: 'awaiting_stock',  label: 'Очікуємо товар' },
  { value: 'picking',         label: 'Збирається' },
  { value: 'shipped',         label: 'Відправлено' },
  { value: 'delivered',       label: 'Доставлено' },
  { value: 'cancelled',       label: 'Скасовано' },
  { value: '',                label: 'Всі' },
];

const NAV = [
  { href: '/admin/products',             label: 'Товари',        icon: Package,       exact: false },
  { href: '/admin/suppliers',            label: 'Постачальники', icon: Truck,         exact: false },
  { href: '/admin/partners',             label: 'Партнери',      icon: Users,         exact: false },
  { href: '/admin/procurement',          label: 'Закупівля',     icon: ShoppingCart,  exact: false },
  { href: '/admin/contracts',            label: 'Договори',      icon: FileText,      exact: false },
  { href: '/admin/finance',              label: 'Фінанси',       icon: BarChart3,     exact: false },
  { href: '/admin/accounting/documents', label: 'Облік',         icon: BookOpen,      exact: false },
  { href: '/admin/accounting/stock',     label: 'Залишки',       icon: Warehouse,     exact: false },
  { href: '/admin/mail',                 label: 'Пошта',         icon: Mail,          exact: false },
  { href: '/admin/reviews',             label: 'Відгуки',       icon: Star,          exact: false },
  { href: '/admin/chat',                label: 'Чат',           icon: MessageSquare, exact: false },
  { href: '/admin/settings',            label: 'Налаштування',  icon: Settings,      exact: false },
];

// ── Visual tokens — change colours here only ──────────────────────────────
const T = {
  textIdle:    'rgba(148,163,184,0.72)',
  textActive:  '#3DBFB8',
  bgActive:    'rgba(61,191,184,0.13)',
  subIdle:     'rgba(148,163,184,0.58)',
  subActive:   '#3DBFB8',
  subBgActive: 'rgba(61,191,184,0.1)',
  divider:     'rgba(255,255,255,0.07)',
} as const;

type Props = { newOrdersCount: number; statusCounts?: Record<string, number>; chatUnreadCount?: number };

function SidebarInner({ newOrdersCount, statusCounts = {}, chatUnreadCount = 0 }: Props) {
  const pathname      = usePathname();
  const searchParams  = useSearchParams();
  const currentStatus = searchParams.get('status') ?? '';
  const isOrders      = pathname === '/admin';
  const isProcurement = pathname.startsWith('/admin/procurement');

  const [ordersOpen,   setOrdersOpen]   = useState(false);
  const [procOpen,     setProcOpen]     = useState(false);
  const [poDraftCount, setPoDraftCount] = useState(0);
  const [mailUnread,   setMailUnread]   = useState(0);

  useEffect(() => {
    function fetchUnread() {
      fetch('/api/admin/mail/unread')
        .then(r => r.json())
        .then(d => setMailUnread(d?.count ?? 0))
        .catch(() => {});
    }
    fetchUnread();
    const interval = setInterval(fetchUnread, 60_000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    function readCount() {
      try {
        const drafts = JSON.parse(sessionStorage.getItem('admin_po_drafts') ?? '[]');
        setPoDraftCount(Array.isArray(drafts) ? drafts.length : 0);
      } catch { setPoDraftCount(0); }
    }
    readCount();
    const handler = (e: Event) => {
      setPoDraftCount((e as CustomEvent<{ count: number }>).detail?.count ?? 0);
    };
    window.addEventListener('po-drafts-changed', handler);
    return () => window.removeEventListener('po-drafts-changed', handler);
  }, []);

  return (
    <aside style={{
      width: '240px',
      flexShrink: 0,
      background: 'linear-gradient(180deg, #0F1729 0%, #0D1F3C 100%)',
      display: 'flex',
      flexDirection: 'column',
      height: '100vh',
      position: 'sticky',
      top: 0,
      borderRight: `1px solid ${T.divider}`,
    }}>

      {/* ── Logo ─────────────────────────────────────────────────── */}
      <div style={{ padding: '22px 18px 18px', borderBottom: `1px solid ${T.divider}` }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <Store size={20} color="#3DBFB8" />
          <div>
            <div style={{ fontSize: '14px', fontWeight: 800, color: '#fff', letterSpacing: '0.02em' }}>
              FIXLINE
            </div>
            <div style={{ fontSize: '11px', color: 'rgba(61,191,184,0.6)', marginTop: '1px' }}>
              Панель менеджера
            </div>
          </div>
        </div>
      </div>

      {/* ── Nav ──────────────────────────────────────────────────── */}
      <nav
        className="admin-sidebar-nav"
        style={{ flex: 1, padding: '10px 10px 0', display: 'flex', flexDirection: 'column', gap: '2px', overflowY: 'auto' }}
      >

        {/* Orders accordion */}
        <div>
          <button
            onClick={() => setOrdersOpen(o => !o)}
            className="admin-nav-btn"
            style={{
              width: '100%', display: 'flex', alignItems: 'center', gap: '10px',
              padding: '9px 12px', borderRadius: '8px',
              background: isOrders ? T.bgActive : 'transparent',
              color: isOrders ? T.textActive : T.textIdle,
              fontSize: '13.5px', fontWeight: isOrders ? 600 : 400,
              border: 'none', cursor: 'pointer', textAlign: 'left',
            }}
          >
            <ShoppingBag size={15} strokeWidth={isOrders ? 2.5 : 1.75} color={isOrders ? '#3DBFB8' : undefined} />
            <span style={{ flex: 1 }}>Замовлення</span>
            {newOrdersCount > 0 && !ordersOpen && (
              <span style={{
                background: '#EF4444', color: '#fff',
                fontSize: '10px', fontWeight: 700,
                borderRadius: '6px', padding: '1px 6px', minWidth: '18px', textAlign: 'center',
              }}>
                {newOrdersCount}
              </span>
            )}
            {ordersOpen
              ? <ChevronUp   size={12} style={{ opacity: 0.4, flexShrink: 0 }} />
              : <ChevronDown size={12} style={{ opacity: 0.4, flexShrink: 0 }} />
            }
          </button>

          {ordersOpen && (
            <div style={{ paddingLeft: '10px', marginTop: '2px', display: 'flex', flexDirection: 'column', gap: '1px' }}>
              {ORDER_STATUSES.map(s => {
                const active = isOrders && currentStatus === s.value;
                const count  = s.value ? (statusCounts[s.value] ?? 0) : null;
                return (
                  <Link
                    key={s.value}
                    href={s.value ? `/admin?status=${s.value}` : '/admin'}
                    className="admin-nav-sub"
                    style={{
                      display: 'flex', alignItems: 'center',
                      padding: '6px 10px 6px 16px', borderRadius: '6px', textDecoration: 'none',
                      background: active ? T.subBgActive : 'transparent',
                      color:      active ? T.subActive   : T.subIdle,
                      fontSize: '13px', fontWeight: active ? 600 : 400,
                    }}
                  >
                    <span style={{ flex: 1 }}>{s.label}</span>
                    {count !== null && count > 0 && (
                      <span style={{
                        background: s.value === 'new' ? '#EF4444' : 'rgba(255,255,255,0.12)',
                        color: '#fff', fontSize: '10px', fontWeight: 700,
                        borderRadius: '6px', padding: '1px 6px', minWidth: '18px', textAlign: 'center',
                      }}>
                        {count}
                      </span>
                    )}
                  </Link>
                );
              })}

              {/* Відправлення sub-link */}
              {(() => {
                const active = pathname.startsWith('/admin/dispatch');
                return (
                  <Link
                    href="/admin/dispatch"
                    className="admin-nav-sub"
                    style={{
                      display: 'flex', alignItems: 'center', gap: '6px',
                      padding: '6px 10px 6px 16px', borderRadius: '6px', textDecoration: 'none',
                      background: active ? T.subBgActive : 'transparent',
                      color:      active ? T.subActive   : T.subIdle,
                      fontSize: '13px', fontWeight: active ? 600 : 400,
                      marginTop: '4px',
                    }}
                  >
                    <Send size={11} />
                    <span>Відправлення</span>
                  </Link>
                );
              })()}
            </div>
          )}
        </div>

        {/* Other nav items */}
        {NAV.map(({ href, label, icon: Icon, exact }) => {

          /* Закупівля — collapsible */
          if (href === '/admin/procurement') {
            return (
              <div key={href}>
                <button
                  onClick={() => setProcOpen(o => !o)}
                  className="admin-nav-btn"
                  style={{
                    width: '100%', display: 'flex', alignItems: 'center', gap: '10px',
                    padding: '9px 12px', borderRadius: '8px',
                    background: isProcurement ? T.bgActive : 'transparent',
                    color: isProcurement ? T.textActive : T.textIdle,
                    fontSize: '13.5px', fontWeight: isProcurement ? 600 : 400,
                    border: 'none', cursor: 'pointer', textAlign: 'left',
                  }}
                >
                  <Icon size={15} strokeWidth={isProcurement ? 2.5 : 1.75} color={isProcurement ? '#3DBFB8' : undefined} />
                  <span style={{ flex: 1 }}>{label}</span>
                  {poDraftCount > 0 && (
                    <span style={{
                      background: '#F59E0B', color: '#fff',
                      fontSize: '10px', fontWeight: 700,
                      borderRadius: '6px', padding: '1px 6px', minWidth: '18px', textAlign: 'center',
                    }}>
                      {poDraftCount}
                    </span>
                  )}
                  {procOpen
                    ? <ChevronUp   size={12} style={{ opacity: 0.4 }} />
                    : <ChevronDown size={12} style={{ opacity: 0.4 }} />
                  }
                </button>
                {procOpen && (
                  <div style={{ paddingLeft: '10px', marginTop: '2px', display: 'flex', flexDirection: 'column', gap: '1px' }}>
                    {[
                      { href: '/admin/procurement',          label: 'Замовлення постачальнику' },
                      { href: '/admin/procurement/receipts', label: 'Приходи товару' },
                    ].map(sub => {
                      const subActive = pathname === sub.href
                        || (sub.href !== '/admin/procurement' && pathname.startsWith(sub.href));
                      return (
                        <Link
                          key={sub.href}
                          href={sub.href}
                          className="admin-nav-sub"
                          style={{
                            display: 'flex', alignItems: 'center',
                            padding: '6px 10px 6px 16px', borderRadius: '6px', textDecoration: 'none',
                            background: subActive ? T.subBgActive : 'transparent',
                            color:      subActive ? T.subActive   : T.subIdle,
                            fontSize: '13px', fontWeight: subActive ? 600 : 400,
                          }}
                        >
                          {sub.label}
                        </Link>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          }

          const active     = exact ? pathname === href : pathname.startsWith(href);
          const badge      = href === '/admin/chat' && chatUnreadCount > 0 ? chatUnreadCount
                           : href === '/admin/mail' && mailUnread > 0      ? mailUnread
                           : null;

          return (
            <Link
              key={href}
              href={href}
              className="admin-nav-btn"
              style={{
                display: 'flex', alignItems: 'center', gap: '10px',
                padding: '9px 12px', borderRadius: '8px', textDecoration: 'none',
                background: active ? T.bgActive : 'transparent',
                color:      active ? T.textActive : T.textIdle,
                fontSize: '13.5px', fontWeight: active ? 600 : 400,
              }}
            >
              <Icon size={15} strokeWidth={active ? 2.5 : 1.75} color={active ? '#3DBFB8' : undefined} />
              <span style={{ flex: 1 }}>{label}</span>
              {badge !== null && (
                <span style={{
                  background: '#EF4444', color: '#fff',
                  fontSize: '10px', fontWeight: 700,
                  borderRadius: '6px', padding: '1px 6px', minWidth: '18px', textAlign: 'center',
                }}>
                  {badge}
                </span>
              )}
            </Link>
          );
        })}
      </nav>

      {/* ── Back to site ─────────────────────────────────────────── */}
      <div style={{ padding: '12px 10px', borderTop: `1px solid ${T.divider}` }}>
        <Link
          href="/"
          className="admin-nav-btn"
          style={{
            display: 'flex', alignItems: 'center', gap: '8px',
            padding: '8px 12px', borderRadius: '8px', textDecoration: 'none',
            color: 'rgba(148,163,184,0.4)', fontSize: '13px',
          }}
        >
          <ExternalLink size={13} />
          На сайт
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
