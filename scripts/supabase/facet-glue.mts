/**
 * Етап 6 фасетів — родина «Клеї» (GLUE_CATS). Разовий переклад карток після
 * перезаливки словника (seed-char-dictionary):
 *
 *  1. «Тип клею» := product_type картки (виверене власником поле), якщо він є.
 *  2. «Склеювані матеріали» (перелік): виводиться з тексту «Сумісність з
 *     основами» + «Матеріал» + «Область застосування» + «Призначення» +
 *     product_type + назви (лише канони довідника); без збігів — дефолт категорії.
 *     «Матеріал», що містив перелік поверхонь (не матеріал клею), видаляється.
 *  3. «Стан»: канонізація; «готовий до застосування» тощо → з product_type
 *     (суперклей Гель/Рідкий) або дефолт категорії.
 *  4. «Тип використання»: з «Область застосування» («внутрішні роботи»), інакше дефолт.
 *  5. Клас водостійкості / Наявність індикатора / Кількість компонентів — канонізація.
 *  6. product_type для епоксидних (порожній) → «Епоксидний».
 *
 *   npx tsx --env-file=.env.test  scripts/supabase/facet-glue.mts            (dry-run)
 *   npx tsx --env-file=.env.local scripts/supabase/facet-glue.mts --apply
 * Бекап повних наборів змінених товарів — scripts/supabase/backups/facet-glue-*.json.
 */
import fs from 'node:fs';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';
import * as charsNS from '../../lib/characteristics';
import * as valuesNS from '../../lib/char-values';
import { GLUE_CATS } from './char-dictionary.mjs';
const { loadCharDictionary, normalizeChars } = ((charsNS as Record<string, unknown>).default ?? charsNS) as typeof charsNS;
const { canonicalCharValue, matchCanonicalValues, MULTI_SEP } = ((valuesNS as Record<string, unknown>).default ?? valuesNS) as typeof valuesNS;

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

const PRODUCT_TYPE_DEFAULT: Record<string, string> = { 'epoksydni-klei': 'Епоксидний' };

async function main() {
  const dict = await loadCharDictionary(db);
  if (!dict.values.get('Склеювані матеріали')) throw new Error('У characteristic_values немає правил для «Склеювані матеріали» — спершу seed-char-dictionary.mjs');

  const products = await fetchAll<Product>('products', 'sku, name, category_slug, product_type', q => q.in('category_slug', GLUE_CATS));
  const allChars = await fetchAll<Char & { product_sku: string }>('product_characteristics', 'id, product_sku, label, value, sort_order', q => q.in('product_sku', products.map(p => p.sku)));
  const charsOf = new Map<string, Char[]>();
  for (const c of allChars) { if (!charsOf.has(c.product_sku)) charsOf.set(c.product_sku, []); charsOf.get(c.product_sku)!.push(c); }
  const defRows = await fetchAll<{ category_slug: string; default_value: string | null; characteristic_definitions: { label: string } | null }>(
    'category_characteristics', 'category_slug, default_value, characteristic_definitions(label)', q => q.in('category_slug', GLUE_CATS), 'category_slug');
  const defaults = new Map<string, Map<string, string>>();
  for (const r of defRows) {
    if (!r.default_value || !r.characteristic_definitions) continue;
    if (!defaults.has(r.category_slug)) defaults.set(r.category_slug, new Map());
    defaults.get(r.category_slug)!.set(r.characteristic_definitions.label, r.default_value);
  }

  console.log(`БД: ${process.env.NEXT_PUBLIC_SUPABASE_URL}${APPLY ? '' : ' (DRY-RUN)'}\nКлеї: ${GLUE_CATS.length} категорій, ${products.length} товарів`);
  const stats = { matDerived: 0, matDefault: 0, droppedMaterial: 0, stateFromType: 0, stateDefault: 0, useDerived: 0, useDefault: 0, typeFromCard: 0 };
  const changed: { sku: string; before: Char[]; after: Char[] }[] = [];
  const typeFixes: { sku: string; before: string | null; after: string }[] = [];
  const dist = new Map<string, Map<string, number>>();
  const bump = (label: string, value: string) => {
    if (!dist.has(label)) dist.set(label, new Map());
    for (const v of value.split(MULTI_SEP)) dist.get(label)!.set(v, (dist.get(label)!.get(v) ?? 0) + 1);
  };
  const known = (label: string, v: string) => dict.values.get(label)!.some(r => r.value === v);

  for (const p of products) {
    if (!p.product_type && PRODUCT_TYPE_DEFAULT[p.category_slug]) { typeFixes.push({ sku: p.sku, before: null, after: PRODUCT_TYPE_DEFAULT[p.category_slug] }); p.product_type = PRODUCT_TYPE_DEFAULT[p.category_slug]; }
    const before = [...(charsOf.get(p.sku) ?? [])].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0) || (a.id ?? 0) - (b.id ?? 0));
    const ctx = (label: string) => ({ rules: dict.values, category: p.category_slug, parentOf: dict.parentOf, multiselect: dict.multiselect.has(label) });
    const catDefaults = defaults.get(p.category_slug) ?? new Map<string, string>();
    const map = new Map<string, string>();
    for (const c of before) if (!map.has(c.label)) map.set(c.label, c.value);
    const get = (l: string) => map.get(l)?.trim() || null;

    // 1. Тип клею з картки; «Тип» (глобальний лейбл) у клеях — дубль «Типу клею»
    if (p.product_type) { map.set('Тип клею', p.product_type); stats.typeFromCard++; }
    map.delete('Тип');

    // 2. Склеювані матеріали
    const pool = [get('Склеювані матеріали'), get('Сумісність з основами'), get('Матеріал'), get('Область застосування'), get('Призначення'), p.product_type, p.name].filter(Boolean).join('; ');
    const mats = matchCanonicalValues('Склеювані матеріали', pool, ctx('Склеювані матеріали'));
    if (mats.length) { map.set('Склеювані матеріали', mats.join(MULTI_SEP)); stats.matDerived++; }
    else if (catDefaults.get('Склеювані матеріали')) { map.set('Склеювані матеріали', catDefaults.get('Склеювані матеріали')!); stats.matDefault++; }
    // «Матеріал» у клеях: перелік поверхонь (→ уже в «Склеювані матеріали»), фасування
    // («Картридж 380 г» — сміття) або основа клею (акрил, МС-полімер → «Основа»)
    if (get('Матеріал')) {
      const m = get('Матеріал')!;
      if (matchCanonicalValues('Склеювані матеріали', m, ctx('Склеювані матеріали')).length || /картридж|\d+\s*(г|мл|кг)/i.test(m)) { map.delete('Матеріал'); stats.droppedMaterial++; }
      else { if (!get('Основа')) map.set('Основа', m); map.delete('Матеріал'); stats.droppedMaterial++; }
    }

    // 3. Стан
    const stateCanon = get('Стан') ? canonicalCharValue('Стан', get('Стан')!, ctx('Стан')) : null;
    if (!stateCanon || !known('Стан', stateCanon)) {
      const fromType = p.product_type ? canonicalCharValue('Стан', p.product_type, ctx('Стан')) : null;
      if (fromType && known('Стан', fromType)) { map.set('Стан', fromType); stats.stateFromType++; }
      else if (catDefaults.get('Стан')) { map.set('Стан', catDefaults.get('Стан')!); stats.stateDefault++; }
    }

    // 4. Тип використання
    if (!get('Тип використання')) {
      const fromArea = get('Область застосування') ? canonicalCharValue('Тип використання', get('Область застосування')!, ctx('Тип використання')) : null;
      if (fromArea && known('Тип використання', fromArea)) { map.set('Тип використання', fromArea); stats.useDerived++; }
      else if (catDefaults.get('Тип використання')) { map.set('Тип використання', catDefaults.get('Тип використання')!); stats.useDefault++; }
    }

    // 5. інші дефолти обов'язкових фасетів
    for (const label of ['Кількість компонентів', 'Наявність індикатора', 'Клас водостійкості']) {
      if (!get(label) && catDefaults.get(label)) map.set(label, catDefaults.get(label)!);
    }

    const after = normalizeChars([...map].map(([label, value]) => ({ label, value })), dict, p.category_slug);
    for (const c of after) if (dict.values.has(c.label)) bump(c.label, c.value);
    const same = after.length === before.length && after.every((n, i) => n.label === before[i].label && n.value === before[i].value && n.sort_order === before[i].sort_order);
    if (!same) changed.push({ sku: p.sku, before, after });
  }

  console.log(`\nСклеювані матеріали: виведено ${stats.matDerived}, дефолт ${stats.matDefault}; «Матеріал»-перелік видалено ${stats.droppedMaterial}`);
  console.log(`Стан: з типу ${stats.stateFromType}, дефолт ${stats.stateDefault}; Тип використання: виведено ${stats.useDerived}, дефолт ${stats.useDefault}; Тип клею з картки ${stats.typeFromCard}`);
  console.log(`product_type: ${typeFixes.length} виправлень`);
  console.log('\nРозподіл фасетів після чистки:');
  for (const [label, m] of dist) {
    console.log(`  ${label}:`);
    for (const [v, n] of [...m].sort((a, b) => b[1] - a[1])) console.log(`     ${String(n).padStart(4)}  ${v}`);
  }
  console.log(`\nТоварів зі зміненими характеристиками: ${changed.length} із ${products.length}`);
  if (!APPLY) { console.log('DRY-RUN: нічого не записано. Запусти з --apply.'); return; }

  const dir = path.join(process.cwd(), 'scripts', 'supabase', 'backups');
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `facet-glue-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
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
