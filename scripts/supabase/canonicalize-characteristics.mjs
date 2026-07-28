/**
 * canonicalize-characteristics.mjs — разова чистка product_characteristics
 * за словником char-dictionary.mjs:
 *   • перейменування лейблів-синонімів у канонічні (+ уніфікація апострофа);
 *   • спец-правила за значенням («Сфера застосування», «Об'єм / Вага»);
 *   • злиття дублів у межах товару (multiselect — об'єднання значень через кому,
 *     решта — лишаємо канонічний/найінформативніший рядок);
 *   • перенумерація sort_order за порядком словника.
 *
 * БЕЗ --apply нічого не пише (dry-run за замовчуванням):
 *   node scripts/supabase/canonicalize-characteristics.mjs [--apply] [--env=.env.local] [--sku=1203-028]
 */

import { readFileSync, writeFileSync } from 'fs';
import { createClient } from '@supabase/supabase-js';
import { buildAliasMap, canonicalLabel, normKey, sortIndex } from './char-dictionary.mjs';

const args = process.argv.slice(2);
const APPLY = args.includes('--apply');
const envPath = args.find(a => a.startsWith('--env='))?.slice(6) ?? '.env.local';
const onlySku = args.find(a => a.startsWith('--sku='))?.slice(6) ?? null;

const env = {};
for (const line of readFileSync(envPath, 'utf-8').split('\n')) {
  const m = line.match(/^([^#=\s]+)\s*=\s*(.*)$/);
  if (m) env[m[1]] = m[2].trim();
}
const supabase = createClient(env['NEXT_PUBLIC_SUPABASE_URL'], env['SUPABASE_SERVICE_ROLE_KEY']);

// Multiselect-лейбли: кілька рядків зливаються в один зі значеннями через кому
const MULTISELECT = new Set(['Область застосування']);

async function fetchAll(table, columns) {
  const rows = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase.from(table).select(columns).order('id').range(from, from + 999);
    if (error) throw new Error(`${table}: ${error.message}`);
    rows.push(...(data ?? []));
    if (!data || data.length < 1000) return rows;
  }
}

// Злиття кількох рядків multiselect: кожен рядок — атомарне значення (НЕ ріжемо
// по комах — вільний текст має лишитись цілим). Розділювач "; " — фіди
// розгортають по ньому назад у кілька <param>.
function mergeMultiValues(values) {
  const seen = new Set();
  const parts = [];
  for (const v of values) {
    const p = String(v).trim();
    if (!p) continue;
    const k = p.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    parts.push(p);
  }
  return parts.join('; ');
}

// Апостроф/пробіли в лейблі поза словником теж уніфікуємо
function tidyLabel(label) {
  return String(label).replace(/['`´ʼ']/g, "'").replace(/\s+/g, ' ').trim();
}

async function main() {
  console.log(`БД: ${env['NEXT_PUBLIC_SUPABASE_URL']} ${APPLY ? '⚠️ APPLY' : '(dry-run)'}`);
  const aliasMap = buildAliasMap();

  let chars = await fetchAll('product_characteristics', 'id, product_sku, label, value, sort_order');
  if (onlySku) chars = chars.filter(c => c.product_sku === onlySku);
  console.log(`Рядків: ${chars.length}`);

  const byProduct = new Map();
  for (const c of chars) {
    if (!byProduct.has(c.product_sku)) byProduct.set(c.product_sku, []);
    byProduct.get(c.product_sku).push(c);
  }

  const updates = [];           // { id, product_sku, label, value, sort_order }
  const deletes = [];           // id
  const renameStats = new Map(); // "від → до" → count
  const mergeStats = new Map();  // canonical → merged rows count
  const outsideDict = new Map(); // tidied label → count (поза словником)
  const affected = new Set();

  for (const [sku, rows] of byProduct) {
    // 1. Канонізація лейблів
    const canonRows = rows.map(r => {
      const canon = canonicalLabel(r.label, r.value, aliasMap) ?? tidyLabel(r.label);
      if (!aliasMap.has(normKey(canon))) outsideDict.set(canon, (outsideDict.get(canon) ?? 0) + 1);
      if (canon !== r.label) renameStats.set(`${r.label} → ${canon}`, (renameStats.get(`${r.label} → ${canon}`) ?? 0) + 1);
      return { ...r, canon };
    });

    // 2. Групування дублів
    const groups = new Map();
    for (const r of canonRows) {
      const k = normKey(r.canon);
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k).push(r);
    }

    // 3. Розв'язання груп → фінальний список рядків товару
    const finalRows = [];
    const deletesBefore = deletes.length;
    for (const group of groups.values()) {
      const canon = group[0].canon;
      if (group.length === 1) {
        finalRows.push({ ...group[0] });
        continue;
      }
      mergeStats.set(canon, (mergeStats.get(canon) ?? 0) + group.length - 1);
      if (MULTISELECT.has(canon)) {
        const keeper = group[0];
        finalRows.push({ ...keeper, value: mergeMultiValues(group.map(g => g.value)) });
        for (const g of group.slice(1)) deletes.push(g.id);
      } else {
        // keeper: 1) оригінальний лейбл уже канонічний; 2) значення з літерами
        // (одиниці/слова) краще за голе число ("1 л" > "1000"); 3) довше значення
        const score = r => {
          const canonMatch = normKey(r.label) === normKey(canon) ? 4 : 0;
          const hasWords = /[а-яіїєґa-z]/i.test(String(r.value)) ? 2 : 0;
          return canonMatch + hasWords;
        };
        const keeper = [...group].sort((a, b) =>
          score(b) - score(a) || String(b.value).length - String(a.value).length,
        )[0];
        finalRows.push({ ...keeper });
        for (const g of group) if (g.id !== keeper.id) deletes.push(g.id);
      }
    }

    // 4. Перенумерація sort_order за словником (стабільно за старим порядком)
    finalRows.sort((a, b) => {
      const d = sortIndex(a.canon) - sortIndex(b.canon);
      if (d !== 0) return d;
      return (a.sort_order ?? 0) - (b.sort_order ?? 0) || a.id - b.id;
    });
    finalRows.forEach((r, i) => {
      const sort = i + 1;
      if (r.canon !== r.label || r.value !== rows.find(x => x.id === r.id).value || sort !== r.sort_order) {
        updates.push({ id: r.id, product_sku: sku, label: r.canon, value: r.value, sort_order: sort });
        affected.add(sku);
      }
    });
    if (deletes.length > deletesBefore) affected.add(sku);
  }

  // ── Звіт ──
  console.log('\n── Перейменування лейблів ──');
  for (const [k, n] of [...renameStats.entries()].sort((a, b) => b[1] - a[1])) console.log(`  ${n}× ${k}`);
  console.log('\n── Злиття дублів у межах товару (видалених рядків) ──');
  for (const [k, n] of [...mergeStats.entries()].sort((a, b) => b[1] - a[1])) console.log(`  ${n}× ${k}`);
  console.log('\n── Лейбли поза словником (лишаються як додаткові) ──');
  for (const [k, n] of [...outsideDict.entries()].sort((a, b) => b[1] - a[1])) console.log(`  ${n}× ${k}`);
  console.log(`\nПідсумок: updates=${updates.length}, deletes=${deletes.length}, товарів зачеплено=${affected.size}`);

  const report = { updates: updates.length, deletes: deletes.length, affectedProducts: affected.size,
    renames: Object.fromEntries(renameStats), merges: Object.fromEntries(mergeStats), outsideDict: Object.fromEntries(outsideDict) };
  writeFileSync('scripts/supabase/canonicalize-report.json', JSON.stringify(report, null, 2));
  console.log('Звіт: scripts/supabase/canonicalize-report.json');

  if (!APPLY) { console.log('\nDry-run: нічого не записано. Для запису: --apply'); return; }

  // ── Запис: спочатку deletes (щоб не впертись у майбутній unique), потім upsert ──
  for (let i = 0; i < deletes.length; i += 200) {
    const { error } = await supabase.from('product_characteristics').delete().in('id', deletes.slice(i, i + 200));
    if (error) throw new Error(`delete: ${error.message}`);
  }
  console.log(`✓ deleted ${deletes.length}`);
  for (let i = 0; i < updates.length; i += 500) {
    const { error } = await supabase.from('product_characteristics')
      .upsert(updates.slice(i, i + 500), { onConflict: 'id' });
    if (error) throw new Error(`upsert: ${error.message}`);
  }
  console.log(`✓ updated ${updates.length}`);
  console.log('\n✅ Готово. Тепер можна застосовувати міграцію з UNIQUE (product_sku, label).');
}

main().catch(err => { console.error('❌', err.message); process.exit(1); });
