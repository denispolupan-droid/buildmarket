/**
 * lib/showcase-server.ts — серверне читання вітрини.
 *
 * Окремо від lib/showcase, бо той чистий і його імпортує клієнтський екран
 * адмінки: тут next/cache і supabase, і тягнути їх у браузер не можна.
 */
import { unstable_cache } from 'next/cache';
import { createServiceClient } from './supabase';
import { SHOWCASE_MAX_ITEMS, type ShowcaseSurface } from './showcase';

/** SKU вітрини по порядку. */
export async function getShowcaseSkus(surface: ShowcaseSurface): Promise<string[]> {
  const { data, error } = await createServiceClient()
    .from('showcase_items')
    .select('sku')
    .eq('surface', surface)
    .order('position')
    .limit(SHOWCASE_MAX_ITEMS);
  // Вітрина — прикраса, а не каталог: її збій не має валити головну.
  if (error) return [];
  return (data ?? []).map(r => r.sku as string);
}

/**
 * Кеш із власним тегом 'showcase': збереження в адмінці скидає саме його, не
 * чіпаючи кеш товарів. Вітрину читає кожна головна, а міняється вона рідко.
 */
export const getShowcaseSkusCached = unstable_cache(
  async (surface: ShowcaseSurface) => getShowcaseSkus(surface),
  ['showcase-skus'],
  { revalidate: 300, tags: ['showcase'] },
);
