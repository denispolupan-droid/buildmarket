/**
 * Генерация русских описаний и ключевых слов для товаров.
 * Заполняет description_ru, description_full_ru, keywords_ru.
 *
 * Использование: npx tsx --env-file=.env.local scripts/enrich-descriptions-ru.mts [limit] [category]
 *
 * Примеры:
 *   npx tsx --env-file=.env.local scripts/enrich-descriptions-ru.mts 10
 *   npx tsx --env-file=.env.local scripts/enrich-descriptions-ru.mts 999
 *   npx tsx --env-file=.env.local scripts/enrich-descriptions-ru.mts 5 vodoemiulsiyni-interierni
 */

import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@supabase/supabase-js';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

const limit    = Number(process.argv[2] ?? 10);
const category = process.argv[3];

type Product = {
  sku: string;
  name: string;
  name_ru: string | null;
  brand: string;
  product_type: string | null;
  category_slug: string;
  volume: string | null;
  description: string | null;
  description_full: string | null;
  description_ru: string | null;
  description_full_ru: string | null;
  keywords: string | null;
  keywords_ru: string | null;
};

let query = db
  .from('products')
  .select('sku, name, name_ru, brand, product_type, category_slug, volume, description, description_full, description_ru, description_full_ru, keywords, keywords_ru')
  .or('description_ru.is.null,description_ru.eq.,description_full_ru.is.null,description_full_ru.eq.,keywords_ru.is.null,keywords_ru.eq.')
  .eq('is_active', true)
  .order('sort_order');

if (category) query = (query as typeof query).eq('category_slug', category);
if (limit)    query = (query as typeof query).limit(limit);

const { data: products, error } = await query;
if (error) { console.error('DB error:', error); process.exit(1); }
if (!products?.length) { console.log('✅ Все товары уже имеют описание и ключевые слова на русском.'); process.exit(0); }

console.log(`\n🤖 Генератор русского контента`);
console.log(`   Найдено ${products.length} товаров без полного русского контента\n`);

let done = 0;
let errors = 0;

for (const product of products as Product[]) {
  const nameRu = product.name_ru ?? product.name;
  const needShort    = !product.description_ru;
  const needFull     = !product.description_full_ru;
  const needKeywords = !product.keywords_ru;

  const flags = [needShort && 'desc', needFull && 'full', needKeywords && 'kw'].filter(Boolean).join('+');
  process.stdout.write(`[${done + errors + 1}/${products.length}] ${product.sku} — ${nameRu.slice(0, 50)} [${flags}]\n`);

  try {
    const [{ data: chars }, { data: examples }] = await Promise.all([
      db.from('product_characteristics').select('label, value').eq('product_sku', product.sku),
      db.from('products')
        .select('name_ru, name, description_ru, description_full_ru, keywords_ru')
        .eq('category_slug', product.category_slug)
        .not('description_ru', 'is', null)
        .neq('description_ru', '')
        .neq('sku', product.sku)
        .limit(2),
    ]);

    const charsText = (chars ?? [])
      .map((c: { label: string; value: string }) => `${c.label}: ${c.value}`)
      .join('\n');

    const examplesText = (examples ?? [])
      .map((e: { name_ru: string | null; name: string; description_ru: string | null; description_full_ru: string | null; keywords_ru: string | null }) =>
        [
          `Название: ${e.name_ru ?? e.name}`,
          e.description_ru      ? `Краткое: ${e.description_ru}` : '',
          e.description_full_ru ? `Полное: ${e.description_full_ru}` : '',
          e.keywords_ru         ? `Ключевые слова: ${e.keywords_ru}` : '',
        ].filter(Boolean).join('\n'))
      .join('\n\n---\n\n');

    const context = [
      `Название (рус): ${nameRu}`,
      `Бренд: ${product.brand}`,
      product.product_type  ? `Тип товара: ${product.product_type}` : '',
      product.volume        ? `Объём/вес: ${product.volume}` : '',
      product.description   ? `Краткое описание (укр): ${product.description}` : '',
      product.description_full ? `Полное описание (укр): ${product.description_full}` : '',
      product.keywords      ? `Ключевые слова (укр): ${product.keywords}` : '',
      charsText             ? `\nХарактеристики:\n${charsText}` : '',
      examplesText          ? `\nПримеры из той же категории:\n\n${examplesText}` : '',
    ].filter(Boolean).join('\n');

    let description_ru      = product.description_ru;
    let description_full_ru = product.description_full_ru;
    let keywords_ru         = product.keywords_ru;

    // Генерируем всё за один запрос чтобы экономить токены
    const prompt = `Ты SEO-копирайтер для украинского B2B интернет-магазина строительной химии FIXLINE (fixline.com.ua).
Напиши на русском языке для товара три блока — СТРОГО в указанном формате, без лишнего текста.

Товар:
${context}

Требования:
- Язык: русский (не украинизмы, не суржик)
- Тон: профессиональный B2B, конкретный
- Ориентация на рынок Украины

---
БЛОК 1 — КРАТКОЕ_ОПИСАНИЕ (1–2 предложения, 40–80 слов):
[${needShort ? 'напиши' : 'SKIP — уже есть: ' + description_ru}]

БЛОК 2 — ПОЛНОЕ_ОПИСАНИЕ (3–4 предложения, 80–160 слов, включай: бренд + ключевое свойство + область применения + преимущества):
[${needFull ? 'напиши' : 'SKIP — уже есть'}]

БЛОК 3 — КЛЮЧЕВЫЕ_СЛОВА (8–12 слов/фраз через запятую, для поиска на Google.ru/ua: название товара по-русски, синонимы, «купить», «оптом», конкретные применения):
[${needKeywords ? 'напиши' : 'SKIP — уже есть'}]
---

Ответ строго в формате (без пояснений):
КРАТКОЕ: <текст>
ПОЛНОЕ: <текст>
КЛЮЧЕВЫЕ: <слово1, слово2, ...>`;

    const msg = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 700,
      messages: [{ role: 'user', content: prompt }],
    });

    const raw = (msg.content[0] as { type: string; text: string }).text.trim();

    const shortMatch    = raw.match(/^КРАТКОЕ:\s*(.+?)(?=\nПОЛНОЕ:|$)/ms);
    const fullMatch     = raw.match(/^ПОЛНОЕ:\s*(.+?)(?=\nКЛЮЧЕВЫЕ:|$)/ms);
    const keywordsMatch = raw.match(/^КЛЮЧЕВЫЕ:\s*(.+?)$/ms);

    if (needShort    && shortMatch)    description_ru      = shortMatch[1].trim();
    if (needFull     && fullMatch)     description_full_ru = fullMatch[1].trim();
    if (needKeywords && keywordsMatch) keywords_ru         = keywordsMatch[1].trim();

    const update: Record<string, string> = {};
    if (needShort    && description_ru)      update.description_ru      = description_ru;
    if (needFull     && description_full_ru) update.description_full_ru = description_full_ru;
    if (needKeywords && keywords_ru)         update.keywords_ru         = keywords_ru;

    if (Object.keys(update).length) {
      const { error: dbErr } = await db.from('products').update(update).eq('sku', product.sku);
      if (dbErr) throw dbErr;
    }

    console.log(`  ✓ kw: ${(keywords_ru ?? '').slice(0, 90)}\n`);
    done++;

  } catch (err) {
    console.log(`  ✗ Ошибка: ${err}\n`);
    errors++;
  }
}

console.log(`\n✅ Готово: ${done} товаров обработано, ${errors} ошибок`);
