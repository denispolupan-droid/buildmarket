'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

// Закупівля і залишки — одна робота: подивився, чого бракує → замовив →
// оприходував → залишок виріс. Раніше це були два пункти сайдбара, між якими
// доводилось стрибати, причому «Залишки» відкривались хабом із плитками, тобто
// зайвим кліком перед кожним екраном. Тепер один розділ і рядок вкладок — той
// самий патерн, що у «Фінансах» і SEO (класи .fin-tab*).
//
// Старі адреси /admin/accounting/stock/* і /admin/accounting/inventory
// редіректяться на нові — див. next.config.ts.

const TABS: { href: string; label: string; exact?: boolean; hint: string }[] = [
  { href: '/admin/procurement',           label: 'Замовлення', exact: true, hint: 'Замовлення постачальнику: від чернетки до отримання' },
  { href: '/admin/procurement/receipts',  label: 'Приходи',    hint: 'Оприходування товару, собівартість і landed cost' },
  { href: '/admin/procurement/stock',     label: 'Власний склад', hint: 'Залишки на своєму складі: всього, резерв, доступно' },
  { href: '/admin/procurement/suppliers', label: 'Склади постачальників', hint: 'Наявність у постачальників за їхніми прайсами' },
  { href: '/admin/procurement/reorder',   label: 'Треба докупити', hint: 'Позиції, що впали нижче мінімального залишку' },
  { href: '/admin/procurement/inventory', label: 'Інвентаризація', hint: 'Перерахунок фактичних залишків із відомістю розбіжностей' },
];

export default function ProcurementTabs() {
  const pathname = usePathname();

  // Картки документів (/admin/procurement/<uuid>) — це відкрите замовлення,
  // тож підсвічуємо «Замовлення», а не нічого. Вкладки-сусіди статичні, тому
  // достатньо перевірити, що сегмент не збігається з жодною з них.
  const staticHrefs = TABS.filter(t => !t.exact).map(t => t.href);
  const isDocPage = pathname.startsWith('/admin/procurement/') && !staticHrefs.some(h => pathname.startsWith(h));

  const active = (t: typeof TABS[number]) =>
    t.exact ? (pathname === t.href || isDocPage) : pathname.startsWith(t.href);

  return (
    <nav className="fin-tabs" aria-label="Розділи закупівлі">
      {TABS.map(t => (
        <Link key={t.href} href={t.href} title={t.hint} className={'fin-tab' + (active(t) ? ' active' : '')}>
          {t.label}
        </Link>
      ))}
    </nav>
  );
}
