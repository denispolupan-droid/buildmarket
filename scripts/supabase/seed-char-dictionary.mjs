/**
 * seed-char-dictionary.mjs — заливає словник характеристик у БД
 * (characteristic_definitions + category_characteristics, міграція 082).
 *
 *   node scripts/supabase/seed-char-dictionary.mjs [--dry-run] [--env=.env.local]
 *
 * Обов'язкові набори: явні з CATEGORY_STANDARDS; для решти категорій —
 * автовивід зі статистики (канонічний лейбл покриває ≥60% товарів категорії
 * → required, ≥30% → додатковий/optional). Скрипт ідемпотентний.
 */

import { readFileSync } from 'fs';
import { createClient } from '@supabase/supabase-js';
import { DICTIONARY, CATEGORY_STANDARDS, buildAliasMap, canonicalLabel } from './char-dictionary.mjs';

const args = process.argv.slice(2);
const DRY = args.includes('--dry-run');
const envPath = args.find(a => a.startsWith('--env='))?.slice(6) ?? '.env.local';

const env = {};
for (const line of readFileSync(envPath, 'utf-8').split('\n')) {
  const m = line.match(/^([^#=\s]+)\s*=\s*(.*)$/);
  if (m) env[m[1]] = m[2].trim();
}
const supabase = createClient(env['NEXT_PUBLIC_SUPABASE_URL'], env['SUPABASE_SERVICE_ROLE_KEY']);

const REQUIRED_COVERAGE = 0.6;  // автовивід: required, якщо лейбл у ≥60% товарів
const OPTIONAL_COVERAGE = 0.3;  // автовивід: optional, якщо у ≥30%
const MIN_PRODUCTS = 3;         // автовивід required тільки для категорій від 3 товарів

async function fetchAll(table, columns, filter) {
  const rows = [];
  for (let from = 0; ; from += 1000) {
    let q = supabase.from(table).select(columns).range(from, from + 999);
    if (filter) q = filter(q);
    const { data, error } = await q;
    if (error) throw new Error(`${table}: ${error.message}`);
    rows.push(...(data ?? []));
    if (!data || data.length < 1000) return rows;
  }
}

async function main() {
  console.log(`Словник: ${DICTIONARY.length} канонічних лейблів. БД: ${env['NEXT_PUBLIC_SUPABASE_URL']}${DRY ? ' (DRY-RUN)' : ''}`);

  // 1. Definitions (+ прибираємо ті, що більше не в словнику — напр., злиті в аліас;
  //    category_characteristics підчищається каскадом)
  if (!DRY) {
    const { error: delErr } = await supabase
      .from('characteristic_definitions')
      .delete()
      .not('label', 'in', `(${DICTIONARY.map(d => `"${d.label.replace(/"/g, '\\"')}"`).join(',')})`);
    if (delErr) throw new Error(`definitions prune: ${delErr.message}`);
    const { error } = await supabase.from('characteristic_definitions').upsert(
      DICTIONARY.map(d => ({
        label: d.label,
        aliases: d.aliases,
        is_multiselect: !!d.multiselect,
        unit: d.unit ?? null,
        sort_order: d.sort,
      })),
      { onConflict: 'label' },
    );
    if (error) throw new Error(`definitions upsert: ${error.message}`);
  }
  console.log('✓ characteristic_definitions');

  const { data: defs, error: defErr } = DRY
    ? { data: DICTIONARY.map((d, i) => ({ id: i + 1, label: d.label })), error: null }
    : await supabase.from('characteristic_definitions').select('id, label');
  if (defErr) throw new Error(defErr.message);
  const defId = new Map(defs.map(d => [d.label, d.id]));

  // 2. Статистика по категоріях (для автовиводу та optional-доповнення)
  const products = await fetchAll('products', 'sku, category_slug', q => q.eq('is_active', true));
  const chars = await fetchAll('product_characteristics', 'product_sku, label, value');
  const aliasMap = buildAliasMap();

  const catOf = new Map(products.map(p => [p.sku, p.category_slug]));
  const catProducts = new Map(); // slug → count
  for (const p of products) catProducts.set(p.category_slug, (catProducts.get(p.category_slug) ?? 0) + 1);

  // slug → canonical label → Set<sku>
  const coverage = new Map();
  for (const c of chars) {
    const slug = catOf.get(c.product_sku);
    if (!slug) continue;
    const canon = canonicalLabel(c.label, c.value, aliasMap);
    if (!canon) continue; // поза словником — не бере участі у наборах
    if (!coverage.has(slug)) coverage.set(slug, new Map());
    const m = coverage.get(slug);
    if (!m.has(canon)) m.set(canon, new Set());
    m.get(canon).add(c.product_sku);
  }

  // 3. Набори по категоріях
  let totalRows = 0;
  for (const [slug, total] of [...catProducts.entries()].sort()) {
    const rows = [];
    const std = CATEGORY_STANDARDS[slug];
    const seen = new Set();

    if (std) {
      std.req.forEach((label, i) => {
        if (!defId.has(label)) throw new Error(`${slug}: невідомий лейбл у стандарті: "${label}"`);
        rows.push({ category_slug: slug, definition_id: defId.get(label), required: true, default_value: std.def[label] ?? null, sort_order: i + 1 });
        seen.add(label);
      });
    }

    const stats = coverage.get(slug) ?? new Map();
    const ranked = [...stats.entries()]
      .map(([label, skus]) => ({ label, share: skus.size / total }))
      .sort((a, b) => b.share - a.share);
    for (const { label, share } of ranked) {
      if (seen.has(label)) continue;
      const required = !std && share >= REQUIRED_COVERAGE && total >= MIN_PRODUCTS;
      if (!required && share < OPTIONAL_COVERAGE) continue;
      rows.push({ category_slug: slug, definition_id: defId.get(label), required, default_value: null, sort_order: null });
      seen.add(label);
    }

    if (!rows.length) continue;
    totalRows += rows.length;
    const reqCount = rows.filter(r => r.required).length;
    console.log(`  ${slug}: ${reqCount} обов'язкових + ${rows.length - reqCount} додаткових${std ? ' (стандарт)' : ' (автовивід)'}`);

    if (!DRY) {
      const { error: delErr } = await supabase.from('category_characteristics').delete().eq('category_slug', slug);
      if (delErr) throw new Error(`${slug} delete: ${delErr.message}`);
      const { error: insErr } = await supabase.from('category_characteristics').insert(rows);
      if (insErr) throw new Error(`${slug} insert: ${insErr.message}`);
    }
  }

  console.log(`\n✅ category_characteristics: ${totalRows} рядків по ${catProducts.size} категоріях${DRY ? ' (нічого не записано)' : ''}`);
}

main().catch(err => { console.error('❌', err.message); process.exit(1); });
