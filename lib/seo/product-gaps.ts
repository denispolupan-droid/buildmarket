import { createClient } from '@supabase/supabase-js';
import { fetchAllRows } from '../db-paginate';
import { THIN_DESCRIPTION_CHARS } from './thresholds';

/**
 * Черга SEO-контенту: у яких товарів чого бракує.
 *
 * Довжини описів рахує Postgres (view product_seo_state) — раніше сторінка
 * тягнула description_full і description_full_ru всіх активних товарів, тобто
 * 3.5 МБ тексту на кожне відкриття, щоб узяти від них .length.
 *
 * Сама класифікація лишається чистою функцією: це єдине місце, де вирішується
 * «пробіл / не пробіл», і воно покрите тестом.
 */

export type SeoStateRow = {
  sku: string;
  slug: string | null;
  name: string;
  brand: string;
  category_slug: string | null;
  desc_len: number;
  desc_ru_len: number;
  no_ru: boolean;
  no_keywords: boolean;
  no_image: boolean;
  faq_count: number;
  faq_untranslated: number;
  chars_count: number;
};

export type CharRow = { product_sku: string; label: string };
export type DictRow = { label: string; aliases: string[] | null };
export type CategoryCharRow = {
  category_slug: string;
  required: boolean;
  // PostgREST типізує вкладену таблицю як масив, хоча звʼязок «один до одного»
  // й реально приходить обʼєкт — приймаємо обидві форми.
  characteristic_definitions: { label: string } | { label: string }[] | null;
};

const defLabel = (d: CategoryCharRow['characteristic_definitions']): string | null => {
  if (!d) return null;
  return Array.isArray(d) ? (d[0]?.label ?? null) : d.label;
};

export type ProductGaps = {
  thinDesc: boolean;
  noFaq: boolean;
  ruDesc: boolean;
  noRu: boolean;
  noKeywords: boolean;
  noChars: boolean;
  missingRequired: boolean;
  dirtyChars: boolean;
  noImage: boolean;
};

export type QueueItem = {
  sku: string;
  slug: string | null;
  name: string;
  brand: string;
  category: string;
  /** незаповнені обовʼязкові характеристики категорії (зі словника) */
  missingLabels: string[];
  gaps: ProductGaps;
};

/** Апострофи різних накреслень і подвійні пробіли — це той самий лейбл. */
export const normKey = (s: string) =>
  s.replace(/['`´ʼ’]/g, "'").replace(/\s+/g, ' ').trim().toLowerCase();

export function computeProductGaps(input: {
  products: SeoStateRow[];
  chars: CharRow[];
  dict: DictRow[];
  categoryChars: CategoryCharRow[];
  thinDescriptionChars?: number;
}): QueueItem[] {
  const thin = input.thinDescriptionChars ?? THIN_DESCRIPTION_CHARS;

  const aliasMap = new Map<string, string>();
  for (const d of input.dict) {
    aliasMap.set(normKey(d.label), d.label);
    for (const a of d.aliases ?? []) aliasMap.set(normKey(a), d.label);
  }

  const requiredByCat = new Map<string, string[]>();
  for (const r of input.categoryChars) {
    const label = r.required ? defLabel(r.characteristic_definitions) : null;
    if (!label) continue;
    if (!requiredByCat.has(r.category_slug)) requiredByCat.set(r.category_slug, []);
    requiredByCat.get(r.category_slug)!.push(label);
  }

  const charsBySku = new Map<string, { canon: Set<string>; dirty: boolean }>();
  for (const c of input.chars) {
    if (!charsBySku.has(c.product_sku)) charsBySku.set(c.product_sku, { canon: new Set(), dirty: false });
    const entry = charsBySku.get(c.product_sku)!;
    const canon = aliasMap.get(normKey(c.label));
    if (canon) {
      entry.canon.add(canon);
      if (canon !== c.label) entry.dirty = true; // синонім/апостроф — треба нормалізувати
    } else if (normKey(c.label) === 'сфера застосування') {
      // legacy-лейбл, канонізується за значенням — покриває обидві цілі
      entry.canon.add('Тип використання');
      entry.canon.add('Область застосування');
      entry.dirty = true;
    }
    // інші лейбли поза словником — легальні додаткові, dirty не ставимо
  }

  return input.products.map(p => {
    const chars = charsBySku.get(p.sku);
    const hasChars = p.chars_count > 0;
    const required = requiredByCat.get(p.category_slug ?? '') ?? [];
    const missingLabels = chars ? required.filter(l => !chars.canon.has(l)) : required;
    return {
      sku: p.sku,
      slug: p.slug,
      name: p.name,
      brand: p.brand,
      category: p.category_slug ?? '',
      missingLabels: hasChars ? missingLabels : [],
      gaps: {
        thinDesc: p.desc_len < thin,
        noFaq: p.faq_count === 0,
        ruDesc: p.desc_ru_len < p.desc_len * 0.75 || p.faq_untranslated > 0,
        noRu: p.no_ru,
        noKeywords: p.no_keywords,
        noChars: !hasChars,
        missingRequired: hasChars && missingLabels.length > 0,
        dirtyChars: !!chars?.dirty,
        noImage: p.no_image,
      },
    };
  });
}

export function hasAnyGap(item: QueueItem): boolean {
  return Object.values(item.gaps).some(Boolean);
}

const db = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

/** Завантажує стан каталогу й повертає лише товари, у яких є хоч один пробіл. */
export async function loadProductQueue(): Promise<{ items: QueueItem[]; total: number }> {
  const client = db();

  const [products, chars, dict, categoryChars] = await Promise.all([
    fetchAllRows<SeoStateRow>((f, t) =>
      client.from('product_seo_state').select('*').order('category_slug').order('sku').range(f, t)),
    fetchAllRows<CharRow>((f, t) =>
      client.from('product_characteristics').select('product_sku, label').range(f, t)),
    fetchAllRows<DictRow>((f, t) =>
      client.from('characteristic_definitions').select('label, aliases').range(f, t)),
    fetchAllRows<CategoryCharRow>((f, t) =>
      client.from('category_characteristics')
        .select('category_slug, required, characteristic_definitions(label)').range(f, t)),
  ]);

  const all = computeProductGaps({ products, chars, dict, categoryChars });
  return { items: all.filter(hasAnyGap), total: products.length };
}
