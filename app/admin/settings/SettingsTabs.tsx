'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

// Той самий приём, що в «Фінансах» (FinanceTabs): підкреслені вкладки замість
// одного довгого списку карток, який доводилось гортати.

const TABS = [
  { href: '/admin/settings',              label: 'Нова Пошта', exact: true },
  { href: '/admin/settings/rz-delivery',  label: 'ROZETKA Доставка' },
  { href: '/admin/settings/mail',         label: 'Пошта' },
  { href: '/admin/settings/reservations', label: 'Резерв' },
  { href: '/admin/settings/marketplaces', label: 'Маркетплейси' },
  { href: '/admin/settings/users',        label: 'Користувачі' },
];

export default function SettingsTabs() {
  const pathname = usePathname();
  const isActive = (t: { href: string; exact?: boolean }) =>
    t.exact ? pathname === t.href : pathname.startsWith(t.href);

  return (
    <nav className="fin-tabs" aria-label="Розділи налаштувань">
      {TABS.map(t => (
        <Link key={t.href} href={t.href} className={'fin-tab' + (isActive(t) ? ' active' : '')}>
          {t.label}
        </Link>
      ))}
    </nav>
  );
}
