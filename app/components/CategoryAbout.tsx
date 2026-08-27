'use client';

import Link from 'next/link';
import { useState, type ReactNode } from 'react';
import Reveal from './Reveal';
import type { CategoryMeta } from '../../lib/category-descriptions';

// Текстовий блок під листингом: опис категорії, розгорнутий SEO-текст, гайд
// «Як вибрати» і FAQ.
//
// Той самий контент до цього рендерив ShopClient — клієнтсько, і на сторінці
// /shop/[category] показувався двічі (див. hideCategoryInfo). Тут він у
// серверному HTML, тобто присутній ще до виконання JS.
//
// Дві колонки: проза ліворуч, питання праворуч. Одна колонка на всю ширину
// сторінки (у магазину немає max-width) або лишала половину екрана порожньою,
// або розтягувала рядок до нечитабельної довжини.
//
// Гайд (meta.guide) — окремою карткою під сіткою, на всю ширину, у кольорі
// родини категорії (--cat-accent, як у сайдбарі й зоні заголовка). Навіщо він:
// категорії стояли на позиціях 40–60 при живому попиті («грунтовка концентрат»
// — 120 показів/міс), бо для пошуку листинг із абзацом — сторінка без
// відповіді, а статті блогу з відповіддю — на 5–8. Гайд дає відповідь на самій
// категорії. Стоїть ПІД товарами і згорнутий за замовчуванням: перший екран —
// за товарами, 600 слів прози не тиснуть на того, хто прийшов купити. Текст
// при цьому ПОВНІСТЮ в HTML (згортання — лише max-height), тож пошук читає
// його цілком, як і приховані вкладки на картці товару.

type Props = {
  lang: 'uk' | 'ru';
  name: string;
  meta: CategoryMeta;
  /** Колір родини категорії (categoryAccent) — фарбує нитку й акценти гайда */
  accent?: string;
};

const T = {
  uk: { eyebrow: 'Про категорію', faq: 'Часті питання', read: 'Читати статтю', related: 'Дивіться також', guide: 'Гід покупця', more: 'Читати повністю', less: 'Згорнути', contents: 'У цьому гіді' },
  ru: { eyebrow: 'О категории',   faq: 'Частые вопросы', read: 'Читать статью', related: 'Смотрите также', guide: 'Гид покупателя', more: 'Читать полностью', less: 'Свернуть', contents: 'В этом гиде' },
};

// Мінімальна розмітка посилань у прозі гайда: [текст](/shop/x) → <Link>. Без
// markdown-парсера навмисно — інший синтаксис у текстах не потрібен, а кожна
// зайва можливість — це ще один спосіб зламати HTML з даних.
function withLinks(text: string, prefix: string): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /\[([^\]]+)\]\((\/[^)\s]+)\)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    // Шляхи в текстах — без мовного префікса, як і в related: на /ru додаємо його тут
    out.push(<Link key={m.index} href={`${prefix}${m[2]}`} className="cat-guide-link">{m[1]}</Link>);
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

const anchorId = (i: number) => `guide-${i + 1}`;

// Клієнтський компонент із серверним первинним рендером: рендериться зсередини
// ShopClient/CatalogClient від поточної категорії, тож при прямому заході текст
// потрапляє в HTML, а при клієнтському перемиканні оновлюється тим самим кадром.
export default function CategoryAbout({ lang, name, meta, accent }: Props) {
  const t = T[lang];
  const prefix = lang === 'ru' ? '/ru' : '';
  const faq = meta.faq ?? [];
  const guide = meta.guide;
  const related = meta.related ?? [];
  const [open, setOpen] = useState(false);

  return (
    <section
      style={{ marginTop: '40px', paddingTop: '32px', borderTop: '1px solid var(--border)', ...(accent ? ({ '--cat-accent': accent } as React.CSSProperties) : {}) }}
    >
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

      {/* Гайд «Як вибрати» — картка у кольорі родини, згорнута за замовчуванням */}
      {guide && (
        <Reveal>
          <article className={`cat-guide${open ? ' is-open' : ''}`} aria-label={guide.title}>
            <header className="cat-guide-head">
              <div>
                <span className="brand-section-title" style={{ margin: 0 }}>{t.guide}</span>
                <h2 className="cat-guide-title">{guide.title}</h2>
              </div>
              <button type="button" className="cat-guide-toggle" onClick={() => setOpen(o => !o)} aria-expanded={open}>
                {open ? t.less : t.more}
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.25s' }}><polyline points="6 9 12 15 18 9" /></svg>
              </button>
            </header>

            <div className="cat-guide-body">
              <div className="cat-guide-text">
                {guide.sections.map((s, i) => (
                  <section key={s.h} id={anchorId(i)}>
                    <h3 className="cat-guide-h3">{s.h}</h3>
                    {s.p.map((para, j) => <p key={j} className="cat-guide-p">{withLinks(para, prefix)}</p>)}
                  </section>
                ))}
              </div>
              <aside className="cat-guide-toc" aria-label={t.contents}>
                <span className="brand-section-title">{t.contents}</span>
                <ol>
                  {guide.sections.map((s, i) => (
                    <li key={s.h}><a href={`#${anchorId(i)}`} onClick={() => setOpen(true)}>{s.h}</a></li>
                  ))}
                </ol>
              </aside>
            </div>

            {!open && (
              <button type="button" className="cat-guide-more" onClick={() => setOpen(true)} aria-hidden="true" tabIndex={-1}>
                {t.more} ↓
              </button>
            )}
          </article>
        </Reveal>
      )}

      {/* Суміжні категорії та статті — навігація для людини і вага для пошуку */}
      {related.length > 0 && (
        <div style={{ marginTop: '24px' }}>
          <span className="brand-section-title">{t.related}</span>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
            {related.map(r => (
              <Link key={r.href} href={`${prefix}${r.href}`} className="cat-guide-chip">
                {r.label} →
              </Link>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
