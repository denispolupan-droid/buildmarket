/**
 * update-prom-commissions.mjs
 * 1. Заповнює prom_commissions_ref (довідник усіх категорій Prom з усіма 4 ставками)
 * 2. Оновлює categories (prom_commission_pct_* по prom_section_id)
 *
 * Перегляд без змін:
 *   node scripts/supabase/update-prom-commissions.mjs "K:\...\Комісія Prom.xlsx"
 *
 * Застосувати:
 *   node scripts/supabase/update-prom-commissions.mjs "K:\...\Комісія Prom.xlsx" --apply
 */

import { readFileSync } from 'fs';
import { createClient } from '@supabase/supabase-js';
import xlsx from 'xlsx';

// ── Конфіг ────────────────────────────────────────────────────────────────────

const envLines = readFileSync('.env.local', 'utf-8').split('\n');
const env = {};
for (const line of envLines) {
  const m = line.match(/^([^#=\s]+)\s*=\s*(.*)$/);
  if (m) env[m[1]] = m[2].trim();
}

const supabase = createClient(env['NEXT_PUBLIC_SUPABASE_URL'], env['SUPABASE_SERVICE_ROLE_KEY']);
const XLSX_PATH = process.argv[2];
const APPLY     = process.argv.includes('--apply');

if (!XLSX_PATH) {
  console.error('Usage: node scripts/supabase/update-prom-commissions.mjs <path-to-xlsx> [--apply]');
  process.exit(1);
}

// ── Парсинг Excel ─────────────────────────────────────────────────────────────

function parsePct(val) {
  if (val == null || val === '') return null;
  // Excel може віддати як число (0.0931) або рядок "9,31%"
  if (typeof val === 'number') return parseFloat((val * 100).toFixed(3));
  const s = String(val).replace('%', '').replace(',', '.').trim();
  return parseFloat(s) || null;
}

const wb   = xlsx.readFile(XLSX_PATH);
const ws   = wb.Sheets[wb.SheetNames[0]]; // перший лист — % за замовлення
const rows = xlsx.utils.sheet_to_json(ws, { header: 1, defval: '' });

// Заголовок у рядку 4 (індекс 3), дані з рядку 5
// Колонки: 0=cat0 1=cat1 2=cat2 3=cat3 4=cat4 5=рівень 6=ID 7=назва 8=Економ 9=Єдина 10=Більше 11=Турбо
const HEADER_ROW = 3;
const DATA_START = 4;

// Перевірка заголовків
const header = rows[HEADER_ROW];
console.log('\n📋 Заголовки Excel:');
console.log(`  [6] ${header[6]}`);
console.log(`  [7] ${header[7]}`);
console.log(`  [8] ${header[8]}`);
console.log(`  [9] ${header[9]}`);
console.log(`  [10] ${header[10]}`);
console.log(`  [11] ${header[11]}`);

// Будуємо map: prom_category_id → { name, path, ecom, single, more, turbo }
const promMap = new Map();

for (let i = DATA_START; i < rows.length; i++) {
  const row   = rows[i];
  const idRaw = row[6];
  if (!idRaw) continue;
  const id   = String(idRaw).trim();
  const name = String(row[7] ?? '').trim();
  // Path: перші ненульові рівні (колонки 0-4)
  const pathParts = [row[0], row[1], row[2], row[3], row[4]].map(v => String(v ?? '').trim()).filter(Boolean);
  const path = pathParts.join(' > ');
  const ecom   = parsePct(row[8]);
  const single = parsePct(row[9]);
  const more   = parsePct(row[10]);
  const turbo  = parsePct(row[11]);
  if (id && name && single != null) {
    promMap.set(id, { name, path, ecom, single, more, turbo });
  }
}

console.log(`\n📄 Excel: знайдено ${promMap.size} категорій Prom`);

// ── Порівняння з нашими категоріями ──────────────────────────────────────────

const { data: categories, error } = await supabase
  .from('categories')
  .select('slug, name, prom_section_id, prom_commission_pct, prom_commission_pct_econom, prom_commission_pct_more_sales, prom_commission_pct_turbo')
  .not('prom_section_id', 'is', null);

if (error) { console.error('Supabase error:', error.message); process.exit(1); }

const updates = [];
const noMatch = [];

for (const cat of categories) {
  const key  = String(cat.prom_section_id);
  const data = promMap.get(key);
  if (!data) { noMatch.push(cat); continue; }

  const changes = {};
  const diffs   = [];

  const check = (col, newVal, label) => {
    const old = cat[col] != null ? Number(cat[col]) : null;
    if (old !== newVal) {
      changes[col] = newVal;
      diffs.push(`${label}: ${old ?? '—'} → ${newVal ?? '—'}%`);
    }
  };

  check('prom_commission_pct_econom',      data.ecom,   'Економ');
  check('prom_commission_pct',             data.single, 'Єдина');
  check('prom_commission_pct_more_sales',  data.more,   'Більше продажів');
  check('prom_commission_pct_turbo',       data.turbo,  'Турбо');

  if (Object.keys(changes).length > 0) {
    updates.push({ slug: cat.slug, name: cat.name, id: key, changes, diffs });
  }
}

// ── Звіт ──────────────────────────────────────────────────────────────────────

if (updates.length === 0) {
  console.log('\n✅ Всі комісії актуальні — жодних змін не потрібно.');
} else {
  console.log(`\n📊 Зміни (${updates.length} категорій):`);
  for (const u of updates) {
    console.log(`\n  ${u.name} [prom_id: ${u.id}]`);
    for (const d of u.diffs) console.log(`    ${d}`);
  }
}

if (noMatch.length > 0) {
  console.log(`\n⚠️  Не знайдено в Excel (${noMatch.length}):`);
  for (const c of noMatch) {
    console.log(`  ${c.name.padEnd(40)} prom_section_id=${c.prom_section_id}`);
  }
}

// ── Застосування ─────────────────────────────────────────────────────────────

if (!APPLY) {
  console.log('\n💡 Запустіть з --apply щоб зберегти зміни в БД.');
  process.exit(0);
}

// ── 1. Довідник prom_commissions_ref ─────────────────────────────────────────

console.log(`\n📥 Заповнення prom_commissions_ref (${promMap.size} рядків)…`);
const refRows = [...promMap.entries()].map(([id, d]) => ({
  prom_category_id:  parseInt(id),
  name:              d.name,
  path:              d.path || null,
  commission_single: d.single,
  commission_ecom:   d.ecom,
  commission_more:   d.more,
  commission_turbo:  d.turbo,
}));

// Вставляємо батчами по 500
const BATCH = 500;
let refOk = 0;
for (let i = 0; i < refRows.length; i += BATCH) {
  const batch = refRows.slice(i, i + BATCH);
  const { error: refErr } = await supabase.from('prom_commissions_ref').upsert(batch, { onConflict: 'prom_category_id' });
  if (refErr) { console.error('  ✗ Ref batch error:', refErr.message); }
  else refOk += batch.length;
}
console.log(`  ✓ Довідник оновлено: ${refOk} категорій`);

// ── 2. Оновлення наших categories ────────────────────────────────────────────

if (updates.length === 0) {
  console.log('\n✅ Комісії категорій актуальні — нічого оновлювати.');
  process.exit(0);
}

console.log(`\n📝 Оновлення categories (${updates.length})…`);
let ok = 0, fail = 0;
for (const u of updates) {
  const { error: upErr } = await supabase
    .from('categories')
    .update(u.changes)
    .eq('slug', u.slug);
  if (upErr) { console.error(`  ✗ ${u.slug}:`, upErr.message); fail++; }
  else { console.log(`  ✓ ${u.name}`); ok++; }
}

console.log(`\n✅ Оновлено ${ok} категорій${fail > 0 ? `, помилок: ${fail}` : ''}.`);
