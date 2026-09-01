import Link from 'next/link';
import { createElement } from 'react';
import { ArrowRight } from 'lucide-react';
import Reveal from './Reveal';
import { categoryAccent, categoryIcon } from '../../lib/category-icons';
import { getCategoryContentCached } from '../../lib/category-content';
import { getCategoryNameRu, getCategoryDescriptionRu } from '../../lib/ru';
import { HOME_CATEGORY_CARDS } from '../../lib/home-categories';
import type { Category } from '../../types';

/**
 * Великі картки популярних категорій під пошуком на головній — стиль карток
 * блогу (.blog-card): велика іконка родини на тонованій підкладці, назва,
 * опис категорії та «Перейти». Кольори і іконки — з lib/category-icons.
 */
type Props = {
  categories: Category[];
  lang: 'uk' | 'ru';
  max?: number;
};

export default async function HomeCategoryCards({ categories, lang, max = HOME_CATEGORY_CARDS }: Props) {
  const content = await getCategoryContentCached(lang);
  const prefix = lang === 'ru' ? '/ru' : '';
  const allRoots = categories
    .filter(c => !c.parent_slug)
    .sort((a, b) => a.sort_order - b.sort_order);
  const roots = allRoots.slice(0, max);
  // Решта родин — компактними пігулками під сіткою: з головної доступні ВСІ
  // категорії, і не виникає враження, що шість карток — весь асортимент.
  const rest = allRoots.slice(max);

  return (
    <>
    <div className="home-cat-grid">
      {roots.map((c, i) => {
        const accent = categoryAccent(c.slug) ?? 'var(--brand-blue)';
        const icon = categoryIcon(c.slug);
        const name = lang === 'ru' ? getCategoryNameRu(c.slug, c.name) : c.name;
        const description = content[c.slug]?.description ?? (lang === 'ru' ? getCategoryDescriptionRu(c.slug, name) : '');
        return (
          <Reveal key={c.slug} delay={i * 70} style={{ height: '100%' }}>
          <Link href={`${prefix}/shop?category=${c.slug}`} className="blog-card home-cat-card" style={{
            display: 'flex', flexDirection: 'column', height: '100%',
            background: 'var(--bg-card)', border: '1px solid var(--border)',
            // Без кольорової смуги зверху: колір родини вже є в тонованій шапці
            // та іконці — смуга була б третім акцентом. Смуги лишаються прийомом
            // БІЛИХ карток («Як ми працюємо», формати співпраці).
            borderRadius: '16px', overflow: 'hidden', textDecoration: 'none',
          }}>
            <div style={{
              height: '118px',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: `color-mix(in srgb, ${accent} 16%, var(--bg-card))`,
            }}>
              <span style={{
                width: '64px', height: '64px', borderRadius: '18px',
                background: `color-mix(in srgb, ${accent} 18%, transparent)`, color: accent,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }} aria-hidden>
                {icon && createElement(icon, { size: 32, strokeWidth: 1.75 })}
              </span>
            </div>
            <div style={{ padding: '18px 20px 20px', display: 'flex', flexDirection: 'column', flex: 1, gap: '8px' }}>
              <h3 style={{ fontSize: '16px', fontWeight: 800, color: 'var(--text-primary)', margin: 0, lineHeight: 1.3 }}>{name}</h3>
              {description && (
                <p className="home-cat-card__desc" style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.6, margin: 0 }}>
                  {description}
                </p>
              )}
              <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--brand-blue)', display: 'flex', alignItems: 'center', gap: '4px', marginTop: 'auto', paddingTop: '4px' }}>
                {lang === 'ru' ? 'Перейти' : 'Перейти'} <ArrowRight size={14} />
              </span>
            </div>
          </Link>
          </Reveal>
        );
      })}
    </div>

    {rest.length > 0 && (
      <Reveal delay={120}>
        <div className="home-cat-rest">
          {rest.map(c => {
            const accent = categoryAccent(c.slug) ?? 'var(--brand-blue)';
            const icon = categoryIcon(c.slug);
            const name = lang === 'ru' ? getCategoryNameRu(c.slug, c.name) : c.name;
            return (
              <Link key={c.slug} href={`${prefix}/shop?category=${c.slug}`} className="home-cat-pill"
                style={{
                  // Заливка й межа — у кольорі родини, як у шапках карток вище
                  background: `color-mix(in srgb, ${accent} 16%, var(--bg-card))`,
                  borderColor: `color-mix(in srgb, ${accent} 30%, transparent)`,
                }}>
                {icon && (
                  <span className="home-cat-pill__icon" style={{ color: accent }} aria-hidden>
                    {createElement(icon, { size: 15, strokeWidth: 2 })}
                  </span>
                )}
                {name}
              </Link>
            );
          })}
          <Link href={`${prefix}/shop`} className="home-cat-pill home-cat-pill--all">
            {lang === 'ru' ? 'Все категории' : 'Всі категорії'} <ArrowRight size={14} />
          </Link>
        </div>
      </Reveal>
    )}
    </>
  );
}
