import Link from 'next/link';
import Reveal from './Reveal';
import type { CategoryMeta } from '../../lib/category-descriptions';

// Текстовий блок під листингом: опис категорії, розгорнутий SEO-текст і FAQ.
//
// Українська версія сторінки досі віддавала FAQPage у JSON-LD, але самих
// питань на сторінці не було — розмітка без видимого контенту порушує вимоги
// Google до FAQ-сніпетів, а весь seoText не потрапляв в індекс основною мовою.
// Тепер обидві мови рендерять однаковий блок із того самого джерела.

type Props = {
  lang: 'uk' | 'ru';
  name: string;
  meta: CategoryMeta;
};

const T = {
  uk: { eyebrow: 'Про категорію', faq: 'Часті питання', read: 'Читати статтю' },
  ru: { eyebrow: 'О категории',   faq: 'Частые вопросы', read: 'Читать статью' },
};

export default function CategoryAbout({ lang, name, meta }: Props) {
  const t = T[lang];
  const prefix = lang === 'ru' ? '/ru' : '';
  const hasFaq = !!meta.faq?.length;

  return (
    <section style={{ marginTop: '40px', paddingTop: '32px', borderTop: '1px solid var(--border)' }}>
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
        <p style={{ fontSize: '15px', color: 'var(--text-secondary)', lineHeight: 1.75, margin: '16px 0 0', maxWidth: '860px' }}>
          {meta.description}
        </p>
        {meta.seoText && (
          <p style={{ fontSize: '14px', color: 'var(--text-secondary)', lineHeight: 1.75, margin: '14px 0 0', maxWidth: '860px' }}>
            {meta.seoText}
          </p>
        )}
      </Reveal>

      {hasFaq && (
        <div style={{ marginTop: '32px' }}>
          <Reveal>
            <h3 style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-muted)', margin: '0 0 14px', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
              {t.faq}
            </h3>
          </Reveal>
          <div className="faq-accordion" style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxWidth: '860px' }}>
            {meta.faq!.map(({ q, a }, i) => (
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
    </section>
  );
}
