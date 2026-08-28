'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

// Розділ виріс з однієї «черги товарів» у шість різних задач, які раніше лежали
// однією простинею на 700 рядків. Вкладки — окремі роути, тому дані кожного
// екрана вантажаться лише коли на нього зайшли (черга товарів, наприклад,
// тягнула характеристики й FAQ навіть тим, хто прийшов дивитись запити).

const TABS: { href: string; label: string; exact?: boolean; hint: string }[] = [
  { href: '/admin/seo',            label: 'Запити',    exact: true, hint: 'Запити з Search Console і дожим під них' },
  { href: '/admin/seo/pages',      label: 'Сторінки',  hint: 'Зріз по сторінках: покази, кліки, позиція, динаміка' },
  { href: '/admin/seo/demand',     label: 'Попит',     hint: 'Що шукають: топ товарів за попитом і запити без своєї картки' },
  { href: '/admin/seo/snippets',   label: 'Сніпети',   hint: 'Втрати CTR і фактичні title/description зі сторінок' },
  { href: '/admin/seo/products',   label: 'Товари',    hint: 'Черга товарів з пробілами контенту' },
  { href: '/admin/seo/categories', label: 'Категорії', hint: 'Текст категорії проти фактичного асортименту' },
  { href: '/admin/seo/ai',         label: 'ШІ',        hint: 'Візити ШІ-краулерів і переходи з ChatGPT, Perplexity, Gemini' },
  { href: '/admin/seo/log',        label: 'Журнал',    hint: 'Що робили зі сторінками і що це дало' },
  { href: '/admin/seo/guide',      label: 'Довідник',  hint: 'Тижневий цикл, таблиця рішень і довідка по всіх вкладках' },
];

export default function SeoTabs() {
  const pathname = usePathname();
  const active = (t: typeof TABS[number]) => (t.exact ? pathname === t.href : pathname.startsWith(t.href));

  return (
    <nav className="fin-tabs" aria-label="Розділи SEO">
      {TABS.map(t => (
        <Link key={t.href} href={t.href} title={t.hint} className={'fin-tab' + (active(t) ? ' active' : '')}>
          {t.label}
        </Link>
      ))}
    </nav>
  );
}
