import { createClient } from '@supabase/supabase-js';
import {
  generateUA, translateRU, applyContent, getCategoryLabels, EMPTY_LABEL_SPEC,
  THIN_DESCRIPTION_CHARS, type GenProduct, type GeneratedRU, type CategoryLabelSpec,
} from './product-content-gen';
import { loadCharDictionary, normCharKey, offDictionaryLabels } from './characteristics';
import { CostSink } from './ai-cost';

// Розділ SEO (/admin/seo) — головний вхід у ЄДИНИЙ рушій генерації контенту
// (lib/product-content-gen). Тут лише оркестрація: вибір товарів за пробілами,
// послідовний прохід, стрім подій. Опис/keywords/характеристики/FAQ/name_ru
// генеруються тим самим промптом, що й кнопка в картці товару.

export { THIN_DESCRIPTION_CHARS };

function db() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

export type EnrichEvent =
  | { type: 'start'; total: number }
  | { type: 'progress'; sku: string; name: string; done: number; total: number }
  | { type: 'result'; sku: string; description_full: string; faqCount: number; ru: boolean; costUsd: number }
  | { type: 'error'; sku: string; error: string }
  | { type: 'done'; done: number; errors: number };

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
    .select('sku, name, name_ru, brand, category_slug, description, description_full, keywords')
    .eq('is_active', true)
    .order('sort_order');

  if (opts.sku)          query = query.eq('sku', opts.sku);
  if (opts.skus?.length) query = query.in('sku', opts.skus);
  if (opts.category)     query = query.eq('category_slug', opts.category);

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
  const labelsCache = new Map<string | null, CategoryLabelSpec>();

  for (const product of products) {
    yield { type: 'progress', sku: product.sku, name: product.name, done, total: products.length };

    try {
      // Наявність характеристик і FAQ (щоб не перезаписувати вже заповнене без потреби)
      const [{ data: chars }, { data: faqRows }] = await Promise.all([
        supabase.from('product_characteristics').select('label, value').eq('product_sku', product.sku).order('sort_order').limit(100),
        supabase.from('product_faq').select('question_ru').eq('product_sku', product.sku),
      ]);
      const hasChars = !!chars?.length;
      const hasFaq = !!faqRows?.length;
      const hasUntranslatedFaq = (faqRows ?? []).some(r => !r.question_ru);

      if (!labelsCache.has(product.category_slug)) {
        labelsCache.set(product.category_slug, await getCategoryLabels(supabase, product.category_slug));
      }

      // Характеристики перегенеровуємо не тільки коли їх немає, а й коли не всі
      // обов'язкові (за словником категорії) заповнені
      const requiredLabels = labelsCache.get(product.category_slug)?.required ?? [];
      let missingRequired = false;
      // …і коли значення фасетів поза довідником («Акрилова дисперсія (водна база)»):
      // такі рядки з merge виключаємо, щоб enum-значення від AI їх перекрило
      let offDict = new Set<string>();
      if (hasChars) {
        const dict = await loadCharDictionary(supabase);
        const have = new Set((chars ?? []).map(c => dict.aliasMap.get(normCharKey(c.label)) ?? c.label));
        missingRequired = requiredLabels.some(l => !have.has(l));
        offDict = new Set(offDictionaryLabels(chars ?? [], dict, product.category_slug).map(normCharKey));
      }
      const regenChars = missingRequired || offDict.size > 0;
      const categoryName = catName.get(product.category_slug ?? '') ?? product.category_slug ?? '';

      const gp: GenProduct = {
        sku: product.sku, name: product.name, name_ru: product.name_ru,
        brand: product.brand, category_slug: product.category_slug, description: product.description,
      };

      // Лічильник на кожен товар окремо — щоб у прогресі було видно фактичну,
      // а не прикидочну вартість кожної картки
      const cost = new CostSink();
      const ua = await generateUA(gp, categoryName, labelsCache.get(product.category_slug) ?? EMPTY_LABEL_SPEC, opts.targetQuery, cost);

      // RU — обов'язкова, але не критична: якщо переклад упав, зберігаємо UA
      let ru: GeneratedRU | null = null;
      try { ru = await translateRU(ua, cost); } catch { /* лишиться пробіл «рос. версія» */ }

      const res = await applyContent(supabase, gp, ua, ru, {
        // Опис перегенеровуємо лише якщо тонкий (gap-aware); FAQ — якщо немає або без
        // перекладу; характеристики — якщо бракує обов'язкових зі словника
        regen: { faq: !hasFaq || hasUntranslatedFaq, characteristics: regenChars },
        // Існуючі характеристики мають пріоритет — AI лише ДОДАЄ відсутні обов'язкові
        // (крім рядків зі значенням поза довідником — їх заміняє enum-значення)
        mergeChars: regenChars ? (chars ?? []).filter(c => !offDict.has(normCharKey(c.label))) : undefined,
        targetQuery: opts.targetQuery,
        currentFull: product.description_full,
        currentKeywords: product.keywords,
        hasChars, hasFaq,
      });

      yield { type: 'result', sku: product.sku, description_full: ua.description_full, faqCount: res.faqCount, ru: res.ru, costUsd: cost.usd };
      done++;
    } catch (err) {
      errors++;
      yield { type: 'error', sku: product.sku, error: String(err) };
    }
  }

  yield { type: 'done', done, errors };
}
