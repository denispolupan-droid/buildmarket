'use client';

import { useCallback, useEffect, useState } from 'react';

// Позначки «що вже робили зі сторінкою» потрібні одразу трьом екранам
// (Запити, Сторінки, Сніпети) — тримаємо завантаження в одному місці.

export type PageAction = {
  page_path: string;
  last_at: string;
  total: number;
  kinds: ('article_boost' | 'article_products' | 'article_new' | 'article_categories' | 'product_boost' | 'cover' | 'meta_rewrite')[];
  query: string | null;
  products: number | null;
};

export const KIND_LABEL: Record<string, string> = {
  article_boost: 'дожим статті',
  article_products: 'товари',
  article_categories: 'категорії',
  article_new: 'нова стаття',
  product_boost: 'перепис картки',
  cover: 'обкладинка',
  meta_rewrite: 'мета',
};

/** Ключ журналу: без домену, параметрів і без /ru — обидві мови в один рядок. */
export function actionKey(pageOrPath: string): string {
  const p = pageOrPath
    .replace(/^https?:\/\/[^/]+/i, '')
    .replace(/[?#].*$/, '')
    .replace(/^\/ru(?=\/|$)/, '')
    .replace(/\/+$/, '');
  return p || '/';
}

export function useSeoActions() {
  const [actions, setActions] = useState<Map<string, PageAction>>(new Map());

  const reload = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/seo/actions');
      if (!res.ok) return;
      const rows: PageAction[] = await res.json();
      setActions(new Map(rows.map(r => [r.page_path, r])));
    } catch { /* історія не критична для роботи розділу */ }
  }, []);

  useEffect(() => { void reload(); }, [reload]);

  return { actions, reload };
}
