'use client';

import { useEffect, useMemo, useState } from 'react';
import { subtreeSlugs, type FacetCategoryTree } from './facets';
import { assembleCatalog } from './shop-products';

/**
 * Довантаження товарів при клієнтському перемиканні категорії.
 *
 * Сервер віддає лише гілку `scope` (корінь відкритої категорії; null — у
 * списку вже весь каталог, як на /shop, /shop/sale і бренд-сторінках). Клік по
 * категорії поза гілкою без навігації (pushState) → один запит
 * /api/shop-products/<slug> для її піддерева; повернення в уже завантажену
 * гілку — без запиту. Список збирається в серверному порядку `order`.
 *
 * `loading` — обрана категорія ще не завантажена: листинг показує
 * «Завантажуємо», а не «Нічого не знайдено». Якщо запит упав, робимо звичайний
 * перехід на поточну адресу — сервер віддасть сторінку з потрібною гілкою.
 */
export function useShopProducts<T extends { sku: string; category_slug: string | null }>(
  products: T[],
  order: string[] | null | undefined,
  categories: FacetCategoryTree,
  selCat: string | null,
  scope: string | null | undefined,
): { products: T[]; loading: boolean } {
  const [extra, setExtra] = useState<Map<string, T>>(() => new Map());
  // Слаги, чиї товари вже всі в списку: піддерево стартової гілки + довантажені.
  const [covered, setCovered] = useState<Set<string>>(() => new Set(scope ? subtreeSlugs(categories, scope) : []));

  const partial = !!scope && !!order;
  const need = useMemo(
    () => (selCat ? subtreeSlugs(categories, selCat) : categories.map(c => c.slug)),
    [selCat, categories],
  );
  const loading = partial && !need.every(s => covered.has(s));

  useEffect(() => {
    if (!loading) return;
    const ctrl = new AbortController();
    fetch(`/api/shop-products/${encodeURIComponent(selCat ?? 'all')}`, { signal: ctrl.signal })
      .then(r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json() as Promise<T[]>;
      })
      .then(rows => {
        setExtra(prev => {
          const next = new Map(prev);
          for (const r of rows) next.set(r.sku, r);
          return next;
        });
        setCovered(prev => new Set([...prev, ...need]));
      })
      .catch(err => {
        if (ctrl.signal.aborted) return; // перемкнули далі — запит уже не потрібен
        console.warn('[shop] довантаження товарів не вдалося, перехід сторінкою', err);
        window.location.assign(window.location.pathname);
      });
    return () => ctrl.abort();
  }, [loading, selCat, need]);

  const list = useMemo(
    () => (partial ? assembleCatalog(order!, products, extra) : products),
    [partial, order, products, extra],
  );
  return { products: list, loading };
}
