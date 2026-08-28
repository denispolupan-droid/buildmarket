import { NextResponse } from 'next/server';
import { getCategoriesCached, getSupabase } from '../../lib/supabase';
import { getPublishedPostsCached } from '../../lib/blog-db';
import { getCategoryContentCached } from '../../lib/category-content';
import { fetchAllRows } from '../../lib/db-paginate';
import { llmsTxt, type LlmsTxtInput } from '../../lib/llms-md';

// /llms.txt — стандарт llmstxt.org: коротка карта сайту для мовних моделей.
// Sitemap каже пошуковику, ЩО обійти; цей файл пояснює моделі, що це за сайт,
// які тут розділи й де брати факти. Тому тут описи і цифри, а не 6000 URL.

export const revalidate = 3600;

type Row = {
  category_slug: string | null;
  brand: string | null;
  stock: { price_retail: number | null; price_promo: number | null } | { price_retail: number | null; price_promo: number | null }[] | null;
};

function price(stock: Row['stock']): number | null {
  const s = Array.isArray(stock) ? stock[0] : stock;
  if (!s) return null;
  return s.price_promo ?? s.price_retail ?? null;
}

import { brandSlug as brandToSlug } from '../../lib/seo/slug';

export async function GET() {
  const supabase = getSupabase();

  // Через fetchAllRows, а не getProductsCached: там немає .limit(), а PostgREST
  // мовчки ріже відповідь на 1000 рядках — у llms.txt це вилізло б заниженими
  // лічильниками й обрізаним діапазоном цін, які ніхто б не помітив.
  const [categories, posts, rows, content] = await Promise.all([
    getCategoriesCached(),
    getPublishedPostsCached(),
    fetchAllRows<Row>((from, to) =>
      supabase
        .from('products')
        .select('category_slug, brand, stock:product_stock(price_retail, price_promo)')
        .eq('is_active', true)
        .range(from, to),
    ),
    getCategoryContentCached('uk'),
  ]);

  // Категорія рахує всю свою гілку: товари прив'язані до листків, і без цього
  // «Герметики» показували б нуль позицій при сотнях у підкатегоріях.
  const parentOf = new Map(categories.map(c => [c.slug, c.parent_slug]));
  const stats = new Map<string, { count: number; min: number | null; max: number | null }>();
  const brandCount = new Map<string, number>();

  for (const r of rows) {
    if (r.brand) brandCount.set(r.brand.trim(), (brandCount.get(r.brand.trim()) ?? 0) + 1);
    const p = price(r.stock);
    let slug = r.category_slug;
    const seen = new Set<string>();
    while (slug && !seen.has(slug)) {
      seen.add(slug);
      const cur = stats.get(slug) ?? { count: 0, min: null, max: null };
      cur.count++;
      if (p !== null) {
        cur.min = cur.min === null ? p : Math.min(cur.min, p);
        cur.max = cur.max === null ? p : Math.max(cur.max, p);
      }
      stats.set(slug, cur);
      slug = parentOf.get(slug) ?? null;
    }
  }

  // Верхній рівень: модель має побачити структуру магазину, а не плаский
  // список із 60 листків, де «Силіконові герметики» стоять поруч із «Клеї».
  const input: LlmsTxtInput = {
    totalProducts: rows.length,
    categories: categories
      .filter(c => !c.parent_slug && (stats.get(c.slug)?.count ?? 0) > 0)
      .sort((a, b) => a.sort_order - b.sort_order)
      .map(c => {
        const s = stats.get(c.slug)!;
        return {
          slug: c.slug,
          name: c.name,
          description: content[c.slug]?.description ?? null,
          count: s.count,
          minPrice: s.min,
          maxPrice: s.max,
        };
      }),
    brands: [...brandCount.entries()]
      .filter(([, n]) => n >= 5)
      .sort((a, b) => b[1] - a[1])
      .map(([name, count]) => ({ name, slug: brandToSlug(name), count })),
    posts: posts.map(p => ({ slug: p.slug, title: p.title, excerpt: p.description })),
  };

  return new NextResponse(llmsTxt(input), {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400',
    },
  });
}
