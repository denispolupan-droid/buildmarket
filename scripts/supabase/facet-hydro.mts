/**
 * Етап 9 фасетів — родина «Гідроізоляція» (HYDRO_CATS). Разовий переклад карток
 * після перезаливки словника (seed-char-dictionary):
 *  1. «Тип» := product_type картки (по одному на категорію — виверено).
 *  2. «Основа» — канонізація (бітумно-каучукова / бітумна / акрилова / полімерна /
 *     цементна); у стрічок «Основа» — матеріал полотна, не чіпаємо.
 *  3. «Призначення» — канонізація до закритого списку родини; дефолт категорії.
 *  4. Температури «35» / «5» без знаку → «+35 °C» / «+5 °C»; «Витрата матеріалу»
 *     з голим числом без одиниць — сміття, видаляється.
 *  5. «Стан» — дубль «Консистенції», видаляється.
 *
 *   npx tsx --env-file=.env.test  scripts/supabase/facet-hydro.mts            (dry-run)
 *   npx tsx --env-file=.env.local scripts/supabase/facet-hydro.mts --apply
 * Бекап — scripts/supabase/backups/facet-hydro-*.json.
 */
import fs from 'node:fs';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';
import * as charsNS from '../../lib/characteristics';
import * as valuesNS from '../../lib/char-values';
import { HYDRO_CATS } from './char-dictionary.mjs';
const { loadCharDictionary, normalizeChars } = ((charsNS as Record<string, unknown>).default ?? charsNS) as typeof charsNS;
const { canonicalCharValue } = ((valuesNS as Record<string, unknown>).default ?? valuesNS) as typeof valuesNS;

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

async function main() {
  const dict = await loadCharDictionary(db);
  if (!dict.values.get('Призначення')!.some(v => v.value === 'Ґрунтування перед гідроізоляцією')) throw new Error('Немає правил родини — спершу seed-char-dictionary.mjs');

  const products = await fetchAll<Product>('products', 'sku, name, category_slug, product_type', q => q.in('category_slug', HYDRO_CATS));
  const allChars = await fetchAll<Char & { product_sku: string }>('product_characteristics', 'id, product_sku, label, value, sort_order', q => q.in('product_sku', products.map(p => p.sku)));
  const charsOf = new Map<string, Char[]>();
  for (const c of allChars) { if (!charsOf.has(c.product_sku)) charsOf.set(c.product_sku, []); charsOf.get(c.product_sku)!.push(c); }
  const defRows = await fetchAll<{ category_slug: string; default_value: string | null; characteristic_definitions: { label: string } | null }>(
    'category_characteristics', 'category_slug, default_value, characteristic_definitions(label)', q => q.in('category_slug', HYDRO_CATS), 'category_slug');
  const defaults = new Map<string, Map<string, string>>();
  for (const r of defRows) {
    if (!r.default_value || !r.characteristic_definitions) continue;
    if (!defaults.has(r.category_slug)) defaults.set(r.category_slug, new Map());
    defaults.get(r.category_slug)!.set(r.characteristic_definitions.label, r.default_value);
  }

  console.log(`БД: ${process.env.NEXT_PUBLIC_SUPABASE_URL}${APPLY ? '' : ' (DRY-RUN)'}\nГідроізоляція: ${HYDRO_CATS.length} категорій, ${products.length} товарів`);
  const changed: { sku: string; before: Char[]; after: Char[] }[] = [];
  const dist = new Map<string, Map<string, number>>();
  const bump = (label: string, value: string) => {
    if (!dist.has(label)) dist.set(label, new Map());
    dist.get(label)!.set(value, (dist.get(label)!.get(value) ?? 0) + 1);
  };
  const known = (label: string, v: string | null) => !!v && dict.values.get(label)!.some(r => r.value === v);

  for (const p of products) {
    const before = [...(charsOf.get(p.sku) ?? [])].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0) || (a.id ?? 0) - (b.id ?? 0));
    const ctx = (label: string) => ({ rules: dict.values, category: p.category_slug, parentOf: dict.parentOf, multiselect: dict.multiselect.has(label) });
    const catDefaults = defaults.get(p.category_slug) ?? new Map<string, string>();
    const map = new Map<string, string>();
    for (const c of before) if (!map.has(c.label)) map.set(c.label, c.value);
    const get = (l: string) => map.get(l)?.trim() || null;

    if (p.product_type) map.set('Тип', p.product_type);

    // Призначення: канон/дефолт
    const canonPurpose = get('Призначення') ? canonicalCharValue('Призначення', get('Призначення')!, ctx('Призначення')) : null;
    if (known('Призначення', canonPurpose)) map.set('Призначення', canonPurpose!);
    else if (catDefaults.get('Призначення')) map.set('Призначення', catDefaults.get('Призначення')!);

    // Температури без знаку/одиниці
    for (const [label, plus] of [['Мінімальна температура застосування', '+'], ['Максимальна температура застосування', '+']] as const) {
      const v = get(label);
      if (v && /^-?\d+$/.test(v)) map.set(label, `${v.startsWith('-') ? '' : plus}${v} °C`);
    }
    // Витрата з голим числом — сміття
    if (get('Витрата матеріалу') && /^\d+([.,]\d+)?$/.test(get('Витрата матеріалу')!)) map.delete('Витрата матеріалу');
    // Стан — дубль Консистенції
    if (get('Консистенція')) map.delete('Стан');

    for (const label of ['Тип використання']) {
      if (!get(label) && catDefaults.get(label)) map.set(label, catDefaults.get(label)!);
    }

    const after = normalizeChars([...map].map(([label, value]) => ({ label, value })), dict, p.category_slug);
    for (const c of after) if (dict.values.has(c.label) || c.label === 'Тип') bump(c.label, c.value);
    const same = after.length === before.length && after.every((n, i) => n.label === before[i].label && n.value === before[i].value && n.sort_order === before[i].sort_order);
    if (!same) changed.push({ sku: p.sku, before, after });
  }

  console.log('\nРозподіл фасетів після чистки:');
  for (const [label, m] of dist) {
    console.log(`  ${label}:`);
    for (const [v, n] of [...m].sort((a, b) => b[1] - a[1])) console.log(`     ${String(n).padStart(4)}  ${v}`);
  }
  console.log(`\nТоварів зі зміненими характеристиками: ${changed.length} із ${products.length}`);
  if (!APPLY) { console.log('DRY-RUN: нічого не записано. Запусти з --apply.'); return; }

  const dir = path.join(process.cwd(), 'scripts', 'supabase', 'backups');
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `facet-hydro-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
  fs.writeFileSync(file, JSON.stringify({ chars: changed.map(c => ({ sku: c.sku, before: c.before })) }, null, 1));
  console.log(`бекап: ${file}`);
  for (const c of changed) {
    const { error: d } = await db.from('product_characteristics').delete().eq('product_sku', c.sku);
    if (d) throw new Error(`${c.sku} delete: ${d.message}`);
    const { error: i } = await db.from('product_characteristics').insert(c.after.map(x => ({ product_sku: c.sku, label: x.label, value: x.value, sort_order: x.sort_order })));
    if (i) throw new Error(`${c.sku} insert: ${i.message}`);
  }
  console.log(`записано: ${changed.length} товарів`);
}
main().catch(e => { console.error(e); process.exit(1); });
