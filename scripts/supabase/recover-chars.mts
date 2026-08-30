/**
 * Відновлення характеристик після інциденту 30.08.2026: fill-facet-defaults читав
 * product_characteristics сторінками без ORDER BY, частина рядків не прийшла,
 * і для цих товарів delete+insert лишив лише дефолти.
 *
 * Джерела:
 *  1. фарби (родина farby) — бекап facet-paints (повний стан ДО фасетів, 29.08 20:45):
 *     повертаємо всім 253 товарам, далі детермінований конвеєр наново
 *     (canonicalize → facet-paints → fill-facet-defaults → enrich лаків);
 *  2. решта — test-БД (копія каталогу проду від 28.07): якщо у проді зник лейбл,
 *     який був у копії, — повертаємо ці рядки (наявні рядки не чіпаємо).
 *
 *   npx tsx --env-file=.env.local scripts/supabase/recover-chars.mts            (dry-run)
 *   npx tsx --env-file=.env.local scripts/supabase/recover-chars.mts --apply
 */
import fs from 'node:fs';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';
import * as charsNS from '../../lib/characteristics';
const { loadCharDictionary, normalizeChars, normCharKey } = ((charsNS as Record<string, unknown>).default ?? charsNS) as typeof charsNS;

const APPLY = process.argv.includes('--apply');
const BACKUP = 'scripts/supabase/backups/facet-paints-2026-08-29T20-45-31-296Z.json';
const prod = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

const testEnv: Record<string, string> = {};
for (const line of fs.readFileSync('.env.test', 'utf8').split('\n')) {
  const m = line.match(/^([^#=\s]+)\s*=\s*(.*)$/);
  if (m) testEnv[m[1]] = m[2].trim().replace(/^"|"$/g, '');
}
const test = createClient(testEnv.NEXT_PUBLIC_SUPABASE_URL, testEnv.SUPABASE_SERVICE_ROLE_KEY);

type Char = { product_sku: string; label: string; value: string; sort_order: number | null };
async function fetchAll<T>(db: typeof prod, table: string, columns: string, orderBy = 'id'): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db.from(table).select(columns).order(orderBy).range(from, from + 999);
    if (error) throw new Error(`${table}: ${error.message}`);
    rows.push(...((data ?? []) as T[]));
    if (!data || data.length < 1000) return rows;
  }
}
const group = (rows: Char[]) => {
  const m = new Map<string, Char[]>();
  for (const r of rows) { if (!m.has(r.product_sku)) m.set(r.product_sku, []); m.get(r.product_sku)!.push(r); }
  return m;
};

async function main() {
  const dict = await loadCharDictionary(prod);
  const backup = JSON.parse(fs.readFileSync(BACKUP, 'utf8')) as { chars: { sku: string; before: { label: string; value: string; sort_order?: number }[] }[] };
  const products = await fetchAll<{ sku: string; category_slug: string | null }>(prod, 'products', 'sku, category_slug');
  const catOf = new Map(products.map(p => [p.sku, p.category_slug]));
  const [prodChars, testChars] = await Promise.all([
    fetchAll<Char>(prod, 'product_characteristics', 'product_sku, label, value, sort_order'),
    fetchAll<Char>(test, 'product_characteristics', 'product_sku, label, value, sort_order'),
  ]);
  const P = group(prodChars), T = group(testChars);
  console.log(`prod: ${prodChars.length} рядків / ${P.size} товарів; test: ${testChars.length} / ${T.size}; бекап фарб: ${backup.chars.length}${APPLY ? '' : ' (DRY-RUN)'}`);

  const writes: { sku: string; rows: { label: string; value: string; sort_order: number }[]; why: string }[] = [];

  // 1. фарби — повний відкат до бекапу
  const paintSkus = new Set(backup.chars.map(c => c.sku));
  for (const c of backup.chars) {
    const rows = c.before.map((r, i) => ({ label: r.label, value: r.value, sort_order: r.sort_order ?? i + 1 }));
    writes.push({ sku: c.sku, rows, why: 'бекап фарб' });
  }

  // 2. решта — лейбли з test-копії, яких у проді більше немає
  let damaged = 0, missingFromTest = 0;
  const byCat = new Map<string, number>();
  for (const p of products) {
    if (paintSkus.has(p.sku)) continue;
    const t = T.get(p.sku);
    if (!t) { missingFromTest++; continue; }
    const cur = P.get(p.sku) ?? [];
    const have = new Set(cur.map(c => normCharKey(dict.aliasMap.get(normCharKey(c.label)) ?? c.label)));
    const lost = t.filter(r => !have.has(normCharKey(dict.aliasMap.get(normCharKey(r.label)) ?? r.label)));
    if (!lost.length) continue;
    damaged++;
    byCat.set(p.category_slug ?? '?', (byCat.get(p.category_slug ?? '?') ?? 0) + 1);
    // test-копія попереду: для повністю затертих товарів мої дефолти (Колір=Білий…)
    // не мають перекривати справжні значення; нові рядки проду (яких нема в копії) лишаються
    const merged = normalizeChars([...t, ...cur].map(r => ({ label: r.label, value: r.value })), dict, p.category_slug);
    writes.push({ sku: p.sku, rows: merged, why: `test-копія: +${lost.length} (${lost.map(l => l.label).join(', ')})` });
  }
  console.log(`\nНе-фарби: пошкоджено ${damaged} товарів (немає в test-копії: ${missingFromTest} — перевірити не можемо)`);
  for (const [c, n] of [...byCat].sort((a, b) => b[1] - a[1])) console.log(`   ${String(n).padStart(3)}  ${c}`);
  for (const w of writes.filter(w => w.why !== 'бекап фарб')) console.log(`   ${w.sku}: ${w.why}`);

  if (!APPLY) { console.log(`\nDRY-RUN: ${writes.length} товарів до запису (фарб ${paintSkus.size} + пошкоджених ${damaged}).`); return; }

  const dir = path.join(process.cwd(), 'scripts', 'supabase', 'backups');
  const file = path.join(dir, `recover-chars-current-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
  fs.writeFileSync(file, JSON.stringify(writes.map(w => ({ sku: w.sku, before: P.get(w.sku) ?? [] })), null, 1));
  console.log(`бекап поточного стану: ${file}`);
  for (const w of writes) {
    const { error: d } = await prod.from('product_characteristics').delete().eq('product_sku', w.sku);
    if (d) throw new Error(`${w.sku}: ${d.message}`);
    const { error: i } = await prod.from('product_characteristics').insert(w.rows.map(r => ({ product_sku: w.sku, ...r })));
    if (i) throw new Error(`${w.sku}: ${i.message}`);
  }
  console.log(`записано ${writes.length} товарів`);
}
main().catch(e => { console.error(e); process.exit(1); });
