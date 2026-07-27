import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@supabase/supabase-js';

// ЄДИНИЙ рушій генерації контенту картки товару. Обидва входи — розділ SEO
// (/admin/seo → catalog-enricher) і кнопка в картці (/products → product-ai-filler)
// — викликають саме його, щоб опис/keywords/тощо генерувались в ОДНОМУ місці за
// одним промптом. UA пише Opus (structured output), RU докладає Haiku-переклад.

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// description_full коротший за цей поріг вважається "тонким" контентом
export const THIN_DESCRIPTION_CHARS = 800;

// Тип клієнта беремо з реального виклику createClient(url, key) — щоб збігався
// з клієнтами модулів, що передають supabase сюди (інакше TS бачить різні схеми).
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- використовується лише як тип-якір (ReturnType нижче)
function dbAnchor() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
}
type Db = ReturnType<typeof dbAnchor>;

export type GenProduct = {
  sku: string;
  name: string;
  name_ru: string | null;
  brand: string;
  category_slug: string | null;
  description: string | null;
};

export type FaqPair = { q: string; a: string };

// UA-контент, який продукує основний Opus-виклик
export type GeneratedUA = {
  name_ru: string;
  description: string;
  description_full: string;
  keywords: string;
  characteristics: { label: string; value: string }[];
  faq: FaqPair[];
};

// RU-версія текстових полів (Haiku-переклад). Характеристики лишаються UA.
export type GeneratedRU = {
  description_ru: string;
  description_full_ru: string;
  keywords_ru: string;
  faq_ru: FaqPair[];
};

const UA_SCHEMA = {
  type: 'object' as const,
  properties: {
    name_ru:          { type: 'string' as const, description: 'Назва товару російською (бренди/артикули/числа без змін, перекладай лише загальні слова)' },
    description:      { type: 'string' as const, description: 'Короткий опис 150-220 символів' },
    description_full: { type: 'string' as const, description: 'Повний опис 250-400 слів, 4-6 абзаців через порожній рядок, без markdown/заголовків' },
    keywords:         { type: 'string' as const, description: '12-18 пошукових фраз через кому, малими літерами' },
    characteristics: {
      type: 'array' as const,
      items: {
        type: 'object' as const,
        properties: { label: { type: 'string' as const }, value: { type: 'string' as const } },
        required: ['label', 'value'], additionalProperties: false,
      },
    },
    faq: {
      type: 'array' as const,
      items: {
        type: 'object' as const,
        properties: { q: { type: 'string' as const }, a: { type: 'string' as const } },
        required: ['q', 'a'], additionalProperties: false,
      },
    },
  },
  required: ['name_ru', 'description', 'description_full', 'keywords', 'characteristics', 'faq'],
  additionalProperties: false,
};

const RU_SCHEMA = {
  type: 'object' as const,
  properties: {
    description_ru:      { type: 'string' as const },
    description_full_ru: { type: 'string' as const },
    keywords_ru:         { type: 'string' as const },
    faq_ru: {
      type: 'array' as const,
      items: {
        type: 'object' as const,
        properties: { q: { type: 'string' as const }, a: { type: 'string' as const } },
        required: ['q', 'a'], additionalProperties: false,
      },
    },
  },
  required: ['description_ru', 'description_full_ru', 'keywords_ru', 'faq_ru'],
  additionalProperties: false,
};

// Топ-ярлики характеристик у категорії (згорнуті за апострофом) — щоб AI вживав
// узгоджені назви параметрів по каталогу.
export async function getCategoryLabels(supabase: Db, categorySlug: string | null): Promise<string[]> {
  if (!categorySlug) return [];
  const { data } = await supabase
    .from('product_characteristics')
    .select('label, products!inner(category_slug)')
    .eq('products.category_slug', categorySlug)
    .limit(200);
  if (!data?.length) return [];
  const canon = (s: string) => s.replace(/['`´ʼ']/g, "'").replace(/\s+/g, ' ').trim().toLowerCase();
  const counts: Record<string, { n: number; label: string }> = {};
  for (const row of data as { label: string }[]) {
    const k = canon(row.label);
    if (!counts[k]) counts[k] = { n: 0, label: row.label };
    counts[k].n += 1;
  }
  return Object.values(counts).sort((a, b) => b.n - a.n).slice(0, 15).map(c => c.label);
}

function buildUaPrompt(
  product: GenProduct,
  categoryName: string,
  categoryLabels: string[],
  targetQuery?: string,
): string {
  const labelsHint = categoryLabels.length
    ? `\nСтандартні ярлики характеристик цієї категорії (вживай саме їх, де доречно): ${categoryLabels.join(', ')}.\n`
    : '';
  const boost = targetQuery
    ? `\nSEO-дожим: сторінка має краще ранжуватися за запитом "${targetQuery}". Природно інтегруй його (і близькі формулювання) в опис і зроби одне з FAQ прямою відповіддю на нього. Без переспаму.\n`
    : '';
  return `Ти SEO-копірайтер українського інтернет-магазину будівельної хімії FIXLINE (fixline.com.ua, доставка Новою Поштою по всій Україні).
${boost}Згенеруй ПОВНИЙ контент картки товару (усе — українською; name_ru — російською):

1. name_ru — назва товару російською. Бренди, артикули, торгові марки та всі числа/одиниці лишай БЕЗ змін; перекладай лише загальні слова. Без кальки.
2. description — короткий опис 150-220 символів: що це і для чого, без води.
3. description_full — розгорнутий опис 250-400 слів, кілька абзаців (порожній рядок між ними), без markdown і заголовків, у такому порядку:
   - призначення і ключова властивість (почни з бренду й назви + фасування);
   - сфера застосування: конкретні поверхні, типи робіт, внутрішні/зовнішні;
   - технічні характеристики своїми словами, вплетені в речення (не списком);
   - переваги перед звичайними аналогами (без назв конкурентів);
   - ПЕРЕДОСТАННІЙ абзац дослівно: "Замовити [тип товару] [назва] можна з доставкою Новою Поштою по всій Україні — у Київ, Харків, Дніпро, Одесу, Львів та інші міста. Доступна оплата при отриманні або передоплата на зручних для вас умовах.";
   - ОСТАННІЙ абзац дослівно: "Оформлюйте замовлення в інтернет-магазині FIXLINE і отримайте якісний [за потреби країна-прикметник] продукт швидко та без зайвих клопотів.".
   Не вигадуй точних числових значень, яких не можеш обґрунтувати з назви/категорії.
4. keywords — 12-18 пошукових фраз через кому, малими літерами: бренд, тип товару, синоніми, "купити [назва]", "[назва] ціна", "[назва] оптом", "[назва] Київ".
5. characteristics — 6-14 рядків label/value з реальних даних назви.${labelsHint}   БЕЗ ДУБЛІВ: кожен параметр рівно один рядок; не давай синонімічних ярликів (обери одне: «Основа» або «Матеріал»; «Тип» або «Область застосування»; об'єм/вагу — раз). Апостроф скрізь звичайний (Об'єм). Порядок: спочатку специфічні, останніми — Бренд і Країна виробника.
6. faq — 3-4 пари питання/відповідь під реальні пошукові запити (витрата, як застосовувати, чим відрізняється, скільки сохне). Відповіді 2-3 речення, тільки з наданих/загальновідомих даних.

Товар:
Назва: ${product.name}
Бренд: ${product.brand}
Категорія: ${categoryName}
Поточний короткий опис: ${product.description ?? ''}`;
}

function parseStructured<T>(msg: Anthropic.Message): T {
  if (msg.stop_reason !== 'end_turn') throw new Error(`stop_reason=${msg.stop_reason}`);
  const block = msg.content.find(b => b.type === 'text');
  if (!block || block.type !== 'text') throw new Error('no text block in response');
  return JSON.parse(block.text) as T;
}

const ITEM_TIMEOUT_MS = 120_000;

/** Основна генерація UA-контенту (Opus, structured output). */
export async function generateUA(
  product: GenProduct,
  categoryName: string,
  categoryLabels: string[],
  targetQuery?: string,
): Promise<GeneratedUA> {
  const msg = await anthropic.messages.create(
    {
      model: 'claude-opus-4-8',
      max_tokens: 8000,
      output_config: { format: { type: 'json_schema', schema: UA_SCHEMA } },
      messages: [{ role: 'user', content: buildUaPrompt(product, categoryName, categoryLabels, targetQuery) }],
    },
    { timeout: ITEM_TIMEOUT_MS },
  );
  const gen = parseStructured<GeneratedUA>(msg);
  const words = gen.description_full.split(/\s+/).filter(Boolean).length;
  if (words < 120) throw new Error(`description too short: ${words} words`);
  return gen;
}

/** RU-переклад текстових полів (Haiku). Назву не перекладаємо (name_ru з UA-виклику). */
export async function translateRU(ua: GeneratedUA): Promise<GeneratedRU> {
  const msg = await anthropic.messages.create(
    {
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 8000,
      output_config: { format: { type: 'json_schema', schema: RU_SCHEMA } },
      messages: [{
        role: 'user',
        content: `Переведи контент товара с украинского на русский (аудитория — русскоязычные покупатели в Украине).
Правила: названия брендов, артикулы и все числа оставляй без изменений; естественный русский без кальки; сохрани разбиение на абзацы (пустая строка между абзацами); FAQ и keywords переведи, количество пар FAQ не меняй; города в блоке заказа — Киев, Харьков, Днепр, Одесса, Львов.

Короткое описание:
${ua.description}

Полное описание:
${ua.description_full}

Ключевые слова:
${ua.keywords}

FAQ:
${ua.faq.map((f, i) => `${i + 1}. Q: ${f.q}\n   A: ${f.a}`).join('\n')}`,
      }],
    },
    { timeout: ITEM_TIMEOUT_MS },
  );
  const ru = parseStructured<GeneratedRU>(msg);
  if (ru.faq_ru.length !== ua.faq.length) throw new Error(`translate: faq count ${ru.faq_ru.length} != ${ua.faq.length}`);
  return ru;
}

// Дедуп ярликів характеристик (варіанти апострофа + повтори): лишаємо перший.
function dedupeChars(chars: { label: string; value: string }[]): { label: string; value: string }[] {
  const norm = (s: string) => s.toLowerCase().replace(/['`´ʼ']/g, "'").replace(/\s+/g, ' ').trim();
  const seen = new Set<string>();
  return chars.filter(c => {
    const k = norm(c.label ?? '');
    if (!k || !c.value || seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

export async function replaceFaq(supabase: Db, sku: string, faq: FaqPair[], faqRu?: FaqPair[]): Promise<void> {
  const { error: delErr } = await supabase.from('product_faq').delete().eq('product_sku', sku);
  if (delErr) throw delErr;
  if (!faq.length) return;
  const { error: insErr } = await supabase.from('product_faq').insert(
    faq.map((f, i) => ({
      product_sku: sku, question: f.q, answer: f.a,
      question_ru: faqRu?.[i]?.q ?? null, answer_ru: faqRu?.[i]?.a ?? null, sort_order: i,
    })),
  );
  if (insErr) throw insErr;
}

async function replaceChars(supabase: Db, sku: string, chars: { label: string; value: string }[]): Promise<void> {
  const unique = dedupeChars(chars);
  await supabase.from('product_characteristics').delete().eq('product_sku', sku);
  if (!unique.length) return;
  const { error } = await supabase.from('product_characteristics').insert(
    unique.map((c, i) => ({ product_sku: sku, label: c.label, value: c.value, sort_order: i + 1 })),
  );
  if (error) throw error;
}

type FieldKey = 'description' | 'description_full' | 'keywords' | 'characteristics' | 'faq' | 'name_ru';

// Політика запису кожного поля:
//   fields[k]=false  → поле взагалі не чіпаємо;
//   regen[k]=true    → перезаписуємо, навіть якщо заповнене;
//   інакше           → gap-aware: пишемо лише порожнє/тонке (не чіпаємо ручний контент).
// name_ru навмисно НІКОЛИ не перезаписуємо (лише якщо порожнє) — це власна назва.
export type ApplyOpts = {
  fields?: Partial<Record<FieldKey, boolean>>;
  regen?: Partial<Record<FieldKey, boolean>>;
  targetQuery?: string;
  currentFull?: string | null;    // поточний description_full (для порогу «тонкий»)
  currentKeywords?: string | null;
  hasChars?: boolean;
  hasFaq?: boolean;
};

export async function applyContent(
  supabase: Db,
  product: GenProduct,
  ua: GeneratedUA,
  ru: GeneratedRU | null,
  opts: ApplyOpts = {},
): Promise<{ wroteFull: boolean; faqCount: number; ru: boolean }> {
  const on    = (k: FieldKey) => opts.fields?.[k] !== false; // за замовч. усі увімкнені
  const regen = (k: FieldKey) => !!opts.regen?.[k];

  const update: Record<string, string | null> = {};

  // Рос. назва — тільки якщо порожня (не перезаписуємо переклад/ручне).
  if (on('name_ru') && !product.name_ru?.trim() && ua.name_ru?.trim()) {
    update.name_ru = ua.name_ru.trim();
  }
  if (on('description') && (regen('description') || !product.description?.trim())) {
    update.description = ua.description;
    if (ru) update.description_ru = ru.description_ru;
  }
  let wroteFull = false;
  const fullThin = (opts.currentFull ?? '').length < THIN_DESCRIPTION_CHARS;
  if (on('description_full') && (regen('description_full') || fullThin)) {
    update.description_full = ua.description_full;
    if (ru) update.description_full_ru = ru.description_full_ru;
    wroteFull = true;
  }
  if (on('keywords') && (regen('keywords') || !opts.currentKeywords)) {
    update.keywords = ua.keywords;
    if (ru) update.keywords_ru = ru.keywords_ru;
  } else if (opts.targetQuery) {
    // Дожим: цільовий запит додаємо в keywords, навіть якщо їх не переписуємо
    const existing = opts.currentKeywords ?? '';
    if (!existing.toLowerCase().includes(opts.targetQuery.trim().toLowerCase())) {
      update.keywords = existing ? `${existing}, ${opts.targetQuery.trim()}` : opts.targetQuery.trim();
    }
  }

  if (Object.keys(update).length) {
    const { error } = await supabase.from('products').update(update).eq('sku', product.sku);
    if (error) throw error;
  }

  if (on('characteristics') && (regen('characteristics') || !opts.hasChars) && ua.characteristics?.length) {
    await replaceChars(supabase, product.sku, ua.characteristics);
  }

  let faqCount = 0;
  if (on('faq') && (regen('faq') || !opts.hasFaq) && ua.faq?.length) {
    await replaceFaq(supabase, product.sku, ua.faq, ru?.faq_ru);
    faqCount = ua.faq.length;
  }

  return { wroteFull, faqCount, ru: !!ru };
}
