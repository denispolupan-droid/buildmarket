import Link from 'next/link';

// Шапка сторінки категорії. Свідомо компактна (~120 px): під нею одразу
// листинг, тож повноцінний hero з лендингів тут шкодив би — відсував би товар
// за перший екран. Від фірмового стилю беремо надзаголовок, кегль і легкий
// градієнт, але не воздух по 72 px.

type Props = {
  lang: 'uk' | 'ru';
  name: string;
  parent?: { name: string; slug: string } | null;
  description?: string | null;
  count: number;
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

export default function CategoryHeader({ lang, name, parent, description, count }: Props) {
  const t = T[lang];
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

        <span className="eyebrow" style={{ marginTop: '10px' }}>{parent ? parent.name : t.section}</span>
        <h1>{name}</h1>

        <div style={{ display: 'flex', alignItems: 'baseline', gap: '10px', flexWrap: 'wrap', marginTop: '8px' }}>
          {description && (
            <p style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.6, margin: 0, maxWidth: '760px' }}>
              {description}
            </p>
          )}
          {count > 0 && (
            <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--brand-blue)', whiteSpace: 'nowrap' }}>
              {t.items(count)}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
