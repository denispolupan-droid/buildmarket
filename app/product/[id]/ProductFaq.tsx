import type { CSSProperties } from 'react';
import type { ProductFaqItem } from '../../../lib/supabase';

// FAQ-блок товару (SEO_SPEC Фаза 5.5): серверний рендер, довгий хвіст запитів.
// FAQPage JSON-LD рендериться поруч у page.tsx. Відповіді лежать у DOM і в
// згорнутих <details> — SEO-текст присутній без JS.

type Props = {
  faq: ProductFaqItem[];
  lang?: 'uk' | 'ru';
  /** Колір товарної родини (CATEGORY_COLORS) — фарбує заголовок секції */
  accent?: string;
};

export function faqText(item: ProductFaqItem, lang: 'uk' | 'ru'): { q: string; a: string } {
  if (lang === 'ru') {
    return { q: item.question_ru ?? item.question, a: item.answer_ru ?? item.answer };
  }
  return { q: item.question, a: item.answer };
}

export default function ProductFaq({ faq, lang = 'uk', accent }: Props) {
  if (!faq.length) return null;
  const title = lang === 'ru' ? 'Частые вопросы' : 'Часті питання';
  return (
    <section
      className="product-brand-section"
      style={{ margin: '24px 0', ...(accent ? ({ '--cat-accent': accent } as CSSProperties) : {}) }}
    >
      <h2 className="product-brand-section__title">{title}</h2>
      <div className="faq-accordion" style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {faq.map((item, i) => {
          const { q, a } = faqText(item, lang);
          return (
            <details key={i} style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '12px', padding: '12px 16px' }}>
              <summary style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)', cursor: 'pointer' }}>{q}</summary>
              <p style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.7, margin: '8px 0 0' }}>{a}</p>
            </details>
          );
        })}
      </div>
    </section>
  );
}
