import { createClient } from '@supabase/supabase-js';
import { unstable_cache } from 'next/cache';
import type { CategoryMeta, CategoryFaq, CategoryGuide, CategoryRelated } from './category-descriptions';
import type { Category, ProductStockPublic } from '../types';
import { categoryFamilySlugs, retailPrice } from './seo/meta';
import { resolveGuidePrices } from './seo/guide-prices';

/**
 * Контент категорій (опис, seoText, FAQ, гайд «Як вибрати», «Дивіться також»)
 * живе в таблиці category_content — по рядку на категорію й мову; ru —
 * самостійний текст, не переклад. До 28.08.2026 усе це лежало в коді
 * (lib/category-descriptions*.ts, ~780 КБ) і правилось лише деплоєм; знімок
 * на момент переїзду — supabase/seed/category_content.json.
 *
 * Читання — одним запитом на мову, у кеші Next під тегом category-content:
 * сторінки категорій ISR, і кожна тягнула б свій рядок окремо. Адмінка після
 * збереження робить revalidateTag('category-content').
 *
 * Ціни в текстах — токенами {price:SKU} (lib/seo/guide-prices); сюди вони
 * потрапляють сирими, підставляє їх resolveCategoryMeta на рендері.
 */

export type CategoryContentRow = {
  slug: string;
  lang: 'uk' | 'ru';
  description: string;
  seo_text: string | null;
  faq: CategoryFaq[];
  guide: CategoryGuide | null;
  related: CategoryRelated[];
  blog_slug: string | null;
  source: 'seed' | 'manual' | 'ai';
  updated_at: string;
  updated_by: string | null;
};

export const CATEGORY_CONTENT_TAG = 'category-content';

const db = () => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

export function rowToMeta(r: CategoryContentRow): CategoryMeta {
  return {
    description: r.description,
    ...(r.seo_text ? { seoText: r.seo_text } : {}),
    ...(r.faq?.length ? { faq: r.faq } : {}),
    ...(r.blog_slug ? { blogSlug: r.blog_slug } : {}),
    ...(r.guide ? { guide: r.guide } : {}),
    ...(r.related?.length ? { related: r.related } : {}),
  };
}

async function loadAll(lang: 'uk' | 'ru'): Promise<Record<string, CategoryMeta>> {
  // Категорій < 100, без пагінації — але з явним лімітом, щоб не впертись у 1000 мовчки
  const { data, error } = await db()
    .from('category_content')
    .select('slug, lang, description, seo_text, faq, guide, related, blog_slug, source, updated_at, updated_by')
    .eq('lang', lang)
    .limit(1000);
  if (error) throw error;
  const out: Record<string, CategoryMeta> = {};
  for (const r of (data ?? []) as CategoryContentRow[]) out[r.slug] = rowToMeta(r);
  return out;
}

/** Уся мета мовою: slug → CategoryMeta. Кешується 5 хв, скидається тегом. */
export const getCategoryContentCached = unstable_cache(
  loadAll,
  ['category-content'],
  { revalidate: 300, tags: [CATEGORY_CONTENT_TAG] },
);

/** Найсвіжіший updated_at по категорії (обидві мови) — lastmod у sitemap: переписаний гайд має сигналити Google перечитати сторінку. */
export const getCategoryContentUpdatedCached = unstable_cache(
  async (): Promise<Record<string, string>> => {
    const { data, error } = await db().from('category_content').select('slug, updated_at').limit(1000);
    if (error) throw error;
    const out: Record<string, string> = {};
    for (const r of (data ?? []) as { slug: string; updated_at: string }[]) if (!out[r.slug] || r.updated_at > out[r.slug]) out[r.slug] = r.updated_at;
    return out;
  },
  ['category-content-updated'],
  { revalidate: 300, tags: [CATEGORY_CONTENT_TAG] },
);

export async function getCategoryMeta(slug: string, lang: 'uk' | 'ru' = 'uk'): Promise<CategoryMeta | null> {
  return (await getCategoryContentCached(lang))[slug] ?? null;
}

/** Сирий рядок для адмінки — без кешу, з полями source/updated_*. */
export async function getCategoryContentRows(slug: string): Promise<Partial<Record<'uk' | 'ru', CategoryContentRow>>> {
  const { data, error } = await db().from('category_content').select('*').eq('slug', slug);
  if (error) throw error;
  const out: Partial<Record<'uk' | 'ru', CategoryContentRow>> = {};
  for (const r of (data ?? []) as CategoryContentRow[]) out[r.lang] = r;
  return out;
}

export type CategoryContentInput = {
  description: string;
  seoText?: string | null;
  faq?: CategoryFaq[];
  guide?: CategoryGuide | null;
  related?: CategoryRelated[];
  blogSlug?: string | null;
};

/** Запис із адмінки (service role). Кеш скидає викликач через revalidateTag. */
export async function saveCategoryContent(
  slug: string,
  lang: 'uk' | 'ru',
  input: CategoryContentInput,
  by: { source: 'manual' | 'ai'; user: string | null },
): Promise<void> {
  const { error } = await db().from('category_content').upsert({
    slug,
    lang,
    description: input.description.trim(),
    seo_text: input.seoText?.trim() || null,
    faq: (input.faq ?? []).filter(f => f.q.trim() && f.a.trim()),
    guide: input.guide && input.guide.sections.length ? input.guide : null,
    related: (input.related ?? []).filter(r => r.href.trim() && r.label.trim()),
    blog_slug: input.blogSlug?.trim() || null,
    source: by.source,
    updated_at: new Date().toISOString(),
    updated_by: by.user,
  }, { onConflict: 'slug,lang' });
  if (error) throw error;
}

/**
 * Мета категорії потрібною мовою з живими цінами — одна точка для ShopLoader,
 * CatalogLoader, /api/category-meta, .md-версії та FAQ JSON-LD. Ціна товару —
 * та сама, що на ціннику (retailPrice: promo ?? retail); родина — як у листингу.
 */
export async function resolveCategoryMeta(
  slug: string,
  lang: 'uk' | 'ru',
  products: { sku: string; category_slug: string | null; stock: ProductStockPublic | null }[],
  categories: Pick<Category, 'slug' | 'parent_slug'>[],
): Promise<CategoryMeta | null> {
  const meta = await getCategoryMeta(slug, lang);
  if (!meta) return null;
  const priced = products.map(p => ({ sku: p.sku, category_slug: p.category_slug, price: retailPrice(p) }));
  return resolveGuidePrices(meta, priced, categoryFamilySlugs(categories, slug)).meta;
}
