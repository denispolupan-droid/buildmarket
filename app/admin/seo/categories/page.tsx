import { createClient } from '@supabase/supabase-js';
import { fetchAllRows } from '../../../../lib/db-paginate';
import { CATEGORY_META } from '../../../../lib/category-descriptions';
import { CATEGORY_META_RU } from '../../../../lib/category-descriptions-ru';
import { auditCategories } from '../../../../lib/seo/category-audit';
import CategoryAudit from './CategoryAudit';

const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

export const dynamic = 'force-dynamic';

export default async function SeoCategoriesPage() {
  const [products, categories, posts] = await Promise.all([
    fetchAllRows<{ category_slug: string | null; brand: string | null }>((f, t) =>
      db.from('products').select('category_slug, brand').eq('is_active', true).range(f, t)),
    fetchAllRows<{ slug: string; name: string; parent_slug: string | null }>((f, t) =>
      db.from('categories').select('slug, name, parent_slug').range(f, t)),
    fetchAllRows<{ slug: string }>((f, t) =>
      db.from('blog_posts').select('slug').eq('is_published', true).range(f, t)),
  ]);

  const rows = auditCategories({
    categories,
    products,
    metaUa: CATEGORY_META,
    metaRu: CATEGORY_META_RU,
    brands: [...new Set(products.map(p => p.brand).filter(Boolean))] as string[],
    blogSlugs: posts.map(p => p.slug),
  });

  return <CategoryAudit rows={rows} />;
}
