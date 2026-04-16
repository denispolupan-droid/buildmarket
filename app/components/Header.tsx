'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Home, LayoutGrid, Phone, User, Heart, ShoppingCart } from 'lucide-react';

const NAV = [
  { href: '/',        icon: Home,       label: 'Головна'  },
  { href: '/catalog', icon: LayoutGrid, label: 'Каталог'  },
  { href: '#',        icon: Phone,      label: 'Контакти' },
];

export default function Header() {
  const pathname = usePathname();

  function handleNavClick(e: React.MouseEvent, href: string) {
    if (href === '/' && pathname === '/') {
      e.preventDefault();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }

  return (
    <header style={{
      background: '#fff',
      borderBottom: '1px solid #E2E8F0',
      position: 'sticky', top: 0, zIndex: 100,
    }}>
      <div style={{
        maxWidth: '1280px', margin: '0 auto', padding: '0 32px',
        height: '64px',
        display: 'grid',
        gridTemplateColumns: '1fr auto 1fr',
        alignItems: 'center',
      }}>

        {/* Logo — left */}
        <Link href="/" onClick={e => handleNavClick(e, '/')} style={{ justifySelf: 'start', flexShrink: 0 }}>
          <img src="/fixhub-logo2.png" alt="FIXLINE" style={{ height: '36px', width: 'auto', display: 'block' }} />
        </Link>

        {/* Nav — truly centered */}
        <nav style={{ display: 'flex', alignItems: 'center', gap: '2px' }}>
          {NAV.map(({ href, icon: Icon, label }) => {
            const active = href === '/' ? pathname === '/' : pathname.startsWith(href) && href !== '#';
            return (
              <Link key={href} href={href} onClick={e => handleNavClick(e, href)} style={{
                display: 'inline-flex', alignItems: 'center', gap: '6px',
                padding: '7px 14px', borderRadius: '8px',
                fontSize: '14px', fontWeight: active ? 600 : 500,
                color: active ? '#1E3A5F' : '#475569',
                background: active ? '#E8EEF5' : 'transparent',
                transition: 'all 0.15s',
              }}>
                <Icon size={15} strokeWidth={2} />
                {label}
              </Link>
            );
          })}
        </nav>

        {/* Actions — right */}
        <div style={{ justifySelf: 'end', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Link href="/login" style={{
            display: 'inline-flex', alignItems: 'center', gap: '7px',
            height: '38px', padding: '0 18px', borderRadius: '8px',
            background: '#1E3A5F', color: '#fff', fontSize: '14px', fontWeight: 600,
          }}>
            <User size={15} strokeWidth={2} />
            Вхід
          </Link>
          <button style={{
            width: '38px', height: '38px', borderRadius: '8px',
            border: '1px solid #E2E8F0', background: '#fff',
            display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#64748B',
          }}>
            <Heart size={16} strokeWidth={2} />
          </button>
          <button style={{
            display: 'inline-flex', alignItems: 'center', gap: '7px',
            height: '38px', padding: '0 18px', borderRadius: '8px',
            border: '1px solid #E2E8F0', background: '#fff',
            color: '#0F172A', fontSize: '14px', fontWeight: 600,
          }}>
            <ShoppingCart size={15} strokeWidth={2} />
            Кошик
          </button>
        </div>

      </div>
    </header>
  );
}
