import { createClient } from '@supabase/supabase-js';

/**
 * Журнал SEO-дій: що робили зі сторінкою, коли і скільки це коштувало.
 *
 * Потрібен, щоб у розділі SEO було видно історію — інакше легко вдруге
 * заплатити за дожим сторінки, яку вже дотягнули, або забути, що з нею
 * працювали. Запис ніколи не має валити саму дію, тому всі помилки глушаться.
 *
 * Ефект дії (стало краще чи ні) тут НЕ зберігається: він рахується
 * ретроспективно з історії gsc_daily — див. lib/seo/history.ts.
 */

export type SeoActionKind =
  | 'article_boost'
  | 'article_products'
  | 'article_new'
  | 'product_boost'
  | 'cover'
  | 'meta_rewrite'
  | 'article_categories'
  | 'category_content';

const db = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

/**
 * Шлях без домену й мовного префікса: /ru/blog/x → /blog/x.
 * Так укр і рос версії однієї сторінки лягають в один рядок історії — саме це
 * і потрібно, бо дожим править обидві мови одночасно.
 */
export function normalizePagePath(pageOrUrl: string): string {
  let p = pageOrUrl.trim();
  p = p.replace(/^https?:\/\/[^/]+/i, '');
  p = p.replace(/[?#].*$/, '');
  p = p.replace(/^\/ru(?=\/|$)/, '');
  if (!p.startsWith('/')) p = `/${p}`;
  return p.replace(/\/+$/, '') || '/';
}

export async function logSeoAction(entry: {
  page: string;
  action: SeoActionKind;
  query?: string | null;
  meta?: Record<string, unknown>;
  by?: string | null;
  /** фактична вартість генерації, $ */
  cost?: number | null;
}): Promise<void> {
  try {
    await db().from('seo_actions').insert({
      page_path: normalizePagePath(entry.page),
      action: entry.action,
      query: entry.query?.trim() || null,
      meta: entry.meta ?? {},
      created_by: entry.by ?? null,
      cost_usd: entry.cost ?? null,
    });
  } catch (err) {
    console.error('[seo-actions] log failed:', err);
  }
}

export type SeoActionRow = {
  page_path: string;
  action: SeoActionKind;
  query: string | null;
  meta: Record<string, unknown>;
  created_at: string;
  created_by: string | null;
  cost_usd: number | null;
};

/** Історія по сторінках, від найновіших. */
export async function recentSeoActions(limit = 500): Promise<SeoActionRow[]> {
  const { data } = await db()
    .from('seo_actions')
    .select('page_path, action, query, meta, created_at, created_by, cost_usd')
    .order('created_at', { ascending: false })
    .limit(limit);
  return (data ?? []) as SeoActionRow[];
}
