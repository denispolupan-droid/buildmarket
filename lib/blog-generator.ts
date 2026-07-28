import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@supabase/supabase-js';
import { slugify } from './seo/slug';

// Генерація статей блогу (SEO: інформаційні запити, довгий хвіст).
// Запускається ТІЛЬКИ вручну з /admin/blog — жодних фонових витрат API.
// Стаття створюється ЧЕРНЕТКОЮ (is_published=false) — публікує адмін після перегляду.

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

function db() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

const OUTPUT_SCHEMA = {
  type: 'object' as const,
  properties: {
    title: { type: 'string' as const, description: 'Заголовок статті українською, до 70 символів, під пошуковий запит' },
    title_ru: { type: 'string' as const, description: 'Заголовок російською' },
    description: { type: 'string' as const, description: 'Опис 140–160 символів українською (meta description)' },
    description_ru: { type: 'string' as const, description: 'Опис російською' },
    keywords: { type: 'array' as const, items: { type: 'string' as const }, description: '8–12 ключових фраз обома мовами' },
    read_time: { type: 'integer' as const, description: 'Хвилин читання (5–8)' },
    content_html: {
      type: 'string' as const,
      description: 'Тіло статті українською: 900–1300 слів, ТІЛЬКИ теги <p><h2><h3><ul><ol><li><table><thead><tbody><tr><th><td><strong><a>. Без <h1>, без <html>/<body>, без стилів і класів.',
    },
    content_html_ru: { type: 'string' as const, description: 'Те саме російською (повний переклад, не скорочення)' },
    faq: {
      type: 'array' as const,
      items: {
        type: 'object' as const,
        properties: { q: { type: 'string' as const }, a: { type: 'string' as const } },
        required: ['q', 'a'],
        additionalProperties: false,
      },
      description: '3–4 питання-відповіді українською під реальні пошукові запити',
    },
    faq_ru: {
      type: 'array' as const,
      items: {
        type: 'object' as const,
        properties: { q: { type: 'string' as const }, a: { type: 'string' as const } },
        required: ['q', 'a'],
        additionalProperties: false,
      },
    },
    related_category_slugs: {
      type: 'array' as const,
      items: { type: 'string' as const },
      description: '2–4 слаги категорій магазину, найрелевантніші темі (тільки зі списку наданих)',
    },
  },
  required: ['title', 'title_ru', 'description', 'description_ru', 'keywords', 'read_time', 'content_html', 'content_html_ru', 'faq', 'faq_ru', 'related_category_slugs'],
  additionalProperties: false,
};

// Санітайзер тіла статті винесено в lib/sanitize-article (щоб blog-db міг
// чистити на рендері без імпорту важкого Anthropic SDK). Реекспорт — для
// зворотної сумісності з наявними імпортами.
import { sanitizeArticleHtml } from './sanitize-article';
export { sanitizeArticleHtml };

/* ── Дожим ІСНУЮЧОЇ статті під запит ──────────────────────────────────────────
   Найчастіший реальний кейс: стаття вже ранжується за запитом (позиція 8–30), але
   тонка, не містить самої фрази запиту (особливо в рос. версії) і не веде на товари.
   Створювати другу статтю на той самий запит нельзя — це канібалізація, обидві
   просядуть. Тому розширюємо наявну: фраза запиту в H2 + першому абзаці ОБОХ мов,
   блок посилань на товари, одне FAQ — пряма відповідь на запит. Слаг і статус
   публікації не змінюються, тож накопичені сигнали URL зберігаються. */

const BOOST_SCHEMA = {
  type: 'object' as const,
  properties: {
    title:           { type: 'string' as const, description: 'Заголовок УКР, до 70 симв. Змінюй лише якщо це помітно підсилює запит; інакше поверни наявний' },
    title_ru:        { type: 'string' as const, description: 'Заголовок РОС' },
    description:     { type: 'string' as const, description: 'Meta description УКР, 140–160 симв., містить запит або близьке формулювання' },
    description_ru:  { type: 'string' as const, description: 'Meta description РОС — ОБОВ\'ЯЗКОВО містить сам запит, якщо запит російською' },
    content_html:    { type: 'string' as const, description: 'ПОВНЕ тіло статті УКР після розширення: 1200–1800 слів. Теги: p,h2,h3,ul,ol,li,table,thead,tbody,tr,th,td,strong,em,a. Без h1/класів/стилів' },
    content_html_ru: { type: 'string' as const, description: 'Те саме РОС — повний переклад, не скорочення' },
    faq: {
      type: 'array' as const,
      items: {
        type: 'object' as const,
        properties: { q: { type: 'string' as const }, a: { type: 'string' as const } },
        required: ['q', 'a'], additionalProperties: false,
      },
      description: '4–5 пар УКР; ПЕРШЕ питання — пряма відповідь на цільовий запит',
    },
    faq_ru: {
      type: 'array' as const,
      items: {
        type: 'object' as const,
        properties: { q: { type: 'string' as const }, a: { type: 'string' as const } },
        required: ['q', 'a'], additionalProperties: false,
      },
    },
  },
  required: ['title', 'title_ru', 'description', 'description_ru', 'content_html', 'content_html_ru', 'faq', 'faq_ru'],
  additionalProperties: false,
};

export type BoostProduct = {
  sku: string; slug: string | null; name: string; name_ru: string | null;
  brand: string; volume: string | null; price: number | null;
};

export async function boostBlogPost(
  postId: number,
  opts: { focusQuery: string; skus?: string[] },
): Promise<{
  slug: string; title: string;
  lenBefore: number; lenAfter: number;
  lenRuBefore: number; lenRuAfter: number;
  faqCount: number; linkedSkus: string[]; appendedBlock: boolean;
}> {
  const supabase = db();

  const { data: post, error: readErr } = await supabase
    .from('blog_posts')
    .select('id, slug, title, title_ru, description, description_ru, content_html, content_html_ru, faq, faq_ru')
    .eq('id', postId)
    .single();
  if (readErr || !post) throw new Error(readErr?.message ?? 'Статтю не знайдено');

  // Товари для блоку «чим саме це робити» — без них дожим дає трафік, але не продажі
  let products: BoostProduct[] = [];
  if (opts.skus?.length) {
    const { data } = await supabase
      .from('products')
      .select('sku, slug, name, name_ru, brand, volume, product_stock(price_retail)')
      .in('sku', opts.skus)
      .eq('is_active', true);
    products = (data ?? []).map(p => {
      const stock = p.product_stock as { price_retail: number | null } | { price_retail: number | null }[] | null;
      const row = Array.isArray(stock) ? stock[0] : stock;
      return {
        sku: p.sku, slug: p.slug, name: p.name, name_ru: p.name_ru,
        brand: p.brand, volume: p.volume, price: row?.price_retail ?? null,
      };
    });
  }

  const productBlock = products.length
    ? `\nТОВАРИ, на які стаття ОБОВ'ЯЗКОВО має вести (додай окремий розділ <h2> з рекомендацією, яку фасовку брати під який обсяг робіт, і встав ці посилання ТОЧНО як указано):\n`
      + products.map(p => `- <a href="/product/${p.slug ?? p.sku}">${p.brand} ${p.name}</a>${p.volume ? ` (${p.volume}` : ''}${p.price ? `, ${p.price} грн)` : p.volume ? ')' : ''}`).join('\n')
    : '';

  const stream = anthropic.messages.stream({
    model: 'claude-opus-4-8',
    max_tokens: 32000,
    output_config: { format: { type: 'json_schema', schema: BOOST_SCHEMA } },
    messages: [{
      role: 'user',
      content: `Ти — редактор блогу українського інтернет-магазину будівельної хімії FIXLINE (fixline.com.ua).

Є ОПУБЛІКОВАНА стаття, яка вже ранжується в Google за запитом "${opts.focusQuery}", але сидить у другому десятку: текст тонкий, самої фрази запиту в ньому немає, і вона не веде читача на товари. Твоє завдання — РОЗШИРИТИ й ДОТЯГНУТИ її під цей запит, не ламаючи те, що вже є.

Правила дожиму:
- фраза "${opts.focusQuery}" (або максимально близьке природне формулювання) має бути в одному з <h2> і в першому абзаці — В ОБОХ мовах. Якщо запит російською, у російській версії має стояти саме він, дослівно;
- збережи всі корисні факти й структуру наявного тексту, додай нові розділи, а не переписуй з нуля;
- обсяг: 1200–1800 слів (зараз ~${post.content_html.split(/\s+/).length});
- додай практичну конкретику: послідовність робіт, витрати на погонний метр/м², температурні межі, час висихання, типові помилки, порівняльна таблиця, якщо доречно;
- ПЕРШЕ FAQ-питання — пряма відповідь на "${opts.focusQuery}";
- HTML лише з тегів: p, h2, h3, ul, ol, li, table, thead, tbody, tr, th, td, strong, em, a. Без h1, класів і стилів;
- не вигадуй характеристик конкретних брендів, яких не знаєш.
${productBlock}

НАЯВНИЙ ЗАГОЛОВОК: ${post.title}
НАЯВНИЙ ЗАГОЛОВОК РОС: ${post.title_ru ?? '—'}
НАЯВНИЙ ОПИС: ${post.description ?? '—'}

НАЯВНЕ ТІЛО (укр):
${post.content_html}

НАЯВНЕ ТІЛО (рос):
${post.content_html_ru ?? '—'}`,
    }],
  });

  const message = await stream.finalMessage();
  if (message.stop_reason !== 'end_turn') throw new Error(`stop_reason=${message.stop_reason}`);
  const block = message.content.find(b => b.type === 'text');
  if (!block || block.type !== 'text') throw new Error('no text block');
  const parsed = JSON.parse(block.text) as {
    title: string; title_ru: string; description: string; description_ru: string;
    content_html: string; content_html_ru: string;
    faq: { q: string; a: string }[]; faq_ru: { q: string; a: string }[];
  };

  let ua = sanitizeArticleHtml(parsed.content_html);
  let ru = sanitizeArticleHtml(parsed.content_html_ru);

  // Модель може «загубити» частину посилань — перевіряємо і дописуємо блок самі.
  // Посилання на товар — головна причина дожиму, покладатись тут на удачу не можна.
  const href = (p: BoostProduct) => `/product/${p.slug ?? p.sku}`;
  const missingUa = products.filter(p => !ua.includes(href(p)));
  const missingRu = products.filter(p => !ru.includes(href(p)));
  const appendedBlock = missingUa.length > 0 || missingRu.length > 0;
  const listBlock = (items: BoostProduct[], lang: 'ua' | 'ru') => {
    const head = lang === 'ua' ? 'Чим це зробити' : 'Чем это сделать';
    const li = items.map(p => {
      const label = lang === 'ru' ? (p.name_ru ?? p.name) : p.name;
      const tail = [p.volume, p.price ? `${p.price} грн` : null].filter(Boolean).join(', ');
      return `<li><a href="${href(p)}">${p.brand} ${label}</a>${tail ? ` — ${tail}` : ''}</li>`;
    }).join('');
    return `<h2>${head}</h2><ul>${li}</ul>`;
  };
  if (missingUa.length) ua += listBlock(missingUa, 'ua');
  if (missingRu.length) ru += listBlock(missingRu, 'ru');

  const { error: updErr } = await supabase
    .from('blog_posts')
    .update({
      title:           parsed.title.trim() || post.title,
      title_ru:        parsed.title_ru.trim() || post.title_ru,
      description:     parsed.description.trim() || post.description,
      description_ru:  parsed.description_ru.trim() || post.description_ru,
      content_html:    ua,
      content_html_ru: ru,
      faq:             parsed.faq,
      faq_ru:          parsed.faq_ru,
      updated_at:      new Date().toISOString(),
    })
    .eq('id', postId);
  if (updErr) throw updErr;

  return {
    slug: post.slug,
    title: parsed.title.trim() || post.title,
    lenBefore: post.content_html.length,
    lenAfter: ua.length,
    lenRuBefore: (post.content_html_ru ?? '').length,
    lenRuAfter: ru.length,
    faqCount: parsed.faq.length,
    linkedSkus: products.map(p => p.sku),
    appendedBlock,
  };
}

export async function generateBlogPost(
  topic: string,
  opts?: {
    /** "Дожим": пошуковий запит, під який оптимізується стаття */
    focusQuery?: string;
    /** Обов'язкове внутрішнє посилання (напр., на товар, що дожимається) */
    mustLink?: { href: string; label: string };
  },
): Promise<{ id: number; slug: string; title: string }> {
  const supabase = db();

  const { data: categories } = await supabase.from('categories').select('slug, name').order('sort_order');
  const catList = (categories ?? []).map(c => `${c.slug} — ${c.name}`).join('\n');

  const boostBlock = opts?.focusQuery
    ? `\nВАЖЛИВО (SEO): стаття має ранжуватися за запитом "${opts.focusQuery}" — використай його у заголовку (або близьке формулювання), у першому абзаці та в одному з FAQ-питань. Без переспаму.`
    : '';
  const linkBlock = opts?.mustLink
    ? `\nОбов'язково додай у текст природне посилання <a href="${opts.mustLink.href}">${opts.mustLink.label}</a> там, де це доречно за змістом.`
    : '';

  // Стрімінг обов'язковий: велика відповідь (дві мови ~10-15 тис. токенів)
  const stream = anthropic.messages.stream({
    model: 'claude-opus-4-8',
    max_tokens: 32000,
    output_config: { format: { type: 'json_schema', schema: OUTPUT_SCHEMA } },
    messages: [{
      role: 'user',
      content: `Ти — редактор блогу українського інтернет-магазину будівельної хімії FIXLINE (fixline.com.ua, доставка Новою Поштою по всій Україні). Пиши практичні статті для домашніх майстрів і будівельних бригад.

Напиши статтю на тему: "${topic}"
${boostBlock}${linkBlock}

Вимоги до статті:
- 900–1300 слів, структура: короткий вступ (проблема читача) → розділи <h2>/<h3> → порівняльна таблиця, якщо доречно → типові помилки → висновок з порадою;
- практичний тон без води: цифри, діапазони, конкретика (витрати, час висихання, температури — тільки загальновідомі значення, нічого не вигадуй про конкретні бренди);
- 2–4 внутрішні посилання <a href="/shop/{slug}"> на релевантні категорії магазину прямо в тексті (природно, без нав'язливості);
- HTML тільки з тегів: p, h2, h3, ul, ol, li, table, thead, tbody, tr, th, td, strong, a. Без h1, без класів і стилів;
- російська версія — повний переклад тієї ж статті (не скорочення), бренди й цифри без змін;
- FAQ — 3–4 пари під реальні запити ("скільки сохне...", "чим відрізняється...", "яку вибрати для...").

Категорії магазину (для посилань і related_category_slugs):
${catList}`,
    }],
  });

  const message = await stream.finalMessage();
  if (message.stop_reason !== 'end_turn') throw new Error(`stop_reason=${message.stop_reason}`);
  const block = message.content.find(b => b.type === 'text');
  if (!block || block.type !== 'text') throw new Error('no text block');
  const parsed = JSON.parse(block.text) as {
    title: string; title_ru: string; description: string; description_ru: string;
    keywords: string[]; read_time: number; content_html: string; content_html_ru: string;
    faq: { q: string; a: string }[]; faq_ru: { q: string; a: string }[];
    related_category_slugs: string[];
  };

  // Слаг з укр заголовка; унікальність — суфіксом
  let slug = slugify(parsed.title, 70);
  const { data: existing } = await supabase.from('blog_posts').select('slug').ilike('slug', `${slug}%`);
  if ((existing ?? []).some(r => r.slug === slug)) slug = `${slug}-${Date.now() % 10000}`;

  const catName = new Map((categories ?? []).map(c => [c.slug, c.name]));
  const relatedLinks = parsed.related_category_slugs
    .filter(s => catName.has(s))
    .slice(0, 4)
    .map(s => ({ label: catName.get(s)!, href: `/shop/${s}` }));

  const { data: inserted, error } = await supabase
    .from('blog_posts')
    .insert({
      slug,
      title: parsed.title,
      title_ru: parsed.title_ru,
      description: parsed.description,
      description_ru: parsed.description_ru,
      keywords: parsed.keywords,
      read_time: Math.min(Math.max(parsed.read_time, 3), 15),
      content_html: sanitizeArticleHtml(parsed.content_html),
      content_html_ru: sanitizeArticleHtml(parsed.content_html_ru),
      faq: parsed.faq,
      faq_ru: parsed.faq_ru,
      related_links: relatedLinks,
      is_published: false,
    })
    .select('id, slug, title')
    .single();
  if (error) throw error;
  return inserted as { id: number; slug: string; title: string };
}
