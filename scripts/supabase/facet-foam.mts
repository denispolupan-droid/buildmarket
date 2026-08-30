/**
 * Етап 5 фасетів — родина «Монтажна піна» (FOAM_CATS, без очисників).
 * Разовий переклад карток після перезаливки словника (seed-char-dictionary):
 *
 *  1. «Тип» (характеристика) і products.product_type = підкатегорія
 *     (Пістолетна / Побутова / Піна-клей / Вогнестійка) — фільтр «Тип» рівня родини.
 *  2. «Спосіб випуску з балона»: канонізація (професійний пістолет → Під пістолет,
 *     трубка-адаптер → Трубка-адаптер); якщо порожньо — з назви («професійна» /
 *     «побутова») або дефолт категорії.
 *  3. «Сезон»: з назви («зимня» → Зимова), інакше канонізація / дефолт Всесезонна.
 *  4. «Вихід піни»: діапазон із числа («до 45-50 л» → 40–50 л).
 *  5. «Основа» (усюди «Поліуретанова») лишається як характеристика, не фільтр.
 *
 *   npx tsx --env-file=.env.test  scripts/supabase/facet-foam.mts            (dry-run)
 *   npx tsx --env-file=.env.local scripts/supabase/facet-foam.mts --apply
 * Бекап повних наборів змінених товарів — scripts/supabase/backups/facet-foam-*.json.
 */
import fs from 'node:fs';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';
import * as charsNS from '../../lib/characteristics';
import * as valuesNS from '../../lib/char-values';
import { FOAM_CATS } from './char-dictionary.mjs';
const { loadCharDictionary, normalizeChars } = ((charsNS as Record<string, unknown>).default ?? charsNS) as typeof charsNS;
const { canonicalCharValue, MULTI_SEP } = ((valuesNS as Record<string, unknown>).default ?? valuesNS) as typeof valuesNS;

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

const TYPE_BY_CAT: Record<string, string> = {
  'pistoletna-pina': 'Пістолетна', 'pobutova-pina': 'Побутова', 'pina-klei': 'Піна-клей', 'vohnezakhysna-pina': 'Вогнестійка',
};

async function main() {
  const dict = await loadCharDictionary(db);
  if (!dict.values.get('Сезон')) throw new Error('У characteristic_values немає правил для «Сезон» — спершу seed-char-dictionary.mjs');

  const products = await fetchAll<Product>('products', 'sku, name, category_slug, product_type', q => q.in('category_slug', FOAM_CATS));
  const allChars = await fetchAll<Char & { product_sku: string }>('product_characteristics', 'id, product_sku, label, value, sort_order', q => q.in('product_sku', products.map(p => p.sku)));
  const charsOf = new Map<string, Char[]>();
  for (const c of allChars) { if (!charsOf.has(c.product_sku)) charsOf.set(c.product_sku, []); charsOf.get(c.product_sku)!.push(c); }
  const defRows = await fetchAll<{ category_slug: string; default_value: string | null; characteristic_definitions: { label: string } | null }>(
    'category_characteristics', 'category_slug, default_value, characteristic_definitions(label)', q => q.in('category_slug', FOAM_CATS), 'category_slug');
  const defaults = new Map<string, Map<string, string>>();
  for (const r of defRows) {
    if (!r.default_value || !r.characteristic_definitions) continue;
    if (!defaults.has(r.category_slug)) defaults.set(r.category_slug, new Map());
    defaults.get(r.category_slug)!.set(r.characteristic_definitions.label, r.default_value);
  }

  console.log(`БД: ${process.env.NEXT_PUBLIC_SUPABASE_URL}${APPLY ? '' : ' (DRY-RUN)'}\nПіна: ${FOAM_CATS.length} категорій, ${products.length} товарів`);
  const stats = { dispenseFromName: 0, dispenseDefault: 0, seasonFromName: 0, defaults: 0, outputKept: [] as string[] };
  const changed: { sku: string; before: Char[]; after: Char[] }[] = [];
  const typeFixes: { sku: string; before: string | null; after: string }[] = [];
  const dist = new Map<string, Map<string, number>>();
  const bump = (label: string, value: string) => {
    if (!dist.has(label)) dist.set(label, new Map());
    for (const v of value.split(MULTI_SEP)) dist.get(label)!.set(v, (dist.get(label)!.get(v) ?? 0) + 1);
  };

  for (const p of products) {
    const type = TYPE_BY_CAT[p.category_slug];
    if (type && p.product_type !== type) typeFixes.push({ sku: p.sku, before: p.product_type, after: type });
    const before = [...(charsOf.get(p.sku) ?? [])].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0) || (a.id ?? 0) - (b.id ?? 0));
    const ctx = (label: string) => ({ rules: dict.values, category: p.category_slug, parentOf: dict.parentOf, multiselect: dict.multiselect.has(label) });
    const catDefaults = defaults.get(p.category_slug) ?? new Map<string, string>();
    const map = new Map<string, string>();
    for (const c of before) if (!map.has(c.label)) map.set(c.label, c.value);
    const get = (l: string) => map.get(l)?.trim() || null;
    const name = p.name.toLowerCase();

    // 1. Тип = підкатегорія
    if (type) map.set('Тип', type);

    // 2. Спосіб випуску з балона
    if (!get('Спосіб випуску з балона')) {
      const fromName = /професійн|під пістолет/.test(name) ? 'Під пістолет' : /побутов/.test(name) ? 'Трубка-адаптер' : null;
      if (fromName) { map.set('Спосіб випуску з балона', fromName); stats.dispenseFromName++; }
      else if (catDefaults.get('Спосіб випуску з балона')) { map.set('Спосіб випуску з балона', catDefaults.get('Спосіб випуску з балона')!); stats.dispenseDefault++; }
    }

    // 3. Сезон — назва важливіша за характеристику («зимня» в назві, «всесезонний» у картці)
    if (/зимн|зимов|winter/.test(name)) { map.set('Сезон', 'Зимова'); stats.seasonFromName++; }
    else if (!get('Сезон') && catDefaults.get('Сезон')) { map.set('Сезон', catDefaults.get('Сезон')!); stats.defaults++; }

    // 4. Вихід піни — канонізацією (діапазон); нерозпізнане лишаємо і показуємо
    if (get('Вихід піни')) {
      const canon = canonicalCharValue('Вихід піни', get('Вихід піни')!, ctx('Вихід піни'));
      if (!dict.values.get('Вихід піни')!.some(v => v.value === canon)) stats.outputKept.push(`${p.sku} «${get('Вихід піни')}»`);
    }

    // 5. Дефолти для порожніх обов'язкових фасетів
    for (const label of ['Тип використання']) {
      if (!get(label) && catDefaults.get(label)) { map.set(label, catDefaults.get(label)!); stats.defaults++; }
    }

    const after = normalizeChars([...map].map(([label, value]) => ({ label, value })), dict, p.category_slug);
    for (const c of after) if (dict.values.has(c.label)) bump(c.label, c.value);
    const same = after.length === before.length && after.every((n, i) => n.label === before[i].label && n.value === before[i].value && n.sort_order === before[i].sort_order);
    if (!same) changed.push({ sku: p.sku, before, after });
  }

  console.log(`\nСпосіб випуску: з назви ${stats.dispenseFromName}, дефолт ${stats.dispenseDefault}; Сезон з назви ${stats.seasonFromName}; дефолти ${stats.defaults}`);
  console.log(`Вихід піни поза діапазонами: ${stats.outputKept.length}${stats.outputKept.map(s => `\n   ? ${s}`).join('')}`);
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
  const file = path.join(dir, `facet-foam-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
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
