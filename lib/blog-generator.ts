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

// Дозволені теги в тілі статті — усе інше вирізається (контент іде в dangerouslySetInnerHTML)
const ALLOWED_TAGS = new Set(['p', 'h2', 'h3', 'ul', 'ol', 'li', 'table', 'thead', 'tbody', 'tr', 'th', 'td', 'strong', 'em', 'a', 'br']);

export function sanitizeArticleHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<\/?([a-zA-Z][a-zA-Z0-9]*)((?:\s+[a-zA-Z-]+(?:="[^"]*")?)*)\s*\/?>/g, (m, tag: string, attrs: string) => {
      const t = tag.toLowerCase();
      if (!ALLOWED_TAGS.has(t)) return '';
      // атрибути: тільки href на <a>, і тільки внутрішні посилання
      if (t === 'a') {
        const href = /href="([^"]*)"/.exec(attrs)?.[1] ?? '';
        if (m.startsWith('</')) return '</a>';
        return href.startsWith('/') ? `<a href="${href}">` : '<a>';
      }
      return m.startsWith('</') ? `</${t}>` : `<${t}>`;
    });
}

export async function generateBlogPost(topic: string): Promise<{ id: number; slug: string; title: string }> {
  const supabase = db();

  const { data: categories } = await supabase.from('categories').select('slug, name').order('sort_order');
  const catList = (categories ?? []).map(c => `${c.slug} — ${c.name}`).join('\n');

  // Стрімінг обов'язковий: велика відповідь (дві мови ~10-15 тис. токенів)
  const stream = anthropic.messages.stream({
    model: 'claude-opus-4-8',
    max_tokens: 32000,
    output_config: { format: { type: 'json_schema', schema: OUTPUT_SCHEMA } },
    messages: [{
      role: 'user',
      content: `Ти — редактор блогу українського інтернет-магазину будівельної хімії FIXLINE (fixline.com.ua, доставка Новою Поштою по всій Україні). Пиши практичні статті для домашніх майстрів і будівельних бригад.

Напиши статтю на тему: "${topic}"

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
