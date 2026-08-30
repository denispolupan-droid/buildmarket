import { createClient } from '@supabase/supabase-js';
import { applicableValues, buildValueRules, canonicalCharValue, valueInDictionary, MULTI_SEP, type ValueRules, type ValueRuleRow } from './char-values';

// Єдина точка нормалізації характеристик перед БУДЬ-ЯКИМ записом у
// product_characteristics (адмін-форма, AI-генерація, Prom-заливка, імпорти).
// Джерело правди — таблиці characteristic_definitions / category_characteristics
// (міграція 082, наповнюються scripts/supabase/seed-char-dictionary.mjs).

// eslint-disable-next-line @typescript-eslint/no-unused-vars -- тип-якір (як у product-content-gen)
function dbAnchor() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
}
type Db = ReturnType<typeof dbAnchor>;

export type CharInput = { label: string; value: string };
export type CharNormalized = { label: string; value: string; sort_order: number };

export type CharDictionary = {
  /** normKey(аліас або канон) → канонічний лейбл */
  aliasMap: Map<string, string>;
  /** канонічні лейбли, значення яких — перелік (зберігаються одним рядком через кому) */
  multiselect: Set<string>;
  /** канонічний лейбл → глобальний порядок відображення */
  sortMap: Map<string, number>;
  /** канонічні значення enum-лейблів (characteristic_values, міграція 105) */
  values: ValueRules;
  /** slug категорії → parent_slug: правила родини діють на підкатегорії */
  parentOf: Map<string, string | null>;
};

/** Порожній словник (тести, деградація без БД). */
export function emptyCharDictionary(): CharDictionary {
  return { aliasMap: new Map(), multiselect: new Set(), sortMap: new Map(), values: new Map(), parentOf: new Map() };
}

/** Нормалізація ключа лейбла: апостроф → ', пробіли, регістр. */
export function normCharKey(s: string): string {
  return String(s ?? '')
    .replace(/['`´ʼ']/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

/** Косметика лейбла поза словником: уніфікуємо апостроф і пробіли, регістр не чіпаємо. */
function tidyLabel(label: string): string {
  return String(label ?? '').replace(/['`´ʼ']/g, "'").replace(/\s+/g, ' ').trim();
}

const SORT_UNKNOWN = 850; // поза словником — після техпараметрів, перед Брендом/Країною

let dictCache: { at: number; dict: CharDictionary } | null = null;
const DICT_TTL_MS = 5 * 60_000;

/** Словник з БД (кеш 5 хв). Порожня таблиця → порожній словник (нормалізація деградує до дедупу). */
export async function loadCharDictionary(supabase: Db): Promise<CharDictionary> {
  if (dictCache && Date.now() - dictCache.at < DICT_TTL_MS) return dictCache.dict;
  const [{ data }, { data: valueRows }, { data: cats }] = await Promise.all([
    supabase.from('characteristic_definitions').select('label, aliases, is_multiselect, sort_order').limit(1000),
    supabase.from('characteristic_values')
      // порядок МАТЧИНГУ = порядок вставки (id), sort_order — лише порядок показу у фільтрі
      .select('value, category_slugs, aliases, match_patterns, sort_order, characteristic_definitions(label)')
      .order('id').limit(5000),
    supabase.from('categories').select('slug, parent_slug').limit(1000),
  ]);
  const aliasMap = new Map<string, string>();
  const multiselect = new Set<string>();
  const sortMap = new Map<string, number>();
  for (const d of (data ?? []) as { label: string; aliases: string[]; is_multiselect: boolean; sort_order: number }[]) {
    aliasMap.set(normCharKey(d.label), d.label);
    for (const a of d.aliases ?? []) aliasMap.set(normCharKey(a), d.label);
    if (d.is_multiselect) multiselect.add(d.label);
    sortMap.set(d.label, d.sort_order);
  }
  type VRow = Omit<ValueRuleRow, 'label'> & { characteristic_definitions: { label: string } | null };
  const values = buildValueRules(
    ((valueRows ?? []) as unknown as VRow[])
      .filter(r => r.characteristic_definitions)
      .map(r => ({ ...r, label: r.characteristic_definitions!.label })),
  );
  const parentOf = new Map<string, string | null>();
  for (const c of (cats ?? []) as { slug: string; parent_slug: string | null }[]) parentOf.set(c.slug, c.parent_slug);
  const dict: CharDictionary = { aliasMap, multiselect, sortMap, values, parentOf };
  dictCache = { at: Date.now(), dict };
  return dict;
}

/** Скидання кешу (тести / після переімпорту словника). */
export function resetCharDictionaryCache(): void {
  dictCache = null;
}

// Злиття КІЛЬКОХ рядків multiselect в один: кожен рядок — атомарне значення
// (НЕ ріжемо по комах — вільний текст на кшталт "стропила, балки" має лишитись
// цілим). Розділювач "; " — фіди розгортають по ньому назад у кілька <param>.
function mergeMultiValues(values: string[]): string {
  const seen = new Set<string>();
  const parts: string[] = [];
  for (const v of values) {
    const p = String(v).trim();
    if (!p || seen.has(p.toLowerCase())) continue;
    seen.add(p.toLowerCase());
    parts.push(p);
  }
  return parts.join('; ');
}

/**
 * Канонізація + дедуп + порядок. Гарантії на виході:
 *  • кожен лейбл рівно один раз (multiselect — злиті значення через кому);
 *  • лейбли-синоніми зведені до канонічних, апостроф уніфіковано;
 *  • sort_order 1..N за порядком словника (невідомі — перед Брендом/Країною).
 */
export function normalizeChars(chars: CharInput[], dict: CharDictionary, category?: string | null): CharNormalized[] {
  type Row = { label: string; value: string; idx: number };
  const groups = new Map<string, Row[]>();
  let idx = 0;
  for (const c of chars) {
    const rawLabel = tidyLabel(c.label);
    const value = String(c.value ?? '').trim();
    if (!rawLabel || !value) continue;
    const label = dict.aliasMap.get(normCharKey(rawLabel)) ?? rawLabel;
    const k = normCharKey(label);
    if (!groups.has(k)) groups.set(k, []);
    // Значення-переліки теж зводимо до канону (див. char-values): інакше
    // «Тип використання» знову розповзеться на 11 формулювань.
    const ctx = { rules: dict.values, category, parentOf: dict.parentOf, multiselect: dict.multiselect.has(label) };
    groups.get(k)!.push({ label, value: canonicalCharValue(label, value, ctx), idx: idx++ });
  }

  const rows: Row[] = [];
  for (const group of groups.values()) {
    const label = group[0].label;
    if (group.length === 1) {
      rows.push(group[0]);
    } else if (dict.multiselect.has(label)) {
      rows.push({ ...group[0], value: mergeMultiValues(group.map(g => g.value)) });
    } else {
      // ПЕРШЕ входження виграє (порядок = пріоритет: існуючі/ручні дані кладуть
      // попереду AI-згенерованих). Виняток: голе число програє значенню з
      // літерами/одиницями ("1 л" інформативніше за "1000").
      const hasWords = (r: Row) => /[а-яіїєґa-z]/i.test(r.value);
      rows.push(group.find(hasWords) ?? group[0]);
    }
  }

  rows.sort((a, b) => {
    const sa = dict.sortMap.get(a.label) ?? SORT_UNKNOWN;
    const sb = dict.sortMap.get(b.label) ?? SORT_UNKNOWN;
    return sa - sb || a.idx - b.idx;
  });
  return rows.map((r, i) => ({ label: r.label, value: r.value, sort_order: i + 1 }));
}

/** Фасет категорії для AI-схеми/адмін-форми: лейбл + дозволені значення. */
export type FacetSpec = { label: string; values: string[]; multi: boolean };

/**
 * Фасети серед заданих лейблів для категорії: лише ті, у яких є канонічні
 * значення, що діють у цій категорії (або її родині). Порядок — як у labels.
 */
export function facetSpecsFor(dict: CharDictionary, category: string | null | undefined, labels: string[]): FacetSpec[] {
  const out: FacetSpec[] = [];
  for (const raw of labels) {
    const label = dict.aliasMap.get(normCharKey(raw)) ?? raw;
    if (out.some(f => f.label === label)) continue;
    const values = applicableValues(label, { rules: dict.values, category, parentOf: dict.parentOf });
    if (values.length) out.push({ label, values, multi: dict.multiselect.has(label) });
  }
  return out;
}

/**
 * Лейбли товару, чиї значення поза довідником (для категорії). Порожньо — усе
 * канонічне або вільний текст.
 */
export function offDictionaryLabels(chars: CharInput[], dict: CharDictionary, category: string | null | undefined): string[] {
  const out: string[] = [];
  for (const c of chars) {
    const label = dict.aliasMap.get(normCharKey(c.label)) ?? tidyLabel(c.label);
    const ok = valueInDictionary(label, String(c.value ?? ''), { rules: dict.values, category, parentOf: dict.parentOf, multiselect: dict.multiselect.has(label) });
    if (!ok && !out.includes(label)) out.push(label);
  }
  return out;
}

/** Значення «невідомо» в enum одиночного фасета (AI-схема); відкидається. */
export const FACET_UNKNOWN = '—';

/** Фасети з відповіді AI → рядки характеристик (порожні/«—»/чужі значення відкидаються). */
export function facetsToChars(facets: Record<string, string | string[]> | undefined, specs: FacetSpec[]): CharInput[] {
  const out: CharInput[] = [];
  for (const spec of specs) {
    const raw = facets?.[spec.label];
    if (raw == null) continue;
    if (Array.isArray(raw)) {
      const vals = raw.filter(v => spec.values.includes(v));
      if (vals.length) out.push({ label: spec.label, value: vals.join(MULTI_SEP) });
    } else if (raw !== FACET_UNKNOWN && spec.values.includes(raw)) {
      out.push({ label: spec.label, value: raw });
    }
  }
  return out;
}

/** Зручний шорткат: словник + нормалізація одним викликом. */
export async function normalizeCharsDb(supabase: Db, chars: CharInput[], category?: string | null): Promise<CharNormalized[]> {
  const dict = await loadCharDictionary(supabase);
  return normalizeChars(chars, dict, category);
}
