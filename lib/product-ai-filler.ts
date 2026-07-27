import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@supabase/supabase-js';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

function db() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

export type AiFillEvent =
  | { type: 'start'; total: number }
  | { type: 'progress'; sku: string; name: string; done: number; total: number }
  | { type: 'result'; sku: string; name: string }
  | { type: 'error'; sku: string; error: string }
  | { type: 'done'; done: number; errors: number };

interface AiContent {
  description_ua: string;
  description_ru: string;
  description_full_ua: string;
  description_full_ru: string;
  keywords_ua: string;
  keywords_ru: string;
  characteristics: { label: string; value: string }[];
}

async function getCategoryLabels(supabase: ReturnType<typeof db>, categorySlug: string | null): Promise<string[]> {
  if (!categorySlug) return [];
  const { data } = await supabase
    .from('product_characteristics')
    .select('label, product_sku, products!inner(category_slug)')
    .eq('products.category_slug', categorySlug)
    .limit(200);

  if (!data?.length) return [];

  // Count label frequency and return top labels sorted by frequency
  const counts: Record<string, number> = {};
  for (const row of data) {
    counts[row.label] = (counts[row.label] ?? 0) + 1;
  }
  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 15)
    .map(([label]) => label);
}

function buildPrompt(
  product: {
    name: string;
    name_ru: string | null;
    brand: string;
    category_slug: string | null;
    description: string | null;
    description_ru: string | null;
  },
  categoryLabels: string[],
): string {
  const labelsHint = categoryLabels.length > 0
    ? `\nСТАНДАРТНІ ЯРЛИКИ ХАРАКТЕРИСТИК ДЛЯ ЦІЄї КАТЕГОРІЇ (використовуй САМЕ ЦІ назви, якщо підходять):\n${categoryLabels.map(l => `  • ${l}`).join('\n')}\n`
    : '';

  return `Ти досвідчений SEO-копірайтер для українського B2B магазину будівельної хімії FIXLINE.
Твоє завдання — написати якісний контент для картки товару.

ТОВАР:
- Назва (UA): ${product.name}
- Назва (RU): ${product.name_ru ?? ''}
- Бренд: ${product.brand}
- Категорія: ${product.category_slug ?? ''}
- Поточний короткий опис: ${product.description ?? ''}
${labelsHint}
ВИМОГИ:
1. description_ua — короткий опис 150-220 символів. Конкретно, без води. Пояснює ЩО це і ДЛЯ ЧОГО.
2. description_ru — те саме росiйською мовою.
3. description_full_ua — розгорнутий SEO-опис 400-600 символів. 2-3 абзаци: призначення → технічні переваги → де застосовується. Природний текст, без маркованих списків.
4. description_full_ru — те саме росiйською мовою.
5. keywords_ua — 12-18 пошукових фраз через кому. Включай: назву бренду, тип товару, синоніми, "купити [назва]", "[назва] ціна", "[назва] оптом", "[назва] Київ". Все малими літерами.
6. keywords_ru — те саме росiйською: 12-18 фраз через кому з "купить", "цена", "оптом".
7. characteristics — масив технічних характеристик товару. Від 6 до 14 рядків. Кожен рядок: label (назва параметра) і value (значення).${categoryLabels.length > 0 ? ' ОБОВ\'ЯЗКОВО використовуй стандартні ярлики з переліку вище де це доречно.' : ''} Витягни реальні технічні дані з назви товару. Порядок: спочатку специфічні параметри, останніми — Бренд та Країна виробника.

ВІДПОВІДЬ — тільки валідний JSON без markdown, без пояснень:
{
  "description_ua": "...",
  "description_ru": "...",
  "description_full_ua": "...",
  "description_full_ru": "...",
  "keywords_ua": "...",
  "keywords_ru": "...",
  "characteristics": [
    {"label": "Тип", "value": "..."},
    {"label": "Бренд", "value": "..."},
    {"label": "Країна виробника", "value": "..."}
  ]
}`;
}

// Таймаут на один товар: якщо AI-запит завис — валимо його з помилкою,
// щоб не тримати слот пулу і не з'їсти весь бюджет функції одним товаром.
const ITEM_TIMEOUT_MS = 90_000;

async function generateContent(
  product: {
    name: string;
    name_ru: string | null;
    brand: string;
    category_slug: string | null;
    description: string | null;
    description_ru: string | null;
  },
  categoryLabels: string[],
): Promise<AiContent> {
  const msg = await anthropic.messages.create(
    {
      model: 'claude-sonnet-4-6',
      max_tokens: 2500,
      messages: [{ role: 'user', content: buildPrompt(product, categoryLabels) }],
    },
    { timeout: ITEM_TIMEOUT_MS },
  );

  const raw = (msg.content[0] as { type: string; text: string }).text;
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) throw new Error('JSON не знайдено у відповіді AI');

  return JSON.parse(match[0]) as AiContent;
}

export type FillFields = {
  description?: boolean;
  description_full?: boolean;
  keywords?: boolean;
  characteristics?: boolean;
};

const DEFAULT_FIELDS: Required<FillFields> = {
  description: true,
  description_full: true,
  keywords: true,
  characteristics: true,
};

type ProductRow = {
  sku: string;
  name: string;
  name_ru: string | null;
  brand: string;
  category_slug: string | null;
  description: string | null;
  description_ru: string | null;
};

// Скільки товарів обробляємо ПАРАЛЕЛЬНО. Кожен товар — важкий AI-запит (~15-25с),
// послідовно 20+ товарів не влазять у 300с бюджету функції й потік обривався на
// середині. Пул із 4 воркерів скорочує wall-time ~у 4 рази.
const CONCURRENCY = 4;

// Обробка одного товару: генерація + запис у БД. Кидає — якщо AI/БД впали.
async function fillOne(
  supabase: ReturnType<typeof db>,
  product: ProductRow,
  categoryLabels: string[],
  f: Required<FillFields>,
): Promise<void> {
  const data = await generateContent(product, categoryLabels);

  // Build product update object — only include selected fields
  const update: Record<string, string | null> = {};
  if (f.description) {
    update.description    = data.description_ua;
    update.description_ru = data.description_ru;
  }
  if (f.description_full) {
    update.description_full    = data.description_full_ua;
    update.description_full_ru = data.description_full_ru;
  }
  if (f.keywords) {
    update.keywords    = data.keywords_ua;
    update.keywords_ru = data.keywords_ru;
  }

  if (Object.keys(update).length > 0) {
    const { error } = await supabase.from('products').update(update).eq('sku', product.sku);
    if (error) throw error;
  }

  if (f.characteristics && data.characteristics?.length) {
    await supabase.from('product_characteristics').delete().eq('product_sku', product.sku);
    const { error } = await supabase.from('product_characteristics').insert(
      data.characteristics.map((c, i) => ({
        product_sku: product.sku,
        label: c.label,
        value: c.value,
        sort_order: i + 1,
      }))
    );
    if (error) throw error;
  }
}

export async function* fillProducts(skus: string[], fields?: FillFields): AsyncGenerator<AiFillEvent> {
  const f = { ...DEFAULT_FIELDS, ...fields };
  const supabase = db();

  const { data: products, error } = await supabase
    .from('products')
    .select('sku, name, name_ru, brand, category_slug, description, description_ru')
    .in('sku', skus)
    .order('category_slug');  // group same category together

  if (error) throw error;
  if (!products?.length) {
    yield { type: 'start', total: 0 };
    yield { type: 'done', done: 0, errors: 0 };
    return;
  }

  yield { type: 'start', total: products.length };

  // Ярлики характеристик рахуємо ОДИН раз на кожну унікальну категорію наперед —
  // так знімається послідовна залежність (кеш між ітераціями) і воркери незалежні.
  const distinctCats = [...new Set(products.map(p => p.category_slug))];
  const labelsByCat = new Map<string | null, string[]>();
  await Promise.all(
    distinctCats.map(async cat => { labelsByCat.set(cat, await getCategoryLabels(supabase, cat)); }),
  );

  // Канал: воркери штовхають події, генератор їх зливає споживачу по мірі готовності.
  const queue: AiFillEvent[] = [];
  let wake: (() => void) | null = null;
  let finished = false;
  const push = (e: AiFillEvent) => { queue.push(e); wake?.(); wake = null; };

  let done = 0;
  let errors = 0;
  let idx = 0;

  async function worker() {
    while (idx < products!.length) {
      const product = products![idx++];
      push({ type: 'progress', sku: product.sku, name: product.name, done, total: products!.length });
      try {
        await fillOne(supabase, product, labelsByCat.get(product.category_slug) ?? [], f);
        done++;
        push({ type: 'result', sku: product.sku, name: product.name });
      } catch (err) {
        errors++;
        push({ type: 'error', sku: product.sku, error: String(err) });
      }
    }
  }

  // Запускаємо пул; коли всі воркери відпрацювали — відмічаємо кінець.
  void Promise.all(
    Array.from({ length: Math.min(CONCURRENCY, products.length) }, () => worker()),
  ).then(() => { finished = true; wake?.(); wake = null; });

  while (!finished || queue.length > 0) {
    if (queue.length > 0) {
      yield queue.shift()!;
    } else {
      await new Promise<void>(resolve => { wake = resolve; });
    }
  }

  yield { type: 'done', done, errors };
}
