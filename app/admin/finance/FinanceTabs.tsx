'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

// Єдина навігація розділу «Фінанси»: підкреслені вкладки замість панелі
// різнокольорових кнопок (рішення власника, орієнтир — Stripe/Notion).
// Всі екрани в один рядок, без випадайки — рядок переноситься за потреби.

const TABS = [
  { href: '/admin/finance',           label: 'Огляд', exact: true },
  { href: '/admin/finance/analytics', label: 'Аналітика' },
  { href: '/admin/finance/cashflow',  label: 'Рух коштів' },
  { href: '/admin/finance/settlements', label: 'Дебіторка' },
  { href: '/admin/finance/payables',  label: 'Кредиторка' },
  { href: '/admin/finance/expenses',  label: 'Витрати' },
  { href: '/admin/finance/reports',   label: 'Звіти' },
  { href: '/admin/finance/marketplace-balance', label: 'Маркетплейси' },
  { href: '/admin/finance/aging',     label: 'Старіння' },
  { href: '/admin/finance/trial-balance', label: 'ОСВ' },
  { href: '/admin/finance/periods',   label: 'Періоди' },
  { href: '/admin/finance/bank',      label: 'Банк' },
];

export default function FinanceTabs() {
  const pathname = usePathname();
  const isActive = (t: { href: string; exact?: boolean }) =>
    t.exact ? pathname === t.href : pathname.startsWith(t.href);

  return (
    <nav className="fin-tabs" aria-label="Розділи фінансів">
      {TABS.map(t => (
        <Link key={t.href} href={t.href} className={'fin-tab' + (isActive(t) ? ' active' : '')}>
          {t.label}
        </Link>
      ))}
    </nav>
  );
}
