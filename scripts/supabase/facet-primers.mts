/**
 * Етап 7 фасетів — родина «Ґрунтовки та шпаклівки» (PRIMER_CATS).
 * Разовий переклад карток після перезаливки словника (seed-char-dictionary):
 *
 *  1. «Тип» (характеристика, 39 формулювань) := product_type картки; точкові
 *     виправлення типів (рішення власника 30.08): AQUASTOP Bio «Антисептична» →
 *     «Антигрибковий», «Змивка висолів» — окремий тип, шпаклівкам типи з назв.
 *  2. «Форма»: Готова до застосування / Концентрат — з product_type
 *     («Ґрунт-концентрат»), «Розведення» в картці або дефолт категорії.
 *  3. «Призначення»: канонізація за родинними правилами (адгезія, цвіль,
 *     висоли, зміцнення); нерозпізнане → виведення з назви/типу → дефолт.
 *  4. Дефолти: Основа, Розчинник, Тип використання, Колір (шпаклівки).
 *
 *   npx tsx --env-file=.env.test  scripts/supabase/facet-primers.mts            (dry-run)
 *   npx tsx --env-file=.env.local scripts/supabase/facet-primers.mts --apply
 * Бекап — scripts/supabase/backups/facet-primers-*.json.
 */
import fs from 'node:fs';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';
import * as charsNS from '../../lib/characteristics';
import * as valuesNS from '../../lib/char-values';
import { PRIMER_CATS } from './char-dictionary.mjs';
const { loadCharDictionary, normalizeChars } = ((charsNS as Record<string, unknown>).default ?? charsNS) as typeof charsNS;
const { canonicalCharValue, matchCanonicalValues, MULTI_SEP } = ((valuesNS as Record<string, unknown>).default ?? valuesNS) as typeof valuesNS;
void MULTI_SEP;

const APPLY = process.argv.includes('--apply');
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

type Char = { id?: number; label: string; value: string; sort_order?: number };
type Product = { sku: string; name: string; category_slug: string; product_type: string | null };

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

// Точкові виправлення product_type (рішення власника 30.08)
const PRODUCT_TYPE_FIXES: Record<string, string> = {
  '1509-001': 'Антигрибковий', '1509-002': 'Антигрибковий',   // AQUASTOP Bio «Антисептична» → злито з антигрибковим
  '1203-029': 'Змивка висолів',                                // Дивоцвіт «Змивка висолів» — не ґрунтовка за типом
  '1205-015': 'Фінішна', '1205-021': 'Фінішна',                // шпаклівки без типу
  '1205-023': 'Для дерева', '1205-024': 'Для дерева',
};

async function main() {
  const dict = await loadCharDictionary(db);
  if (!dict.values.get('Форма')) throw new Error('У characteristic_values немає правил для «Форма» — спершу seed-char-dictionary.mjs');

  const products = await fetchAll<Product>('products', 'sku, name, category_slug, product_type', q => q.in('category_slug', PRIMER_CATS));
  const allChars = await fetchAll<Char & { product_sku: string }>('product_characteristics', 'id, product_sku, label, value, sort_order', q => q.in('product_sku', products.map(p => p.sku)));
  const charsOf = new Map<string, Char[]>();
  for (const c of allChars) { if (!charsOf.has(c.product_sku)) charsOf.set(c.product_sku, []); charsOf.get(c.product_sku)!.push(c); }
  const defRows = await fetchAll<{ category_slug: string; default_value: string | null; characteristic_definitions: { label: string } | null }>(
    'category_characteristics', 'category_slug, default_value, characteristic_definitions(label)', q => q.in('category_slug', PRIMER_CATS), 'category_slug');
  const defaults = new Map<string, Map<string, string>>();
  for (const r of defRows) {
    if (!r.default_value || !r.characteristic_definitions) continue;
    if (!defaults.has(r.category_slug)) defaults.set(r.category_slug, new Map());
    defaults.get(r.category_slug)!.set(r.characteristic_definitions.label, r.default_value);
  }

  console.log(`БД: ${process.env.NEXT_PUBLIC_SUPABASE_URL}${APPLY ? '' : ' (DRY-RUN)'}\nҐрунтовки/шпаклівки: ${PRIMER_CATS.length} категорій, ${products.length} товарів`);
  const stats = { formFromData: 0, formDefault: 0, purposeDerived: 0, purposeDefault: 0, defaults: 0 };
  const changed: { sku: string; before: Char[]; after: Char[] }[] = [];
  const typeFixes: { sku: string; before: string | null; after: string }[] = [];
  const dist = new Map<string, Map<string, number>>();
  const bump = (label: string, value: string) => {
    if (!dist.has(label)) dist.set(label, new Map());
    dist.get(label)!.set(value, (dist.get(label)!.get(value) ?? 0) + 1);
  };
  const known = (label: string, v: string | null) => !!v && dict.values.get(label)!.some(r => r.value === v);

  for (const p of products) {
    if (PRODUCT_TYPE_FIXES[p.sku] && PRODUCT_TYPE_FIXES[p.sku] !== p.product_type) { typeFixes.push({ sku: p.sku, before: p.product_type, after: PRODUCT_TYPE_FIXES[p.sku] }); p.product_type = PRODUCT_TYPE_FIXES[p.sku]; }
    const before = [...(charsOf.get(p.sku) ?? [])].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0) || (a.id ?? 0) - (b.id ?? 0));
    const ctx = (label: string) => ({ rules: dict.values, category: p.category_slug, parentOf: dict.parentOf, multiselect: dict.multiselect.has(label) });
    const catDefaults = defaults.get(p.category_slug) ?? new Map<string, string>();
    const map = new Map<string, string>();
    for (const c of before) if (!map.has(c.label)) map.set(c.label, c.value);
    const get = (l: string) => map.get(l)?.trim() || null;

    // 1. Тип := product_type
    if (p.product_type) map.set('Тип', p.product_type);

    // 2. Форма (не для шпаклівок)
    if (p.category_slug !== 'shpaklivky' && !known('Форма', get('Форма'))) {
      const pool = [p.product_type, get('Розведення') ? 'розводиться' : null, p.name].filter(Boolean).join('; ');
      const derived = canonicalCharValue('Форма', pool, ctx('Форма'));
      if (known('Форма', derived)) { map.set('Форма', derived); stats.formFromData++; }
      else if (catDefaults.get('Форма')) { map.set('Форма', catDefaults.get('Форма')!); stats.formDefault++; }
    }

    // 3. Призначення — закритий список родини
    const cur = get('Призначення');
    const canonCur = cur ? canonicalCharValue('Призначення', cur, ctx('Призначення')) : null;
    if (!known('Призначення', canonCur)) {
      const derived = matchCanonicalValues('Призначення', [cur, p.product_type, p.name].filter(Boolean).join('; '), ctx('Призначення'));
      if (derived.length) { map.set('Призначення', derived[0]); stats.purposeDerived++; }
      else if (catDefaults.get('Призначення')) { map.set('Призначення', catDefaults.get('Призначення')!); stats.purposeDefault++; }
    }

    // 3b. Дублі: «Матеріал» = основа; «Стан» = форма; «Область застосування» = тип використання
    if (get('Матеріал')) { if (!get('Основа')) map.set('Основа', get('Матеріал')!); map.delete('Матеріал'); }
    if (get('Стан')) { if (!known('Форма', get('Форма')) && known('Форма', canonicalCharValue('Форма', get('Стан')!, ctx('Форма')))) map.set('Форма', canonicalCharValue('Форма', get('Стан')!, ctx('Форма'))); map.delete('Стан'); }
    if (get('Область застосування')) {
      const u = canonicalCharValue('Тип використання', get('Область застосування')!, ctx('Тип використання'));
      if (!get('Тип використання') && known('Тип використання', u)) map.set('Тип використання', u);
      map.delete('Область застосування');
    }

    // 4. Дефолти
    for (const label of ['Основа', 'Розчинник', 'Тип використання', 'Колір']) {
      if (!get(label) && catDefaults.get(label)) { map.set(label, catDefaults.get(label)!); stats.defaults++; }
    }

    const after = normalizeChars([...map].map(([label, value]) => ({ label, value })), dict, p.category_slug);
    for (const c of after) if (dict.values.has(c.label) || c.label === 'Тип') bump(c.label, c.value);
    const same = after.length === before.length && after.every((n, i) => n.label === before[i].label && n.value === before[i].value && n.sort_order === before[i].sort_order);
    if (!same) changed.push({ sku: p.sku, before, after });
  }

  console.log(`\nФорма: з даних ${stats.formFromData}, дефолт ${stats.formDefault}; Призначення: виведено ${stats.purposeDerived}, дефолт ${stats.purposeDefault}; інші дефолти ${stats.defaults}`);
  console.log(`product_type: ${typeFixes.length} виправлень${typeFixes.map(f => `\n   ${f.sku}: ${f.before ?? '∅'} → ${f.after}`).join('')}`);
  console.log('\nРозподіл фасетів після чистки:');
  for (const [label, m] of dist) {
    console.log(`  ${label}:`);
    for (const [v, n] of [...m].sort((a, b) => b[1] - a[1])) console.log(`     ${String(n).padStart(4)}  ${v}`);
  }
  console.log(`\nТоварів зі зміненими характеристиками: ${changed.length} із ${products.length}`);
  if (!APPLY) { console.log('DRY-RUN: нічого не записано. Запусти з --apply.'); return; }

  const dir = path.join(process.cwd(), 'scripts', 'supabase', 'backups');
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `facet-primers-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
  fs.writeFileSync(file, JSON.stringify({ chars: changed.map(c => ({ sku: c.sku, before: c.before })), product_type: typeFixes }, null, 1));
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
