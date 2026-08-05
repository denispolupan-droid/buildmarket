import { CATEGORY_ICONS } from '../../lib/category-icons';

/**
 * Декоративна підкладка зони заголовка категорії: стрічка з іконки категорії
 * (та сама, що в сайдбарі), яка тане зліва направо — від щільного до
 * прозорого (mask у .cat-icon-backdrop). Без іконки для slug — нічого.
 */
export default function CategoryIconBackdrop({ slug }: { slug?: string | null }) {
  const Icon = slug ? CATEGORY_ICONS[slug] : undefined;
  if (!Icon) return null;
  return (
    <div className="cat-icon-backdrop" aria-hidden="true">
      {Array.from({ length: 9 }, (_, i) => (
        <Icon key={i} size={46} strokeWidth={1.1} />
      ))}
    </div>
  );
}
