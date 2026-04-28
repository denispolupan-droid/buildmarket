/**
 * import-characteristics-prom.mjs
 * Імпортує характеристики з Prom.ua Excel-вивантаження.
 * Для товарів БЕЗ характеристик — заповнює повністю.
 * Для товарів З характеристиками — додає тільки нові (яких ще немає).
 *
 * Запуск (dry-run):
 *   node scripts/supabase/import-characteristics-prom.mjs --dry-run
 * Реальний:
 *   node scripts/supabase/import-characteristics-prom.mjs
 */

import { readFileSync } from 'fs';
import { createRequire } from 'module';
import { createClient } from '@supabase/supabase-js';

const require = createRequire(import.meta.url);
const XLSX    = require('xlsx');

const envLines = readFileSync('.env.local', 'utf-8').split('\n');
const env = {};
for (const line of envLines) {
  const m = line.match(/^([^#=\s]+)\s*=\s*(.*)$/);
  if (m) env[m[1]] = m[2].trim();
}
const supabase = createClient(env['NEXT_PUBLIC_SUPABASE_URL'], env['SUPABASE_SERVICE_ROLE_KEY']);
const DRY_RUN  = process.argv.includes('--dry-run');

const SKIP_LABELS = new Set(['Торговая марка', 'Торгова марка', 'Артикул', 'Код товару']);

// ── Парсинг характеристик з рядка Excel ──────────────────────────────────────

function extractChars(row) {
  const chars = [];
  for (let i = 0; i <= 23; i++) {
    const suffix = i === 0 ? '' : `_${i}`;
    const label = String(row[`Назва_Характеристики${suffix}`] ?? '').trim();
    const unit  = String(row[`Одиниця_виміру_Характеристики${suffix}`] ?? '').trim();
    const value = String(row[`Значення_Характеристики${suffix}`] ?? '').trim();
    if (!label || !value || SKIP_LABELS.has(label)) continue;
    const displayValue = unit ? `${value} ${unit}` : value;
    chars.push({ label, value: displayValue });
  }
  return chars;
}

// ── Головна функція ───────────────────────────────────────────────────────────

async function main() {
  console.log('\n📊 Читаю Prom.ua Excel...');
  const wb   = XLSX.readFile('export-products-28-04-26_20-13-13.xlsx');
  const ws   = wb.Sheets['Export Products Sheet'];
  const rows = XLSX.utils.sheet_to_json(ws, { defval: '' });
  console.log(`   Рядків: ${rows.length}`);

  // Будуємо map: supplier_sku → характеристики
  const promMap = {};
  for (const row of rows) {
    const code = String(row['Код_товару'] ?? '').trim();
    if (!code) continue;
    const chars = extractChars(row);
    if (chars.length > 0) promMap[code] = chars;
  }
  console.log(`   Товарів з характеристиками: ${Object.keys(promMap).length}`);

  // Завантажуємо наші товари з поточними характеристиками
  const { data: products } = await supabase
    .from('products')
    .select('sku, supplier_sku, name')
    .not('supplier_sku', 'is', null);

  // Завантажуємо поточні характеристики
  const { data: existing } = await supabase
    .from('product_characteristics')
    .select('product_sku, label');

  // Групуємо існуючі по sku
  const existingMap = {};
  for (const e of existing ?? []) {
    if (!existingMap[e.product_sku]) existingMap[e.product_sku] = new Set();
    existingMap[e.product_sku].add(e.label.toLowerCase());
  }

  let matched = 0, newOnly = 0, merged = 0;
  const toInsert = [];

  for (const p of products ?? []) {
    const supplierSku = p.supplier_sku?.trim();
    const chars = promMap[supplierSku];
    if (!chars || chars.length === 0) continue;

    const hasExisting = existingMap[p.sku];
    matched++;

    // Визначаємо стартовий sort_order (після існуючих)
    const existingCount = hasExisting ? hasExisting.size : 0;
    let sortStart = existingCount + 1;

    for (const c of chars) {
      // Пропускаємо якщо така характеристика вже є
      if (hasExisting && hasExisting.has(c.label.toLowerCase())) continue;

      toInsert.push({
        product_sku: p.sku,
        label:       c.label,
        value:       c.value,
        sort_order:  sortStart++,
      });
    }

    if (!hasExisting) newOnly++;
    else if (sortStart > existingCount + 1) merged++;

    if (DRY_RUN && matched <= 3) {
      const newChars = chars.filter(c => !hasExisting?.has(c.label.toLowerCase()));
      console.log(`\n[${p.sku}] ${p.name?.slice(0, 50)}`);
      console.log(`  Вже є: ${existingCount}, Нових з Prom: ${newChars.length}`);
      newChars.slice(0, 5).forEach(c => console.log(`  + ${c.label}: ${c.value}`));
    }
  }

  console.log(`\n✅ Знайдено товарів Prom у нашій базі: ${matched}`);
  console.log(`   Без попередніх характеристик:        ${newOnly}`);
  console.log(`   З додаванням нових характеристик:    ${merged}`);
  console.log(`📝 Нових характеристик для запису:      ${toInsert.length}`);

  if (DRY_RUN) { console.log('\n🔍 DRY RUN — дані не записано.\n'); return; }
  if (toInsert.length === 0) { console.log('\nНічого нового для додавання.\n'); return; }

  console.log('\n➕ Записую нові характеристики...');
  for (let i = 0; i < toInsert.length; i += 500) {
    const { error } = await supabase.from('product_characteristics').insert(toInsert.slice(i, i + 500));
    if (error) console.error('❌', error.message);
    else process.stdout.write(`\r   ${Math.min(i + 500, toInsert.length)}/${toInsert.length}`);
  }

  console.log(`\n\n✅ Готово! Додано ${toInsert.length} нових характеристик.\n`);
}

main().catch(err => { console.error('\n❌', err.message); process.exit(1); });
