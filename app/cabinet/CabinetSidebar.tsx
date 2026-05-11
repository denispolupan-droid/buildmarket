'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LayoutDashboard, ShoppingBag, Wallet, Rss, ChevronLeft, Plus, FileUp, Download } from 'lucide-react';

const NAV = [
  { href: '/cabinet',                 label: 'Дашборд',    icon: LayoutDashboard, exact: true  },
  { href: '/cabinet/orders',          label: 'Замовлення', icon: ShoppingBag,     exact: false },
  { href: '/cabinet/orders/upload',   label: 'Excel імпорт', icon: FileUp,        exact: true  },
  { href: '/cabinet/balance',         label: 'Баланс',     icon: Wallet,          exact: false },
  { href: '/cabinet/feed',            label: 'Прайс-фід',  icon: Rss,             exact: false },
];

export default function CabinetSidebar() {
  const pathname = usePathname();

  return (
    <aside style={{
      width: '220px', flexShrink: 0, background: '#1E3A5F',
      display: 'flex', flexDirection: 'column',
      height: '100vh', position: 'sticky', top: 0,
    }}>
      {/* Logo */}
      <div style={{ padding: '22px 18px 18px', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
        <div style={{ fontSize: '14px', fontWeight: 800, color: '#fff' }}>FIXLINE</div>
        <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.38)', marginTop: '2px' }}>Кабінет партнера</div>
      </div>

      {/* New order button */}
      <div style={{ padding: '12px 10px', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
        <Link href="/cabinet/orders/new" style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '7px',
          height: '38px', borderRadius: '8px', background: '#4880B8',
          color: '#fff', fontSize: '13px', fontWeight: 700, textDecoration: 'none',
        }}>
          <Plus size={15} /> Нове замовлення
        </Link>
      </div>

      {/* Nav */}
      <nav style={{ flex: 1, padding: '10px 10px 0', display: 'flex', flexDirection: 'column', gap: '2px' }}>
        {NAV.map(({ href, label, icon: Icon, exact }) => {
          const moreSpecificActive = NAV.some(n => n.href !== href && n.exact && pathname === n.href);
          const active = exact ? pathname === href : pathname.startsWith(href) && !moreSpecificActive;
          return (
            <Link key={href} href={href} style={{
              display: 'flex', alignItems: 'center', gap: '10px',
              padding: '9px 12px', borderRadius: '8px', textDecoration: 'none',
              background: active ? 'rgba(255,255,255,0.12)' : 'transparent',
              color: active ? '#fff' : 'rgba(255,255,255,0.5)',
              fontSize: '14px', fontWeight: active ? 600 : 400,
            }}>
              <Icon size={16} strokeWidth={active ? 2.5 : 2} />
              {label}
            </Link>
          );
        })}
      </nav>

      {/* Pricelist download */}
      <div style={{ padding: '8px 10px', borderTop: '1px solid rgba(255,255,255,0.08)' }}>
        <a href="/api/cabinet/pricelist" download style={{
          display: 'flex', alignItems: 'center', gap: '8px',
          padding: '9px 12px', borderRadius: '8px', textDecoration: 'none',
          color: 'rgba(255,255,255,0.6)', fontSize: '13px', fontWeight: 500,
        }}>
          <Download size={14} /> Скачати прайс .xlsx
        </a>
      </div>

      {/* Back to site */}
      <div style={{ padding: '8px 10px', borderTop: '1px solid rgba(255,255,255,0.08)' }}>
        <Link href="/" style={{
          display: 'flex', alignItems: 'center', gap: '8px',
          padding: '8px 12px', borderRadius: '8px', textDecoration: 'none',
          color: 'rgba(255,255,255,0.35)', fontSize: '13px',
        }}>
          <ChevronLeft size={14} /> На сайт
        </Link>
      </div>
    </aside>
  );
}
