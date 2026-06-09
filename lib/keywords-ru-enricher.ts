import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@supabase/supabase-js';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

function db() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

export type KeywordsEvent =
  | { type: 'start'; total: number }
  | { type: 'progress'; sku: string; name: string; done: number; total: number }
  | { type: 'result'; sku: string; keywords_ru: string }
  | { type: 'error'; sku: string; error: string }
  | { type: 'done'; done: number; errors: number };

// Bad keywords = auto-generated "купить X, X оптом, X цена, X Украина" pattern
const BAD_PATTERN = `keywords_ru.ilike.%Украина%,keywords_ru.ilike.%оптом%`;

export async function* enrichKeywordsRu(opts: {
  limit?: number;
  category?: string;
  sku?: string;
  force?: boolean; // rewrite even non-bad keywords
}): AsyncGenerator<KeywordsEvent> {
  const supabase = db();

  let query = supabase
    .from('products')
    .select('sku, name, brand, category_slug, description, keywords, keywords_ru')
    .eq('is_active', true)
    .order('category_slug', { nullsFirst: false })
    .order('sku');

  if (!opts.force) {
    // Only bad auto-generated ones: contain "Украина" AND "оптом" in keywords_ru
    query = query
      .ilike('keywords_ru', '%Украина%')
      .ilike('keywords_ru', '%оптом%');
  }

  if (opts.sku)      query = query.eq('sku', opts.sku);
  if (opts.category) query = query.eq('category_slug', opts.category);
  if (opts.limit)    query = query.limit(opts.limit);

  const { data: products, error } = await query;
  if (error) throw error;
  if (!products?.length) { yield { type: 'start', total: 0 }; yield { type: 'done', done: 0, errors: 0 }; return; }

  yield { type: 'start', total: products.length };

  let done = 0;
  let errors = 0;

  for (const product of products) {
    yield { type: 'progress', sku: product.sku, name: product.name, done, total: products.length };

    try {
      const message = await anthropic.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 200,
        messages: [{
          role: 'user',
          content: buildPrompt(product),
        }],
      });

      const raw = (message.content[0] as { type: string; text: string }).text.trim();

      // Strip any header lines AI sometimes adds before the actual keywords
      const stripped = raw
        .replace(/^[^\n]*(?:ключевые слова|keywords|поисковые запросы)[^\n]*\n+/gi, '')
        .replace(/^Вот [^\n]+\n+/gi, '')
        .replace(/^#[^\n]+\n+/gm, '')
        .trim();

      // Sanitize: remove quotes, normalize commas, strip commercial terms, deduplicate
      const COMMERCIAL = /купить|купіт|цена|цену|цін|оптом|украина/i;
      const keywords_ru = stripped
        .replace(/^["']|["']$/g, '')
        .split(',')
        .map(k => k.trim().replace(/^[-•*#]\s*/, ''))
        .filter(k => k.length > 1 && !COMMERCIAL.test(k) && !/ключевые слова|поисковые/i.test(k))
        .filter((k, i, arr) => arr.findIndex(x => x.toLowerCase() === k.toLowerCase()) === i)
        .slice(0, 10)
        .join(', ');

      await supabase
        .from('products')
        .update({ keywords_ru })
        .eq('sku', product.sku);

      yield { type: 'result', sku: product.sku, keywords_ru };
      done++;
    } catch (err) {
      errors++;
      yield { type: 'error', sku: product.sku, error: String(err) };
    }
  }

  yield { type: 'done', done, errors };
}

function buildPrompt(product: {
  name: string;
  brand: string;
  description?: string | null;
  keywords?: string | null;
  keywords_ru?: string | null;
}): string {
  return `Ты SEO-специалист для украинского интернет-магазина строительной химии FIXLINE.
Сгенерируй 8–10 поисковых ключевых слов на РУССКОМ языке для товара.

Требования:
- Слова и фразы, по которым покупатели ищут товар на Prom.ua
- Разнообразные: типы использования, свойства, синонимы названия
- НЕ повторяй название товара целиком как ключевое слово
- НЕ добавляй "оптом", "цена", "Украина", "купить" — только поисковые запросы
- Формат: просто слова/фразы через запятую, без нумерации и без кавычек
- Язык: только русский (не украинский, не транслитерация)

Товар:
Название: ${product.name}
Бренд: ${product.brand}
${product.description ? `Описание: ${product.description}` : ''}
${product.keywords ? `Украинские ключевые слова (для понимания тематики): ${product.keywords}` : ''}

Ключевые слова на русском:`;
}
