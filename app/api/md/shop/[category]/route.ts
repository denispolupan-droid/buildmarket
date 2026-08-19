import { NextResponse } from 'next/server';
import { getCategoriesCached, getProductsCached } from '../../../../../lib/supabase';
import { getCategoryMeta } from '../../../../../lib/category-descriptions';
import { categoryFamilySlugs, duplicateOfParent } from '../../../../../lib/seo/meta';
import { categoryMarkdown, type MdCategoryInput } from '../../../../../lib/llms-md';
import { SITE_URL } from '../../../../../lib/site';

// Markdown-версія листингу категорії. Публічна адреса — /shop/<slug>.md
// (rewrite у next.config), пояснення до заголовків — у сусідньому роуті товару.

export const revalidate = 3600;

const md = (body: string, canonical: string, status = 200) =>
  new NextResponse(body, {
    status,
    headers: {
      'Content-Type': 'text/markdown; charset=utf-8',
      'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400',
      Link: `<${canonical}>; rel="canonical"`,
    },
  });

export async function GET(_req: Request, { params }: { params: Promise<{ category: string }> }) {
  const { category: raw } = await params;
  const slug = decodeURIComponent(raw);

  const [categories, allProducts] = await Promise.all([getCategoriesCached(), getProductsCached()]);
  const cat = categories.find(c => c.slug === slug);
  if (!cat) {
    const url = `${SITE_URL}/shop/${slug}`;
    return md(`# Категорію не знайдено\n\nСторінка ${url} недоступна.\nКаталог: ${SITE_URL}/shop\n`, url, 404);
  }

  // Canonical повторює рішення HTML-сторінки, а не вигадує своє. Підкатегорія,
  // чий листинг повністю збігається з батьківським, канонічно веде на батька
  // (duplicateOfParent) — і sitemap, і generateMetadata уже так вважають.
  // Постав тут просто «/shop/<slug>» — і .md вказував би на адресу, яка сама
  // неканонічна: ланцюжок canonical, який ми свідомо прибрали зі звичайних
  // сторінок, повернувся б через Markdown-шар.
  const canonicalSlug = duplicateOfParent(categories, allProducts, slug) ?? slug;
  const canonical = `${SITE_URL}/shop/${canonicalSlug}`;

  // Товари висять на підкатегоріях, тому для батьківської беремо всю родину —
  // рівно так само, як HTML-листинг (categoryFamilySlugs). Інакше «Герметики»
  // у Markdown виглядали б порожньою категорією, хоча на сайті там сотні позицій.
  const family = new Set(categoryFamilySlugs(categories, slug));
  const products = allProducts.filter(p => p.category_slug && family.has(p.category_slug));

  const children = categories
    .filter(c => c.parent_slug === slug)
    .map(c => {
      const sub = new Set(categoryFamilySlugs(categories, c.slug));
      return {
        slug: c.slug,
        name: c.name,
        count: allProducts.filter(p => p.category_slug && sub.has(p.category_slug)).length,
      };
    })
    .filter(c => c.count > 0)
    .sort((a, b) => b.count - a.count);

  const meta = getCategoryMeta(slug);
  const parent = cat.parent_slug ? categories.find(c => c.slug === cat.parent_slug) ?? null : null;

  const input: MdCategoryInput = {
    slug: cat.slug,
    name: cat.name,
    description: meta?.description ?? null,
    seoText: meta?.seoText ?? null,
    parent: parent ? { slug: parent.slug, name: parent.name } : null,
    children,
    totalCount: products.length,
    products: products.map(p => ({
      sku: p.sku,
      slug: p.slug,
      name: p.name,
      brand: p.brand,
      volume: p.volume,
      stock: p.stock
        ? {
            price_retail: p.stock.price_retail,
            price_retail_old: p.stock.price_retail_old,
            price_promo: p.stock.price_promo,
            stock_status: p.stock.stock_status,
            stock_qty: p.stock.stock_qty,
          }
        : null,
    })),
    faq: meta?.faq ?? [],
  };

  return md(categoryMarkdown(input), canonical);
}
