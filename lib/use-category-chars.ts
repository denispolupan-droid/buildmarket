'use client';

import { useEffect, useMemo, useState } from 'react';
import { subtreeSlugs, type FacetCategoryTree } from './facets';
import { mergeChars, type CharRow } from './shop-chars';

/**
 * Довантаження характеристик при клієнтському перемиканні категорії.
 *
 * Сервер віддає характеристики лише товарам відкритої гілки (`scope` — її
 * корінь; null = у списку вже все, довантажувати нема чого — так на /shop,
 * /shop/sale і бренд-сторінках). Клік по іншій категорії без навігації
 * (pushState) → один запит /api/category-chars/<slug> для її піддерева,
 * відповідь накладається на список; повернення в уже завантажену гілку —
 * без запиту. Поки відповідь у дорозі, фасети нової категорії порожні
 * 100–200 мс, потім з'являються.
 */
export function useCategoryChars<T extends { sku: string; category_slug: string | null; characteristics: CharRow[] }>(
  products: T[],
  categories: FacetCategoryTree,
  selCat: string | null,
  scope: string | null | undefined,
): T[] {
  const [extra, setExtra] = useState<Map<string, CharRow[]>>(() => new Map());
  // Слаги, для яких характеристики вже повні: усе піддерево стартової гілки + довантажені.
  const [covered, setCovered] = useState<Set<string>>(() => new Set(scope ? subtreeSlugs(categories, scope) : []));

  useEffect(() => {
    if (scope === null || scope === undefined) return; // у списку повний набір
    const need = selCat ? subtreeSlugs(categories, selCat) : categories.map(c => c.slug);
    if (need.every(s => covered.has(s))) return;
    const ctrl = new AbortController();
    fetch(`/api/category-chars/${encodeURIComponent(selCat ?? 'all')}`, { signal: ctrl.signal })
      .then(r => (r.ok ? r.json() : []))
      .then((rows: { sku: string; characteristics: CharRow[] }[]) => {
        setExtra(prev => {
          const next = new Map(prev);
          for (const r of rows) next.set(r.sku, r.characteristics);
          return next;
        });
        setCovered(prev => new Set([...prev, ...need]));
      })
      .catch(() => { /* обрив мережі або скасування — фасети просто не з'являться до наступного кліку */ });
    return () => ctrl.abort();
  // eslint-disable-next-line react-hooks/exhaustive-deps -- covered читається лише як «чи вже є»
  }, [selCat, scope, categories]);

  return useMemo(() => mergeChars(products, extra), [products, extra]);
}
