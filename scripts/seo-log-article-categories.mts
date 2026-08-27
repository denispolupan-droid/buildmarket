/**
 * Фіксує в журналі SEO дію «article_categories» для кожної опублікованої
 * статті — після деплою контекстних посилань зі статей на категорії
 * (lib/article-links). Одна дія на статтю з датою запуску: ретроспективний
 * замір (28 днів до / після) у /admin/seo → Журнал покаже, чи зрушили
 * категорії, на які ведуть посилання (meta.categories).
 *
 *   npx tsx --env-file=.env.local scripts/seo-log-article-categories.mts          # dry-run
 *   npx tsx --env-file=.env.local scripts/seo-log-article-categories.mts --apply  # записати
 *
 * Ідемпотентно: статті, у яких дія вже є, пропускаються.
 */
import { createClient } from '@supabase/supabase-js';

const APPLY = process.argv.includes('--apply');
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const al: { linkCategoriesInHtml?: LinkFn; default?: { linkCategoriesInHtml: LinkFn } } = await import('../lib/article-links');
type LinkFn = (html: string, links: { href: string; label: string }[], lang: 'uk' | 'ru') => string;
const link = (al.linkCategoriesInHtml ?? al.default!.linkCategoriesInHtml);

const { data: posts, error } = await db.from('blog_posts').select('slug, related_links, content_html').eq('is_published', true);
if (error) throw error;
const { data: existing } = await db.from('seo_actions').select('page_path').eq('action', 'article_categories');
const have = new Set((existing ?? []).map(r => r.page_path));

let n = 0;
for (const p of posts ?? []) {
  const path = `/blog/${p.slug}`;
  if (have.has(path)) { console.log('skip (є)', path); continue; }
  const links = (p.related_links ?? []) as { href: string; label: string }[];
  const out = link(p.content_html, links, 'uk');
  const cats = [...new Set([...out.matchAll(/<a href="\/shop\/([^"]+)">/g)].map(m => m[1]))].filter(c => !p.content_html.includes(`href="/shop/${c}"`));
  if (!cats.length) { console.log('без посилань', path); continue; }
  console.log(`${APPLY ? 'log' : 'dry'} ${path} → ${cats.join(', ')}`);
  if (APPLY) {
    const { error: e } = await db.from('seo_actions').insert({ page_path: path, action: 'article_categories', meta: { categories: cats, count: cats.length }, created_by: 'seo-log-article-categories' });
    if (e) throw e;
  }
  n++;
}
console.log(`${APPLY ? 'записано' : 'до запису'}: ${n}`);
