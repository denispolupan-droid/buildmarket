/**
 * sync-stock.ts
 * Синхронізує залишки та ціни з файлу постачальника.
 *
 * Підтримувані формати:
 *   --format=1c_xml   CommerceML 2.x (вивантаження з 1С)
 *   --format=1c_csv   CSV з 1С або власний формат постачальника
 *
 * Запуск:
 *   npx tsx scripts/supabase/sync-stock.ts --format=1c_xml --file=stock.xml
 *   npx tsx scripts/supabase/sync-stock.ts --format=1c_csv --file=stock.csv
 *
 * Мапінг SKU:
 *   Скрипт шукає ваш SKU за полем supplier_sku у таблиці product_stock.
 *   Перший запуск: записує supplier_sku разом із рештою даних.
 *   Якщо supplier_sku не збігається — рядок пропускається з попередженням.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';
import { XMLParser } from 'fast-xml-parser';
import { createServiceClient } from '../../lib/supabase';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

// ── Типи ──────────────────────────────────────────────────────────────────────

type StockRow = {
  supplier_sku: string;
  price_unit: number;
  price_old?: number | null;
  stock_qty: number;
  stock_status: 'in_stock' | 'out_of_stock' | 'on_order';
};

// ── Парсери ───────────────────────────────────────────────────────────────────

/**
 * CommerceML 2.x — стандартний формат 1С
 * Структура: КомерческаяИнформация > ПакетПредложений > Предложения > Предложение
 */
function parse1cXml(filePath: string): StockRow[] {
  const xml = fs.readFileSync(filePath, 'utf-8');
  const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_' });
  const doc = parser.parse(xml);

  // Спробуємо знайти пропозиції в різних місцях дерева
  const root =
    doc?.КомерческаяИнформация ??
    doc?.CommercialInformation ??
    doc;

  const pack =
    root?.ПакетПредложений?.Предложения?.Предложение ??
    root?.OfferPackage?.Offers?.Offer ??
    [];

  const rows: StockRow[] = [];

  for (const offer of Array.isArray(pack) ? pack : [pack]) {
    const supplierSku =
      String(offer?.Ид ?? offer?.Id ?? offer?.Артикул ?? offer?.Article ?? '').trim();
    if (!supplierSku) continue;

    const priceRaw =
      offer?.Цены?.Цена?.ЦенаЗаЕдиницу ??
      offer?.Prices?.Price?.PricePerUnit ??
      offer?.Цена ??
      0;
    const price = parseFloat(String(priceRaw).replace(',', '.')) || 0;

    const qty =
      Number(offer?.Количество ?? offer?.Quantity ?? offer?.Остаток ?? 0);

    rows.push({
      supplier_sku: supplierSku,
      price_unit:   price,
      stock_qty:    qty,
      stock_status: qty > 0 ? 'in_stock' : 'out_of_stock',
    });
  }
  return rows;
}

/**
 * CSV-формат: перший рядок — заголовки
 * Очікувані стовпці (регістр не важливий):
 *   sku / supplier_sku / артикул / article
 *   price / ціна / цена
 *   qty / quantity / залишок / остаток
 *   price_old / стара_ціна (опційно)
 */
function parse1cCsv(filePath: string): StockRow[] {
  const text = fs.readFileSync(filePath, 'utf-8');
  const lines = text.split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) return [];

  // Детектуємо роздільник
  const sep = lines[0].includes(';') ? ';' : ',';
  const headers = lines[0].split(sep).map((h) => h.trim().toLowerCase().replace(/['"]/g, ''));

  const col = (names: string[]): number =>
    names.reduce<number>((found, n) => (found >= 0 ? found : headers.indexOf(n)), -1);

  const iSku   = col(['sku', 'supplier_sku', 'артикул', 'article', 'код']);
  const iPrice = col(['price', 'ціна', 'цена', 'price_unit']);
  const iQty   = col(['qty', 'quantity', 'залишок', 'остаток', 'кількість', 'количество']);
  const iOld   = col(['price_old', 'стара_ціна', 'старая_цена']);

  if (iSku < 0 || iPrice < 0) {
    throw new Error(
      `CSV: не знайдено обов'язкові колонки SKU або Ціна. Знайдені заголовки: ${headers.join(', ')}`
    );
  }

  const rows: StockRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cells = lines[i].split(sep).map((c) => c.trim().replace(/^["']|["']$/g, ''));
    const supplierSku = cells[iSku]?.trim();
    if (!supplierSku) continue;

    const price = parseFloat(cells[iPrice]?.replace(',', '.') ?? '0') || 0;
    const qty   = parseInt(cells[iQty] ?? '0', 10) || 0;
    const old   = iOld >= 0 ? parseFloat(cells[iOld]?.replace(',', '.') ?? '') || null : null;

    rows.push({
      supplier_sku: supplierSku,
      price_unit:   price,
      price_old:    old,
      stock_qty:    qty,
      stock_status: qty > 0 ? 'in_stock' : 'out_of_stock',
    });
  }
  return rows;
}

// ── Аргументи командного рядка ────────────────────────────────────────────────

function getArg(name: string): string | undefined {
  const prefix = `--${name}=`;
  return process.argv.find((a) => a.startsWith(prefix))?.slice(prefix.length);
}

// ── Головна функція ───────────────────────────────────────────────────────────

async function main() {
  const format = getArg('format') ?? '1c_csv';
  const fileArg = getArg('file');

  if (!fileArg) {
    console.error('❌  Вкажіть файл: --file=path/to/stock.xml (або .csv)');
    process.exit(1);
  }

  const filePath = path.resolve(process.cwd(), fileArg);
  if (!fs.existsSync(filePath)) {
    console.error(`❌  Файл не знайдено: ${filePath}`);
    process.exit(1);
  }

  console.log(`\n📂  Читаємо файл: ${filePath}  (формат: ${format})`);

  let rows: StockRow[];
  if (format === '1c_xml') {
    rows = parse1cXml(filePath);
  } else if (format === '1c_csv') {
    rows = parse1cCsv(filePath);
  } else {
    console.error(`❌  Невідомий формат: ${format}. Доступні: 1c_xml, 1c_csv`);
    process.exit(1);
  }

  console.log(`   Знайдено позицій у файлі: ${rows.length}`);
  if (rows.length === 0) {
    console.log('   Нічого синхронізувати.\n');
    return;
  }

  const supabase = createServiceClient();
  const startedAt = new Date();
  const startedAtIso = startedAt.toISOString();

  // Постачальник (обов'язково для multi-supplier логіки)
  const supplierIdArg = getArg('supplier');
  const supplierId = supplierIdArg ? parseInt(supplierIdArg) : null;

  if (!supplierId) {
    console.error('❌  Вкажіть постачальника: --supplier=<id>');
    console.error('    Список постачальників: SELECT id, name FROM suppliers;');
    process.exit(1);
  }

  console.log(`   Постачальник ID: ${supplierId}`);

  // Попередній синк — для перевірки повноти файлу
  const { data: prevSync } = await supabase
    .from('sync_log')
    .select('rows_total')
    .eq('supplier_id', supplierId)
    .order('started_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  const prevRows: number | null = (prevSync as { rows_total?: number } | null)?.rows_total ?? null;

  // Маппінг: supplier_sku → наш SKU (з supplier_sku_map для цього постачальника)
  const { data: mapRows } = await supabase
    .from('supplier_sku_map')
    .select('supplier_sku, our_sku')
    .eq('supplier_id', supplierId);

  const skuBySupplier: Record<string, string> = {};
  (mapRows ?? []).forEach((r: { supplier_sku: string; our_sku: string }) => {
    skuBySupplier[r.supplier_sku] = r.our_sku;
  });

  // Fallback: product_stock.supplier_sku (для сумісності)
  const { data: stockMap } = await supabase
    .from('product_stock')
    .select('sku, supplier_sku');
  (stockMap ?? []).forEach((r: { sku: string; supplier_sku: string | null }) => {
    if (r.supplier_sku && !skuBySupplier[r.supplier_sku]) {
      skuBySupplier[r.supplier_sku] = r.sku;
    }
  });

  // Всі наші SKU (для прямого співпадіння)
  const { data: allProducts } = await supabase.from('products').select('sku');
  const ourSkus = new Set((allProducts ?? []).map((p: { sku: string }) => p.sku));

  let updated = 0, skipped = 0;
  const errors: string[] = [];
  const syncTime = new Date().toISOString();

  for (const row of rows) {
    const ourSku = skuBySupplier[row.supplier_sku]
      ?? (ourSkus.has(row.supplier_sku) ? row.supplier_sku : null);

    if (!ourSku) {
      errors.push(`supplier_sku=${row.supplier_sku}: не знайдено`);
      skipped++;
      continue;
    }

    // ── Записуємо в supplier_stock (основна таблиця) ──────────────────────────
    const { error: ssError } = await supabase
      .from('supplier_stock')
      .upsert({
        sku:            ourSku,
        supplier_id:    supplierId,
        supplier_sku:   row.supplier_sku,
        stock_qty:      row.stock_qty,
        stock_status:   row.stock_status,
        price_unit:     row.price_unit,
        price_cost:     row.price_unit,   // ціна постачальника = наша закупівельна
        last_synced_at: syncTime,
        updated_at:     syncTime,
      }, { onConflict: 'sku,supplier_id' });

    if (ssError) {
      // ── Fallback: product_stock (якщо supplier_stock не підтримується) ───────
      const { error: psError } = await supabase
        .from('product_stock')
        .upsert({
          sku:          ourSku,
          supplier_sku: row.supplier_sku,
          price_unit:   row.price_unit,
          price_cost:   row.price_unit,
          price_old:    row.price_old ?? null,
          stock_qty:    row.stock_qty,
          stock_status: row.stock_status,
          updated_at:   syncTime,
        }, { onConflict: 'sku' });

      if (psError) { errors.push(`sku=${ourSku}: ${psError.message}`); skipped++; continue; }
    }

    updated++;
    process.stdout.write(`\r   ✅  Оброблено: ${updated + skipped} / ${rows.length}`);
  }

  console.log('\n');

  // ── Позначаємо відсутні товари як out_of_stock (якщо повний файл) ────────────
  let markedAbsent = 0;
  const { data: markResult } = await supabase.rpc('mark_absent_supplier_stock', {
    p_supplier_id:  supplierId,
    p_sync_started: startedAtIso,
    p_rows_in_file: rows.length,
    p_prev_rows:    prevRows,
  });
  markedAbsent = (markResult as number) ?? 0;
  if (markedAbsent > 0) {
    console.log(`   ⚠️  Позначено як out_of_stock (відсутні у файлі): ${markedAbsent}`);
  }

  // ── Лог ──────────────────────────────────────────────────────────────────────
  await supabase.from('sync_log').insert({
    supplier_id:     supplierId,
    source:          format,
    status:          errors.length === 0 ? 'success' : updated > 0 ? 'partial' : 'error',
    rows_total:      rows.length,
    rows_updated:    updated,
    rows_skipped:    skipped,
    rows_unmapped:   skipped,
    error_message:   errors.length > 0 ? errors.slice(0, 20).join('\n') : null,
    started_at:      startedAtIso,
    finished_at:     new Date().toISOString(),
  });

  console.log('📊  Результат:');
  console.log(`    Оновлено: ${updated}  |  Пропущено: ${skipped}  |  Out_of_stock: ${markedAbsent}`);
  if (errors.length > 0) {
    console.log(`\n⚠️  Попередження (${errors.length}):`);
    errors.slice(0, 10).forEach((e) => console.log(`    ${e}`));
    if (errors.length > 10) console.log(`    ... і ще ${errors.length - 10}`);
  }
  console.log('\n✅  Синхронізацію завершено!\n');
}

main().catch((err) => {
  console.error('\n❌  Критична помилка:', err.message);
  process.exit(1);
});
