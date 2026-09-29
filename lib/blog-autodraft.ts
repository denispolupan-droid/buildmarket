import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@supabase/supabase-js';
import { Resend } from 'resend';
import { generateBlogPost } from './blog-generator';
import { logSeoAction } from './seo-actions';
import { fetchAllRows } from './db-paginate';
import { expandCategories, pickArticleProducts, type LinkProduct } from './blog-product-links';
import { costOf } from './ai-cost';

/**
 * Автопілот контенту: чернетки статей із черги «Невидимого попиту».
 *
 * Стратегія 28.08 (погоджена власником): 3+ статті на тиждень — єдиний канал,
 * який доведено росте; у вересні конвеєр став, бо теми добирались руками.
 * Тепер крон (vercel.json, пн–сб) щодня робить одну чернетку: дешева модель
 * обирає тему з непокритих фраз так, щоб не повторити НАМІР наявних статей
 * (docs/CONTENT-STANDARD.md §3), дорога пише статтю (blog-generator), товари
 * підбираються так само, як кнопкою в адмінці. Публікує — лише людина.
 *
 * Гальма: app_settings.blog_autodraft_per_run (0 = вимкнено), weekly_cap —
 * стеля чернеток за 7 днів (рахується по журналу seo_actions, meta.batch='auto').
 */

const PICK_MODEL = 'claude-sonnet-5';
const SETTING_PER_RUN = 'blog_autodraft_per_run';
const SETTING_WEEKLY_CAP = 'blog_autodraft_weekly_cap';
const BATCH_TAG = 'auto';

// Питальні/інформаційні фрази — те, на що відповідає стаття (як у вкладці «Попит»)
const INFO = /^(як|який|яка|які|яку|скільки|чим|чи|чому|навіщо|коли|как|какой|какая|какие|какую|сколько|чем|можно ли|почему|зачем|когда)(?!\p{L})|(?<!\p{L})(як|как|скільки|сколько|чим|чем|різниц|отлич|витрат|расход|сохне|сохнет|пропорц|нанос|вибрат|выбрать|краще|лучше|своїми|своими|чому|почему|навіщо|зачем|можна|можно)/iu;

const db = () => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

async function settings(): Promise<{ perRun: number; weeklyCap: number; notifyTo: string | null }> {
  const { data } = await db().from('app_settings').select('key, value').in('key', [SETTING_PER_RUN, SETTING_WEEKLY_CAP, 'orders_from_email']);
  const s: Record<string, string> = {};
  for (const r of data ?? []) s[r.key] = (r.value ?? '').trim();
  return {
    perRun: Math.max(0, Math.min(3, Number(s[SETTING_PER_RUN] ?? '1') || 0)),
    weeklyCap: Math.max(0, Number(s[SETTING_WEEKLY_CAP] ?? '6') || 0),
    notifyTo: s.orders_from_email?.includes('@') ? s.orders_from_email : null,
  };
}

export type TopicPick = { topic: string; focusQuery: string; hub: string; why: string };

const PICK_SCHEMA = {
  type: 'object' as const,
  properties: {
    topics: {
      type: 'array' as const,
      items: {
        type: 'object' as const,
        properties: {
          topic: { type: 'string' as const, description: 'Тема статті українською, як заголовок: 50–90 символів, з двома-трьома підзапитами кластера через кому/двокрапку' },
          focusQuery: { type: 'string' as const, description: 'Найширша фраза кластера мовою, якою її шукають (uk або ru) — запит-ціль' },
          hub: { type: 'string' as const, description: 'Слаг категорії магазину з наданого списку — головна тема' },
          why: { type: 'string' as const, description: 'Одне речення: який намір закриває і чому його не закриває жодна наявна стаття' },
        },
        required: ['topic', 'focusQuery', 'hub', 'why'],
        additionalProperties: false,
      },
    },
  },
  required: ['topics'],
  additionalProperties: false,
};

/**
 * Вибір тем: непокриті питальні фрази по категоріях + назви всіх наявних статей
 * (опублікованих і чернеток) → модель повертає N тем із новим наміром.
 */
export async function pickTopics(n: number): Promise<{ picks: TopicPick[]; rejected: TopicPick[]; costUsd: number; candidates: number }> {
  const client = db();
  const [phrases, cats, posts, prods] = await Promise.all([
    fetchAllRows<{ phrase: string; lang: string; category_slug: string; seen: number; gsc_impressions: number | null }>((f, t) =>
      client.from('search_demand').select('phrase, lang, category_slug, seen, gsc_impressions').is('covered_path', null).order('phrase').order('lang').range(f, t)),
    client.from('categories').select('slug, name, parent_slug').then(r => r.data ?? []),
    client.from('blog_posts').select('title, is_published').then(r => r.data ?? []),
    fetchAllRows<{ category_slug: string | null; product_type: string | null }>((f, t) =>
      client.from('products').select('category_slug, product_type').eq('is_active', true).order('id').range(f, t)),
  ]);
  // Що реально є в каталозі: кількість товарів і типи по категоріях (з дітьми) —
  // щоб модель не пропонувала статті про матеріали, яких ми не продаємо
  const familyOf = (slug: string): string[] => {
    const out = [slug];
    for (let i = 0; i < out.length; i++) for (const c of cats) if (c.parent_slug === out[i]) out.push(c.slug);
    return out;
  };
  const assortment = (slug: string): string => {
    const fam = new Set(familyOf(slug));
    const own = prods.filter(p => p.category_slug && fam.has(p.category_slug));
    const types = [...new Set(own.map(p => p.product_type?.trim()).filter(Boolean))].slice(0, 8);
    return own.length ? `товарів ${own.length}${types.length ? `: ${types.join(', ')}` : ''}` : 'товарів немає';
  };
  const info = phrases.filter(p => INFO.test(p.phrase));
  if (info.length === 0 || n <= 0) return { picks: [], rejected: [], costUsd: 0, candidates: info.length };

  // Групи по категоріях, у кожній до 25 найпомітніших фраз — інакше промпт роздувається
  const byCat = new Map<string, typeof info>();
  for (const p of info) byCat.set(p.category_slug, [...(byCat.get(p.category_slug) ?? []), p]);
  const catName = new Map(cats.map(c => [c.slug, c.name]));
  const clusters = [...byCat.entries()]
    .filter(([slug]) => catName.has(slug))
    .sort((a, b) => b[1].length - a[1].length)
    .map(([slug, list]) => {
      const top = list.sort((a, b) => (b.gsc_impressions ?? 0) - (a.gsc_impressions ?? 0) || b.seen - a.seen).slice(0, 25);
      return `## ${slug} — ${catName.get(slug)} (${list.length} фраз; у каталозі ${assortment(slug)})\n${top.map(p => `- [${p.lang}] ${p.phrase}${p.gsc_impressions ? ` (${p.gsc_impressions} показів)` : ''}`).join('\n')}`;
    }).join('\n\n');
  const existing = posts.map(p => `- ${p.title}${p.is_published ? '' : ' (чернетка)'}`).join('\n');

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const msg = await anthropic.messages.create({
    model: PICK_MODEL,
    // Sonnet 5 думає перед відповіддю (adaptive thinking) — ліміт має вмістити
    // і роздуми, і JSON; 2 000 обривалось на max_tokens ще до відповіді.
    max_tokens: 16000,
    output_config: { format: { type: 'json_schema', schema: PICK_SCHEMA }, effort: 'medium' },
    messages: [{
      role: 'user',
      content: `Ти редактор блогу магазину будівельної хімії FIXLINE. Обери ${n} тем(и) для нових статей.

Правила (стандарт контенту):
- одна стаття на КЛАСТЕР наміру, не на фразу: «скільки сохне акриловий», «…силіконовий», «скільки сохне герметик» — одна стаття;
- намір має бути НОВИМ: вибір ≠ як розвести ≠ чим відмити ≠ скільки сохне ≠ чи можна замість — це різні статті; «який кращий» і «як вибрати» — одна й та сама; якщо наявна стаття вже закриває намір — тему НЕ пропонуй;
- перевага фразам із показами і найбільшим кластерам; ігноруй фрази не про будівництво (сни, бізнес, авіаперельоти, 5 букв тощо);
- стаття має ВЕСТИ ДО ТОВАРІВ каталогу: у заголовку групи вказано, що ми продаємо; тему про матеріали, яких у нас немає (мембрани, плівки, рулонна ізоляція, інструмент, якого нема), не пропонуй;
- hub — слаг категорії зі списку нижче (ключ групи, копіюй точно), найближчий до теми.

Наявні статті (не дублювати намір):
${existing}

Непокриті фрази з пошукових підказок, згруповані по категоріях:
${clusters}`,
    }],
  });
  const block = msg.content.find(b => b.type === 'text');
  if (process.env.AUTODRAFT_DEBUG) console.log('[autodraft] stop', msg.stop_reason, 'raw:', block && block.type === 'text' ? block.text.slice(0, 1500) : msg.content.map(b => b.type));
  const parsed = block && block.type === 'text' ? JSON.parse(block.text) as { topics: TopicPick[] } : { topics: [] };
  // Модель іноді пише слаг із хвостом чи батька — підтягуємо до відомого; зовсім невідомий hub відкидаємо
  const known = [...catName.keys()];
  const fix = (t: TopicPick): TopicPick => catName.has(t.hub) ? t
    : { ...t, hub: known.find(k => t.hub.startsWith(k) || k.startsWith(t.hub) || editDistance(k, t.hub) <= 2) ?? t.hub };
  const all = parsed.topics.map(fix);
  const picks = all.filter(t => catName.has(t.hub)).slice(0, n);
  const rejected = all.filter(t => !catName.has(t.hub));
  return { picks, rejected, costUsd: costOf(msg.model, msg.usage), candidates: info.length };
}

/** Автопідбір товарів «Чим це зробити» — та сама логіка, що в /api/admin/blog/link-products. */
async function autoPickProducts(postId: number, hub: string): Promise<number> {
  const client = db();
  const [{ data: post }, { data: cats }, products] = await Promise.all([
    client.from('blog_posts').select('related_links').eq('id', postId).single(),
    client.from('categories').select('slug, name, parent_slug'),
    fetchAllRows<{
      sku: string; slug: string | null; name: string; name_ru: string | null; brand: string; volume: string | null; category_slug: string | null;
      product_stock: { price_retail: number | null; stock_status: string | null; stock_qty: number | null } | { price_retail: number | null; stock_status: string | null; stock_qty: number | null }[] | null;
    }>((f, t) => client.from('products').select('sku, slug, name, name_ru, brand, volume, category_slug, product_stock(price_retail, stock_status, stock_qty)').eq('is_active', true).order('id').range(f, t)),
  ]);
  const childrenOf = new Map<string, string[]>();
  for (const c of cats ?? []) if (c.parent_slug) childrenOf.set(c.parent_slug, [...(childrenOf.get(c.parent_slug) ?? []), c.slug]);
  const byCategory = new Map<string, LinkProduct[]>();
  for (const p of products) {
    const stock = Array.isArray(p.product_stock) ? p.product_stock[0] : p.product_stock;
    const item: LinkProduct = {
      sku: p.sku, slug: p.slug, name: p.name, name_ru: p.name_ru, brand: p.brand, volume: p.volume,
      price: stock?.price_retail ?? null, category_slug: p.category_slug,
      in_stock: stock?.stock_status === 'in_stock' || (stock?.stock_qty ?? 0) >= 1,
    };
    byCategory.set(p.category_slug ?? '', [...(byCategory.get(p.category_slug ?? '') ?? []), item]);
  }
  // Хаб теми — першим у related_links (кнопка «Купити …» і колір родини статті)
  const hubName = (cats ?? []).find(c => c.slug === hub)?.name ?? hub;
  const links = ((post?.related_links ?? []) as { label: string; href: string }[]).filter(l => l.href !== `/shop/${hub}`);
  const related = [{ label: hubName, href: `/shop/${hub}` }, ...links].slice(0, 5);
  const seen = new Set<string>();
  const groups = related.map(l => l.href.replace('/shop/', '')).map(slug =>
    expandCategories([slug], childrenOf).flatMap(s => byCategory.get(s) ?? []).filter(c => !seen.has(c.sku) && seen.add(c.sku)));
  const picks = pickArticleProducts(groups, 6);
  await client.from('blog_posts').update({ related_links: related, product_skus: picks.map(p => p.sku) }).eq('id', postId);
  return picks.length;
}

async function draftsThisWeek(): Promise<number> {
  const since = new Date(Date.now() - 7 * 864e5).toISOString();
  const { count } = await db().from('seo_actions').select('id', { count: 'exact', head: true })
    .eq('action', 'article_new').eq('created_by', 'autodraft').gte('created_at', since);
  return count ?? 0;
}

export type AutodraftResult = {
  planned: number; created: { slug: string; title: string; products: number; costUsd: number }[];
  skipped?: string; pickCostUsd: number; candidates: number; weekly: number; errors: string[];
};

/** Один прогін крона: обрати тему(и), написати чернетку(и), повідомити. `dry` — лише вибір тем. */
export async function runAutodraft(opts: { dry?: boolean } = {}): Promise<AutodraftResult & { picks?: TopicPick[]; rejected?: TopicPick[] }> {
  const { perRun, weeklyCap, notifyTo } = await settings();
  const weekly = await draftsThisWeek();
  const n = Math.min(perRun, Math.max(0, weeklyCap - weekly));
  const base: AutodraftResult = { planned: n, created: [], pickCostUsd: 0, candidates: 0, weekly, errors: [] };
  if (n === 0) return { ...base, skipped: perRun === 0 ? `${SETTING_PER_RUN}=0` : `тижнева стеля ${weeklyCap} досягнута (${weekly})` };

  const { picks, rejected, costUsd, candidates } = await pickTopics(n);
  base.pickCostUsd = costUsd; base.candidates = candidates;
  if (opts.dry) return { ...base, picks, rejected };
  if (picks.length === 0) return { ...base, rejected, skipped: 'модель не запропонувала жодної нової теми' };

  for (const t of picks) {
    try {
      const post = await generateBlogPost(t.topic, { focusQuery: t.focusQuery, mustLink: { href: `/shop/${t.hub}`, label: t.hub } });
      await logSeoAction({
        page: `/blog/${post.slug}`, action: 'article_new', query: t.focusQuery,
        meta: { title: post.title, mustLink: `/shop/${t.hub}`, batch: BATCH_TAG, why: t.why }, by: 'autodraft', cost: post.costUsd,
      });
      const products = await autoPickProducts(post.id, t.hub).catch(() => 0);
      if (products) await logSeoAction({ page: `/blog/${post.slug}`, action: 'article_products', meta: { count: products, mode: 'auto' }, by: 'autodraft' });
      base.created.push({ slug: post.slug, title: post.title, products, costUsd: post.costUsd });
    } catch (e) {
      base.errors.push(`${t.topic}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  if (notifyTo && process.env.RESEND_API_KEY && (base.created.length || base.errors.length)) {
    try {
      const resend = new Resend(process.env.RESEND_API_KEY);
      const items = base.created.map(c => `<li><a href="https://fixline.com.ua/admin/blog">${esc(c.title)}</a> — товарів ${c.products}, $${c.costUsd.toFixed(2)}</li>`).join('');
      const errs = base.errors.map(e => `<li style="color:#b93a32">${esc(e)}</li>`).join('');
      await resend.emails.send({
        from: 'FIXLINE <noreply@fixline.com.ua>', to: notifyTo,
        subject: `Чернетки блогу: ${base.created.length} нових${base.errors.length ? `, помилок ${base.errors.length}` : ''}`,
        html: `<div style="font-family:Arial,sans-serif;max-width:560px;color:#1E293B"><p>Автопілот контенту зробив чернетки — вичитати й опублікувати в <a href="https://fixline.com.ua/admin/blog">/admin/blog</a>:</p><ul>${items}${errs}</ul><p style="color:#64748B;font-size:13px">За тиждень: ${weekly + base.created.length} із ${weeklyCap}. Вимкнути: app_settings.${SETTING_PER_RUN} = 0.</p></div>`,
      });
    } catch (e) { base.errors.push(`notify: ${e instanceof Error ? e.message : String(e)}`); }
  }
  return base;
}

/** Відстань Левенштейна — модель пише «antyseptyky» замість «antyseptyki». */
function editDistance(a: string, b: string): number {
  const dp = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)] as number[]);
  for (let j = 1; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) {
    dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  }
  return dp[a.length][b.length];
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
