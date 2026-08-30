/**
 * Детерміноване дозаповнення обов'язкових характеристик БЕЗ AI:
 *  1. відсутній обов'язковий лейбл із default_value у стандарті категорії → дефолт;
 *  2. «Розчинник» у фарбах/лаках/ґрунтах виводиться з «Основа»
 *     (алкідна → Уайт-спірит; акрилова/латексна/силіконова → Вода).
 * Решту (Клас зносостійкості тощо) закриває AI із SEO-черги.
 *
 *   npx tsx --env-file=.env.local scripts/supabase/fill-facet-defaults.mts            (dry-run)
 *   npx tsx --env-file=.env.local scripts/supabase/fill-facet-defaults.mts --apply
 *   … [--category laky]
 */
import { createClient } from '@supabase/supabase-js';
import * as charsNS from '../../lib/characteristics';
const { loadCharDictionary, normalizeChars, normCharKey } = ((charsNS as Record<string, unknown>).default ?? charsNS) as typeof charsNS;

const APPLY = process.argv.includes('--apply');
const catArg = process.argv.indexOf('--category');
const ONLY_CAT = catArg > -1 ? process.argv[catArg + 1] : null;
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

type Char = { label: string; value: string; sort_order?: number };
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

const SOLVENT_FROM_BASE: [RegExp, string][] = [[/^алкідна/i, 'Уайт-спірит'], [/^(акрилова|латексна|силіконова)$/i, 'Вода']];

async function main() {
  const dict = await loadCharDictionary(db);
  const std = await fetchAll<{ category_slug: string; required: boolean; default_value: string | null; characteristic_definitions: { label: string } | null }>(
    'category_characteristics', 'category_slug, required, default_value, characteristic_definitions(label)', undefined, 'category_slug');
  const reqByCat = new Map<string, { label: string; def: string | null }[]>();
  for (const r of std) {
    if (!r.required || !r.characteristic_definitions) continue;
    if (!reqByCat.has(r.category_slug)) reqByCat.set(r.category_slug, []);
    reqByCat.get(r.category_slug)!.push({ label: r.characteristic_definitions.label, def: r.default_value });
  }
  const products = await fetchAll<{ sku: string; category_slug: string }>('products', 'sku, category_slug',
    q => ONLY_CAT ? q.eq('category_slug', ONLY_CAT) : q.in('category_slug', [...reqByCat.keys()]));
  const chars = await fetchAll<Char & { product_sku: string }>('product_characteristics', 'product_sku, label, value, sort_order', q => q.in('product_sku', products.map(p => p.sku)));
  const bySku = new Map<string, Char[]>();
  for (const c of chars) { if (!bySku.has(c.product_sku)) bySku.set(c.product_sku, []); bySku.get(c.product_sku)!.push(c); }

  const stats = new Map<string, number>();
  const changed: { sku: string; after: ReturnType<typeof normalizeChars> }[] = [];
  for (const p of products) {
    const before = [...(bySku.get(p.sku) ?? [])].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
    const have = new Map(before.map(c => [dict.aliasMap.get(normCharKey(c.label)) ?? c.label, c.value]));
    const add: Char[] = [];
    for (const r of reqByCat.get(p.category_slug) ?? []) {
      if (have.has(r.label)) continue;
      let value: string | null = r.def;
      if (r.label === 'Розчинник' && !value) {
        const base = have.get('Основа') ?? '';
        value = SOLVENT_FROM_BASE.find(([re]) => re.test(base))?.[1] ?? null;
      }
      if (!value) continue;
      add.push({ label: r.label, value });
      const k = `${p.category_slug} / ${r.label} = ${value}`;
      stats.set(k, (stats.get(k) ?? 0) + 1);
    }
    if (!add.length) continue;
    changed.push({ sku: p.sku, after: normalizeChars([...before, ...add], dict, p.category_slug) });
  }

  console.log(`БД: ${process.env.NEXT_PUBLIC_SUPABASE_URL}${APPLY ? '' : ' (DRY-RUN)'}\nТоварів до зміни: ${changed.length}`);
  for (const [k, n] of [...stats].sort((a, b) => b[1] - a[1])) console.log(`  ${String(n).padStart(4)}  ${k}`);
  if (!APPLY) { console.log('DRY-RUN: нічого не записано.'); return; }
  for (const c of changed) {
    const { error: d } = await db.from('product_characteristics').delete().eq('product_sku', c.sku);
    if (d) throw new Error(`${c.sku}: ${d.message}`);
    const { error: i } = await db.from('product_characteristics').insert(c.after.map(x => ({ product_sku: c.sku, ...x })));
    if (i) throw new Error(`${c.sku}: ${i.message}`);
  }
  console.log(`записано ${changed.length} товарів`);
}
main().catch(e => { console.error(e); process.exit(1); });
