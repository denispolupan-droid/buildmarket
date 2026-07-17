import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@supabase/supabase-js';

// SEO-збагачення каталогу (Фаза 5 SEO_SPEC): description_full 250–400 слів + FAQ.
// Промпт погоджено на зразках (SEO_DESCRIPTION_SAMPLES.md, 2026-07-17).
// Запускається ТІЛЬКИ вручну з адмінки (/admin/seo) — жодних фонових витрат API.

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// description_full коротший за цей поріг вважається "тонким" контентом
export const THIN_DESCRIPTION_CHARS = 800;

function db() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

export type EnrichEvent =
  | { type: 'start'; total: number }
  | { type: 'progress'; sku: string; name: string; done: number; total: number }
  | { type: 'result'; sku: string; description_full: string; faqCount: number; ru: boolean }
  | { type: 'error'; sku: string; error: string }
  | { type: 'done'; done: number; errors: number };

const OUTPUT_SCHEMA = {
  type: 'object' as const,
  properties: {
    description_full: {
      type: 'string' as const,
      description: 'Повний опис товару українською, 250–400 слів, 4–5 абзаців, розділені порожнім рядком, без markdown і заголовків',
    },
    faq: {
      type: 'array' as const,
      items: {
        type: 'object' as const,
        properties: {
          q: { type: 'string' as const },
          a: { type: 'string' as const },
        },
        required: ['q', 'a'],
        additionalProperties: false,
      },
    },
  },
  required: ['description_full', 'faq'],
  additionalProperties: false,
};

const TRANSLATE_SCHEMA = {
  type: 'object' as const,
  properties: {
    description_full_ru: {
      type: 'string' as const,
      description: 'Перевод полного описания на русский, те же абзацы',
    },
    faq_ru: {
      type: 'array' as const,
      items: {
        type: 'object' as const,
        properties: {
          q: { type: 'string' as const },
          a: { type: 'string' as const },
        },
        required: ['q', 'a'],
        additionalProperties: false,
      },
    },
  },
  required: ['description_full_ru', 'faq_ru'],
  additionalProperties: false,
};

/** Переклад опису + FAQ на російську (для російськомовної аудиторії в Україні). */
export async function translateEnrichment(
  descriptionFull: string,
  faq: { q: string; a: string }[],
): Promise<{ description_full_ru: string; faq_ru: { q: string; a: string }[] }> {
  const message = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 8000,
    output_config: { format: { type: 'json_schema', schema: TRANSLATE_SCHEMA } },
    messages: [{
      role: 'user',
      content: `Переведи текст о товаре с украинского на русский (аудитория — русскоязычные покупатели в Украине).
Правила: названия брендов, артикулы и все числа оставляй без изменений; естественный русский язык без кальки; сохрани разбиение на абзацы (пустая строка между абзацами); FAQ переведи попарно, количество пар не меняй.

Полное описание:
${descriptionFull}

FAQ:
${faq.map((f, i) => `${i + 1}. Q: ${f.q}\n   A: ${f.a}`).join('\n')}`,
    }],
  });

  if (message.stop_reason !== 'end_turn') throw new Error(`translate stop_reason=${message.stop_reason}`);
  const block = message.content.find(b => b.type === 'text');
  if (!block || block.type !== 'text') throw new Error('translate: no text block');
  const parsed = JSON.parse(block.text) as { description_full_ru: string; faq_ru: { q: string; a: string }[] };
  if (parsed.faq_ru.length !== faq.length) throw new Error(`translate: faq count mismatch ${parsed.faq_ru.length} != ${faq.length}`);
  return parsed;
}

export async function* enrichCatalog(opts: {
  limit?: number;
  category?: string;
  sku?: string;
  skus?: string[];
  /** "Дожим": пошуковий запит, який треба природно інтегрувати в опис/FAQ/keywords */
  targetQuery?: string;
}): AsyncGenerator<EnrichEvent> {
  const supabase = db();

  let query = supabase
    .from('products')
    .select('sku, name, brand, category_slug, description, description_full, keywords')
    .eq('is_active', true)
    .order('sort_order');

  if (opts.sku)      query = query.eq('sku', opts.sku);
  if (opts.skus?.length) query = query.in('sku', opts.skus);
  if (opts.category) query = query.eq('category_slug', opts.category);

  const { data: allProducts, error } = await query;
  if (error) throw error;

  // Явний список SKU обробляємо як є; інакше — тільки товари з тонким описом
  let products = opts.sku || opts.skus?.length
    ? (allProducts ?? [])
    : (allProducts ?? []).filter(p => (p.description_full ?? '').length < THIN_DESCRIPTION_CHARS);
  if (opts.limit) products = products.slice(0, opts.limit);

  if (!products.length) { yield { type: 'start', total: 0 }; yield { type: 'done', done: 0, errors: 0 }; return; }

  const { data: categories } = await supabase.from('categories').select('slug, name');
  const catName = new Map((categories ?? []).map(c => [c.slug, c.name]));

  yield { type: 'start', total: products.length };

  let done = 0;
  let errors = 0;

  for (const product of products) {
    yield { type: 'progress', sku: product.sku, name: product.name, done, total: products.length };

    try {
      const { data: chars } = await supabase
        .from('product_characteristics')
        .select('label, value')
        .eq('product_sku', product.sku);

      const charsText = (chars ?? []).map(c => `${c.label}: ${c.value}`).join('\n');

      const message = await anthropic.messages.create({
        model: 'claude-opus-4-8',
        max_tokens: 8000,
        output_config: { format: { type: 'json_schema', schema: OUTPUT_SCHEMA } },
        messages: [{
          role: 'user',
          content: buildPrompt(product, charsText, catName.get(product.category_slug ?? '') ?? product.category_slug ?? '', opts.targetQuery),
        }],
      });

      if (message.stop_reason !== 'end_turn') throw new Error(`stop_reason=${message.stop_reason}`);
      const block = message.content.find(b => b.type === 'text');
      if (!block || block.type !== 'text') throw new Error('no text block in response');
      const parsed = JSON.parse(block.text) as { description_full: string; faq: { q: string; a: string }[] };
      const words = parsed.description_full.split(/\s+/).filter(Boolean).length;
      if (words < 150) throw new Error(`description too short: ${words} words`);

      // Російська версія — обов'язкова (велика російськомовна аудиторія в Україні).
      // Якщо переклад упав — зберігаємо укр і позначаємо, окремо доперекладається з /admin/seo.
      let ru: { description_full_ru: string; faq_ru: { q: string; a: string }[] } | null = null;
      try {
        ru = await translateEnrichment(parsed.description_full, parsed.faq);
      } catch { /* залишиться пробіл "рос. версія" в SEO-черзі */ }

      // Дожим: цільовий запит додаємо в keywords, якщо його там ще немає
      let keywordsUpdate: Record<string, string> = {};
      if (opts.targetQuery) {
        const q = opts.targetQuery.trim().toLowerCase();
        const existing = product.keywords ?? '';
        if (!existing.toLowerCase().includes(q)) {
          keywordsUpdate = { keywords: existing ? `${existing}, ${opts.targetQuery.trim()}` : opts.targetQuery.trim() };
        }
      }

      const { error: upErr } = await supabase
        .from('products')
        .update({
          description_full: parsed.description_full,
          ...(ru ? { description_full_ru: ru.description_full_ru } : {}),
          ...keywordsUpdate,
        })
        .eq('sku', product.sku);
      if (upErr) throw upErr;

      await replaceFaq(supabase, product.sku, parsed.faq, ru?.faq_ru);

      yield { type: 'result', sku: product.sku, description_full: parsed.description_full, faqCount: parsed.faq.length, ru: !!ru };
      done++;
    } catch (err) {
      errors++;
      yield { type: 'error', sku: product.sku, error: String(err) };
    }
  }

  yield { type: 'done', done, errors };
}

export async function replaceFaq(
  supabase: ReturnType<typeof db>,
  sku: string,
  faq: { q: string; a: string }[],
  faqRu?: { q: string; a: string }[],
): Promise<void> {
  const { error: delErr } = await supabase.from('product_faq').delete().eq('product_sku', sku);
  if (delErr) throw delErr;
  if (!faq.length) return;
  const { error: insErr } = await supabase.from('product_faq').insert(
    faq.map((f, i) => ({
      product_sku: sku,
      question: f.q,
      answer: f.a,
      question_ru: faqRu?.[i]?.q ?? null,
      answer_ru: faqRu?.[i]?.a ?? null,
      sort_order: i,
    })),
  );
  if (insErr) throw insErr;
}

function buildPrompt(
  product: { name: string; brand: string; description: string | null; keywords: string | null },
  characteristics: string,
  categoryName: string,
  targetQuery?: string,
): string {
  const boostBlock = targetQuery
    ? `\nВАЖЛИВО (SEO-дожим): сторінка має краще ранжуватися за запитом "${targetQuery}". Природно інтегруй цей запит (та його близькі формулювання) у текст опису та зроби одне з FAQ-питань прямою відповіддю на нього. Без переспаму — запит має виглядати органічно.\n`
    : '';
  return `Ти SEO-копірайтер українського інтернет-магазину будівельної хімії FIXLINE (fixline.com.ua, доставка Новою Поштою по всій Україні).
${boostBlock}
Напиши для товару:
1. Повний опис (description_full): 250–400 слів, 4–5 абзаців у такому порядку:
   - призначення товару та ключова властивість (почни з бренду й назви);
   - сфера застосування: конкретні поверхні, типи робіт, внутрішні/зовнішні;
   - технічні характеристики своїми словами (витрата, час висихання, температура, фасовка) — ТІЛЬКИ з наданих даних, нічого не вигадуй;
   - переваги перед аналогами (без назв конкурентів);
   - умови покупки: відправка Новою Поштою по Україні (Київ, Харків, Дніпро, Одеса, Львів та ін.), оплата при отриманні або передоплата.
2. FAQ: 3–4 пари питання-відповідь під реальні пошукові запити (витрата на м², як застосовувати, чим відрізняється від схожих типів, скільки сохне). Відповіді 2–3 речення, тільки на основі наданих даних.

Вимоги до тексту:
- природна українська мова, без суржику й канцеляризмів;
- без markdown, без заголовків усередині опису;
- не перераховуй характеристики списком через кому — вплітай у речення;
- цифри з характеристик використовуй точно як надано.

Товар:
Назва: ${product.name}
Бренд: ${product.brand}
Категорія: ${categoryName}
Короткий опис: ${product.description ?? ''}
${product.keywords ? `Ключові слова: ${product.keywords}` : ''}
${characteristics ? `Характеристики:\n${characteristics}` : 'Характеристики: немає даних'}`;
}
