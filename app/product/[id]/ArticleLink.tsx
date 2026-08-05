import Link from 'next/link';
import { BookOpen } from 'lucide-react';

// Картка-посилання «Корисна стаття по темі» — той самий візуальний ряд, що
// картки DeliveryInfo (іконка у фірмово-синій плашці).

type Props = {
  blogSlug: string;
  lang?: 'uk' | 'ru';
};

const T = {
  uk: { label: 'Корисна стаття по темі', read: 'Читати статтю →' },
  ru: { label: 'Полезная статья по теме', read: 'Читать статью →' },
};

export default function ArticleLink({ blogSlug, lang = 'uk' }: Props) {
  const t = T[lang];
  const prefix = lang === 'ru' ? '/ru' : '';
  return (
    <Link href={`${prefix}/blog/${blogSlug}`} className="article-link-card">
      <span className="delivery-card__icon"><BookOpen size={18} strokeWidth={1.8} /></span>
      <span style={{ flex: 1, minWidth: 0, fontSize: '14px', color: 'var(--text-secondary)' }}>{t.label}</span>
      <span className="article-link-card__cta">{t.read}</span>
    </Link>
  );
}
