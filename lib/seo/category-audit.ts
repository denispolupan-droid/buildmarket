import type { CategoryMeta } from '../category-descriptions';

// Аудит категорійного контенту: чи не розійшовся текст категорії з фактичним
// асортиментом. Перевіряються лише машинно-перевірювані твердження — бренди
// (закритий список із БД), наявність товару та повнота FAQ. Прозу («текст
// обіцяє наждачний папір») автоматично не перевіряємо: там самі лише
// хибні спрацювання.
//
// Бренди шукаємо НЕ по всьому тексту, а лише в «каталожному» реченні — тому,
// що містить FIXLINE. За конвенцією саме там перелічують асортимент, і завдяки
// цьому проза на кшталт «конструкційних сталей» не читається як бренд «Сталь».

export type AuditCategory = { slug: string; name: string; parent_slug: string | null };
export type AuditProduct = { category_slug: string | null; brand: string | null };

export type CategoryAuditGaps = {
  /** є текст, але жодного активного товару — сторінка порожня */
  noProducts: boolean;
  /** є товар, але немає курованого тексту */
  noMeta: boolean;
  /** у seoText немає переліку асортименту — текст не прив'язаний до каталогу */
  noCatalogLine: boolean;
  /** у тексті названі бренди, яких у категорії вже немає */
  staleBrands: boolean;
  /** помітна частка асортименту не згадана в тексті */
  missingBrands: boolean;
  /** менше 4 питань FAQ хоча б однією мовою */
  thinFaq: boolean;
  /** російська версія відстає від української */
  ruBehind: boolean;
  /** blogSlug вказує на статтю, якої немає — кнопка «Читати статтю» веде в 404 */
  deadBlogLink: boolean;
};

export type CategoryAuditRow = {
  slug: string;
  name: string;
  productCount: number;
  actualBrands: { brand: string; count: number }[];
  claimedBrands: string[];
  staleBrands: string[];
  missingBrands: string[];
  uaFaq: number;
  ruFaq: number;
  /** slug статті, на яку посилається категорія, якщо такої статті немає */
  deadBlogSlug: string | null;
  gaps: CategoryAuditGaps;
};

/** Бренд згадано в тексті, якщо стоїть окремим словом (з урахуванням кирилиці). */
function mentions(text: string, brand: string): boolean {
  const escaped = brand.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(?<!\\p{L})${escaped}(?!\\p{L})`, 'iu').test(text);
}

/** Речення з переліком асортименту. Порожній рядок, якщо його немає. */
export function catalogSentence(seoText: string | undefined): string {
  if (!seoText || !seoText.includes('FIXLINE')) return '';
  return seoText
    .split(/(?<=[.!?])\s+/)
    .filter(s => s.includes('FIXLINE'))
    .join(' ');
}

/** Бренд вважаємо «пропущеним», лише якщо він помітний — інакше буде шум. */
const MIN_SHARE = 0.1;
const MIN_COUNT = 3;
const MIN_FAQ = 4;

export function auditCategories(input: {
  categories: AuditCategory[];
  products: AuditProduct[];
  metaUa: Record<string, CategoryMeta>;
  metaRu: Record<string, CategoryMeta>;
  brands: string[];
  /** slug'и опублікованих статей блогу; без них перевірку посилань пропускаємо */
  blogSlugs?: string[];
}): CategoryAuditRow[] {
  const { categories, products, metaUa, metaRu, brands, blogSlugs } = input;
  const knownBlog = blogSlugs ? new Set(blogSlugs) : null;

  // Товари прив'язані до підкатегорій — для батьківської беремо всю родину
  const children = new Map<string, string[]>();
  for (const c of categories) {
    if (!c.parent_slug) continue;
    if (!children.has(c.parent_slug)) children.set(c.parent_slug, []);
    children.get(c.parent_slug)!.push(c.slug);
  }
  const family = (slug: string): Set<string> => {
    const out = [slug];
    for (let i = 0; i < out.length; i++) for (const k of children.get(out[i]) ?? []) out.push(k);
    return new Set(out);
  };

  const bySlug = new Map<string, AuditProduct[]>();
  for (const p of products) {
    if (!p.category_slug) continue;
    if (!bySlug.has(p.category_slug)) bySlug.set(p.category_slug, []);
    bySlug.get(p.category_slug)!.push(p);
  }

  const slugs = new Set([...categories.map(c => c.slug), ...Object.keys(metaUa)]);
  const rows: CategoryAuditRow[] = [];

  for (const slug of slugs) {
    const cat = categories.find(c => c.slug === slug);
    const ua = metaUa[slug];
    const ru = metaRu[slug];

    const fam = family(slug);
    const items = [...fam].flatMap(s => bySlug.get(s) ?? []);
    const productCount = items.length;

    // Категорія не існує ні в БД, ні в товарах, ні в тексті — пропускаємо
    if (!cat && !ua) continue;

    const counts = new Map<string, number>();
    for (const p of items) if (p.brand) counts.set(p.brand, (counts.get(p.brand) ?? 0) + 1);
    const actualBrands = [...counts.entries()]
      .map(([brand, count]) => ({ brand, count }))
      .sort((a, b) => b.count - a.count);

    const sentence = catalogSentence(ua?.seoText);
    const claimedBrands = sentence ? brands.filter(b => mentions(sentence, b)) : [];
    const actualSet = new Set(actualBrands.map(b => b.brand));

    const staleBrands = claimedBrands.filter(b => !actualSet.has(b));
    const missingBrands = sentence
      ? actualBrands
          .filter(b => b.count >= MIN_COUNT && b.count / productCount >= MIN_SHARE)
          .map(b => b.brand)
          .filter(b => !claimedBrands.includes(b))
      : [];

    const uaFaq = ua?.faq?.length ?? 0;
    const ruFaq = ru?.faq?.length ?? 0;

    // Стаття могла бути перейменована чи знята з публікації — тоді кнопка
    // «Читати статтю» на сторінці категорії веде в 404. Дивимось обидві мови:
    // RU-карта має власні blogSlug і теж може відстати.
    const linked = [ua?.blogSlug, ru?.blogSlug].filter(Boolean) as string[];
    const deadBlogSlug = knownBlog ? (linked.find(s => !knownBlog.has(s)) ?? null) : null;

    rows.push({
      slug,
      name: cat?.name ?? slug,
      productCount,
      actualBrands,
      claimedBrands,
      staleBrands,
      missingBrands,
      uaFaq,
      ruFaq,
      deadBlogSlug,
      gaps: {
        noProducts: !!ua && productCount === 0,
        noMeta: !ua && productCount > 0,
        noCatalogLine: !!ua && productCount > 0 && !sentence,
        staleBrands: staleBrands.length > 0,
        missingBrands: missingBrands.length > 0,
        thinFaq: !!ua && productCount > 0 && (uaFaq < MIN_FAQ || ruFaq < MIN_FAQ),
        ruBehind: !!ua && (!ru || ruFaq < uaFaq),
        deadBlogLink: deadBlogSlug !== null,
      },
    });
  }

  return rows.sort((a, b) => b.productCount - a.productCount);
}

export function hasCategoryGap(row: CategoryAuditRow): boolean {
  return Object.values(row.gaps).some(Boolean);
}
