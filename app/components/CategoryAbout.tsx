'use client';

import Link from 'next/link';
import Reveal from './Reveal';
import { useCategoryView } from '../../lib/category-view';
import type { CategoryMeta } from '../../lib/category-descriptions';

// Текстовий блок під листингом: опис категорії, розгорнутий SEO-текст і FAQ.
//
// Той самий контент до цього рендерив ShopClient — клієнтсько, і на сторінці
// /shop/[category] показувався двічі (див. hideCategoryInfo). Тут він у
// серверному HTML, тобто присутній ще до виконання JS.
//
// Дві колонки: проза ліворуч, питання праворуч. Одна колонка на всю ширину
// сторінки (у магазину немає max-width) або лишала половину екрана порожньою,
// або розтягувала рядок до нечитабельної довжини.

type Props = {
  lang: 'uk' | 'ru';
  /** Порожньо на /shop: блок з'явиться, щойно оберуть категорію в сайдбарі */
  name?: string;
  meta?: CategoryMeta;
};

const T = {
  uk: { eyebrow: 'Про категорію', faq: 'Часті питання', read: 'Читати статтю' },
  ru: { eyebrow: 'О категории',   faq: 'Частые вопросы', read: 'Читать статью' },
};

// Клієнтський компонент із серверним первинним рендером — як CategoryHeader:
// прямий захід бере пропси (текст у HTML), клієнтське перемикання категорії
// підхоплює живі дані з category-view.
export default function CategoryAbout(props: Props) {
  // Опубліковане для поточної адреси — авторитетне, навіть якщо about: null
  const view = useCategoryView();
  const data = view ? view.about : (props.meta ? props : null);
  if (!data || !data.meta || !data.name) return null;
  const { lang, name, meta } = data as { lang: 'uk' | 'ru'; name: string; meta: CategoryMeta };
  const t = T[lang];
  const prefix = lang === 'ru' ? '/ru' : '';
  const faq = meta.faq ?? [];

  return (
    <section style={{ marginTop: '40px', paddingTop: '32px', borderTop: '1px solid var(--border)' }}>
      <div
        className="cat-about-grid"
        style={{ display: 'grid', gridTemplateColumns: faq.length ? 'minmax(0, 1fr) minmax(0, 1fr)' : 'minmax(0, 1fr)', gap: '40px', alignItems: 'start' }}
      >
        {/* Проза */}
        <div>
          <Reveal>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '16px', flexWrap: 'wrap' }}>
              <div>
                <span className="eyebrow alt">{t.eyebrow}</span>
                <h2 style={{ fontSize: 'clamp(18px, 2vw, 22px)', fontWeight: 800, color: 'var(--text-primary)', margin: '8px 0 0', letterSpacing: '-0.3px' }}>
                  {name}
                </h2>
              </div>
              {meta.blogSlug && (
                <Link
                  href={`${prefix}/blog/${meta.blogSlug}`}
                  style={{ fontSize: '13px', fontWeight: 700, color: 'var(--brand-blue)', textDecoration: 'none', whiteSpace: 'nowrap', marginTop: '18px' }}
                >
                  {t.read} →
                </Link>
              )}
            </div>
          </Reveal>

          <Reveal delay={80}>
            <p style={{ fontSize: '15px', color: 'var(--text-secondary)', lineHeight: 1.75, margin: '16px 0 0', maxWidth: '68ch' }}>
              {meta.description}
            </p>
            {meta.seoText && (
              <p style={{ fontSize: '14px', color: 'var(--text-secondary)', lineHeight: 1.75, margin: '14px 0 0', maxWidth: '68ch' }}>
                {meta.seoText}
              </p>
            )}
          </Reveal>
        </div>

        {/* Питання */}
        {faq.length > 0 && (
          <div>
            <Reveal>
              <h3 style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-muted)', margin: '0 0 14px', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                {t.faq}
              </h3>
            </Reveal>
            <div className="faq-accordion" style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {faq.map(({ q, a }, i) => (
                <Reveal key={q} delay={i * 40}>
                  <details style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '12px', padding: '14px 18px' }}>
                    <summary style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)', cursor: 'pointer' }}>{q}</summary>
                    <p style={{ fontSize: '14px', color: 'var(--text-secondary)', lineHeight: 1.7, margin: '10px 0 0' }}>{a}</p>
                  </details>
                </Reveal>
              ))}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
