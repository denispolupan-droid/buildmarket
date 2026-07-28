import { createClient } from '@supabase/supabase-js';

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
};

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
  const { data } = await supabase
    .from('characteristic_definitions')
    .select('label, aliases, is_multiselect, sort_order')
    .limit(1000);
  const aliasMap = new Map<string, string>();
  const multiselect = new Set<string>();
  const sortMap = new Map<string, number>();
  for (const d of (data ?? []) as { label: string; aliases: string[]; is_multiselect: boolean; sort_order: number }[]) {
    aliasMap.set(normCharKey(d.label), d.label);
    for (const a of d.aliases ?? []) aliasMap.set(normCharKey(a), d.label);
    if (d.is_multiselect) multiselect.add(d.label);
    sortMap.set(d.label, d.sort_order);
  }
  const dict = { aliasMap, multiselect, sortMap };
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
export function normalizeChars(chars: CharInput[], dict: CharDictionary): CharNormalized[] {
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
    groups.get(k)!.push({ label, value, idx: idx++ });
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

/** Зручний шорткат: словник + нормалізація одним викликом. */
export async function normalizeCharsDb(supabase: Db, chars: CharInput[]): Promise<CharNormalized[]> {
  const dict = await loadCharDictionary(supabase);
  return normalizeChars(chars, dict);
}
