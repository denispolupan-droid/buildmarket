/**
 * import-from-excel.ts
 * Читає Excel-файл з товарами і завантажує/оновлює їх у Supabase.
 *
 * Запуск:
 *   npx tsx scripts/supabase/import-from-excel.ts                      # products-template.xlsx
 *   npx tsx scripts/supabase/import-from-excel.ts path/to/my-file.xlsx
 *
 * Логіка:
 *   - Унікальний ключ — SKU
 *   - Якщо SKU вже є → оновлює (upsert)
 *   - Якщо SKU новий → додає
 *   - Характеристики: видаляє старі й записує нові
 *   - Записує рядок у sync_log
 */

import * as XLSX from 'xlsx';
import * as dotenv from 'dotenv';
import path from 'path';
import { createServiceClient } from '../../lib/supabase';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

// ── Типи рядка Excel ──────────────────────────────────────────────────────────

type ExcelRow = Record<string, string | number | undefined>;

// ── Парсинг характеристик ─────────────────────────────────────────────────────

function parseChars(row: ExcelRow) {
  const chars: { label: string; value: string; sort_order: number }[] = [];
  for (let i = 1; i <= 10; i++) {
    const raw = String(row[`Характеристика ${i}`] ?? '').trim();
    if (!raw) continue;
    const [label, ...rest] = raw.split('|');
    const value = rest.join('|').trim();
    if (label && value) chars.push({ label: label.trim(), value, sort_order: i });
  }
  return chars;
}

// ── Головна функція ───────────────────────────────────────────────────────────

async function main() {
  const filePath = process.argv[2]
    ? path.resolve(process.cwd(), process.argv[2])
    : path.resolve(process.cwd(), 'products-template.xlsx');

  console.log(`\n📂  Читаємо файл: ${filePath}`);

  const wb = XLSX.readFile(filePath);
  const ws = wb.Sheets['Товари'];
  if (!ws) throw new Error('Аркуш "Товари" не знайдено в файлі!');

  const rows: ExcelRow[] = XLSX.utils.sheet_to_json(ws);
  console.log(`   Знайдено рядків товарів: ${rows.length}`);

  const supabase = createServiceClient();
  const startedAt = new Date().toISOString();
  let updated = 0, skipped = 0;
  const errors: string[] = [];

  // ── Імпорт категорій ────────────────────────────────────────────────────────
  const wsCats = wb.Sheets['Категорії'];
  if (wsCats) {
    const catRows: ExcelRow[] = XLSX.utils.sheet_to_json(wsCats);
    console.log(`   Знайдено категорій: ${catRows.length}`);
    for (const cat of catRows) {
      const slug = String(cat['slug *'] ?? '').trim();
      const name = String(cat['Назва *'] ?? '').trim();
      if (!slug || !name) continue;
      const sort = Number(cat['sort_order'] ?? 0) || 0;
      const { error } = await supabase
        .from('categories')
        .upsert({ slug, name, sort_order: sort }, { onConflict: 'slug' });
      if (error) errors.push(`Категорія ${slug}: ${error.message}`);
    }
    console.log('   ✅  Категорії оновлено');
  }

  // Підтримуємо обидва формати: з * (шаблон) і без * (експорт)
  const col = (r: ExcelRow, ...keys: string[]) => {
    for (const k of keys) { const v = r[k]; if (v !== undefined && v !== '') return String(v); }
    return '';
  };

  for (const row of rows) {
    const sku = col(row, 'SKU *', 'SKU').trim();
    if (!sku) { skipped++; continue; }

    // Збираємо дані продукту
    const product = {
      sku,
      name:              col(row, 'Назва *', 'Назва').trim(),
      brand:             col(row, 'Бренд *', 'Бренд').trim(),
      category_slug:     col(row, 'Категорія *', 'Категорія (slug)').trim() || null,
      product_type:      col(row, 'Тип матеріалу').trim() || null,
      color:             col(row, 'Колір').trim() || null,
      volume:            col(row, "Об'єм / Вага").trim() || null,
      pack_qty:          Number(row['В упаковці (шт)'] ?? 1) || 1,
      min_order:         Number(row['Мін. замовлення (шт)'] ?? 1) || 1,
      description:       col(row, 'Опис (УКР)', 'Опис').trim() || null,
      description_ru:    col(row, 'Опис (РУС)').trim() || null,
      description_full:  col(row, 'Повний опис (УКР)').trim() || null,
      description_full_ru: col(row, 'Повний опис (РУС)').trim() || null,
      image:             col(row, 'Фото (шлях)', 'Фото (URL)').trim() || null,
      img_type:          (col(row, 'Тип SVG') as 'tube' | 'canister') || 'tube',
      nl1:               col(row, 'SVG рядок 1').trim() || null,
      nl2:               col(row, 'SVG рядок 2').trim() || null,
      bc:                col(row, 'SVG колір тіла') || '#4A6080',
      ac:                col(row, 'SVG колір акценту') || '#2A4060',
      sort_order:        Number(row['Порядок сортування'] ?? 0) || 0,
      is_active:         true,
    };

    if (!product.name || !product.brand) {
      errors.push(`SKU ${sku}: відсутня назва або бренд — пропущено`);
      skipped++;
      continue;
    }

    // Upsert товару
    const { error: productErr } = await supabase
      .from('products')
      .upsert(product, { onConflict: 'sku' });

    if (productErr) {
      errors.push(`SKU ${sku}: ${productErr.message}`);
      skipped++;
      continue;
    }

    // Ціни та залишки (product_stock)
    const supplierSku   = String(row['Артикул постачальника'] ?? '').trim() || null;
    const priceCost     = parseFloat(String(col(row, 'Наш вхід (грн)', 'Наш вхід').replace(',', '.')) || '') || null;
    const priceUnit     = parseFloat(String(col(row, 'Ціна каталог (грн/шт)', 'Ціна (грн/шт)').replace(',', '.')) || '') || null;
    const priceOldUnit  = parseFloat(String(col(row, 'Стара ціна каталог', 'Стара ціна').replace(',', '.')) || '') || null;
    const priceRetail   = parseFloat(String(col(row, 'Ціна магазин (грн/шт)').replace(',', '.')) || '') || null;
    const priceOldRetail= parseFloat(String(col(row, 'Стара ціна магазин').replace(',', '.')) || '') || null;
    const priceDrop     = parseFloat(String(col(row, 'Ціна дроп (грн/шт)').replace(',', '.')) || '') || null;

    if (priceUnit !== null || supplierSku) {
      const stockQty = parseInt(String(row['Залишок (шт)'] ?? '0'), 10) || 0;
      const rawStatus = String(row['Статус'] ?? '').trim();
      const stockStatus = ['in_stock','out_of_stock','on_order'].includes(rawStatus)
        ? rawStatus
        : stockQty > 0 ? 'in_stock' : 'out_of_stock';

      const { error: stockErr } = await supabase
        .from('product_stock')
        .upsert({
          sku,
          supplier_sku:      supplierSku,
          price_cost:        priceCost,
          price_unit:        priceUnit ?? 0,
          price_old:         priceOldUnit,
          price_retail:      priceRetail,
          price_retail_old:  priceOldRetail,
          price_drop:        priceDrop,
          stock_qty:         stockQty,
          stock_status:      stockStatus,
          updated_at:        new Date().toISOString(),
        }, { onConflict: 'sku' });

      if (stockErr) errors.push(`SKU ${sku} stock: ${stockErr.message}`);
    }

    // Характеристики: видаляємо старі → вставляємо нові
    const chars = parseChars(row);
    await supabase.from('product_characteristics').delete().eq('product_sku', sku);
    if (chars.length > 0) {
      const { error: charErr } = await supabase
        .from('product_characteristics')
        .insert(chars.map((c) => ({ ...c, product_sku: sku })));
      if (charErr) errors.push(`SKU ${sku} chars: ${charErr.message}`);
    }

    updated++;
    process.stdout.write(`\r   ✅  Оброблено: ${updated + skipped} / ${rows.length}`);
  }

  console.log('\n');

  // Деактивуємо товари яких немає в Excel
  const excelSkus = rows
    .map((r) => String(r['SKU *'] ?? '').trim())
    .filter(Boolean);

  if (excelSkus.length > 0) {
    const { data: allActive } = await supabase
      .from('products')
      .select('sku')
      .eq('is_active', true);

    const toDeactivate = (allActive ?? [])
      .map((p: { sku: string }) => p.sku)
      .filter((sku: string) => !excelSkus.includes(sku));

    if (toDeactivate.length > 0) {
      await supabase
        .from('products')
        .update({ is_active: false })
        .in('sku', toDeactivate);
      console.log(`   ⚠️  Деактивовано товарів (немає в Excel): ${toDeactivate.length}`);
      console.log(`      SKU: ${toDeactivate.join(', ')}`);
    }
  }

  // Лог синхронізації
  await supabase.from('sync_log').insert({
    source:          'excel',
    status:          errors.length === 0 ? 'success' : updated > 0 ? 'partial' : 'error',
    records_total:   rows.length,
    records_updated: updated,
    records_skipped: skipped,
    error_details:   errors.length > 0 ? errors.slice(0, 20).join('\n') : null,
    started_at:      startedAt,
    finished_at:     new Date().toISOString(),
  });

  console.log(`📊  Результат:`);
  console.log(`    Оновлено/додано: ${updated}`);
  console.log(`    Пропущено:       ${skipped}`);
  if (errors.length > 0) {
    console.log(`\n⚠️  Помилки (${errors.length}):`);
    errors.slice(0, 10).forEach((e) => console.log(`    ${e}`));
    if (errors.length > 10) console.log(`    ... і ще ${errors.length - 10}`);
  }
  console.log('\n✅  Імпорт завершено!\n');
}

main().catch((err) => {
  console.error('\n❌  Критична помилка:', err.message);
  process.exit(1);
});
