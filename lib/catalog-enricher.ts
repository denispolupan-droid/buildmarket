import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@supabase/supabase-js';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

function db() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

export type EnrichEvent =
  | { type: 'start'; total: number }
  | { type: 'progress'; sku: string; name: string; done: number; total: number }
  | { type: 'result'; sku: string; description_full: string }
  | { type: 'error'; sku: string; error: string }
  | { type: 'done'; done: number; errors: number };

export async function* enrichCatalog(opts: {
  limit?: number;
  category?: string;
  sku?: string;
}): AsyncGenerator<EnrichEvent> {
  const supabase = db();

  let query = supabase
    .from('products')
    .select('sku, name, brand, category_slug, description, keywords')
    .or('description_full.is.null,description_full.eq.')
    .eq('is_active', true)
    .order('sort_order');

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
      const [{ data: chars }, { data: examples }] = await Promise.all([
        supabase
          .from('product_characteristics')
          .select('label, value')
          .eq('product_sku', product.sku),
        supabase
          .from('products')
          .select('name, description, description_full')
          .eq('category_slug', product.category_slug)
          .not('description_full', 'is', null)
          .neq('description_full', '')
          .neq('sku', product.sku)
          .limit(2),
      ]);

      const charsText = (chars ?? []).map(c => `${c.label}: ${c.value}`).join('\n');

      const examplesText = (examples ?? [])
        .map(e => `Назва: ${e.name}\nКороткий опис: ${e.description}\nПовний опис: ${e.description_full}`)
        .join('\n\n---\n\n');

      const message = await anthropic.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 600,
        messages: [{
          role: 'user',
          content: buildPrompt(product, charsText, examplesText),
        }],
      });

      const description_full = (message.content[0] as { type: string; text: string }).text.trim();

      await supabase
        .from('products')
        .update({ description_full })
        .eq('sku', product.sku);

      yield { type: 'result', sku: product.sku, description_full };
      done++;
    } catch (err) {
      errors++;
      yield { type: 'error', sku: product.sku, error: String(err) };
    }
  }

  yield { type: 'done', done, errors };
}

function buildPrompt(
  product: { name: string; brand: string; description: string | null; keywords: string | null },
  characteristics: string,
  examples: string,
): string {
  return `Ти копірайтер для українського інтернет-магазину будівельної хімії FIXLINE.
Напиши детальний опис товару (description_full) українською мовою.

Вимоги:
- 3–4 речення, 80–150 слів
- Починай з назви бренду та ключової властивості товару
- Включай технічні характеристики, сферу застосування, переваги
- SEO-дружній, природній текст без перерахування через кому
- Без заголовків, markdown і вступних фраз — одразу текст
- Мова: українська (не суржик)

Товар:
Назва: ${product.name}
Бренд: ${product.brand}
Короткий опис: ${product.description ?? ''}
${product.keywords ? `Ключові слова: ${product.keywords}` : ''}
${characteristics ? `\nХарактеристики:\n${characteristics}` : ''}
${examples ? `\nПриклади описів з цієї ж категорії:\n\n${examples}\n` : ''}
Повний опис:`;
}
