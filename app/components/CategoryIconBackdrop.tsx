import { categoryIcon } from '../../lib/category-icons';

/**
 * Декоративна підкладка зони заголовка категорії: стрічка з іконки категорії
 * (та сама, що в сайдбарі), яка тане зліва направо — від щільного до
 * прозорого (mask у .cat-icon-backdrop). Слаг без власної іконки успадковує
 * батьківську; без обох — нічого.
 */
export default function CategoryIconBackdrop({ slug, parentSlug }: { slug?: string | null; parentSlug?: string | null }) {
  const Icon = categoryIcon(slug, parentSlug);
  if (!Icon) return null;
  return (
    <div className="cat-icon-backdrop" aria-hidden="true">
      {Array.from({ length: 9 }, (_, i) => (
        <Icon key={i} size={46} strokeWidth={1.1} />
      ))}
    </div>
  );
}
