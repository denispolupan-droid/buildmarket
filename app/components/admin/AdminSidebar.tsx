'use client';

import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { ShoppingBag, Package, Truck, Store, ChevronLeft, Settings } from 'lucide-react';

const NAV = [
  { href: '/admin',           label: 'Замовлення',    icon: ShoppingBag, exact: true },
  { href: '/admin/products',  label: 'Товари',        icon: Package,     exact: false },
  { href: '/admin/suppliers', label: 'Постачальники', icon: Truck,       exact: false },
  { href: '/admin/settings',  label: 'Налаштування',  icon: Settings,    exact: false },
];

type Props = { newOrdersCount: number };

export default function AdminSidebar({ newOrdersCount }: Props) {
  const pathname = usePathname();

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
      <nav style={{ flex: 1, padding: '10px 10px 0', display: 'flex', flexDirection: 'column', gap: '2px' }}>
        {NAV.map(({ href, label, icon: Icon, exact }) => {
          const active = exact ? pathname === href : pathname.startsWith(href);
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
              {label === 'Замовлення' && newOrdersCount > 0 && (
                <span style={{
                  background: '#EF4444', color: '#fff', fontSize: '11px', fontWeight: 700,
                  borderRadius: '20px', padding: '1px 7px',
                }}>
                  {newOrdersCount}
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
