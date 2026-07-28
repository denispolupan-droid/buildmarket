import { NextRequest, NextResponse } from 'next/server';
import { revalidateTag } from 'next/cache';
import { createClient } from '@supabase/supabase-js';
import { requireStaff } from '../../../../../lib/auth-guard';
import { fetchAllRows } from '../../../../../lib/db-paginate';
import {
  expandCategories, pickArticleProducts, stripLinksBlock,
  hasLinksBlock, countProductLinks, productLabel, type LinkProduct,
} from '../../../../../lib/blog-product-links';

export const runtime = 'nodejs';

const serviceClient = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

// 6 — рівно два ряди по три в ширині статті (760px); 4 лягали 3+1 і виглядали обірвано
const LIMIT_PER_ARTICLE = 6;

type PostRow = {
  id: number; slug: string; title: string; is_published: boolean;
  content_html: string; content_html_ru: string | null;
  related_links: { label: string; href: string }[] | null;
  product_skus: string[] | null;
};

type Plan = {
  id: number; slug: string; title: string; is_published: boolean;
  categories: string[];
  picks: { sku: string; label: string; href: string; price: number | null; volume: string | null }[];
  /** уже має посилання, вставлені не нами (AI/руками) — за замовчуванням не чіпаємо */
  manualLinks: boolean;
  /** наш блок уже стоїть — повторний запуск його освіжить */
  hasBlock: boolean;
  ruMissing: boolean;
};

/** Спільна підготовка: статті, дерево категорій, товари з цінами й наявністю. */
async function buildPlans(): Promise<{ plans: Plan[]; posts: Map<number, PostRow>; picksBySku: Map<number, LinkProduct[]> }> {
  const [{ data: postsRaw }, { data: cats }, products] = await Promise.all([
    serviceClient.from('blog_posts')
      .select('id, slug, title, is_published, content_html, content_html_ru, related_links, product_skus')
      .order('id'),
    serviceClient.from('categories').select('slug, parent_slug'),
    fetchAllRows<{
      sku: string; slug: string | null; name: string; name_ru: string | null;
      brand: string; volume: string | null; category_slug: string | null;
      product_stock: { price_retail: number | null; stock_status: string | null; stock_qty: number | null }
        | { price_retail: number | null; stock_status: string | null; stock_qty: number | null }[] | null;
    }>((from, to) => serviceClient.from('products')
      .select('sku, slug, name, name_ru, brand, volume, category_slug, product_stock(price_retail, stock_status, stock_qty)')
      .eq('is_active', true)
      .range(from, to)),
  ]);

  const childrenOf = new Map<string, string[]>();
  for (const c of cats ?? []) {
    if (!c.parent_slug) continue;
    childrenOf.set(c.parent_slug, [...(childrenOf.get(c.parent_slug) ?? []), c.slug]);
  }

  const byCategory = new Map<string, LinkProduct[]>();
  for (const p of products) {
    const stock = Array.isArray(p.product_stock) ? p.product_stock[0] : p.product_stock;
    const item: LinkProduct = {
      sku: p.sku, slug: p.slug, name: p.name, name_ru: p.name_ru, brand: p.brand,
      volume: p.volume, price: stock?.price_retail ?? null, category_slug: p.category_slug,
      // Той самий критерій наявності, що на вітрині: постачальники дають статус,
      // а не точну кількість, тому qty сам по собі ненадійний.
      in_stock: stock?.stock_status === 'in_stock' || (stock?.stock_qty ?? 0) >= 1,
    };
    const key = p.category_slug ?? '';
    byCategory.set(key, [...(byCategory.get(key) ?? []), item]);
  }

  const posts = new Map<number, PostRow>();
  const picksBySku = new Map<number, LinkProduct[]>();
  const plans: Plan[] = [];

  for (const post of (postsRaw ?? []) as PostRow[]) {
    posts.set(post.id, post);

    const slugs = (post.related_links ?? [])
      .map(l => l.href)
      .filter(h => h.startsWith('/shop/'))
      .map(h => h.replace('/shop/', ''));

    // Групи в порядку статті: перша категорія — головна тема, решта суміжні.
    // Кожну розгортаємо з підкатегоріями; SKU не повторюємо між групами, щоб
    // товар з головної теми не «з'їв» слот суміжної.
    const seen = new Set<string>();
    const groups = slugs.map(slug => {
      const inGroup = expandCategories([slug], childrenOf).flatMap(s => byCategory.get(s) ?? []);
      return inGroup.filter(c => !seen.has(c.sku) && seen.add(c.sku));
    });
    const picks = pickArticleProducts(groups, LIMIT_PER_ARTICLE);
    picksBySku.set(post.id, picks);

    const hasBlock = (post.product_skus ?? []).length > 0
      || hasLinksBlock(post.content_html, 'uk')
      || hasLinksBlock(post.content_html_ru ?? '', 'ru');
    plans.push({
      id: post.id, slug: post.slug, title: post.title, is_published: post.is_published,
      categories: slugs,
      picks: picks.map(p => ({
        sku: p.sku, label: productLabel(p, 'uk'),
        href: `/product/${p.slug ?? p.sku}`, price: p.price, volume: p.volume,
      })),
      manualLinks: countProductLinks(post.content_html) > 0 && !hasBlock,
      hasBlock,
      ruMissing: !(post.content_html_ru ?? '').trim(),
    });
  }

  return { plans, posts, picksBySku };
}

/** GET — попередній перегляд: що і куди буде вставлено. Нічого не пише. */
export async function GET() {
  const auth = await requireStaff('admin');
  if (!auth.ok) return auth.response;
  const { plans } = await buildPlans();
  return NextResponse.json(plans);
}

/** POST { ids } — вставити/оновити блок посилань у вказаних статтях. */
export async function POST(req: NextRequest) {
  const auth = await requireStaff('admin');
  if (!auth.ok) return auth.response;

  const { ids } = await req.json() as { ids?: number[] };
  if (!Array.isArray(ids) || !ids.length) {
    return NextResponse.json({ error: 'Не вибрано жодної статті' }, { status: 400 });
  }

  const { posts, picksBySku } = await buildPlans();
  const updated: { slug: string; links: number }[] = [];
  const skipped: { slug: string; reason: string }[] = [];

  for (const id of ids) {
    const post = posts.get(id);
    if (!post) { skipped.push({ slug: String(id), reason: 'статтю не знайдено' }); continue; }
    const picks = picksBySku.get(id) ?? [];
    if (!picks.length) { skipped.push({ slug: post.slug, reason: 'немає товарів у наявності за категоріями статті' }); continue; }

    // Пишемо АРТИКУЛИ, а не готовий HTML: ціни й наявність підтягуються на
    // рендері. Заразом прибираємо «запечені» блоки, якщо вони лишились від
    // попередньої схеми — інакше на сторінці буде два блоки, один зі старими цінами.
    const ua = stripLinksBlock(post.content_html, 'uk');
    const ru = (post.content_html_ru ?? '').trim()
      ? stripLinksBlock(post.content_html_ru!, 'ru')
      : post.content_html_ru;

    const { error } = await serviceClient.from('blog_posts')
      .update({
        product_skus: picks.map(p => p.sku),
        content_html: ua,
        content_html_ru: ru,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id);
    if (error) { skipped.push({ slug: post.slug, reason: error.message }); continue; }
    updated.push({ slug: post.slug, links: picks.length });
  }

  if (updated.length) revalidateTag('blog', 'max');
  return NextResponse.json({ ok: true, updated, skipped });
}
