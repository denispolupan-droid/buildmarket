import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@supabase/supabase-js';
import type { CategoryMeta } from './category-descriptions';
import type { CategoryContentInput } from './category-content';
import { fetchAllRows } from './db-paginate';
import { getCategoryNameRu } from './ru';
import { categoryFamilySlugs } from './seo/meta';
import { tokenSkus } from './seo/guide-prices';
import { queryAll } from './gsc';
import { toLangNeutralPath } from './seo/history';
import type { CostSink } from './ai-cost';

/**
 * Генерація контенту категорії «за стандартом» (docs/CONTENT-STANDARD.md, розд. 1)
 * для кнопки в адмінці /admin/seo/categories/<slug>.
 *
 * Модель отримує все, з чого стандарт велить писати: товари родини з
 * артикулами й поточними цінами (щоб ціни стали токенами {price:SKU}, а не
 * цифрами), витрату з характеристик, топ-запити Search Console по цій сторінці
 * (для формулювань і FAQ), сусідні категорії та статті (для посилань — лише з
 * дозволеного списку). Результат — structured output за схемою CategoryMeta,
 * далі validateContent перевіряє машинно-перевірюване: чи всі токени
 * розв'язуються, чи всі посилання існують, довжина description, склад FAQ і
 * гайда. Помилки не блокують — повертаються попередженнями в редактор, бо
 * дописати одне питання руками дешевше, ніж переганяти все за $1.
 *
 * Російська версія — самостійний текст того ж обсягу (стандарт 1.4): по
 * більшості категорій запити російськомовні, і ранжується саме /ru. Якщо
 * українська вже є, вона йде моделі як джерело фактів, а не як текст на
 * переклад.
 */

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const MODEL = 'claude-opus-4-8';
const TIMEOUT_MS = 240_000;

export type GenProduct = {
  sku: string; name: string; brand: string; volume: string | null;
  price: number | null; inStock: boolean; consumption: string | null; categorySlug: string;
};
export type GenCategory = { slug: string; name: string; nameRu: string };
export type GenQuery = { query: string; impressions: number; position: number };
export type GenPost = { slug: string; title: string; titleRu: string | null };

export type GenContext = {
  category: GenCategory & { parent: GenCategory | null; children: GenCategory[]; siblings: GenCategory[] };
  family: string[];
  products: GenProduct[];
  /** усі активні артикули з цінами — для перевірки токенів, що посилаються за межі родини */
  skuPrices: Record<string, number>;
  queries: GenQuery[];
  posts: GenPost[];
  /** шляхи, на які можна посилатись у прозі, related і blogSlug */
  allowedLinks: Set<string>;
  allCategories: GenCategory[];
};

const db = () => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

type ProductRow = {
  sku: string; name: string; brand: string | null; volume: string | null; category_slug: string | null;
  stock: { price_retail: number | null; price_promo: number | null; stock_status: string | null } | null;
  characteristics: { label: string; value: string }[] | null;
};

export async function buildGenContext(slug: string): Promise<GenContext> {
  const client = db();
  const [cats, products, posts] = await Promise.all([
    fetchAllRows<{ slug: string; name: string; parent_slug: string | null }>((f, t) =>
      client.from('categories').select('slug, name, parent_slug').range(f, t)),
    fetchAllRows<ProductRow>((f, t) =>
      client.from('products')
        .select('sku, name, brand, volume, category_slug, stock:product_stock(price_retail, price_promo, stock_status), characteristics:product_characteristics(label, value)')
        .eq('is_active', true).range(f, t) as unknown as PromiseLike<{ data: ProductRow[] | null; error: unknown }>),
    fetchAllRows<{ slug: string; title: string; title_ru: string | null; related_links: { href: string }[] | null }>((f, t) =>
      client.from('blog_posts').select('slug, title, title_ru, related_links').eq('is_published', true).range(f, t)),
  ]);

  const cat = cats.find(c => c.slug === slug);
  if (!cat) throw new Error(`Категорії ${slug} немає`);
  const gc = (c: { slug: string; name: string }): GenCategory => ({ slug: c.slug, name: c.name, nameRu: getCategoryNameRu(c.slug, c.name) });
  const parent = cat.parent_slug ? cats.find(c => c.slug === cat.parent_slug) ?? null : null;
  const family = categoryFamilySlugs(cats, slug);
  const famSet = new Set(family);

  const skuPrices: Record<string, number> = {};
  const famProducts: GenProduct[] = [];
  for (const p of products) {
    const price = p.stock?.price_promo ?? p.stock?.price_retail ?? null;
    if (price && price > 0) skuPrices[p.sku] = price;
    if (p.category_slug && famSet.has(p.category_slug)) {
      famProducts.push({
        sku: p.sku, name: p.name, brand: p.brand ?? '', volume: p.volume, price,
        inStock: p.stock?.stock_status === 'in_stock',
        consumption: p.characteristics?.find(c => /витрат/i.test(c.label))?.value ?? null,
        categorySlug: p.category_slug,
      });
    }
  }
  famProducts.sort((a, b) => a.brand.localeCompare(b.brand) || (a.price ?? 0) - (b.price ?? 0));

  // Запити по сторінці uk+ru за 90 днів — GSC може бути недоступним, тоді без них
  let queries: GenQuery[] = [];
  try {
    const rows = await queryAll({ dimensions: ['query', 'page'], days: 90 });
    const agg = new Map<string, GenQuery>();
    for (const r of rows) {
      if (toLangNeutralPath(r.keys[1]) !== `/shop/${slug}`) continue;
      const cur = agg.get(r.keys[0]);
      if (cur) { cur.impressions += r.impressions; cur.position = Math.min(cur.position, r.position); }
      else agg.set(r.keys[0], { query: r.keys[0], impressions: r.impressions, position: Math.round(r.position) });
    }
    queries = [...agg.values()].sort((a, b) => b.impressions - a.impressions).slice(0, 20);
  } catch { /* без GSC */ }

  // Статті: ті, що посилаються на родину в related_links, — першими; решта теж дозволена як посилання
  const linksTo = (p: { related_links: { href: string }[] | null }) =>
    (p.related_links ?? []).some(l => { const m = /^\/shop\/([^/?#]+)/.exec(l.href); return !!m && famSet.has(m[1]); });
  const relatedPosts = posts.filter(linksTo).map(p => ({ slug: p.slug, title: p.title, titleRu: p.title_ru }));
  const allowedLinks = new Set<string>(['/opt', '/calculators', ...cats.map(c => `/shop/${c.slug}`), ...posts.map(p => `/blog/${p.slug}`)]);

  return {
    category: { ...gc(cat), parent: parent ? gc(parent) : null, children: cats.filter(c => c.parent_slug === slug).map(gc), siblings: cats.filter(c => c.parent_slug === cat.parent_slug && c.slug !== slug && c.parent_slug).map(gc) },
    family, products: famProducts, skuPrices, queries, posts: relatedPosts, allowedLinks, allCategories: cats.map(gc),
  };
}

const SCHEMA = {
  type: 'object' as const,
  properties: {
    description: { type: 'string' as const, description: '1–2 речення, ≤160 символів: що це і для кого, зі словом «купити» або назвою типу товару як його шукають' },
    seoText: { type: 'string' as const, description: 'Один абзац 60–100 слів: типи, коли який; обов’язково речення з переліком брендів: «У каталозі FIXLINE — …»' },
    faq: { type: 'array' as const, items: { type: 'object' as const, properties: { q: { type: 'string' as const }, a: { type: 'string' as const } }, required: ['q', 'a'], additionalProperties: false } },
    guide: {
      type: 'object' as const,
      properties: {
        title: { type: 'string' as const },
        sections: { type: 'array' as const, items: { type: 'object' as const, properties: { h: { type: 'string' as const }, p: { type: 'array' as const, items: { type: 'string' as const } } }, required: ['h', 'p'], additionalProperties: false } },
      },
      required: ['title', 'sections'], additionalProperties: false,
    },
    related: { type: 'array' as const, items: { type: 'object' as const, properties: { href: { type: 'string' as const }, label: { type: 'string' as const } }, required: ['href', 'label'], additionalProperties: false } },
    blogSlug: { type: 'string' as const, description: 'slug профільної статті з переліку або порожній рядок' },
  },
  required: ['description', 'seoText', 'faq', 'guide', 'related', 'blogSlug'],
  additionalProperties: false,
};

function productLines(ctx: GenContext, lang: 'uk' | 'ru'): string {
  // Великі родини (фарби — 200+) не влазять цілком: по 12 позицій на бренд, найдешевші й найдорожчі лишаються
  const byBrand = new Map<string, GenProduct[]>();
  for (const p of ctx.products) byBrand.set(p.brand, [...(byBrand.get(p.brand) ?? []), p]);
  const lines: string[] = [];
  for (const [brand, list] of byBrand) {
    const take = list.length <= 12 ? list : [...list.slice(0, 6), ...list.slice(-6)];
    for (const p of take) {
      lines.push(`- ${p.sku} | ${p.name}${p.volume ? ` | ${p.volume}` : ''} | ${p.price ? `${p.price} грн` : lang === 'ru' ? 'цены нет' : 'ціни немає'}${p.inStock ? '' : lang === 'ru' ? ' | нет в наличии' : ' | немає в наявності'}${p.consumption ? ` | ${lang === 'ru' ? 'расход' : 'витрата'}: ${p.consumption}` : ''}`);
    }
    if (take.length < list.length) lines.push(`  (… ще ${list.length - take.length} позицій ${brand})`);
  }
  return lines.join('\n');
}

function buildPrompt(ctx: GenContext, lang: 'uk' | 'ru', opts: { current?: CategoryMeta | null; basisUk?: CategoryMeta | null; hint?: string }): string {
  const c = ctx.category;
  const name = lang === 'ru' ? c.nameRu : c.name;
  const nm = (x: GenCategory) => (lang === 'ru' ? x.nameRu : x.name);
  const catLine = (x: GenCategory) => `- /shop/${x.slug} — ${nm(x)}`;
  const nav = [
    c.parent ? `${lang === 'ru' ? 'Родительская' : 'Батьківська'}: ${catLine(c.parent)}` : '',
    c.children.length ? `${lang === 'ru' ? 'Дочерние' : 'Дочірні'}:\n${c.children.map(catLine).join('\n')}` : '',
    c.siblings.length ? `${lang === 'ru' ? 'Соседние' : 'Сусідні'}:\n${c.siblings.map(catLine).join('\n')}` : '',
  ].filter(Boolean).join('\n');
  const posts = ctx.posts.length
    ? ctx.posts.map(p => `- /blog/${p.slug} — ${lang === 'ru' ? (p.titleRu ?? p.title) : p.title}`).join('\n')
    : (lang === 'ru' ? '(статей по теме нет)' : '(статей по темі немає)');
  const queries = ctx.queries.length
    ? ctx.queries.map(q => `- «${q.query}» — ${q.impressions} ${lang === 'ru' ? 'показов, позиция' : 'показів, позиція'} ${q.position}`).join('\n')
    : (lang === 'ru' ? '(данных Search Console по странице нет)' : '(даних Search Console по сторінці немає)');
  const prices = Object.values(ctx.skuPrices);
  const famPrices = ctx.products.map(p => p.price).filter((p): p is number => !!p);
  const range = famPrices.length ? `${Math.min(...famPrices)}–${Math.max(...famPrices)} грн` : '—';

  const rulesUk = `ПРАВИЛА (стандарт контенту FIXLINE, розділ 1):
1. description — 1–2 речення, НЕ БІЛЬШЕ 160 символів: що це і для кого; містить «купити» або назву типу товару так, як її шукають.
2. seoText — один абзац 60–100 слів: типи, коли який; ОБОВ'ЯЗКОВО речення з переліком брендів, що реально в наявності, зі словом FIXLINE: «У каталозі FIXLINE — Lotus, Polifarb, …».
3. guide — гайд «Як вибрати», 350–600 слів, title і 5–6 розділів (h + 1–3 абзаци в p):
   1) Коли потрібен саме цей матеріал (і коли — сусідній, з посиланням).
   2) Типи в каталозі й чим відрізняються — за брендами й серіями, які реально є нижче.
   3) Скільки купити — витрата з характеристик + приклад на типовий об'єкт (кімната 18 м², санвузол 4 м², фундамент 10×10).
   4) Як наносити / застосовувати — температура, підготовка основи, інтервали.
   5) Типові помилки — 3–4 конкретні.
   6) «Де купити і скільки коштує» — ОБОВ'ЯЗКОВИЙ, останній: бренди, ціни ТОКЕНАМИ, ціна на м²/метр/пачку, «купити можна від 1 одиниці, доставка Новою Поштою та ROZETKA по Україні», посилання [оптові ціни](/opt).
4. faq — щонайменше 7 питань: з реальних запитів нижче («10 літрів — на скільки квадратів», «чи підходить під плитку»); ОДНЕ обов'язково про ціну («Скільки коштує …?») з цифрами-токенами. Відповідь 2–4 речення з конкретикою, не «залежить від умов».
5. related — 4–6 чипів «Дивіться також»: сусідні/дочірні категорії та статті з переліку нижче; href — лише зі списку, label — коротка назва.
6. blogSlug — slug профільної статті з переліку або "".

ЦІНИ — ТІЛЬКИ ТОКЕНАМИ, ніколи цифрами (вони застарівають за добу):
- {price:SKU} — ціна товару (SKU з переліку нижче): «Lotus 1 л — {price:1204-007}» → «72 грн»
- {price:SKU / K} — ціна, поділена на константу K, яку ти сам назвав у тому ж реченні: «з 1 л виходить 5 л, тобто {price:1204-007 / 5} за літр розчину»; «банка 10 л закриває 33 м² у два шари, тобто {price:2108-010 / 33} за м²»
- {range:SKU1,SKU2} — мін–макс серед перелічених артикулів; {range} — по всій категорії; {min} / {max} / {count} — по всій категорії
Слово «грн» токен додає сам — не пиши «{price:…} грн». Артикули бери ТІЛЬКИ з переліку. Товари «немає в наявності» в ціни не став.

ПОСИЛАННЯ в прозі — [текст](/шлях), 3–6 на гайд, шляхи ТІЛЬКИ з дозволених нижче. Вигадувати шляхи не можна.

МОВА: до покупця, конкретно, без «якісний/надійний/широкий асортимент». Факти — з переліку товарів (бренди, фасування, витрата). Галузеві норми (час сушіння, температура, витрата, якщо в характеристиках її немає) — типові для класу матеріалу, без вигаданих точних цифр. Без markdown, крім посилань. Не згадуй конкурентів. Не пиши «у нашому магазині» — пиши «у FIXLINE».`;

  const rulesRu = `ПРАВИЛА (стандарт контента FIXLINE, раздел 1) — пиши ПО-РУССКИ, самостоятельный текст (не перевод), названия брендов латиницей как в каталоге:
1. description — 1–2 предложения, НЕ БОЛЬШЕ 160 символов: что это и для кого; содержит «купить» или название типа товара так, как его ищут по-русски.
2. seoText — один абзац 60–100 слов: типы, когда какой; ОБЯЗАТЕЛЬНО предложение с перечнем брендов, которые реально в наличии, со словом FIXLINE: «В каталоге FIXLINE — Lotus, Polifarb, …».
3. guide — гид «Как выбрать», 350–600 слов, title и 5–6 разделов (h + 1–3 абзаца в p):
   1) Когда нужен именно этот материал (и когда — соседний, со ссылкой).
   2) Типы в каталоге и чем отличаются — по брендам и сериям, которые реально есть ниже.
   3) Сколько купить — расход из характеристик + пример на типовой объект (комната 18 м², санузел 4 м², фундамент 10×10).
   4) Как наносить / применять — температура, подготовка основания, интервалы.
   5) Типичные ошибки — 3–4 конкретные.
   6) «Где купить и сколько стоит» — ОБЯЗАТЕЛЬНЫЙ, последний: бренды, цены ТОКЕНАМИ, цена за м²/метр/пачку, «купить можно от 1 единицы, доставка Новой Почтой и ROZETKA по Украине», ссылка [оптовые цены](/opt).
4. faq — не менее 7 вопросов: из реальных запросов ниже; ОДИН обязательно о цене («Сколько стоит …?») с цифрами-токенами. Ответ 2–4 предложения с конкретикой.
5. related — 4–6 чипов «Смотрите также»: соседние/дочерние категории и статьи из перечня ниже; href — только из списка, label — короткое русское название.
6. blogSlug — slug профильной статьи из перечня или "".

ЦЕНЫ — ТОЛЬКО ТОКЕНАМИ, никогда цифрами (они устаревают за сутки):
- {price:SKU} — цена товара (SKU из перечня ниже): «Lotus 1 л — {price:1204-007}» → «72 грн»
- {price:SKU / K} — цена, делённая на константу K, которую ты сам назвал в том же предложении: «из 1 л выходит 5 л, то есть {price:1204-007 / 5} за литр раствора»
- {range:SKU1,SKU2} — мин–макс среди перечисленных артикулов; {range} — по всей категории; {min} / {max} / {count} — по всей категории
Слово «грн» токен добавляет сам — не пиши «{price:…} грн». Артикулы бери ТОЛЬКО из перечня. Товары «нет в наличии» в цены не ставь.

ССЫЛКИ в прозе — [текст](/путь), 3–6 на гид, пути ТОЛЬКО из разрешённых ниже (без префикса /ru — он добавляется сам). Выдумывать пути нельзя.

ЯЗЫК: к покупателю, конкретно, без «качественный/надёжный/широкий ассортимент». Факты — из перечня товаров. Отраслевые нормы — типовые для класса материала, без выдуманных точных цифр. Без markdown, кроме ссылок. Не упоминай конкурентов. Пиши «в FIXLINE», не «в нашем магазине».`;

  const head = lang === 'ru'
    ? `Ты SEO-копирайтер украинского интернет-магазина строительной химии FIXLINE (fixline.com.ua). Напиши полный контент страницы категории «${name}» (/shop/${c.slug}) по стандарту ниже.`
    : `Ти SEO-копірайтер українського інтернет-магазину будівельної хімії FIXLINE (fixline.com.ua). Напиши повний контент сторінки категорії «${name}» (/shop/${c.slug}) за стандартом нижче.`;

  const basis = lang === 'ru' && opts.basisUk
    ? `\n\nУКРАИНСКАЯ ВЕРСИЯ (источник фактов и структуры — НЕ переводи дословно, напиши свой русский текст того же объёма, с теми же токенами цен):\n${JSON.stringify(opts.basisUk, null, 1).slice(0, 12000)}`
    : '';
  const current = opts.current && !(lang === 'ru' && opts.basisUk)
    ? `\n\n${lang === 'ru' ? 'ТЕКУЩИЙ ТЕКСТ (можно опираться, но переписать по стандарту)' : 'ПОТОЧНИЙ ТЕКСТ (можна спиратися, але переписати за стандартом)'}:\n${JSON.stringify(opts.current, null, 1).slice(0, 8000)}`
    : '';
  const hint = opts.hint?.trim() ? `\n\n${lang === 'ru' ? 'ПОЖЕЛАНИЕ ВЛАДЕЛЬЦА' : 'ПОБАЖАННЯ ВЛАСНИКА'}: ${opts.hint.trim()}` : '';

  return `${head}

${lang === 'ru' ? rulesRu : rulesUk}

КАТЕГОРІЯ: ${name} (/shop/${c.slug}), ${lang === 'ru' ? 'товаров' : 'товарів'}: ${ctx.products.length}, ${lang === 'ru' ? 'диапазон цен' : 'діапазон цін'}: ${range}
${nav}

ТОВАРИ (SKU | назва | фасування | ціна | наявність | витрата):
${productLines(ctx, lang)}

${lang === 'ru' ? 'ЗАПРОСЫ SEARCH CONSOLE по этой странице за 90 дней' : 'ЗАПИТИ SEARCH CONSOLE по цій сторінці за 90 днів'}:
${queries}

${lang === 'ru' ? 'СТАТЬИ БЛОГА по теме' : 'СТАТТІ БЛОГУ по темі'}:
${posts}

${lang === 'ru' ? 'РАЗРЕШЁННЫЕ ПУТИ для ссылок' : 'ДОЗВОЛЕНІ ШЛЯХИ для посилань'}: /opt, /calculators, /shop/<slug> ${lang === 'ru' ? 'любой категории из навигации выше и' : 'будь-якої категорії з навігації вище та'} /blog/<slug> ${lang === 'ru' ? 'из статей выше' : 'зі статей вище'}.${basis}${current}${hint}

${lang === 'ru' ? 'Всего активных артикулов с ценой в каталоге' : 'Усього активних артикулів із ціною в каталозі'}: ${prices.length}.`;
}

export type GenResult = { content: CategoryContentInput; warnings: string[] };

/** Перевіряє машинно-перевірюване і чистить related від невідомих шляхів. */
export function validateContent(content: CategoryContentInput, ctx: GenContext, lang: 'uk' | 'ru'): string[] {
  const w: string[] = [];
  const meta: CategoryMeta = { description: content.description, seoText: content.seoText ?? undefined, faq: content.faq, guide: content.guide ?? undefined, related: content.related };
  if (content.description.length > 160) w.push(`description ${content.description.length} симв. (≤160) — meta description обріжеться`);
  if (!/FIXLINE/.test(content.seoText ?? '')) w.push('у seoText немає речення «У каталозі FIXLINE — …» — аудит не побачить переліку асортименту');
  const dead = tokenSkus(meta).filter(s => !ctx.skuPrices[s]);
  if (dead.length) w.push(`токени на невідомі/безцінні артикули (речення з ними випадуть): ${dead.join(', ')}`);
  if (/\{price:[^}]*\}\s*грн/.test(JSON.stringify(meta))) w.push('«{price:…} грн» — токен сам додає «грн», буде «72 грн грн»');
  const text = JSON.stringify(meta);
  const links = [...text.matchAll(/\]\(([^)\s]+)\)/g)].map(m => m[1]);
  const badLinks = [...new Set(links.filter(l => !ctx.allowedLinks.has(l.replace(/^\/ru(?=\/)/, ''))))];
  if (badLinks.length) w.push(`посилання на неіснуючі шляхи: ${badLinks.join(', ')}`);
  const guide = content.guide;
  if (guide) {
    const words = [guide.title, ...guide.sections.flatMap(s => [s.h, ...s.p])].join(' ').split(/\s+/).filter(Boolean).length;
    if (words < 300) w.push(`гайд ${words} слів (норма 350–600)`);
    if (words > 800) w.push(`гайд ${words} слів (норма 350–600) — довгий`);
    if (!/купит|ціна|цін[аи]|коштує|цена|стоит/iu.test(JSON.stringify(guide))) w.push('у гайді немає розділу «Де купити» (слів купити/ціна)');
    // Склад розділів: «Типові помилки» є в кожному еталонному гайді (стандарт 1.4);
    // кількісні перевірки вище цього не ловлять — гайд герметиків 04.09 пройшов без нього
    if (!guide.sections.some(sec => /помилк|ошибк/iu.test(sec.h))) w.push('у гайді немає розділу «Типові помилки»');
  } else w.push('гайда немає');
  // Мова: філер/генератор інколи зривається в російську на профлексиці («серпянка»,
  // «стеклотканевая» — інцидент 04.09.2026). Літери ы/э/ъ/ё в українському тексті не
  // трапляються ні в словах, ні в брендах — надійна ознака зриву.
  if (lang === 'uk' && /[ыэъё]/i.test(JSON.stringify(meta))) w.push('російські літери (ы/э/ъ/ё) в українському тексті — мова зіскочила');
  if (lang === 'ru' && /[їєґ]/i.test(JSON.stringify(meta))) w.push('українські літери (ї/є/ґ) у російському тексті — мова зіскочила');
  if ((content.faq?.length ?? 0) < 7) w.push(`FAQ ${content.faq?.length ?? 0} питань (норма ≥ 7 з гайдом)`);
  if (!content.faq?.some(f => /кошту|ціна|цін[аи]|стоит|цена/iu.test(f.q))) w.push('у FAQ немає питання про ціну');
  if ((content.related?.length ?? 0) < 4) w.push(`«Дивіться також» ${content.related?.length ?? 0} чипів (норма 4–6)`);
  if (content.blogSlug && !ctx.allowedLinks.has(`/blog/${content.blogSlug}`)) w.push(`blogSlug ${content.blogSlug} — такої статті немає`);
  void lang;
  return w;
}

export async function generateCategoryContent(
  ctx: GenContext,
  lang: 'uk' | 'ru',
  opts: { current?: CategoryMeta | null; basisUk?: CategoryMeta | null; hint?: string; cost?: CostSink } = {},
): Promise<GenResult> {
  const msg = await anthropic.messages.create(
    {
      model: MODEL,
      max_tokens: 12000,
      output_config: { format: { type: 'json_schema', schema: SCHEMA } },
      messages: [{ role: 'user', content: buildPrompt(ctx, lang, opts) }],
    },
    { timeout: TIMEOUT_MS },
  );
  opts.cost?.add(msg.model, msg.usage);
  if (msg.stop_reason !== 'end_turn') throw new Error(`stop_reason=${msg.stop_reason}`);
  const block = msg.content.find(b => b.type === 'text');
  if (!block || block.type !== 'text') throw new Error('порожня відповідь моделі');
  const raw = JSON.parse(block.text) as CategoryContentInput & { blogSlug: string };

  // related: невідомі шляхи прибираємо (аудит і так їх не пропустить), решту лишаємо
  const related = (raw.related ?? []).map(r => ({ href: r.href.replace(/^\/ru(?=\/)/, ''), label: r.label })).filter(r => ctx.allowedLinks.has(r.href));
  const content: CategoryContentInput = {
    description: raw.description.trim(),
    seoText: raw.seoText?.trim() || null,
    faq: (raw.faq ?? []).map(f => ({ q: f.q.trim(), a: f.a.trim() })),
    guide: raw.guide ? { title: raw.guide.title.trim(), sections: raw.guide.sections.map(s => ({ h: s.h.trim(), p: s.p.map(x => x.trim()).filter(Boolean) })).filter(s => s.p.length) } : null,
    related,
    blogSlug: raw.blogSlug?.trim() || null,
  };
  const warnings = validateContent(content, ctx, lang);
  if ((raw.related?.length ?? 0) > related.length) warnings.push(`прибрано ${(raw.related?.length ?? 0) - related.length} чипів «Дивіться також» із неіснуючими шляхами`);
  return { content, warnings };
}
