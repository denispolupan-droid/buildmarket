import type { LucideIcon } from 'lucide-react';
import {
  ShoppingBag, Package, Truck, Settings, BookOpen, BarChart3, Users, Star,
  MessageSquare, ShoppingCart, Mail, ShoppingBasket, Sparkles, Megaphone,
  Tags, Search, LayoutGrid, Calculator,
} from 'lucide-react';

/**
 * Карта розділів адмінки — одне джерело для сайдбара (групи) і палітри
 * Ctrl+K (сторінки з вкладками). Адреси не чіпати: на них стоять закладки
 * й посилання з телеграм-алертів.
 */
export type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  exact?: boolean;
  /** Інші префікси, які підсвічують цей пункт як активний. */
  also?: string[];
};

export type NavGroup = { title: string; items: NavItem[] };

export const NAV_GROUPS: NavGroup[] = [
  { title: 'Продажі', items: [
    { href: '/admin',          label: 'Замовлення',   icon: ShoppingBag,    exact: true, also: ['/admin/orders', '/admin/dispatch'] },
    // Усі площадки під одним пунктом; перемикач Prom/Rozetka/Епіцентр — усередині
    // розділу (MarketplaceTabs).
    { href: '/admin/prom',     label: 'Маркетплейси', icon: ShoppingBasket, also: ['/admin/rozetka', '/admin/epicentr'] },
    { href: '/admin/chat',     label: 'Чати',         icon: MessageSquare },
    { href: '/admin/mail',     label: 'Пошта',        icon: Mail },
    { href: '/admin/reviews',  label: 'Відгуки',      icon: Star },
  ] },
  { title: 'Каталог', items: [
    { href: '/admin/products',    label: 'Товари',          icon: Package },
    { href: '/admin/prices',      label: 'Ціни',            icon: Tags },
    { href: '/admin/showcase',    label: 'Вітрина',         icon: LayoutGrid },
    { href: '/admin/promo',       label: 'Акції та банери', icon: Megaphone },
    { href: '/admin/promo-codes', label: 'Промокоди',       icon: Tags },
  ] },
  { title: 'Закупівля', items: [
    // «Залишки» — вкладками у «Закупівлі», там же, де їх поповнюють.
    { href: '/admin/procurement', label: 'Закупівля',     icon: ShoppingCart },
    { href: '/admin/suppliers',   label: 'Постачальники', icon: Truck },
    { href: '/admin/partners',    label: 'Контрагенти',   icon: Users, also: ['/admin/contracts'] },
  ] },
  { title: 'Гроші', items: [
    { href: '/admin/finance',              label: 'Фінанси', icon: BarChart3 },
    { href: '/admin/accounting/documents', label: 'Облік',   icon: Calculator },
  ] },
  { title: 'Просування', items: [
    { href: '/admin/seo',    label: 'SEO',      icon: Search },
    { href: '/admin/blog',   label: 'Блог',     icon: BookOpen },
    { href: '/admin/digest', label: 'Дайджест', icon: Sparkles },
  ] },
  { title: 'Система', items: [
    { href: '/admin/settings', label: 'Налаштування', icon: Settings },
  ] },
];

export function isNavActive(item: NavItem, pathname: string): boolean {
  if (item.exact ? pathname === item.href : pathname.startsWith(item.href)) return true;
  return (item.also ?? []).some(p => pathname.startsWith(p));
}

/** Сторінки для палітри: розділи + їхні вкладки. Підпис — «Розділ · Вкладка». */
export type PageEntry = { href: string; label: string; section: string; icon: LucideIcon };

const TABS: Record<string, [string, string][]> = {
  '/admin/finance': [
    ['', 'Огляд'], ['/analytics', 'Аналітика'], ['/reports', 'Звіти'], ['/mutual', 'Взаєморозрахунки'],
    ['/bank', 'Банк'], ['/cashflow', 'Рух коштів'], ['/cashflow/cash', 'Каса'], ['/expenses', 'Витрати'],
    ['/novapay', 'НоваПей'], ['/marketplace-balance', 'Маркетплейси'], ['/returns', 'Повернення'],
    ['/adjustments', 'Коригування'], ['/income-book', 'Книга доходів'], ['/trial-balance', 'ОСВ'],
    ['/periods', 'Періоди'], ['/marketing', 'Реклама'],
  ],
  '/admin/procurement': [
    ['', 'Замовлення'], ['/receipts', 'Приходи'], ['/reorder', 'Треба докупити'], ['/stock', 'Власний склад'],
    ['/suppliers', 'Склади постачальників'], ['/inventory', 'Інвентаризація'],
  ],
  '/admin/prom': [
    ['', 'Огляд'], ['/orders', 'Замовлення'], ['/products', 'Товари'], ['/prices', 'Ціни'],
    ['/commissions', 'Комісії'], ['/attributes', 'Атрибути'],
  ],
  '/admin/seo': [
    ['', 'Запити'], ['/pages', 'Сторінки'], ['/products', 'Товари'], ['/categories', 'Категорії'],
    ['/demand', 'Попит'], ['/snippets', 'Сніпети'], ['/ai', 'ШІ'], ['/log', 'Журнал'], ['/guide', 'Довідник'],
  ],
  '/admin/settings': [
    ['', 'Нова Пошта'], ['/mail', 'Пошта'], ['/reservations', 'Резерв'],
    ['/rz-delivery', 'ROZETKA Доставка'], ['/users', 'Користувачі'],
  ],
  '/admin/products': [['', 'Список'], ['/new', 'Новий товар'], ['/import', 'Імпорт']],
};

export const PAGES: PageEntry[] = NAV_GROUPS.flatMap(g => g.items.flatMap(item => {
  const tabs = TABS[item.href];
  if (!tabs) return [{ href: item.href, label: item.label, section: g.title, icon: item.icon }];
  return tabs.map(([suffix, label]) => ({
    href: item.href + suffix,
    label: suffix ? `${item.label} · ${label}` : item.label,
    section: g.title,
    icon: item.icon,
  }));
}));
