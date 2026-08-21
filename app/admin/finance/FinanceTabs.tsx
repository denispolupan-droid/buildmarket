'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

// Єдина навігація розділу «Фінанси»: 7 тем замість 12 вкладок-таблиць
// (рішення власника: «Огляд» — загальна картина, решта розкриває нюанси).
// Споріднені екрани згруповано: тема в головному рядку, її екрани — рядком
// підвкладок нижче. URL сторінок НЕ мінялись — закладки живі.

type Leaf  = { href: string; label: string; exact?: boolean };
type Group = { label: string; children: Leaf[] } | (Leaf & { children?: undefined });

const GROUPS: Group[] = [
  { href: '/admin/finance',           label: 'Огляд', exact: true },
  { href: '/admin/finance/analytics', label: 'Аналітика' },
  { href: '/admin/finance/marketing', label: 'Реклама' },
  { label: 'Гроші', children: [
    { href: '/admin/finance/cashflow',      label: 'Рух коштів', exact: true },
    { href: '/admin/finance/cashflow/cash', label: 'Каса' },
    { href: '/admin/finance/bank',          label: 'Банк' },
  ] },
  { label: 'Борги', children: [
    { href: '/admin/finance/settlements', label: 'Дебіторка' },
    { href: '/admin/finance/payables',    label: 'Кредиторка' },
    { href: '/admin/finance/aging',       label: 'Старіння' },
  ] },
  { href: '/admin/finance/expenses',            label: 'Витрати' },
  { href: '/admin/finance/marketplace-balance', label: 'Маркетплейси' },
  { label: 'Звітність', children: [
    { href: '/admin/finance/reports',       label: 'Звіти' },
    { href: '/admin/finance/trial-balance', label: 'ОСВ' },
    { href: '/admin/finance/periods',       label: 'Періоди' },
  ] },
];

function leafActive(pathname: string, t: Leaf): boolean {
  return t.exact ? pathname === t.href : pathname.startsWith(t.href);
}

export default function FinanceTabs() {
  const pathname = usePathname();

  const groupActive = (g: Group): boolean =>
    g.children ? g.children.some(c => leafActive(pathname, c)) : leafActive(pathname, g);

  const active = GROUPS.find(groupActive);

  return (
    <div>
      <nav className="fin-tabs" aria-label="Розділи фінансів">
        {GROUPS.map(g => {
          const href = g.children ? g.children[0].href : g.href;
          return (
            <Link key={g.label} href={href} className={'fin-tab' + (groupActive(g) ? ' active' : '')}>
              {g.label}
            </Link>
          );
        })}
      </nav>
      {active?.children && (
        <nav className="fin-subtabs" aria-label={`Екрани: ${active.label}`}>
          {active.children.map(c => (
            <Link key={c.href} href={c.href}
              className={'fin-pill' + (leafActive(pathname, c) ? ' active' : '')}>
              {c.label}
            </Link>
          ))}
        </nav>
      )}
    </div>
  );
}
