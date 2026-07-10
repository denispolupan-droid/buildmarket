import { createClient } from '@supabase/supabase-js';
import { unstable_cache } from 'next/cache';
import { env } from './env';

export type {
  Category,
  Product,
  ProductCharacteristic,
  ProductStock,
  ProductFull,
  ProductListItem,
} from '../types';

import type { Category, Product, ProductFull, ProductListItem, ProductStock } from '../types';

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

export async function getCategories(): Promise<Category[]> {
  const { data, error } = await supabase
    .from('categories')
    .select('*')
    .order('sort_order');
  if (error) throw error;
  return data ?? [];
}

// Поля для списку — без description (зберігає ~200KB на запит)
const PRODUCT_LIST_SELECT = `
  id, sku, name, name_ru, brand, category_slug, is_active, sort_order,
  nl1, nl2, bc, ac, img_type, color, product_type, volume, image,
  min_order, pack_qty,
  stock:product_stock(*),
  characteristics:product_characteristics(*)
`;

export async function getProducts(opts?: {
  category?: string;
  search?: string;
  inStockOnly?: boolean;
  limit?: number;
}): Promise<ProductFull[]> {
  let query = supabase
    .from('products')
    .select(PRODUCT_LIST_SELECT)
    .eq('is_active', true)
    .order('sort_order');

  if (opts?.category) {
    query = query.eq('category_slug', opts.category);
  }
  if (opts?.search) {
    const term = `%${opts.search}%`;
    query = query.or(`name.ilike.${term},sku.ilike.${term},brand.ilike.${term}`);
  }
  if (opts?.inStockOnly) {
    query = query.eq('product_stock.stock_status', 'in_stock');
  }
  if (opts?.limit) {
    query = query.limit(opts.limit);
  }

  const { data, error } = await query;
  if (error) throw error;

  // Товари без наявності — в кінець
  const sorted = (data ?? []).sort((a, b) => {
    const aOut = (a as { stock?: { stock_status?: string } }).stock?.stock_status !== 'in_stock' ? 1 : 0;
    const bOut = (b as { stock?: { stock_status?: string } }).stock?.stock_status !== 'in_stock' ? 1 : 0;
    return aOut - bOut;
  });

  return sorted as ProductFull[];
}

export async function getProductsLight(opts?: {
  category?: string;
  search?: string;
  limit?: number;
}): Promise<ProductListItem[]> {
  let query = supabase
    .from('products')
    .select(`
      id, sku, name, brand, category_slug, is_active, sort_order,
      nl1, nl2, bc, ac, img_type, color, product_type, volume, image,
      stock:product_stock(*)
    `)
    .eq('is_active', true)
    .order('sort_order');

  if (opts?.category) {
    query = query.eq('category_slug', opts.category);
  }
  if (opts?.search) {
    const term = `%${opts.search}%`;
    query = query.or(`name.ilike.${term},sku.ilike.${term},brand.ilike.${term}`);
  }
  if (opts?.limit) {
    query = query.limit(opts.limit);
  }

  const { data, error } = await query;
  if (error) throw error;

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
    .single();
  if (error) return null;
  return data as ProductFull;
}

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

export const getProductsLightCached = unstable_cache(
  async (opts?: { category?: string; limit?: number }) => getProductsLight(opts),
  ['products-light'],
  { revalidate: 60, tags: ['products'] }
);

export const getBrandsCached = unstable_cache(
  async () => getBrands(),
  ['brands'],
  { revalidate: 60, tags: ['brands'] }
);

export const getBrandLogosCached = unstable_cache(
  async () => getBrandLogos(),
  ['brand-logos'],
  { revalidate: 60, tags: ['brand-logos'] }
);

export const getProductBySkuCached = unstable_cache(
  async (sku: string) => getProductBySku(sku),
  ['product'],
  { revalidate: 60, tags: ['products'] }
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
  const { data, error } = await supabase
    .from('products')
    .select(`
      *,
      stock:product_stock(*),
      characteristics:product_characteristics(*)
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
