'use client';

import Link from 'next/link';
import { useCategoryView } from '../../lib/category-view';

// Шапка сторінки категорії. Свідомо компактна: під нею одразу листинг, тож
// повноцінний hero з лендингів тут шкодив би — відсував би товар за перший екран.
//
// Опис стоїть праворуч від заголовка, а не під ним: сторінка магазину не має
// обмеження по ширині, і колонка тексту на 760px лишала половину екрана порожньою.
// Двома колонками шапка ще й нижча, тож товар піднімається вище.
//
// Клієнтський компонент із серверним первинним рендером: при прямому заході
// текст у HTML з пропсів; при клієнтському перемиканні категорії в сайдбарі
// ShopClient публікує свіжі дані у category-view — шапка оновлюється миттєво,
// без навігації (див. коментар у lib/category-view.ts).

type Props = {
  lang: 'uk' | 'ru';
  /** Порожньо на /shop: шапка з'явиться, щойно оберуть категорію в сайдбарі */
  name?: string;
  parent?: { name: string; slug: string } | null;
  description?: string | null;
  count?: number;
};

const T = {
  uk: { home: 'Головна', shop: 'Магазин', section: 'Категорія', items: (n: number) => `${n} ${plural(n, 'товар', 'товари', 'товарів')}` },
  ru: { home: 'Главная', shop: 'Магазин', section: 'Категория', items: (n: number) => `${n} ${plural(n, 'товар', 'товара', 'товаров')}` },
};

function plural(n: number, one: string, few: string, many: string): string {
  const mod10 = n % 10, mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
  return many;
}

export default function CategoryHeader(props: Props) {
  // Опубліковане для поточної адреси — авторитетне, НАВІТЬ якщо header: null
  // (клік «Всі категорії»: шапка має зникнути, а не відкотитись до пропсів).
  const view = useCategoryView();
  const data = view ? view.header : (props.name ? props : null);
  const lang = data?.lang ?? props.lang;
  const t = T[lang];
  if (!data || !data.name) return null;
  const { name, parent, description, count = 0 } = data;
  const prefix = lang === 'ru' ? '/ru' : '';
  const crumb: React.CSSProperties = { color: 'var(--text-muted)', textDecoration: 'none' };

  return (
    <div className="cat-head">
      <div style={{ margin: '0 auto', padding: '0 16px' }} className="mobile-pad">
        <nav aria-label="Breadcrumb" style={{ fontSize: '12px', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
          <Link href={`${prefix}/`} style={crumb}>{t.home}</Link>
          <span>/</span>
          <Link href={`${prefix}/shop`} style={crumb}>{t.shop}</Link>
          {parent && (
            <>
              <span>/</span>
              <Link href={`${prefix}/shop/${parent.slug}`} style={crumb}>{parent.name}</Link>
            </>
          )}
          <span>/</span>
          <span style={{ color: 'var(--text-secondary)' }}>{name}</span>
        </nav>

        {/* Ліва колонка по ширині заголовка, а не половина екрана: інакше опис
            починався з середини й ламався на три рядки замість двох. */}
        <div className="cat-head-grid" style={{ display: 'grid', gridTemplateColumns: 'minmax(0, max-content) minmax(0, 1fr)', gap: '36px', alignItems: 'center', marginTop: '10px' }}>
          <div>
            <span className="eyebrow">{parent ? parent.name : t.section}</span>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: '12px', flexWrap: 'wrap' }}>
              <h1>{name}</h1>
              {count > 0 && (
                <span style={{
                  fontSize: '12px', fontWeight: 700, color: 'var(--brand-blue)',
                  background: 'var(--brand-blue-light)', borderRadius: '20px',
                  padding: '3px 10px', whiteSpace: 'nowrap',
                }}>
                  {t.items(count)}
                </span>
              )}
            </div>
          </div>

          {description && (
            <p style={{ fontSize: '14px', color: 'var(--text-secondary)', lineHeight: 1.65, margin: 0, maxWidth: '92ch' }}>
              {description}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
