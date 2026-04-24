/**
 * Import supplier products from Prom.ua Excel export into Supabase.
 *
 * Usage:
 *   node scripts/import-supplier.mjs <path-to-xlsx> [--dry-run]
 *
 * Category mapping: edit CATEGORY_MAP below to match your site categories.
 */

import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const XLSX = require('xlsx');
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import path from 'path';

// ── Config ────────────────────────────────────────────────────────────────────

// Load .env.local manually (no dotenv dependency)
const envPath = new URL('../.env.local', import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1');
const envLines = readFileSync(envPath, 'utf-8').split('\n');
const env = {};
for (const line of envLines) {
  const m = line.match(/^([^#=]+)=(.*)$/);
  if (m) env[m[1].trim()] = m[2].trim();
}

const SUPABASE_URL = env['NEXT_PUBLIC_SUPABASE_URL'];
const SERVICE_KEY  = env['SUPABASE_SERVICE_ROLE_KEY'];

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('❌ Не знайдено NEXT_PUBLIC_SUPABASE_URL або SUPABASE_SERVICE_ROLE_KEY в .env.local');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

// Supplier group IDs → your site category slugs
const CATEGORY_MAP = {
  119119123: 'germetyky',       // Герметики і силікони
  119119124: 'montazhni-piny',  // Монтажна піна
};

const FILE_PATH = process.argv[2];
const DRY_RUN   = process.argv.includes('--dry-run');

if (!FILE_PATH) {
  console.error('Usage: node scripts/import-supplier.mjs <path-to-xlsx> [--dry-run]');
  process.exit(1);
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function parsePrice(raw) {
  if (!raw) return 0;
  return parseFloat(String(raw).replace(',', '.')) || 0;
}

function parseQty(raw) {
  if (!raw) return 0;
  return Math.round(parseFloat(String(raw).replace(',', '.'))) || 0;
}

function stripHtml(html) {
  if (!html) return null;
  return String(html)
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s{2,}/g, ' ')
    .trim() || null;
}

// Collect characteristics from a row (xlsx adds _1, _2 ... suffixes for duplicate columns)
function extractChars(row) {
  const chars = [];
  let i = 0;
  while (true) {
    const suffix = i === 0 ? '' : `_${i}`;
    const labelKey = `Назва_Характеристики${suffix}`;
    const unitKey  = `Одиниця_виміру_Характеристики${suffix}`;
    const valueKey = `Значення_Характеристики${suffix}`;

    if (!(labelKey in row)) break;

    const label = row[labelKey];
    const unit  = row[unitKey] || '';
    const value = row[valueKey];

    if (label && value !== undefined && value !== '') {
      const displayLabel = unit ? `${label}, ${unit}` : label;
      chars.push({ label: String(displayLabel), value: String(value), sort_order: i + 1 });
    }
    i++;
  }
  return chars;
}

// Try to pull volume and color from characteristics
function findCharValue(chars, ...labels) {
  for (const { label, value } of chars) {
    for (const l of labels) {
      if (label.toLowerCase().startsWith(l.toLowerCase())) return value;
    }
  }
  return null;
}

// ── Main ──────────────────────────────────────────────────────────────────────

const absPath = path.resolve(FILE_PATH);
console.log(`📂 Читаю файл: ${absPath}`);
const wb = XLSX.readFile(absPath);
const ws = wb.Sheets['Export Products Sheet'];
if (!ws) { console.error('❌ Лист "Export Products Sheet" не знайдено'); process.exit(1); }

const rows = XLSX.utils.sheet_to_json(ws);
const targetGroupIds = new Set(Object.keys(CATEGORY_MAP).map(Number));
const filtered = rows.filter(r => targetGroupIds.has(Number(r['Номер_групи'])));

console.log(`✅ Знайдено ${filtered.length} товарів у вибраних категоріях\n`);
if (DRY_RUN) console.log('🔍 DRY RUN — дані не записуються\n');

const products   = [];
const stocks     = [];
const allChars   = [];

for (const row of filtered) {
  const sku          = String(row['Код_товару']).trim();
  const supplierSku  = sku;
  const name         = String(row['Назва_позиції_укр'] || row['Назва_позиції'] || '').trim();
  const brand        = String(row['Виробник'] || '').trim();
  const groupId      = Number(row['Номер_групи']);
  const categorySlug = CATEGORY_MAP[groupId] || null;
  const isActive     = String(row['Наявність']).trim() === '+';
  const stockQty     = parseQty(row['Кількість']);
  const priceUnit    = parsePrice(row['Ціна']);
  const minOrder     = parseQty(row['Мінімальне_замовлення_опт']) || 1;
  const imageUrl     = String(row['Посилання_зображення'] || '').split(',')[0].trim() || null;
  const descRaw      = row['Опис_укр'] || row['Опис'] || '';
  const description  = stripHtml(String(descRaw)).slice(0, 2000) || null;

  const chars = extractChars(row);
  const volume = findCharValue(chars, "Об'єм", 'Об`єм', 'Обʼєм', 'Об єм');
  const color  = findCharValue(chars, 'Колір');

  // Skip chars that duplicate product-level fields (brand is already stored)
  const filteredChars = chars.filter(c => !['Торговая марка', 'Торгова марка'].includes(c.label));

  products.push({
    sku,
    name,
    brand,
    category_slug: categorySlug,
    product_type:  null,
    color:         color || null,
    volume:        volume ? `${volume} мл` : null,
    pack_qty:      minOrder,
    min_order:     minOrder,
    description,
    image:         imageUrl,
    nl1:           null,
    nl2:           null,
    bc:            '#E8EEF5',
    ac:            '#1E3A5F',
    img_type:      'tube',
    is_active:     isActive,
    sort_order:    0,
  });

  stocks.push({
    sku,
    supplier_sku:  supplierSku,
    price_unit:    priceUnit,
    price_old:     null,
    stock_qty:     stockQty,
    stock_status:  isActive && stockQty > 0 ? 'in_stock' : 'out_of_stock',
  });

  for (const c of filteredChars) {
    allChars.push({ product_sku: sku, ...c });
  }
}

// ── Preview ───────────────────────────────────────────────────────────────────

console.log('=== ПЕРШІ 3 ТОВАРИ (preview) ===');
products.slice(0, 3).forEach((p, i) => {
  console.log(`\n[${i+1}] ${p.sku} — ${p.name}`);
  console.log(`     Бренд: ${p.brand} | Категорія: ${p.category_slug} | Ціна: ${stocks[i].price_unit} грн`);
  console.log(`     Наявність: ${stocks[i].stock_status} (${stocks[i].stock_qty} шт) | Мін. замовлення: ${p.min_order}`);
  console.log(`     Фото: ${p.image}`);
  const pc = allChars.filter(c => c.product_sku === p.sku);
  console.log(`     Характеристик: ${pc.length}`);
});

console.log(`\n📦 Всього: ${products.length} товарів, ${allChars.length} характеристик`);

if (DRY_RUN) {
  console.log('\n✅ DRY RUN завершено. Запустіть без --dry-run щоб записати дані.');
  process.exit(0);
}

// ── Write to Supabase ─────────────────────────────────────────────────────────

console.log('\n🚀 Записую в Supabase...');

// 1. Fetch existing products that already have a custom description
const skusAll = products.map(p => p.sku);
const { data: existingWithDesc } = await supabase
  .from('products')
  .select('sku, description')
  .in('sku', skusAll)
  .not('description', 'is', null);

const customDescSkus = new Set((existingWithDesc ?? []).map(r => r.sku));
console.log(`   Товарів з власним описом (не перезаписуємо): ${customDescSkus.size}`);

// For products that already have a custom description — exclude description from upsert
const productsToUpsert = products.map(p =>
  customDescSkus.has(p.sku) ? { ...p, description: undefined } : p
);

// Upsert products
const { error: pe } = await supabase
  .from('products')
  .upsert(productsToUpsert, { onConflict: 'sku' });
if (pe) { console.error('❌ products:', pe.message); process.exit(1); }
console.log(`✅ products: ${products.length} рядків`);

// 2. Upsert product_stock
const { error: se } = await supabase
  .from('product_stock')
  .upsert(stocks, { onConflict: 'sku' });
if (se) { console.error('❌ product_stock:', se.message); process.exit(1); }
console.log(`✅ product_stock: ${stocks.length} рядків`);

// 3. Delete old chars for these skus, then insert fresh
const { error: de } = await supabase
  .from('product_characteristics')
  .delete()
  .in('product_sku', skusAll);
if (de) { console.error('❌ delete chars:', de.message); process.exit(1); }

if (allChars.length > 0) {
  const { error: ce } = await supabase
    .from('product_characteristics')
    .insert(allChars);
  if (ce) { console.error('❌ product_characteristics:', ce.message); process.exit(1); }
}
console.log(`✅ product_characteristics: ${allChars.length} рядків`);

console.log('\n🎉 Імпорт завершено!');
