'use client';

import { useMemo } from 'react';
import { useAdminQuery } from '../../../lib/admin/api';

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
  category_content: 'текст категорії',
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
  // Помилку не показуємо: історія не критична для роботи розділу
  const { data, refresh: reload } = useAdminQuery<PageAction[]>('/api/admin/seo/actions');
  const actions = useMemo(() => new Map((data ?? []).map(r => [r.page_path, r])), [data]);

  return { actions, reload };
}
