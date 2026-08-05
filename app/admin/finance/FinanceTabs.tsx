'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ChevronDown } from 'lucide-react';

// Єдина навігація розділу «Фінанси»: підкреслені вкладки замість панелі
// різнокольорових кнопок (рішення власника, орієнтир — Stripe/Notion).
// Рідше вживані екрани — у випадайці «Ще».

const TABS = [
  { href: '/admin/finance',           label: 'Огляд', exact: true },
  { href: '/admin/finance/analytics', label: 'Аналітика' },
  { href: '/admin/finance/cashflow',  label: 'Рух коштів' },
  { href: '/admin/finance/settlements', label: 'Дебіторка' },
  { href: '/admin/finance/payables',  label: 'Кредиторка' },
  { href: '/admin/finance/expenses',  label: 'Витрати' },
  { href: '/admin/finance/reports',   label: 'Звіти' },
];

const MORE = [
  { href: '/admin/finance/marketplace-balance', label: 'Баланс маркетплейсів' },
  { href: '/admin/finance/aging',               label: 'Старіння боргу' },
  { href: '/admin/finance/trial-balance',       label: 'ОСВ' },
  { href: '/admin/finance/periods',             label: 'Облікові періоди' },
  { href: '/admin/finance/bank',                label: 'Банківська виписка' },
];

export default function FinanceTabs() {
  const pathname = usePathname();
  const isActive = (t: { href: string; exact?: boolean }) =>
    t.exact ? pathname === t.href : pathname.startsWith(t.href);
  const moreActive = MORE.some(t => pathname.startsWith(t.href));

  return (
    <nav className="fin-tabs" aria-label="Розділи фінансів">
      {TABS.map(t => (
        <Link key={t.href} href={t.href} className={'fin-tab' + (isActive(t) ? ' active' : '')}>
          {t.label}
        </Link>
      ))}
      <div className={'fin-tab fin-tab-more' + (moreActive ? ' active' : '')}>
        Ще <ChevronDown size={13} strokeWidth={2.2} />
        <div className="fin-tab-menu">
          {MORE.map(t => (
            <Link key={t.href} href={t.href} className={'fin-tab-menu-item' + (pathname.startsWith(t.href) ? ' active' : '')}>
              {t.label}
            </Link>
          ))}
        </div>
      </div>
    </nav>
  );
}
