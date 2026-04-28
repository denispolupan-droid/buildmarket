import { createClient } from '@supabase/supabase-js';

// ── Типи, що відповідають схемі БД ───────────────────────────────────────────

export type Category = {
  id: number;
  slug: string;
  name: string;
  sort_order: number;
  parent_slug: string | null;
  created_at: string;
};

export type Product = {
  id: number;
  sku: string;
  name: string;
  brand: string;
  category_slug: string | null;
  product_type: string | null;
  color: string | null;
  volume: string | null;
  pack_qty: number;
  min_order: number;
  description: string | null;
  description_ru: string | null;
  image: string | null;
  nl1: string | null;
  nl2: string | null;
  bc: string;
  ac: string;
  img_type: 'tube' | 'canister';
  is_active: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

export type ProductCharacteristic = {
  id: number;
  product_sku: string;
  label: string;
  value: string;
  sort_order: number;
};

export type ProductStock = {
  id: number;
  sku: string;
  price_cost: number | null;
  price_unit: number;
  price_old: number | null;
  price_retail: number | null;
  price_retail_old: number | null;
  price_drop: number | null;
  stock_qty: number;
  stock_status: 'in_stock' | 'out_of_stock' | 'on_order';
  supplier_sku: string | null;
  updated_at: string;
};

// Зручний агрегований тип для відображення на сторінці
export type ProductFull = Product & {
  stock: ProductStock | null;
  characteristics: ProductCharacteristic[];
};

// ── Клієнт для браузера / Server Components ───────────────────────────────────

let _supabase: ReturnType<typeof createClient> | null = null;

export function getSupabase() {
  if (!_supabase) {
    _supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    );
  }
  return _supabase;
}

// Зворотня сумісність — використовуй getSupabase() для нових викликів
export const supabase = new Proxy({} as ReturnType<typeof createClient>, {
  get(_, prop) { return (getSupabase() as any)[prop]; },
});

// ── Клієнт з service role — тільки для серверних скриптів ─────────────────────
// Ніколи не використовувати на клієнті!
export function createServiceClient() {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) throw new Error('SUPABASE_SERVICE_ROLE_KEY is not set');
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    serviceKey,
    { auth: { persistSession: false } },
  );
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

export async function getProducts(opts?: {
  category?: string;
  search?: string;
  inStockOnly?: boolean;
  limit?: number;
}): Promise<ProductFull[]> {
  let query = supabase
    .from('products')
    .select(`
      *,
      stock:product_stock(*),
      characteristics:product_characteristics(*)
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
  if (opts?.inStockOnly) {
    query = query.eq('product_stock.stock_status', 'in_stock');
  }
  if (opts?.limit) {
    query = query.limit(opts.limit);
  }

  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as ProductFull[];
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
