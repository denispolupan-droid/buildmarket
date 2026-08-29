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
import { DICTIONARY, CATEGORY_STANDARDS, CHAR_VALUES, charValueRows, buildAliasMap, canonicalLabel } from './char-dictionary.mjs';

const args = process.argv.slice(2);
const DRY = args.includes('--dry-run');
const DIFF = args.includes('--diff');   // показати, що саме зміниться в БД
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
        kind: CHAR_VALUES[d.label] ? 'enum' : (d.kind ?? 'text'),
        is_filter: !!d.filter,
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
  const idLabel = new Map(defs.map(d => [d.id, d.label]));

  // 1b. Канонічні значення фасетів (міграція 105): повна перезаливка — на таблицю
  //     ніхто не посилається за id, тож це безпечно й ідемпотентно.
  const valueRows = charValueRows();
  for (const r of valueRows) {
    if (!defId.has(r.label)) throw new Error(`CHAR_VALUES: невідомий лейбл "${r.label}"`);
    for (const p of r.match_patterns) { try { new RegExp(p, 'i'); } catch { throw new Error(`CHAR_VALUES ${r.label}/${r.value}: зіпсований регекс ${p}`); } }
  }
  if (!DRY) {
    const { error: delErr } = await supabase.from('characteristic_values').delete().gte('id', 0);
    if (delErr) throw new Error(`values prune: ${delErr.message}`);
    const { error: insErr } = await supabase.from('characteristic_values').insert(
      valueRows.map(r => ({
        definition_id: defId.get(r.label), value: r.value, category_slugs: r.category_slugs,
        aliases: r.aliases, match_patterns: r.match_patterns, sort_order: r.sort_order,
      })),
    );
    if (insErr) throw new Error(`values insert: ${insErr.message}`);
  }
  console.log(`✓ characteristic_values: ${valueRows.length} значень для ${Object.keys(CHAR_VALUES).length} лейблів`);

  // Знімок поточного стану — щоб --diff показав, що саме зміниться.
  const current = new Map();
  const diffs = [];
  if (DIFF) {
    const rows = await fetchAll('category_characteristics',
      'category_slug, required, default_value, characteristic_definitions(label)');
    for (const r of rows) {
      const l = r.characteristic_definitions?.label;
      if (l) current.set(`${r.category_slug}|${l}`, `${r.required ? 'req' : 'opt'}|${r.default_value ?? ''}`);
    }
    console.log(`знімок БД: ${current.size} рядків`);
  }

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

    // Фасети категорії: явний список → is_filter true/false для КОЖНОГО рядка
    // (чужі глобальні фільтри не просочуються); без списку → NULL (успадкувати).
    const filters = std?.filters ?? null;
    const facet = (label) => filters
      ? { is_filter: filters.includes(label), filter_order: filters.includes(label) ? filters.indexOf(label) + 1 : null }
      : { is_filter: null, filter_order: null };

    if (std) {
      std.req.forEach((label, i) => {
        if (!defId.has(label)) throw new Error(`${slug}: невідомий лейбл у стандарті: "${label}"`);
        rows.push({ category_slug: slug, definition_id: defId.get(label), required: true, default_value: std.def[label] ?? null, sort_order: i + 1, ...facet(label) });
        seen.add(label);
      });
      for (const label of filters ?? []) {
        if (seen.has(label)) continue;
        if (!defId.has(label)) throw new Error(`${slug}: невідомий лейбл у filters: "${label}"`);
        rows.push({ category_slug: slug, definition_id: defId.get(label), required: false, default_value: null, sort_order: null, ...facet(label) });
        seen.add(label);
      }
    }

    const stats = coverage.get(slug) ?? new Map();
    const ranked = [...stats.entries()]
      .map(([label, skus]) => ({ label, share: skus.size / total }))
      .sort((a, b) => b.share - a.share);
    for (const { label, share } of ranked) {
      if (seen.has(label)) continue;
      const required = !std && share >= REQUIRED_COVERAGE && total >= MIN_PRODUCTS;
      if (!required && share < OPTIONAL_COVERAGE) continue;
      rows.push({ category_slug: slug, definition_id: defId.get(label), required, default_value: null, sort_order: null, ...facet(label) });
      seen.add(label);
    }

    if (!rows.length) continue;
    totalRows += rows.length;
    const reqCount = rows.filter(r => r.required).length;
    console.log(`  ${slug}: ${reqCount} обов'язкових + ${rows.length - reqCount} додаткових${std ? ' (стандарт)' : ' (автовивід)'}`);
    // --diff показує, що саме зміниться в БД. Потрібно тому, що набори для
    // категорій без явного стандарту виводяться зі СТАТИСТИКИ покриття: варто
    // почистити характеристики — і перезаливка тихо перекине лейбл із
    // обов'язкових у додаткові. Без цього прапорця різницю видно лише постфактум.
    if (DIFF) {
      for (const r of rows) {
        const key = `${slug}|${idLabel.get(r.definition_id)}`;
        const next = `${r.required ? 'req' : 'opt'}|${r.default_value ?? ''}`;
        const prev = current.get(key);
        if (prev === undefined) diffs.push(`+ ${key} → ${next}`);
        else if (prev !== next) diffs.push(`~ ${key}: ${prev} → ${next}`);
        current.delete(key);
      }
    }

    if (!DRY) {
      const { error: delErr } = await supabase.from('category_characteristics').delete().eq('category_slug', slug);
      if (delErr) throw new Error(`${slug} delete: ${delErr.message}`);
      const { error: insErr } = await supabase.from('category_characteristics').insert(rows);
      if (insErr) throw new Error(`${slug} insert: ${insErr.message}`);
    }
  }

  if (DIFF) {
    // Те, що лишилося в current, у новому наборі відсутнє — тобто зникне.
    for (const [k, v] of current) diffs.push(`- ${k} (було ${v})`);
    console.log(`\n## Різниця з поточним станом БД: ${diffs.length}`);
    for (const d of diffs.sort()) console.log(`  ${d}`);
  }

  console.log(`\n✅ category_characteristics: ${totalRows} рядків по ${catProducts.size} категоріях${DRY ? ' (нічого не записано)' : ''}`);
}

main().catch(err => { console.error('❌', err.message); process.exit(1); });
