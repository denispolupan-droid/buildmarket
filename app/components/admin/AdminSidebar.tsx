'use client';

import { useState, useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { Suspense } from 'react';
import Link from 'next/link';
import {
  ShoppingBag, Package, Truck, Store,
  Settings, BookOpen, Warehouse, BarChart3, Users, Star,
  MessageSquare, FileText, ShoppingCart, Mail, ExternalLink, TrendingUp,
} from 'lucide-react';

const NAV = [
  { href: '/admin',                      label: 'Замовлення',     icon: ShoppingBag,   exact: true  },
  { href: '/admin/products',             label: 'Товари',         icon: Package,       exact: false },
  { href: '/admin/suppliers',            label: 'Постачальники',  icon: Truck,         exact: false },
  { href: '/admin/partners',             label: 'Контрагенти',    icon: Users,         exact: false },
  { href: '/admin/procurement',          label: 'Закупівля',      icon: ShoppingCart,  exact: false },
  { href: '/admin/contracts',            label: 'Договори',       icon: FileText,      exact: false },
  { href: '/admin/pricing',              label: 'Аналіз цін',     icon: TrendingUp,    exact: false },
  { href: '/admin/finance',              label: 'Фінанси',        icon: BarChart3,     exact: false },
  { href: '/admin/accounting/documents', label: 'Облік',          icon: BookOpen,      exact: false },
  { href: '/admin/accounting/stock',     label: 'Залишки',        icon: Warehouse,     exact: false },
  { href: '/admin/mail',                 label: 'Пошта',          icon: Mail,          exact: false },
  { href: '/admin/reviews',              label: 'Відгуки',        icon: Star,          exact: false },
  { href: '/admin/chat',                 label: 'Чат',            icon: MessageSquare, exact: false },
  { href: '/admin/settings',             label: 'Налаштування',   icon: Settings,      exact: false },
];

// ── Visual tokens — change colours here only ──────────────────────────────
const T = {
  textIdle:   'rgba(148,163,184,0.80)',
  textActive: '#3DBFB8',
  bgActive:   'rgba(61,191,184,0.13)',
  divider:    'rgba(255,255,255,0.07)',
  iconActive: '#3DBFB8',
} as const;

type Props = { newOrdersCount: number; chatUnreadCount?: number };

function SidebarInner({ newOrdersCount, chatUnreadCount = 0 }: Props) {
  const pathname = usePathname();

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
      background: 'linear-gradient(180deg, #1A3357 0%, #1E3D6A 100%)',
      display: 'flex',
      flexDirection: 'column',
      height: '100vh',
      position: 'sticky',
      top: 0,
      borderRight: `1px solid ${T.divider}`,
      boxShadow: '4px 0 24px rgba(0,0,0,0.25)',
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
        {NAV.map(({ href, label, icon: Icon, exact }) => {
          // Custom active logic: /admin (Замовлення) also covers /admin/orders/* and /admin/dispatch
          const active = href === '/admin'
            ? (pathname === '/admin' || pathname.startsWith('/admin/orders') || pathname.startsWith('/admin/dispatch'))
            : exact ? pathname === href : pathname.startsWith(href);

          // Badges
          const badgeCount =
            href === '/admin'             && newOrdersCount > 0  ? newOrdersCount  :
            href === '/admin/procurement' && poDraftCount > 0    ? poDraftCount    :
            href === '/admin/chat'        && chatUnreadCount > 0 ? chatUnreadCount :
            href === '/admin/mail'        && mailUnread > 0      ? mailUnread      :
            0;
          const badgeColor = href === '/admin/procurement' ? '#F59E0B' : '#EF4444';

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
              <Icon size={15} strokeWidth={active ? 2.5 : 1.75} color={active ? T.iconActive : T.textIdle} />
              <span style={{ flex: 1 }}>{label}</span>
              {badgeCount > 0 && (
                <span style={{
                  background: badgeColor, color: '#fff',
                  fontSize: '10px', fontWeight: 700,
                  borderRadius: '6px', padding: '1px 6px', minWidth: '18px', textAlign: 'center',
                }}>
                  {badgeCount}
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
      <SidebarInner newOrdersCount={props.newOrdersCount} chatUnreadCount={props.chatUnreadCount} />
    </Suspense>
  );
}
