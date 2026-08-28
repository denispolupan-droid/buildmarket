import { notFound } from 'next/navigation';
import { createClient } from '@supabase/supabase-js';
import { fetchAllRows } from '../../../../../lib/db-paginate';
import { getCategoryContentRows, getCategoryContentCached, type CategoryContentRow } from '../../../../../lib/category-content';
import { auditCategories, type AuditDemand } from '../../../../../lib/seo/category-audit';
import { CATEGORY_NAMES_RU, getCategoryNameRu } from '../../../../../lib/ru';
import { categoryFamilySlugs } from '../../../../../lib/seo/meta';
import { queryAll } from '../../../../../lib/gsc';
import { toLangNeutralPath } from '../../../../../lib/seo/history';
import type { PricedProduct } from '../../../../../lib/seo/guide-prices';
import CategoryEditor, { type EditorContent } from './CategoryEditor';

export const dynamic = 'force-dynamic';

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

type ProductRow = { sku: string; name: string; brand: string | null; volume: string | null; category_slug: string | null; stock: { price_retail: number | null; price_promo: number | null } | null };

/**
 * Редактор контенту категорії: опис, seoText, FAQ, гайд «Як вибрати»,
 * «Дивіться також» — обома мовами, з живим прев'ю (ціни підставляються з
 * каталогу так само, як на сайті) і кнопкою «Згенерувати за стандартом».
 * Гейт розділу — у layout /admin/seo.
 */
export default async function CategoryEditorPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const [categories, products, posts, rows, metaUa, metaRu] = await Promise.all([
    fetchAllRows<{ slug: string; name: string; parent_slug: string | null }>((f, t) =>
      db.from('categories').select('slug, name, parent_slug').order('name').range(f, t)),
    fetchAllRows<ProductRow>((f, t) =>
      db.from('products').select('sku, name, brand, volume, category_slug, stock:product_stock(price_retail, price_promo)').eq('is_active', true).order('sku').range(f, t) as unknown as PromiseLike<{ data: ProductRow[] | null; error: unknown }>),
    fetchAllRows<{ slug: string; title: string }>((f, t) =>
      db.from('blog_posts').select('slug, title').eq('is_published', true).order('title').range(f, t)),
    getCategoryContentRows(slug),
    getCategoryContentCached('uk'),
    getCategoryContentCached('ru'),
  ]);
  const cat = categories.find(c => c.slug === slug);
  if (!cat) notFound();

  const family = categoryFamilySlugs(categories, slug);
  const famSet = new Set(family);
  const priced: PricedProduct[] = products.map(p => ({ sku: p.sku, category_slug: p.category_slug, price: p.stock?.price_promo ?? p.stock?.price_retail ?? null }));
  const familyProducts = products
    .filter(p => p.category_slug && famSet.has(p.category_slug))
    .map(p => ({ sku: p.sku, name: p.name, brand: p.brand ?? '', volume: p.volume, price: p.stock?.price_promo ?? p.stock?.price_retail ?? null }))
    .sort((a, b) => a.brand.localeCompare(b.brand) || (a.price ?? 0) - (b.price ?? 0));

  // Попит по сторінці — щоб редактор бачив, під які запити писати
  let demand: AuditDemand | null = null;
  let queries: { query: string; impressions: number; position: number }[] = [];
  try {
    const raw = await queryAll({ dimensions: ['query', 'page'], days: 28 });
    const agg = new Map<string, { query: string; impressions: number; position: number }>();
    for (const r of raw) {
      if (toLangNeutralPath(r.keys[1]) !== `/shop/${slug}`) continue;
      const cur = agg.get(r.keys[0]);
      if (cur) { cur.impressions += r.impressions; cur.position = Math.min(cur.position, Math.round(r.position)); }
      else agg.set(r.keys[0], { query: r.keys[0], impressions: r.impressions, position: Math.round(r.position) });
    }
    queries = [...agg.values()].sort((a, b) => b.impressions - a.impressions).slice(0, 12);
    demand = { impressions: queries.reduce((s, q) => s + q.impressions, 0), topQuery: queries[0]?.query ?? null };
  } catch { /* GSC недоступний — без запитів */ }

  const audit = auditCategories({
    categories,
    products: products.map(p => ({ sku: p.sku, category_slug: p.category_slug, brand: p.brand })),
    metaUa, metaRu,
    brands: [...new Set(products.map(p => p.brand).filter(Boolean))] as string[],
    blogSlugs: posts.map(p => p.slug),
    demand: demand ? { [slug]: demand } : undefined,
    namesRu: CATEGORY_NAMES_RU,
  }).find(r => r.slug === slug) ?? null;

  const toContent = (r?: CategoryContentRow): EditorContent | null => r ? ({
    description: r.description, seoText: r.seo_text ?? '', faq: r.faq ?? [], guide: r.guide ?? null, related: r.related ?? [], blogSlug: r.blog_slug ?? '',
    source: r.source, updatedAt: r.updated_at, updatedBy: r.updated_by,
  }) : null;

  return (
    <CategoryEditor
      slug={slug}
      name={cat.name}
      nameRu={getCategoryNameRu(cat.slug, cat.name)}
      initial={{ uk: toContent(rows.uk), ru: toContent(rows.ru) }}
      priced={priced}
      family={family}
      familyProducts={familyProducts}
      categories={categories.map(c => ({ slug: c.slug, name: c.name, nameRu: getCategoryNameRu(c.slug, c.name), parent: c.parent_slug }))}
      posts={posts}
      gaps={audit ? Object.entries(audit.gaps).filter(([, v]) => v).map(([k]) => k) : []}
      demand={demand}
      queries={queries}
    />
  );
}
