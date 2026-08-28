import { createClient } from '@supabase/supabase-js';
import { fetchAllRows } from '../../../../lib/db-paginate';
import { getCategoryContentCached } from '../../../../lib/category-content';
import { auditCategories, type AuditDemand } from '../../../../lib/seo/category-audit';
import { CATEGORY_NAMES_RU } from '../../../../lib/ru';
import { queryAll } from '../../../../lib/gsc';
import { toLangNeutralPath } from '../../../../lib/seo/history';
import CategoryAudit from './CategoryAudit';

const DAYS = 28;

/**
 * Попит по категоріях: покази uk+ru сторінки за 28 днів із gsc_daily (щоденна
 * історія, без звернень до API) і найчастіший запит із GSC API (кешується в
 * lib/gsc на 10 хв). Без цього аудит не може сказати, чи потрібен категорії
 * гайд (стандарт 1.4) і чи названа вона так, як її шукають (1.2). GSC може
 * бути недоступним — тоді просто без цих двох перевірок.
 */
async function loadDemand(): Promise<Record<string, AuditDemand>> {
  const since = new Date(Date.now() - DAYS * 864e5).toISOString().slice(0, 10);
  const rows = await fetchAllRows<{ page_path: string; impressions: number }>((f, t) =>
    db.from('gsc_daily').select('page_path, impressions').gte('date', since).like('page_path', '%/shop/%').range(f, t));
  const out: Record<string, AuditDemand> = {};
  const slugOf = (path: string) => { const m = toLangNeutralPath(path).match(/^\/shop\/([^/]+)$/); return m && m[1] !== 'sale' ? m[1] : null; };
  for (const r of rows) {
    const slug = slugOf(r.page_path); if (!slug) continue;
    (out[slug] ??= { impressions: 0, topQuery: null }).impressions += r.impressions;
  }
  try {
    const qp = await queryAll({ dimensions: ['query', 'page'], days: DAYS });
    const best = new Map<string, { q: string; i: number }>();
    for (const r of qp) {
      const slug = slugOf(r.keys[1]); if (!slug) continue;
      const cur = best.get(slug);
      if (!cur || r.impressions > cur.i) best.set(slug, { q: r.keys[0], i: r.impressions });
    }
    for (const [slug, b] of best) (out[slug] ??= { impressions: 0, topQuery: null }).topQuery = b.q;
  } catch {
    // GSC недоступний — залишаємо лише покази з історії
  }
  return out;
}

const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

export const dynamic = 'force-dynamic';

export default async function SeoCategoriesPage() {
  const [products, categories, posts, demand] = await Promise.all([
    fetchAllRows<{ sku: string; category_slug: string | null; brand: string | null }>((f, t) =>
      db.from('products').select('sku, category_slug, brand').eq('is_active', true).range(f, t)),
    fetchAllRows<{ slug: string; name: string; parent_slug: string | null }>((f, t) =>
      db.from('categories').select('slug, name, parent_slug').range(f, t)),
    fetchAllRows<{ slug: string }>((f, t) =>
      db.from('blog_posts').select('slug').eq('is_published', true).range(f, t)),
    loadDemand(),
  ]);
  const [metaUa, metaRu] = await Promise.all([getCategoryContentCached('uk'), getCategoryContentCached('ru')]);

  const rows = auditCategories({
    categories,
    products,
    metaUa,
    metaRu,
    brands: [...new Set(products.map(p => p.brand).filter(Boolean))] as string[],
    blogSlugs: posts.map(p => p.slug),
    demand,
    namesRu: CATEGORY_NAMES_RU,
  });

  return <CategoryAudit rows={rows} />;
}
