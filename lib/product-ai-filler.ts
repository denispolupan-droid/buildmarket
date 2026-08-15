import { createClient } from '@supabase/supabase-js';
import { generateMpUA, translateMpRU } from './marketplace-description-gen';
import { isMpDescriptionClean } from './marketplace-description';
import {
  generateUA, translateRU, applyContent, getCategoryLabels,
  type GenProduct, type GeneratedRU, type CategoryLabelSpec,
} from './product-content-gen';
import { CostSink } from './ai-cost';

// Кнопка «AI заповнення» в картці товару — ДРУГИЙ вхід у той самий рушій
// генерації (lib/product-content-gen), що й розділ SEO. Тут — паралельний пул +
// стрім AiFillEvent. Дубля промпту немає: опис/keywords/характеристики/FAQ/name_ru
// генеруються спільним core. Відмінність від SEO-входу: користувач явно обирає
// поля (чекбокси) → ці поля ПЕРЕГЕНЕРОВУЮТЬСЯ (перезапис), а FAQ і name_ru
// дозаповнюються лише якщо порожні.

function db() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

export type AiFillEvent =
  | { type: 'start'; total: number }
  | { type: 'progress'; sku: string; name: string; done: number; total: number }
  | { type: 'result'; sku: string; name: string; costUsd: number }
  | { type: 'error'; sku: string; error: string }
  | { type: 'done'; done: number; errors: number };

export type FillFields = {
  description?: boolean;
  description_full?: boolean;
  keywords?: boolean;
  characteristics?: boolean;
  /** Окремий текст для фідів Rozetka/Prom (products.description_mp) */
  description_mp?: boolean;
};

const DEFAULT_FIELDS: Required<FillFields> = {
  description: true,
  description_full: true,
  keywords: true,
  characteristics: true,
  // Вимкнено за замовчуванням: опис для маркетплейсу пишеться іншою парою
  // моделей і живе своїм життям — «дожим» картки під пошуковий запит його
  // стосуватися не повинен.
  description_mp: false,
};

// Opus-генерація важча за Sonnet; 4 паралельно тримає невеликі пачки < бюджету
// функції. Великі пачки краще ганяти через розділ SEO (послідовно, gap-driven).
const CONCURRENCY = 4;

type ProductRow = {
  sku: string;
  name: string;
  name_ru: string | null;
  brand: string;
  category_slug: string | null;
  description: string | null;
  description_full: string | null;
  keywords: string | null;
  keywords_ru: string | null;
};

async function fillOne(
  supabase: ReturnType<typeof db>,
  product: ProductRow,
  categoryName: string,
  categoryLabels: CategoryLabelSpec,
  f: Required<FillFields>,
  force: boolean,
  targetQuery?: string,
  cost?: CostSink,
): Promise<void> {
  const gp: GenProduct = {
    sku: product.sku, name: product.name, name_ru: product.name_ru,
    brand: product.brand, category_slug: product.category_slug, description: product.description,
  };

  const ua = await generateUA(gp, categoryName, categoryLabels, targetQuery, cost);
  let ru: GeneratedRU | null = null;
  try { ru = await translateRU(ua, cost); } catch { /* лишиться пробіл «рос. версія», доб'ється в SEO */ }

  const [{ data: chars }, { data: faq }] = await Promise.all([
    supabase.from('product_characteristics').select('product_sku').eq('product_sku', product.sku).limit(1),
    supabase.from('product_faq').select('product_sku').eq('product_sku', product.sku).limit(1),
  ]);

  // force = «повністю переписати картку»: перезаписуємо ВСЕ, навіть заповнене
  // (включно з FAQ і рос. назвою). Інакше — обрані чекбоксами поля регенеруємо,
  // FAQ/name_ru лише дозаповнюємо, якщо порожні.
  await applyContent(supabase, gp, ua, ru, {
    fields: force
      ? { description: true, description_full: true, keywords: true, characteristics: true, faq: true, name_ru: true }
      : {
          description: f.description, description_full: f.description_full,
          keywords: f.keywords, characteristics: f.characteristics,
          faq: true, name_ru: true,
        },
    regen: force
      ? { description: true, description_full: true, keywords: true, characteristics: true, faq: true, name_ru: true }
      : {
          description: f.description, description_full: f.description_full,
          keywords: f.keywords, characteristics: f.characteristics,
        },
    targetQuery,
    currentFull: product.description_full,
    currentKeywords: product.keywords,
    currentKeywordsRu: product.keywords_ru,
    hasChars: !!chars?.length,
    hasFaq: !!faq?.length,
  });

  // Опис для маркетплейсів — окремий текст і окрема пара моделей (Sonnet пише,
  // Haiku перекладає): на сайті лишається повний опис, у фід іде свій, інакше
  // сторінки дублюють одна одну. Генеруємо лише на явний запит — у «дожимі» під
  // пошуковий запит йому робити нічого.
  if (f.description_mp || force) {
    const { data: charRows } = await supabase
      .from('product_characteristics')
      .select('label, value, sort_order')
      .eq('product_sku', product.sku)
      .order('sort_order');
    const mpUa = await generateMpUA(
      {
        sku: product.sku, name: product.name, brand: product.brand,
        chars: (charRows ?? []).map(c => ({ label: c.label as string, value: c.value as string })),
      },
      categoryName,
    );
    // Текст зі згадкою магазину Rozetka блокує — краще не записати нічого, ніж
    // отримати відмову модерації за власним підписом.
    if (!isMpDescriptionClean(mpUa)) throw new Error('MP-опис містить згадки магазину');
    const mpRu = await translateMpRU(mpUa);
    await supabase.from('products')
      .update({ description_mp: mpUa, description_mp_ru: isMpDescriptionClean(mpRu) ? mpRu : null })
      .eq('sku', product.sku);
  }
}

export async function* fillProducts(
  skus: string[],
  fields?: FillFields,
  force = false,
  /** «Дожим»: запит, під який цілиться контент (з розділу SEO) */
  targetQuery?: string,
): AsyncGenerator<AiFillEvent> {
  const f = { ...DEFAULT_FIELDS, ...fields };
  const supabase = db();

  const { data: products, error } = await supabase
    .from('products')
    .select('sku, name, name_ru, brand, category_slug, description, description_full, keywords, keywords_ru')
    .in('sku', skus)
    .order('category_slug');  // group same category together

  if (error) throw error;
  if (!products?.length) {
    yield { type: 'start', total: 0 };
    yield { type: 'done', done: 0, errors: 0 };
    return;
  }

  yield { type: 'start', total: products.length };

  // Назви категорій + топ-ярлики характеристик рахуємо ОДИН раз на категорію наперед.
  const { data: categories } = await supabase.from('categories').select('slug, name');
  const catName = new Map((categories ?? []).map(c => [c.slug, c.name]));
  const distinctCats = [...new Set(products.map(p => p.category_slug))];
  const labelsByCat = new Map<string | null, CategoryLabelSpec>();
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
        const categoryName = catName.get(product.category_slug ?? '') ?? product.category_slug ?? '';
        // Свій лічильник на кожен товар: воркери йдуть паралельно, спільний
        // накопичувач змішав би витрати різних карток.
        const cost = new CostSink();
        await fillOne(supabase, product, categoryName, labelsByCat.get(product.category_slug) ?? { required: [], optional: [] }, f, force, targetQuery, cost);
        done++;
        push({ type: 'result', sku: product.sku, name: product.name, costUsd: cost.usd });
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
