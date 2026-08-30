/**
 * Етап 4 фасетів — родина «Герметики» (SEALANT_CATS, без герметизуючої нитки).
 * Разовий переклад карток після перезаливки словника (seed-char-dictionary):
 *
 *  1. «Матеріал» — канонізується (21 формулювання → 7); якщо порожній — з «Основа»
 *     або дефолт категорії. «Основа» у герметиках — дубль «Матеріалу», видаляється.
 *  2. «Область застосування» → закритий перелік: виводиться з тексту «Область
 *     застосування» + «Тип герметика» + product_type + назви (лише канони);
 *     без збігів — дефолт категорії або старий текст. «Тип герметика» видаляється.
 *  3. «Форма випуску»: блістер/туба/відро/картридж — з назви й фасування.
 *  4. Дефолти категорії для порожніх «Під фарбування»/«Тип використання».
 *  5. Усе через normalizeChars (канонізація значень, порядок).
 *
 *   npx tsx --env-file=.env.test  scripts/supabase/facet-sealants.mts            (dry-run)
 *   npx tsx --env-file=.env.local scripts/supabase/facet-sealants.mts --apply
 * Бекап повних наборів змінених товарів — scripts/supabase/backups/facet-sealants-*.json.
 */
import fs from 'node:fs';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';
import * as charsNS from '../../lib/characteristics';
import * as valuesNS from '../../lib/char-values';
import { SEALANT_CATS } from './char-dictionary.mjs';

// «Тип» картки (products.product_type) — виверене власником поле; «Область
// застосування» виводиться з нього, а не з вільного тексту характеристик.
const TYPE_TO_AREA: Record<string, string> = {
  'Санітарний': 'Санітарний', 'Універсальний': 'Універсальний', 'Клей-герметик': 'Універсальний',
  'Для покрівлі': 'Покрівля', 'Для монтажних швів': 'Монтажні шви', 'Для деформаційних швів': 'Монтажні шви',
  'Для дерева': 'Дерево', 'Для кольорових швів': 'Санітарний', 'Термостійкий': 'Печі та каміни',
};
// Точкові виправлення product_type (рішення власника 30.08)
const PRODUCT_TYPE_FIXES: Record<string, string> = {
  '1000-001': 'Для покрівлі',        // Bitugum стиковий — це покрівельний герметик, не «для стиків панелей»
  '1001-001': 'Універсальний',       // Ceresit CS 11 — універсальний, не «фасадний»
  '1001-002': 'Для монтажних швів', '1001-003': 'Для монтажних швів', '1001-004': 'Для монтажних швів', // Lacrysil «зовні приміщень А»
  '1005-001': 'Термостійкий', '1000-002': 'Термостійкий',
};
const AREA_CATS = [...SEALANT_CATS, 'nytka-dlya-trub'];
const { loadCharDictionary, normalizeChars } = ((charsNS as Record<string, unknown>).default ?? charsNS) as typeof charsNS;
const { canonicalCharValue, matchCanonicalValues, MULTI_SEP } = ((valuesNS as Record<string, unknown>).default ?? valuesNS) as typeof valuesNS;

const APPLY = process.argv.includes('--apply');
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

type Char = { id?: number; label: string; value: string; sort_order?: number };
type Product = { sku: string; name: string; category_slug: string; product_type: string | null; volume: string | null };

async function fetchAll<T>(table: string, columns: string, filter?: (q: any) => any, orderBy = 'id'): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += 1000) {
    let q = db.from(table).select(columns).order(orderBy).range(from, from + 999); // ORDER обов'язковий: без нього сторінки гублять рядки
    if (filter) q = filter(q);
    const { data, error } = await q;
    if (error) throw new Error(`${table}: ${error.message}`);
    rows.push(...((data ?? []) as T[]));
    if (!data || data.length < 1000) return rows;
  }
}

/** Форма випуску з назви/фасування: блістер → Блістер; ≥1 кг → Відро; <200 г/мл → Туба; інакше Картридж. */
function packagingOf(p: Product): string {
  const name = p.name.toLowerCase();
  if (/блістер/.test(name)) return 'Блістер';
  const vol = (p.volume ?? name).toLowerCase().replace(',', '.');
  const kg = vol.match(/(\d+(?:\.\d+)?)\s*кг/);
  if (kg && parseFloat(kg[1]) >= 1) return 'Відро';
  const g = vol.match(/(\d+(?:\.\d+)?)\s*(г|мл)\b/);
  const l = vol.match(/(\d+(?:\.\d+)?)\s*л\b/);
  const amount = g ? parseFloat(g[1]) : l ? parseFloat(l[1]) * 1000 : kg ? parseFloat(kg[1]) * 1000 : NaN;
  if (!isNaN(amount) && amount < 200) return 'Туба';
  return 'Картридж';
}

async function main() {
  const dict = await loadCharDictionary(db);
  if (!dict.values.get('Матеріал')) throw new Error('У characteristic_values немає правил для «Матеріал» — спершу seed-char-dictionary.mjs');

  const products = await fetchAll<Product>('products', 'sku, name, category_slug, product_type, volume', q => q.in('category_slug', AREA_CATS));
  const allChars = await fetchAll<Char & { product_sku: string }>('product_characteristics', 'id, product_sku, label, value, sort_order', q => q.in('product_sku', products.map(p => p.sku)));
  const charsOf = new Map<string, Char[]>();
  for (const c of allChars) { if (!charsOf.has(c.product_sku)) charsOf.set(c.product_sku, []); charsOf.get(c.product_sku)!.push(c); }

  const defRows = await fetchAll<{ category_slug: string; default_value: string | null; characteristic_definitions: { label: string } | null }>(
    'category_characteristics', 'category_slug, default_value, characteristic_definitions(label)', q => q.in('category_slug', SEALANT_CATS), 'category_slug');
  const defaults = new Map<string, Map<string, string>>();
  for (const r of defRows) {
    if (!r.default_value || !r.characteristic_definitions) continue;
    if (!defaults.has(r.category_slug)) defaults.set(r.category_slug, new Map());
    defaults.get(r.category_slug)!.set(r.characteristic_definitions.label, r.default_value);
  }

  console.log(`БД: ${process.env.NEXT_PUBLIC_SUPABASE_URL}${APPLY ? '' : ' (DRY-RUN)'}\nГерметики: ${SEALANT_CATS.length} категорій, ${products.length} товарів`);
  const stats = { areaFromType: 0, areaDerived: 0, areaDefault: 0, areaKept: [] as string[], materialFromBase: 0, materialDefault: 0, droppedBase: 0, droppedType: 0, packaging: 0, defaults: 0 };
  const changed: { sku: string; before: Char[]; after: Char[] }[] = [];
  const typeFixes: { sku: string; before: string | null; after: string }[] = [];
  const dist = new Map<string, Map<string, number>>();
  const bump = (label: string, value: string) => {
    if (!dist.has(label)) dist.set(label, new Map());
    for (const v of value.split(MULTI_SEP)) dist.get(label)!.set(v, (dist.get(label)!.get(v) ?? 0) + 1);
  };

  for (const p of products) {
    if (PRODUCT_TYPE_FIXES[p.sku] && PRODUCT_TYPE_FIXES[p.sku] !== p.product_type) {
      typeFixes.push({ sku: p.sku, before: p.product_type, after: PRODUCT_TYPE_FIXES[p.sku] });
      p.product_type = PRODUCT_TYPE_FIXES[p.sku];
    }
    const isSealant = SEALANT_CATS.includes(p.category_slug);
    const before = [...(charsOf.get(p.sku) ?? [])].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0) || (a.id ?? 0) - (b.id ?? 0));
    const ctx = (label: string) => ({ rules: dict.values, category: p.category_slug, parentOf: dict.parentOf, multiselect: dict.multiselect.has(label) });
    const catDefaults = defaults.get(p.category_slug) ?? new Map<string, string>();
    const map = new Map<string, string>();
    for (const c of before) if (!map.has(c.label)) map.set(c.label, c.value);
    const get = (l: string) => map.get(l)?.trim() || null;

    // 1. Матеріал (лише герметики)
    if (isSealant && !get('Матеріал')) {
      const fromBase = get('Основа') ? canonicalCharValue('Матеріал', get('Основа')!, ctx('Матеріал')) : null;
      const known = fromBase && dict.values.get('Матеріал')!.some(v => v.value === fromBase);
      if (known) { map.set('Матеріал', fromBase!); stats.materialFromBase++; }
      else if (catDefaults.get('Матеріал')) { map.set('Матеріал', catDefaults.get('Матеріал')!); stats.materialDefault++; }
    }
    if (isSealant && map.delete('Основа')) stats.droppedBase++;

    // 2. Область застосування — закритий перелік: спершу з «Типу» картки, інакше з назви/тексту
    const fromType = p.product_type && TYPE_TO_AREA[p.product_type];
    const pool = [get('Тип герметика'), p.name, get('Область застосування')].filter(Boolean).join('; ');
    const derived = fromType ? [fromType] : matchCanonicalValues('Область застосування', pool, ctx('Область застосування'));
    if (fromType) stats.areaFromType++;
    if (derived.length) { map.set('Область застосування', derived.join(MULTI_SEP)); if (!fromType) stats.areaDerived++; }
    else if (catDefaults.get('Область застосування')) { map.set('Область застосування', catDefaults.get('Область застосування')!); stats.areaDefault++; }
    else if (get('Область застосування')) stats.areaKept.push(`${p.sku} «${get('Область застосування')}»`);
    if (map.delete('Тип герметика')) stats.droppedType++;

    // 3. Форма випуску (лише герметики)
    if (isSealant && !get('Форма випуску')) { map.set('Форма випуску', packagingOf(p)); stats.packaging++; }

    // 4. Дефолти
    for (const label of isSealant ? ['Під фарбування', 'Тип використання', 'Колір'] : []) {
      if (!get(label) && catDefaults.get(label)) { map.set(label, catDefaults.get(label)!); stats.defaults++; }
    }

    const after = normalizeChars([...map].map(([label, value]) => ({ label, value })), dict, p.category_slug);
    for (const c of after) if (dict.values.has(c.label)) bump(c.label, c.value);
    const same = after.length === before.length && after.every((n, i) => n.label === before[i].label && n.value === before[i].value && n.sort_order === before[i].sort_order);
    if (!same) changed.push({ sku: p.sku, before, after });
  }

  console.log(`\nМатеріал: з «Основа» ${stats.materialFromBase}, дефолт ${stats.materialDefault}; «Основа» видалено ${stats.droppedBase}, «Тип герметика» видалено ${stats.droppedType}`);
  console.log(`Область застосування: з «Типу» ${stats.areaFromType}, з тексту ${stats.areaDerived}, дефолт ${stats.areaDefault}, лишено як є ${stats.areaKept.length}`);
  console.log(`product_type: ${typeFixes.length} виправлень${typeFixes.map(f => `
   ${f.sku}: ${f.before ?? '∅'} → ${f.after}`).join('')}`);
  for (const s of stats.areaKept) console.log(`   ? ${s}`);
  console.log(`Форма випуску проставлено: ${stats.packaging}; інші дефолти: ${stats.defaults}`);
  console.log('\nРозподіл фасетів після чистки:');
  for (const [label, m] of dist) {
    console.log(`  ${label}:`);
    for (const [v, n] of [...m].sort((a, b) => b[1] - a[1])) console.log(`     ${String(n).padStart(4)}  ${v}`);
  }
  console.log(`\nТоварів зі зміненими характеристиками: ${changed.length} із ${products.length}`);
  if (!APPLY) { console.log('DRY-RUN: нічого не записано. Запусти з --apply.'); return; }

  const dir = path.join(process.cwd(), 'scripts', 'supabase', 'backups');
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `facet-sealants-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
  fs.writeFileSync(file, JSON.stringify({ chars: changed.map(c => ({ sku: c.sku, before: c.before })) }, null, 1));
  console.log(`бекап: ${file}`);
  for (const c of changed) {
    const { error: d } = await db.from('product_characteristics').delete().eq('product_sku', c.sku);
    if (d) throw new Error(`${c.sku} delete: ${d.message}`);
    const { error: i } = await db.from('product_characteristics').insert(c.after.map(x => ({ product_sku: c.sku, label: x.label, value: x.value, sort_order: x.sort_order })));
    if (i) throw new Error(`${c.sku} insert: ${i.message}`);
  }
  for (const f of typeFixes) {
    const { error } = await db.from('products').update({ product_type: f.after }).eq('sku', f.sku);
    if (error) throw new Error(`${f.sku} product_type: ${error.message}`);
  }
  console.log(`записано: ${changed.length} товарів, ${typeFixes.length} product_type`);
}
main().catch(e => { console.error(e); process.exit(1); });
