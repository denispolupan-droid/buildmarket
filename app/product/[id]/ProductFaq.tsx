import type { ProductFaqItem } from '../../../lib/supabase';

// FAQ-блок товару (SEO_SPEC Фаза 5.5): серверний рендер, довгий хвіст запитів.
// FAQPage JSON-LD рендериться поруч у page.tsx.

type Props = {
  faq: ProductFaqItem[];
  lang?: 'uk' | 'ru';
};

export function faqText(item: ProductFaqItem, lang: 'uk' | 'ru'): { q: string; a: string } {
  if (lang === 'ru') {
    return { q: item.question_ru ?? item.question, a: item.answer_ru ?? item.answer };
  }
  return { q: item.question, a: item.answer };
}

export default function ProductFaq({ faq, lang = 'uk' }: Props) {
  if (!faq.length) return null;
  const title = lang === 'ru' ? 'Частые вопросы' : 'Часті питання';
  return (
    <section style={{ margin: '24px 0', padding: '16px 20px', borderRadius: '10px', border: '1px solid var(--border)', background: 'var(--bg-card)' }}>
      <h2 style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 12px' }}>
        {title}
      </h2>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        {faq.map((item, i) => {
          const { q, a } = faqText(item, lang);
          return (
            <div key={i}>
              <h3 style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)', margin: '0 0 4px' }}>{q}</h3>
              <p style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.65, margin: 0 }}>{a}</p>
            </div>
          );
        })}
      </div>
    </section>
  );
}
