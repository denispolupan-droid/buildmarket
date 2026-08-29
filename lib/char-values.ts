/**
 * Канонічні ЗНАЧЕННЯ характеристик-переліків (фасетів) — data-driven.
 *
 * Правила живуть у таблиці characteristic_values (міграція 105; вміст —
 * CHAR_VALUES у scripts/supabase/char-dictionary.mjs, заливка seed-char-dictionary):
 * для лейбла — список канонічних значень, у кожного точні синоніми (aliases),
 * регекси (match_patterns) і категорії, де правило діє (category_slugs; порожньо =
 * скрізь; slug може бути родиною-предком — «farby» покриває всі фарби).
 *
 * Семантика:
 *  • одиночне значення: точний збіг (значення/аліас) → воно; інакше ПЕРШИЙ
 *    регекс, що збігся, виграє; без збігу — значення лишається як є (краще
 *    недоправити, ніж зіпсувати);
 *  • multiselect: значення ріжеться по «; », кожен шматок: точний збіг → канон,
 *    інакше збираються ВСІ канони, чиї регекси збіглися («Молотковий та
 *    перламутровий» → «Молотковий; Перламутровий»); шматок без збігів лишається.
 *
 * Застосовується в normalizeChars — до КОЖНОГО запису (адмінка, AI, Prom).
 * Разова чистка наявних даних — scripts/supabase/canonicalize-char-values.mts.
 * Нові значення/синоніми додавати в CHAR_VALUES + перезалити seed, а не в код.
 */

export type ValueRuleRow = {
  label: string;
  value: string;
  category_slugs?: string[] | null;
  aliases?: string[] | null;
  match_patterns?: string[] | null;
};

export type ValueRule = {
  value: string;
  cats: string[] | null;      // null = діє скрізь
  aliases: Set<string>;       // lowercase, разом із самим значенням
  patterns: RegExp[];
};

/** label → правила в порядку пріоритету */
export type ValueRules = Map<string, ValueRule[]>;

export type ValueContext = {
  rules: ValueRules;
  /** slug категорії товару (лист дерева) */
  category?: string | null;
  /** slug → parent_slug, щоб правила родини діяли на підкатегорії */
  parentOf?: Map<string, string | null>;
  /** лейбл — multiselect (значення через «; ») */
  multiselect?: boolean;
};

export const MULTI_SEP = '; ';

const tidy = (s: string) => String(s ?? '').toLowerCase().replace(/[’ʼ`´]/g, "'").replace(/\s+/g, ' ').trim();

/** Компіляція рядків БД у правила. Невалідний регекс пропускається (не валимо запис). */
export function buildValueRules(rows: ValueRuleRow[]): ValueRules {
  const out: ValueRules = new Map();
  for (const r of rows) {
    const patterns: RegExp[] = [];
    for (const p of r.match_patterns ?? []) {
      try { patterns.push(new RegExp(p, 'i')); } catch { /* зіпсований регекс у довіднику — ігноруємо */ }
    }
    const aliases = new Set<string>([tidy(r.value), ...(r.aliases ?? []).map(tidy)]);
    const cats = r.category_slugs?.length ? r.category_slugs : null;
    if (!out.has(r.label)) out.set(r.label, []);
    out.get(r.label)!.push({ value: r.value, cats, aliases, patterns });
  }
  return out;
}

/** Ланцюжок категорій від листа до кореня: ['moltkovi-farby', 'farby-3v1', 'farby']. */
export function categoryChain(category: string | null | undefined, parentOf?: Map<string, string | null>): string[] {
  const chain: string[] = [];
  let slug: string | null | undefined = category;
  while (slug && !chain.includes(slug)) {
    chain.push(slug);
    slug = parentOf?.get(slug) ?? null;
  }
  return chain;
}

function applicableRules(label: string, ctx: ValueContext): ValueRule[] {
  const all = ctx.rules.get(label);
  if (!all?.length) return [];
  const chain = categoryChain(ctx.category, ctx.parentOf);
  return all.filter(r => !r.cats || r.cats.some(c => chain.includes(c)));
}

function matchOne(text: string, rules: ValueRule[]): string | null {
  const t = tidy(text);
  for (const r of rules) if (r.aliases.has(t)) return r.value;
  for (const r of rules) if (r.patterns.some(re => re.test(t))) return r.value;
  return null;
}

function matchAll(text: string, rules: ValueRule[]): string[] {
  const t = tidy(text);
  for (const r of rules) if (r.aliases.has(t)) return [r.value];
  return rules.filter(r => r.patterns.some(re => re.test(t))).map(r => r.value);
}

/**
 * Лише канони, що збіглися (без «залишку» вільного тексту). Для ВИВЕДЕННЯ
 * одного лейбла з іншого (напр., «Поверхня» з «Призначення» у фарбах).
 */
export function matchCanonicalValues(label: string, text: string, ctx: ValueContext): string[] {
  const rules = applicableRules(label, ctx);
  if (!rules.length || !text) return [];
  const found: string[] = [];
  for (const part of text.split(';')) {
    for (const v of matchAll(part, rules)) if (!found.includes(v)) found.push(v);
  }
  // порядок — як у довіднику, а не як у тексті
  return rules.map(r => r.value).filter(v => found.includes(v));
}

/**
 * Канонічне значення для лейбла; без правил (або без збігу) повертає значення
 * без змін. category — slug категорії товару: без нього діють лише правила,
 * не прив'язані до категорій.
 */
export function canonicalCharValue(label: string, value: string, ctx: ValueContext): string {
  const v = String(value ?? '').trim();
  if (!v) return v;
  const rules = applicableRules(label, ctx);
  if (!rules.length) return v;

  if (!ctx.multiselect) return matchOne(v, rules) ?? v;

  const out: string[] = [];
  const push = (s: string) => { if (s && !out.some(x => x.toLowerCase() === s.toLowerCase())) out.push(s); };
  for (const raw of v.split(';')) {
    const part = raw.trim();
    if (!part) continue;
    const hits = matchAll(part, rules);
    if (hits.length) hits.forEach(push); else push(part);
  }
  // канони — у порядку довідника, нерозпізнані шматки — після них
  const canon = rules.map(r => r.value).filter(x => out.includes(x));
  const rest = out.filter(x => !canon.includes(x));
  return [...canon, ...rest].join(MULTI_SEP);
}
