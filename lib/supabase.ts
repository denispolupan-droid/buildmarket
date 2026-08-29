import { createClient } from '@supabase/supabase-js';
import { unstable_cache } from 'next/cache';
import { env } from './env';
import { escapeOrTerm } from './pg-filter';
import { fetchAllRows } from './db-paginate';

export type {
  Category,
  Product,
  ProductCharacteristic,
  ProductStock,
  ProductFull,
  ProductListItem,
  ProductPublic,
  ProductStockPublic,
  ProductCharacteristicPublic,
  ProductB2B,
  ProductStockB2B,
} from '../types';

import type { Category, CategoryFacet, Product, ProductFull, ProductListItem, ProductStock, ProductPublic, ProductB2B } from '../types';
import { computeCategoryFacets, type FacetDefinitionRow, type FacetCategoryRow, type FacetValueRow } from './facets';

// ── Клієнт для браузера / Server Components ───────────────────────────────────

let _supabase: ReturnType<typeof createClient> | null = null;

export function getSupabase() {
  if (!_supabase) {
    _supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
  }
  return _supabase;
}

// Зворотня сумісність — використовуй getSupabase() для нових викликів
export const supabase = new Proxy({} as ReturnType<typeof createClient>, {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  get(_, prop) { return (getSupabase() as any)[prop as string]; },
});

// ── Клієнт з service role — тільки для серверних скриптів ─────────────────────
// Ніколи не використовувати на клієнті!
export function createServiceClient() {
  if (!env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY is not set');
  }
  return createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });
}

// ── Допоміжні функції для Next.js ─────────────────────────────────────────────

// Категорії теж їдуть у браузер (дерево магазину). select('*') тягнув із собою
// всі маркетплейсні налаштування таблиці — prom_markup_pct, rozetka_markup_pct,
// prom_commission_pct*, rozetka_commission_* — тобто нашу цінову політику по
// кожній категорії. Перелік нижче збігається з типом Category і нічого зайвого
// назовні не пускає. Код синхронізації МП цю функцію не використовує — він
// робить власні запити.
export async function getCategories(): Promise<Category[]> {
  const { data, error } = await supabase
    .from('categories')
    .select('id, slug, name, sort_order, parent_slug, prom_section_url, prom_section_id, created_at')
    .order('sort_order');
  if (error) throw error;
  const cats = (data ?? []) as Category[];
  const facets = await getCategoryFacets(cats);
  return cats.map(c => (facets[c.slug] ? { ...c, facets: facets[c.slug] } : c));
}

/**
 * Фасети-фільтри категорій зі словника характеристик (lib/facets). Таблиці
 * словника закриті RLS для anon — читаємо service-клієнтом (лише сервер,
 * результат іде в той самий кеш категорій). Без ключа чи без міграції 105
 * листинг живе без фасетів, а не падає.
 */
async function getCategoryFacets(cats: Category[]): Promise<Record<string, CategoryFacet[]>> {
  try {
    const db = createServiceClient();
    const [defs, rows, values] = await Promise.all([
      db.from('characteristic_definitions').select('id, label, is_filter, is_multiselect, sort_order').limit(1000),
      db.from('category_characteristics').select('category_slug, definition_id, is_filter, filter_order').limit(5000),
      db.from('characteristic_values').select('definition_id, value, category_slugs, sort_order').limit(5000),
    ]);
    const err = defs.error ?? rows.error ?? values.error;
    if (err) throw err;
    return computeCategoryFacets(
      (defs.data ?? []) as FacetDefinitionRow[],
      (rows.data ?? []) as FacetCategoryRow[],
      (values.data ?? []) as FacetValueRow[],
      cats,
    );
  } catch (e) {
    console.error('[facets] словник недоступний, листинг без фасетів:', e instanceof Error ? e.message : e);
    return {};
  }
}

// Поля для списку — без description (зберігає ~200KB на запит)
const PRODUCT_LIST_BASE = `
  id, sku, slug, name, name_ru, brand, category_slug, is_active, is_hit, is_new, sort_order,
  nl1, nl2, bc, ac, img_type, color, product_type, volume, image,
  min_order, pack_qty, variant_main_sku, variant_canonical`;

/**
 * ПУБЛІЧНА вибірка — усе, що тут перелічено, поїде у вихідний код сторінки та
 * в браузер анонімного відвідувача. Раніше стояло product_stock(*), і разом із
 * роздрібною ціною назовні йшли price_cost, price_wholesale, price_drop і
 * supplier_sku по всьому каталогу. Додавати сюди поле можна лише свідомо.
 *
 * Характеристики потрібні — на них тримаються фільтри листингу, — але лише
 * парою «лейбл-значення»: id, product_sku і sort_order клієнту ні до чого.
 */
const PRODUCT_LIST_SELECT = `${PRODUCT_LIST_BASE},
  stock:product_stock(price_retail, price_retail_old, price_promo, stock_status, stock_qty),
  characteristics:product_characteristics(label, value)
`;

/**
 * B2B-вибірка для /catalog: те саме, що публічна, плюс оптова ціна й price_old.
 * Собівартості та коду постачальника тут теж немає — оптовому клієнту вони не
 * потрібні. Адмінка цю функцію не використовує, вона будує власні запити з
 * явним переліком колонок (див. /admin/prices).
 *
 * Важливо тримати вибірку вузькою: unstable_cache не кешує значення понад 2 МБ,
 * і повний select мовчки перевищував ліміт — кожен рендер /catalog і магазину
 * ходив у базу заново (у логах Vercel «items over 2MB can not be cached»).
 */
const PRODUCT_LIST_SELECT_B2B = `${PRODUCT_LIST_BASE},
  stock:product_stock(price_retail, price_retail_old, price_promo, price_old, price_unit, stock_status, stock_qty),
  characteristics:product_characteristics(label, value)
`;

type PostgrestList = {
  limit(n: number): PromiseLike<{ data: unknown[] | null; error: unknown }>;
  order(column: string): PostgrestList;
  range(from: number, to: number): PromiseLike<{ data: unknown[] | null; error: unknown }>;
};

/**
 * Вибірка без явного ліміту йде посторінково через fetchAllRows: PostgREST
 * мовчки ріже відповідь на 1000 рядків, і при рості каталогу товари тихо зникали б
 * із sitemap, листингів і generateStaticParams. Будівник запиту — функція, а не
 * готовий об'єкт: builder мутабельний, і .range() кожної сторінки має лягати на
 * свіжий запит. Другий ключ сортування (sku) — щоб сторінки не «пливли» на
 * однакових sort_order.
 */
async function loadProducts<T>(build: () => PostgrestList, limit?: number): Promise<T[]> {
  if (limit) {
    const { data, error } = await build().limit(limit);
    if (error) throw error;
    return (data ?? []) as T[];
  }
  return fetchAllRows<T>((f, t) => build().order('sku').range(f, t) as PromiseLike<{ data: T[] | null; error: unknown }>);
}

export async function getProducts(opts?: {
  category?: string;
  search?: string;
  inStockOnly?: boolean;
  limit?: number;
}): Promise<ProductPublic[]> {
  const build = () => {
    let query = supabase
      .from('products')
      .select(PRODUCT_LIST_SELECT)
      .eq('is_active', true)
      .order('sort_order');
    if (opts?.category) {
      query = query.eq('category_slug', opts.category);
    }
    if (opts?.search) {
      const term = `%${escapeOrTerm(opts.search)}%`;
      query = query.or(`name.ilike.${term},sku.ilike.${term},brand.ilike.${term}`);
    }
    if (opts?.inStockOnly) {
      query = query.eq('product_stock.stock_status', 'in_stock');
    }
    return query as unknown as PostgrestList;
  };
  const data = await loadProducts<ProductPublic>(build, opts?.limit);

  // Товари без наявності — в кінець
  const sorted = (data ?? []).sort((a, b) => {
    const aOut = (a as { stock?: { stock_status?: string } }).stock?.stock_status !== 'in_stock' ? 1 : 0;
    const bOut = (b as { stock?: { stock_status?: string } }).stock?.stock_status !== 'in_stock' ? 1 : 0;
    return aOut - bOut;
  });

  return sorted as ProductPublic[];
}

/**
 * Товари для оптового кабінету /catalog.
 * Окрема функція, а не прапорець: прапорець легко передати випадково,
 * а окремий імпорт видно на очі при рев'ю.
 */
export async function getProductsB2B(): Promise<ProductB2B[]> {
  const data = await loadProducts<ProductB2B>(() => supabase
    .from('products')
    .select(PRODUCT_LIST_SELECT_B2B)
    .eq('is_active', true)
    .order('sort_order') as unknown as PostgrestList);

  const sorted = (data ?? []).sort((a, b) => {
    const aOut = (a as { stock?: { stock_status?: string } }).stock?.stock_status !== 'in_stock' ? 1 : 0;
    const bOut = (b as { stock?: { stock_status?: string } }).stock?.stock_status !== 'in_stock' ? 1 : 0;
    return aOut - bOut;
  });

  return sorted as ProductB2B[];
}

export async function getProductsLight(opts?: {
  category?: string;
  search?: string;
  limit?: number;
}): Promise<ProductListItem[]> {
  const build = () => {
    let query = supabase
      .from('products')
      .select(`
        id, sku, slug, name, name_ru, brand, category_slug, is_active, sort_order,
        nl1, nl2, bc, ac, img_type, color, product_type, volume, image, variant_main_sku, variant_canonical,
        stock:product_stock(price_retail, price_retail_old, price_promo, price_old, price_unit, stock_status, stock_qty)
      `)
      .eq('is_active', true)
      .order('sort_order');
    if (opts?.category) {
      query = query.eq('category_slug', opts.category);
    }
    if (opts?.search) {
      const term = `%${escapeOrTerm(opts.search)}%`;
      query = query.or(`name.ilike.${term},sku.ilike.${term},brand.ilike.${term}`);
    }
    return query as unknown as PostgrestList;
  };
  const data = await loadProducts<ProductListItem>(build, opts?.limit);

  const sorted = (data ?? []).sort((a, b) => {
    const aOut = (a as { stock?: { stock_status?: string } }).stock?.stock_status !== 'in_stock' ? 1 : 0;
    const bOut = (b as { stock?: { stock_status?: string } }).stock?.stock_status !== 'in_stock' ? 1 : 0;
    return aOut - bOut;
  });

  return sorted as ProductListItem[];
}

export async function getProductBySku(sku: string): Promise<ProductFull | null> {
  const { data, error } = await supabase
    .from('products')
    .select(`
      *,
      stock:product_stock(*),
      characteristics:product_characteristics(*)
    `)
    .eq('sku', sku)
    .eq('is_active', true)
    // Порядок характеристик = порядок словника (canonicalize/normalizeChars пишуть 1..N)
    .order('sort_order', { referencedTable: 'characteristics' })
    .single();
  if (error) return null;
  return data as ProductFull;
}

export async function getProductBySlug(slug: string): Promise<ProductFull | null> {
  const { data, error } = await supabase
    .from('products')
    .select(`
      *,
      stock:product_stock(*),
      characteristics:product_characteristics(*)
    `)
    .eq('slug', slug)
    .eq('is_active', true)
    .order('sort_order', { referencedTable: 'characteristics' })
    .single();
  if (error) return null;
  return data as ProductFull;
}

export const getProductBySlugCached = unstable_cache(
  async (slug: string) => getProductBySlug(slug),
  ['product-by-slug'],
  { revalidate: 60, tags: ['products'] }
);

export async function getBrands(): Promise<string[]> {
  const { data, error } = await supabase
    .from('products')
    .select('brand')
    .eq('is_active', true)
    .limit(2000);
  if (error) throw error;
  const seen = new Map<string, string>();
  for (const { brand } of (data ?? []) as { brand: string }[]) {
    const b = brand?.trim();
    if (b && !seen.has(b.toUpperCase())) seen.set(b.toUpperCase(), b);
  }
  return [...seen.values()].sort();
}

// brand_name -> logo_url, keyed uppercase for case-insensitive lookup against products.brand
export async function getBrandLogos(): Promise<Record<string, string>> {
  const { data, error } = await supabase.from('brand_logos').select('brand_name, logo_url');
  if (error) throw error;
  const map: Record<string, string> = {};
  for (const row of (data ?? []) as { brand_name: string; logo_url: string }[]) {
    map[row.brand_name.trim().toUpperCase()] = row.logo_url;
  }
  return map;
}

// Brands an admin opted into the homepage carousel / About page grid via the
// "Логотипи брендів" modal, beyond the hand-curated list in lib/brands.ts.
export async function getVisibleBrandLogos(): Promise<{ name: string; logoUrl: string }[]> {
  const { data, error } = await supabase
    .from('brand_logos')
    .select('brand_name, logo_url')
    .eq('show_on_home', true)
    .order('brand_name');
  if (error) throw error;
  return ((data ?? []) as { brand_name: string; logo_url: string }[])
    .map(row => ({ name: row.brand_name, logoUrl: row.logo_url }));
}

// sku -> { avg, count } from all approved reviews. Fetches every approved
// review row (not filtered by sku) rather than one query per product — cheap
// while review volume is low, and avoids an IN(...) list of hundreds of skus
// on every catalog/shop page render.
export type ReviewStats = Record<string, { avg: number; count: number }>;

export async function getReviewStats(): Promise<ReviewStats> {
  // product_reviews has no public SELECT policy (RLS) — every other reader of
  // this table (the /api/reviews route, the product page's own count query)
  // goes through the service-role client for the same reason.
  const { data, error } = await createServiceClient()
    .from('product_reviews')
    .select('product_sku, rating')
    .eq('is_approved', true);
  if (error) throw error;
  const grouped: Record<string, number[]> = {};
  for (const row of (data ?? []) as { product_sku: string; rating: number }[]) {
    (grouped[row.product_sku] ??= []).push(row.rating);
  }
  const stats: ReviewStats = {};
  for (const [sku, ratings] of Object.entries(grouped)) {
    stats[sku] = { avg: Math.round((ratings.reduce((a, b) => a + b, 0) / ratings.length) * 10) / 10, count: ratings.length };
  }
  return stats;
}

// ── Кэшированные функции для ISR ──────────────────────────────────────────────

export const getCategoriesCached = unstable_cache(
  async () => getCategories(),
  ['categories'],
  { revalidate: 300, tags: ['categories'] }
);

export const getProductsCached = unstable_cache(
  async (opts?: { category?: string; limit?: number }) => getProducts(opts),
  ['products'],
  { revalidate: 60, tags: ['products'] }
);

// ОКРЕМИЙ ключ кешу — інакше публічна сторінка може отримати з кешу B2B-дані
// (або навпаки), і оптова ціна поїде анонімам тихо й непередбачувано.
export const getProductsB2BCached = unstable_cache(
  async () => getProductsB2B(),
  ['products-b2b'],
  { revalidate: 60, tags: ['products'] }
);

export const getProductsLightCached = unstable_cache(
  async (opts?: { category?: string; limit?: number }) => getProductsLight(opts),
  ['products-light'],
  { revalidate: 60, tags: ['products'] }
);

/**
 * Товари для sitemap: лише те, що потрібно карті сайту, — адреса, бренд,
 * категорія й ДАТА ЗМІНИ. Раніше sitemap брав getProductsCached(), а в тій
 * вибірці немає updated_at (її свідомо тримають вузькою: усе з неї їде в
 * браузер), тож lastmod усіх 1 550 товарних URL мовчки падав на дату збірки
 * статичних сторінок — 1 680 однакових дат, які Google помічає як недостовірні
 * й перестає враховувати. Окрема вибірка не роздуває листинги й віддає
 * справжню дату: тригер products_updated_at ставить її на кожен UPDATE
 * картки, а ціни й залишки живуть у product_stock і її не смикають.
 */
export type SitemapProduct = Pick<Product, 'sku' | 'slug' | 'brand' | 'category_slug' | 'updated_at' | 'variant_main_sku' | 'variant_canonical'>;

export async function getSitemapProducts(): Promise<SitemapProduct[]> {
  return fetchAllRows<SitemapProduct>((f, t) =>
    supabase.from('products')
      .select('sku, slug, brand, category_slug, updated_at, variant_main_sku, variant_canonical')
      .eq('is_active', true)
      .order('sort_order').order('sku')
      .range(f, t));
}

export const getSitemapProductsCached = unstable_cache(
  async () => getSitemapProducts(),
  ['products-sitemap'],
  { revalidate: 60, tags: ['products'] }
);

export const getBrandsCached = unstable_cache(
  async () => getBrands(),
  ['brands'],
  { revalidate: 60, tags: ['brands'] }
);

// Топ-бренди (за кількістю активних товарів). Легка заміна повного getProducts()
// у Footer, який рендериться на кожній сторінці — тягнемо тільки колонку brand.
export async function getTopBrands(minCount = 5, limit = 10): Promise<string[]> {
  const rows = await fetchAllRows<{ brand: string | null }>((f, t) =>
    supabase.from('products').select('brand').eq('is_active', true).range(f, t));
  const counts = new Map<string, number>();
  for (const { brand } of rows) {
    const b = brand?.trim();
    if (b) counts.set(b, (counts.get(b) ?? 0) + 1);
  }
  return [...counts.entries()]
    .filter(([, c]) => c >= minCount)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([b]) => b);
}

export const getTopBrandsCached = unstable_cache(
  async () => getTopBrands(),
  ['top-brands'],
  { revalidate: 300, tags: ['products', 'brands'] }
);

export const getBrandLogosCached = unstable_cache(
  async () => getBrandLogos(),
  ['brand-logos'],
  { revalidate: 60, tags: ['brand-logos'] }
);

export const getVisibleBrandLogosCached = unstable_cache(
  async () => getVisibleBrandLogos(),
  ['visible-brand-logos'],
  { revalidate: 60, tags: ['brand-logos'] }
);

export const getReviewStatsCached = unstable_cache(
  async () => getReviewStats(),
  ['review-stats'],
  { revalidate: 60, tags: ['review-stats'] }
);

export const getProductBySkuCached = unstable_cache(
  async (sku: string) => getProductBySku(sku),
  ['product'],
  { revalidate: 60, tags: ['products'] }
);

export type ProductFaqItem = {
  question: string;
  answer: string;
  question_ru: string | null;
  answer_ru: string | null;
  sort_order: number;
};

// Толерантно до відсутньої таблиці (до міграції 048) — просто без FAQ-блоку
export async function getProductFaq(sku: string): Promise<ProductFaqItem[]> {
  const { data, error } = await supabase
    .from('product_faq')
    .select('question, answer, question_ru, answer_ru, sort_order')
    .eq('product_sku', sku)
    .order('sort_order');
  if (error) return [];
  return (data ?? []) as ProductFaqItem[];
}

export const getProductFaqCached = unstable_cache(
  async (sku: string) => getProductFaq(sku),
  ['product-faq'],
  { revalidate: 300, tags: ['products'] }
);

export async function getRelatedProducts(categorySlug: string, excludeSku: string, limit = 5): Promise<ProductFull[]> {
  const { data, error } = await supabase
    .from('products')
    .select(PRODUCT_LIST_SELECT)
    .eq('is_active', true)
    .eq('category_slug', categorySlug)
    .neq('sku', excludeSku)
    .order('sort_order')
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as ProductFull[];
}

export const getRelatedProductsCached = unstable_cache(
  async (categorySlug: string, excludeSku: string, limit = 5) => getRelatedProducts(categorySlug, excludeSku, limit),
  ['related-products-v2'],
  { revalidate: 60, tags: ['products'] }
);

export async function getPreviewProducts(categorySlugs: string[], limitPerCategory = 2): Promise<ProductFull[]> {
  if (categorySlugs.length === 0) return [];
  // No per-query limit here: sort_order is 0 for almost every row, so a global
  // "order by sort_order limit N" truncates at an arbitrary row and can starve
  // entire categories of any products. Fetch every candidate row and let the
  // loop below cap each category individually.
  // NB: no characteristics embed AND no `select *` here. The homepage showcase
  // (CategoryPreview) renders only name/brand/image/SVG-params/volume/min_order
  // + price via `stock` — the named columns below. `select *` dragged the heavy
  // text columns (description, SEO texts) of every active product (~7.4 MB) and
  // pushed this query past the DB statement timeout at build time, failing the
  // whole `next build` on the "/" prerender. Product-page SEO (JSON-LD
  // additionalProperty) uses getProductBySku*, which is unaffected.
  const { data, error } = await supabase
    .from('products')
    .select(`
      id, sku, slug, name, name_ru, brand, category_slug, is_active, is_hit, is_new, sort_order,
      nl1, nl2, bc, ac, img_type, color, product_type, volume, image,
      min_order, pack_qty,
      stock:product_stock(price_retail, price_retail_old, price_promo, stock_status, stock_qty)
    `)
    .eq('is_active', true)
    .in('category_slug', categorySlugs)
    .order('sort_order')
    .limit(5000);
  if (error) throw error;
  const result: ProductFull[] = [];
  const countBySlug: Record<string, number> = {};
  for (const p of (data ?? []) as ProductFull[]) {
    const slug = p.category_slug ?? '';
    countBySlug[slug] = (countBySlug[slug] ?? 0) + 1;
    if (countBySlug[slug] <= limitPerCategory) result.push(p);
  }
  return result;
}

export const getPreviewProductsCached = unstable_cache(
  async (categorySlugs: string[], limitPerCategory = 2) => getPreviewProducts(categorySlugs, limitPerCategory),
  ['preview-products'],
  { revalidate: 300, tags: ['products'] }
);
