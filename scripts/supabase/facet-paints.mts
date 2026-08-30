/**
 * Пілот фасетів — родина «Фарби» (farby). Разовий переклад карток на фасети
 * після міграції 105 + seed-char-dictionary:
 *
 *  1. «Умови застосування» → «Тип використання» (дубль-лейбл; якщо є обидва — лишаємо Тип).
 *  2. «Тип використання», якщо порожній: виводимо з тексту «Тип» + назви
 *     («фасадна та інтер'єрна» → обидва), інакше дефолт категорії зі словника.
 *  3. «Поверхня», якщо порожня: виводимо з «Призначення» + «Область застосування»
 *     + «Тип» + назви (лише канони довідника), інакше дефолт категорії.
 *  4. У категоріях із «Поверхня» в стандарті (SURFACE_CATS) видаляємо
 *     «Призначення» і «Область застосування» — їх замінює «Поверхня».
 *  5. Дефолти категорії для порожніх «Основа»/«Розчинник»/«Ефект».
 *  6. Усе через normalizeChars (канонізація значень: Основа 39 → 5, блиск, клас…).
 *  7. products.product_type: NULL → за категорією; «Ґрунтовка» у ґрунт-емалей 3в1
 *     і «Алкідна емаль» в акрилових — виправляємо за назвою.
 *
 * БЕЗ --apply нічого не пише:
 *   npx tsx --env-file=.env.test  scripts/supabase/facet-paints.mts
 *   npx tsx --env-file=.env.local scripts/supabase/facet-paints.mts --apply
 * Бекап повних наборів характеристик змінених товарів і product_type —
 * scripts/supabase/backups/facet-paints-*.json (відкат: delete + insert по sku).
 */
import fs from 'node:fs';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';
import * as charsNS from '../../lib/characteristics';
import * as valuesNS from '../../lib/char-values';
import { SURFACE_CATS } from './char-dictionary.mjs';
const { loadCharDictionary, normalizeChars } = ((charsNS as Record<string, unknown>).default ?? charsNS) as typeof charsNS;
const { canonicalCharValue, matchCanonicalValues, categoryChain, MULTI_SEP } =
  ((valuesNS as Record<string, unknown>).default ?? valuesNS) as typeof valuesNS;

const APPLY = process.argv.includes('--apply');
const FAMILY = 'farby';
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

type Char = { id?: number; label: string; value: string; sort_order?: number };
type Product = { sku: string; name: string; category_slug: string; product_type: string | null };

async function fetchAll<T>(table: string, columns: string, filter?: (q: any) => any, orderBy = 'id'): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += 1000) {
    let q = db.from(table).select(columns).order(orderBy).range(from, from + 999); // ORDER обов'язковий: сторінки без стабільного порядку гублять рядки
    if (filter) q = filter(q);
    const { data, error } = await q;
    if (error) throw new Error(`${table}: ${error.message}`);
    rows.push(...((data ?? []) as T[]));
    if (!data || data.length < 1000) return rows;
  }
}

// product_type за категорією, коли він порожній
const TYPE_BY_CAT: Record<string, string> = {
  'vodoemiulsiyni-interierni': 'Водоемульсійна', 'vodoemiulsiyni-fasadni': 'Водоемульсійна',
  'farby-dlya-radiatoriv': 'Акрилова емаль', 'alkidni-farby': 'Алкідна емаль', 'farby-3v1-alkidni': 'Алкідна емаль',
  'moltkovi-farby': 'Алкідна емаль', 'farby-3v1-akrylovi': 'Акрилова емаль', 'grunty': 'Ґрунтовка', 'laky': 'Лак',
  'koloranty': 'Колорант', 'rozchynnyky': 'Розчинник', 'farby-dlya-pidlohy': 'Для підлоги',
};
function fixProductType(p: Product): string | null {
  const name = p.name.toLowerCase();
  if (!p.product_type) return TYPE_BY_CAT[p.category_slug] ?? null;
  if (/ґрунт-емаль/.test(name)) return 'Ґрунт-емаль 3 в 1';
  if (/акрилов/.test(name) && /алкідн/i.test(p.product_type)) return 'Акрилова емаль';
  return null;
}

async function main() {
  const dict = await loadCharDictionary(db);
  if (!dict.values.size) throw new Error('characteristic_values порожня — спершу seed-char-dictionary.mjs');

  // родина категорій
  const family = new Set<string>();
  for (const slug of dict.parentOf.keys()) if (categoryChain(slug, dict.parentOf).includes(FAMILY)) family.add(slug);
  // і неактивні теж: реактивований товар не має повертати стару форму картки
  const products = (await fetchAll<Product>('products', 'sku, name, category_slug, product_type', q => q.in('category_slug', [...family])));
  const skus = products.map(p => p.sku);
  const allChars = await fetchAll<Char & { product_sku: string }>('product_characteristics', 'id, product_sku, label, value, sort_order', q => q.in('product_sku', skus));
  const charsOf = new Map<string, Char[]>();
  for (const c of allChars) { if (!charsOf.has(c.product_sku)) charsOf.set(c.product_sku, []); charsOf.get(c.product_sku)!.push(c); }

  // дефолти категорій зі словника (single source of truth — category_characteristics)
  const defRows = await fetchAll<{ category_slug: string; default_value: string | null; characteristic_definitions: { label: string } | null }>(
    'category_characteristics', 'category_slug, default_value, characteristic_definitions(label)', q => q.in('category_slug', [...family]), 'category_slug');
  const defaults = new Map<string, Map<string, string>>();
  for (const r of defRows) {
    if (!r.default_value || !r.characteristic_definitions) continue;
    if (!defaults.has(r.category_slug)) defaults.set(r.category_slug, new Map());
    defaults.get(r.category_slug)!.set(r.characteristic_definitions.label, r.default_value);
  }

  console.log(`БД: ${process.env.NEXT_PUBLIC_SUPABASE_URL}${APPLY ? '' : ' (DRY-RUN)'}\nРодина ${FAMILY}: ${family.size} категорій, ${products.length} товарів`);

  const stats = { derivedUse: 0, defaultUse: 0, derivedSurface: 0, defaultSurface: 0, noSurface: [] as string[], droppedPurpose: 0, renamedConditions: 0, defaults: 0 };
  const changed: { sku: string; before: Char[]; after: Char[] }[] = [];
  const typeFixes: { sku: string; before: string | null; after: string }[] = [];
  const dist = new Map<string, Map<string, number>>();
  const bump = (label: string, value: string) => {
    if (!dist.has(label)) dist.set(label, new Map());
    for (const v of value.split(MULTI_SEP)) dist.get(label)!.set(v, (dist.get(label)!.get(v) ?? 0) + 1);
  };

  for (const p of products) {
    const before = [...(charsOf.get(p.sku) ?? [])].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0) || (a.id ?? 0) - (b.id ?? 0));
    const ctx = (label: string) => ({ rules: dict.values, category: p.category_slug, parentOf: dict.parentOf, multiselect: dict.multiselect.has(label) });
    const surfaceCat = SURFACE_CATS.includes(p.category_slug);
    const catDefaults = defaults.get(p.category_slug) ?? new Map<string, string>();

    // робоча мапа label → value (перше входження виграє, як у normalizeChars)
    const map = new Map<string, string>();
    for (const c of before) if (!map.has(c.label)) map.set(c.label, c.value);
    const get = (l: string) => map.get(l)?.trim() || null;

    // 1. Умови застосування → Тип використання
    if (map.has('Умови застосування')) {
      if (!get('Тип використання')) { map.set('Тип використання', map.get('Умови застосування')!); stats.renamedConditions++; }
      map.delete('Умови застосування');
    }
    const textPool = [get('Тип'), p.name, get('Призначення'), get('Область застосування')].filter(Boolean).join('; ');

    // 2. Тип використання
    if (!get('Тип використання')) {
      const derived = canonicalCharValue('Тип використання', textPool, ctx('Тип використання'));
      const known = dict.values.get('Тип використання')!.some(v => v.value === derived);
      if (known) { map.set('Тип використання', derived); stats.derivedUse++; }
      else if (catDefaults.get('Тип використання')) { map.set('Тип використання', catDefaults.get('Тип використання')!); stats.defaultUse++; }
    }

    // 3. Поверхня
    if (surfaceCat && !get('Поверхня')) {
      const derived = matchCanonicalValues('Поверхня', textPool, ctx('Поверхня'));
      if (derived.length) { map.set('Поверхня', derived.join(MULTI_SEP)); stats.derivedSurface++; }
      else if (catDefaults.get('Поверхня')) { map.set('Поверхня', catDefaults.get('Поверхня')!); stats.defaultSurface++; }
      else stats.noSurface.push(`${p.sku} ${p.name}`);
    }

    // 4. Призначення / Область застосування — замінені «Поверхнею»
    if (surfaceCat) {
      if (map.delete('Призначення')) stats.droppedPurpose++;
      map.delete('Область застосування');
    }

    // 5. Дефолти для порожніх фасетів
    for (const label of ['Основа', 'Розчинник', 'Ефект']) {
      if (!get(label) && catDefaults.get(label)) { map.set(label, catDefaults.get(label)!); stats.defaults++; }
    }

    // 6. normalizeChars — канонізація значень + порядок
    const after = normalizeChars([...map].map(([label, value]) => ({ label, value })), dict, p.category_slug);
    for (const c of after) if (dict.values.has(c.label)) bump(c.label, c.value);

    const same = after.length === before.length && after.every((n, i) => n.label === before[i].label && n.value === before[i].value && n.sort_order === before[i].sort_order);
    if (!same) changed.push({ sku: p.sku, before, after });

    const t = fixProductType(p);
    if (t && t !== p.product_type) typeFixes.push({ sku: p.sku, before: p.product_type, after: t });
  }

  console.log(`\nТип використання: виведено ${stats.derivedUse}, дефолт ${stats.defaultUse}; Умови→Тип: ${stats.renamedConditions}`);
  console.log(`Поверхня: виведено ${stats.derivedSurface}, дефолт ${stats.defaultSurface}, без значення ${stats.noSurface.length}`);
  for (const s of stats.noSurface) console.log(`   ? ${s}`);
  console.log(`Призначення видалено: ${stats.droppedPurpose}; дефолти Основа/Розчинник/Ефект: ${stats.defaults}`);
  console.log(`\nРозподіл фасетів після чистки:`);
  for (const [label, m] of dist) {
    console.log(`  ${label}:`);
    for (const [v, n] of [...m].sort((a, b) => b[1] - a[1])) console.log(`     ${String(n).padStart(4)}  ${v}`);
  }
  console.log(`\nproduct_type: ${typeFixes.length} виправлень`);
  for (const f of typeFixes) console.log(`   ${f.sku}: ${f.before ?? '∅'} → ${f.after}`);
  console.log(`\nТоварів зі зміненими характеристиками: ${changed.length} із ${products.length}`);

  if (!APPLY) { console.log('\nDRY-RUN: нічого не записано. Запусти з --apply.'); return; }

  const dir = path.join(process.cwd(), 'scripts', 'supabase', 'backups');
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `facet-paints-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
  fs.writeFileSync(file, JSON.stringify({ chars: changed.map(c => ({ sku: c.sku, before: c.before })), product_type: typeFixes }, null, 1));
  console.log(`бекап: ${file}`);

  for (const c of changed) {
    const { error: delErr } = await db.from('product_characteristics').delete().eq('product_sku', c.sku);
    if (delErr) throw new Error(`${c.sku} delete: ${delErr.message}`);
    const { error: insErr } = await db.from('product_characteristics').insert(c.after.map(x => ({ product_sku: c.sku, label: x.label, value: x.value, sort_order: x.sort_order })));
    if (insErr) throw new Error(`${c.sku} insert: ${insErr.message}`);
  }
  for (const f of typeFixes) {
    const { error } = await db.from('products').update({ product_type: f.after }).eq('sku', f.sku);
    if (error) throw new Error(`${f.sku} product_type: ${error.message}`);
  }
  console.log(`записано: ${changed.length} товарів, ${typeFixes.length} product_type`);
}

main().catch(e => { console.error(e); process.exit(1); });
