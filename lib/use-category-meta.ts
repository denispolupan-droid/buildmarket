'use client';

import { useEffect, useState } from 'react';
import type { CategoryMeta } from './category-descriptions';

/**
 * Мета категорії (опис, FAQ, гайд) для клієнтських листингів.
 *
 * Початкове значення приходить із сервера разом зі сторінкою — так текст
 * відкритої категорії є в HTML (SEO, як і раніше) і гідрація збігається. При
 * клієнтському перемиканні категорії (pushState, без навігації) мета
 * підвантажується з /api/category-meta — замість того, щоб тримати в
 * бандлі всі 79 категорій обома мовами (757 КБ у чанку).
 *
 * Кеш живе, поки живе компонент: повернення на вже відкриту категорію —
 * без запиту. undefined = ще вантажиться, null = у категорії немає мети.
 */
type Cache = Record<string, CategoryMeta | null>;

export function useCategoryMeta(
  slug: string | null | undefined,
  lang: 'uk' | 'ru',
  initial?: { slug?: string | null; meta: CategoryMeta | null },
): CategoryMeta | null {
  const [cache, setCache] = useState<Cache>(() =>
    initial?.slug ? { [`${lang}:${initial.slug}`]: initial.meta } : {},
  );
  const key = slug ? `${lang}:${slug}` : null;

  useEffect(() => {
    if (!key || key in cache) return;
    const ctrl = new AbortController();
    fetch(`/api/category-meta/${encodeURIComponent(slug!)}?lang=${lang}`, { signal: ctrl.signal })
      .then(r => (r.ok ? r.json() : { meta: null }))
      .then((j: { meta: CategoryMeta | null }) => setCache(c => ({ ...c, [key]: j.meta ?? null })))
      .catch(() => { /* обрив мережі або скасування — блок просто не з'явиться */ });
    return () => ctrl.abort();
  // eslint-disable-next-line react-hooks/exhaustive-deps -- cache читається лише як «чи вже є ключ»
  }, [key, lang, slug]);

  return key ? (cache[key] ?? null) : null;
}
