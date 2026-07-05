import { SupabaseClient } from '@supabase/supabase-js';

/**
 * Fetches active products ordered exactly the way the public catalog shows them:
 * one filtered query per category (matching lib/supabase.ts getProducts()'s
 * per-category query shape: `.eq('category_slug', slug).order('sort_order')`),
 * walked in the categories' own sort_order.
 *
 * A single combined query ordered by (category_slug, sort_order) looks equivalent
 * but isn't: most products share sort_order = 0, so ties are broken by Postgres'
 * unspecified physical scan order — which differs between one big multi-category
 * query and the storefront's narrow per-category query, even on identical data.
 * Running the same narrow query per category reproduces the storefront's order.
 */
export async function fetchProductsInCatalogOrder<T>(
  db: SupabaseClient,
  selectStr: string,
  categorySlugsInOrder: string[],
): Promise<T[]> {
  const [perCategory, { data: uncategorized }] = await Promise.all([
    Promise.all(categorySlugsInOrder.map(slug =>
      db.from('products')
        .select(selectStr)
        .eq('is_active', true)
        .eq('category_slug', slug)
        .order('sort_order'),
    )),
    db.from('products')
      .select(selectStr)
      .eq('is_active', true)
      .is('category_slug', null)
      .order('sort_order'),
  ]);

  const results: T[] = [];
  for (const { data } of perCategory) {
    if (data) results.push(...(data as unknown as T[]));
  }
  if (uncategorized) results.push(...(uncategorized as unknown as T[]));
  return results;
}
