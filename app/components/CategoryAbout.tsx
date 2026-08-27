'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';
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
// Гайд (meta.guide) — окремим блоком під сіткою, на всю ширину, але в межах
// 68ch: це довгий текст із підзаголовками, у вузькій колонці поруч із FAQ він
// перетворився б на стовпчик. Навіщо він узагалі: категорії стояли на
// позиціях 40–60 при живому попиті («грунтовка концентрат» — 120 показів/міс),
// бо для пошуку листинг із абзацом — сторінка без відповіді, а статті блогу з
// відповіддю — на 5–8. Гайд дає відповідь на самій категорії. Стоїть ПІД
// товарами: перший екран лишається за товарами.

type Props = {
  lang: 'uk' | 'ru';
  name: string;
  meta: CategoryMeta;
};

const T = {
  uk: { eyebrow: 'Про категорію', faq: 'Часті питання', read: 'Читати статтю', related: 'Дивіться також' },
  ru: { eyebrow: 'О категории',   faq: 'Частые вопросы', read: 'Читать статью', related: 'Смотрите также' },
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
    out.push(<Link key={m.index} href={`${prefix}${m[2]}`} style={{ color: 'var(--brand-blue)', fontWeight: 600 }}>{m[1]}</Link>);
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

// Клієнтський компонент із серверним первинним рендером: рендериться зсередини
// ShopClient/CatalogClient від поточної категорії, тож при прямому заході текст
// потрапляє в HTML, а при клієнтському перемиканні оновлюється тим самим кадром.
export default function CategoryAbout({ lang, name, meta }: Props) {
  const t = T[lang];
  const prefix = lang === 'ru' ? '/ru' : '';
  const faq = meta.faq ?? [];
  const guide = meta.guide;
  const related = meta.related ?? [];

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

      {/* Гайд «Як вибрати» */}
      {guide && (
        <div className="cat-guide" style={{ marginTop: '40px', maxWidth: '68ch' }}>
          <Reveal>
            <h2 style={{ fontSize: 'clamp(20px, 2.2vw, 24px)', fontWeight: 800, color: 'var(--text-primary)', margin: '0 0 8px', letterSpacing: '-0.3px' }}>
              {guide.title}
            </h2>
          </Reveal>
          {guide.sections.map((s, i) => (
            <Reveal key={s.h} delay={Math.min(i, 4) * 40}>
              <h3 style={{ fontSize: '17px', fontWeight: 700, color: 'var(--text-primary)', margin: '24px 0 6px' }}>{s.h}</h3>
              {s.p.map((para, j) => (
                <p key={j} style={{ fontSize: '15px', color: 'var(--text-secondary)', lineHeight: 1.75, margin: '10px 0 0' }}>
                  {withLinks(para, prefix)}
                </p>
              ))}
            </Reveal>
          ))}
        </div>
      )}

      {/* Суміжні категорії та статті — навігація для людини і вага для пошуку */}
      {related.length > 0 && (
        <div style={{ marginTop: '32px' }}>
          <h3 style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-muted)', margin: '0 0 10px', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
            {t.related}
          </h3>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
            {related.map(r => (
              <Link
                key={r.href}
                href={`${prefix}${r.href}`}
                style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)', textDecoration: 'none', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '999px', padding: '6px 12px' }}
              >
                {r.label} →
              </Link>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
