/**
 * lib/supplier-sync.ts
 * Основна логіка синхронізації одного постачальника.
 * Використовується і в ручному запуску (/api/admin/suppliers/[id]/sync),
 * і в cron (/api/cron/sync-suppliers).
 */

import { XMLParser } from 'fast-xml-parser';
import * as XLSX from 'xlsx';
import { createClient } from '@supabase/supabase-js';

// ── Типи ──────────────────────────────────────────────────────────────────────

type ParsedRow = {
  supplier_sku: string;
  price_in: number;       // ціна з файлу (до знижки)
  stock_qty: number;
  sample_name?: string;   // назва з файлу (для unmapped логу)
};

export type SyncResult = {
  rows_total: number;
  rows_updated: number;
  rows_skipped: number;
  rows_unmapped: number;
  error_message: string | null;
};

// ── Парсери ───────────────────────────────────────────────────────────────────

function parseCsv(buffer: Buffer): ParsedRow[] {
  const text = buffer.toString('utf-8');
  const lines = text.split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) return [];

  const sep = lines[0].includes(';') ? ';' : ',';
  const headers = lines[0].split(sep).map(h => h.trim().toLowerCase().replace(/['"]/g, ''));

  const col = (...names: string[]) =>
    names.reduce<number>((f, n) => (f >= 0 ? f : headers.indexOf(n)), -1);

  const iSku  = col('sku', 'supplier_sku', 'артикул', 'article', 'код');
  const iPrice = col('price', 'ціна', 'цена', 'price_unit', 'прайс');
  const iQty  = col('qty', 'quantity', 'залишок', 'остаток', 'кількість', 'количество');
  const iName = col('name', 'назва', 'наименование', 'товар');

  if (iSku < 0 || iPrice < 0) {
    throw new Error(`CSV: не знайдено колонки SKU або Ціна. Заголовки: ${headers.join(', ')}`);
  }

  const rows: ParsedRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cells = lines[i].split(sep).map(c => c.trim().replace(/^["']|["']$/g, ''));
    const supplier_sku = cells[iSku]?.trim();
    if (!supplier_sku) continue;
    rows.push({
      supplier_sku,
      price_in:    parseFloat(cells[iPrice]?.replace(',', '.') ?? '0') || 0,
      stock_qty:   parseInt(cells[iQty] ?? '0', 10) || 0,
      sample_name: iName >= 0 ? cells[iName] : undefined,
    });
  }
  return rows;
}

function parseXlsx(buffer: Buffer): ParsedRow[] {
  const wb = XLSX.read(buffer, { type: 'buffer' });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const raw = XLSX.utils.sheet_to_json<Record<string, string | number>>(ws, { defval: '' });

  const col = (obj: Record<string, unknown>, ...names: string[]) => {
    const key = Object.keys(obj).find(k => names.includes(k.toLowerCase().trim()));
    return key ? String(obj[key]).trim() : '';
  };

  return raw.map(r => ({
    supplier_sku: col(r, 'sku', 'артикул', 'article', 'код'),
    price_in:     parseFloat(String(col(r, 'price', 'ціна', 'цена', 'прайс')).replace(',', '.')) || 0,
    stock_qty:    parseInt(col(r, 'qty', 'залишок', 'остаток', 'кількість'), 10) || 0,
    sample_name:  col(r, 'name', 'назва', 'наименование', 'товар') || undefined,
  })).filter(r => r.supplier_sku);
}

function parse1cXml(buffer: Buffer): ParsedRow[] {
  const xml = buffer.toString('utf-8');
  const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_' });
  const doc = parser.parse(xml);

  const root = doc?.КомерческаяИнформация ?? doc?.CommercialInformation ?? doc;
  const pack =
    root?.ПакетПредложений?.Предложения?.Предложение ??
    root?.OfferPackage?.Offers?.Offer ?? [];

  return (Array.isArray(pack) ? pack : [pack]).map(offer => {
    const supplier_sku = String(
      offer?.Ид ?? offer?.Id ?? offer?.Артикул ?? offer?.Article ?? ''
    ).trim();
    const priceRaw =
      offer?.Цены?.Цена?.ЦенаЗаЕдиницу ??
      offer?.Prices?.Price?.PricePerUnit ??
      offer?.Цена ?? 0;
    return {
      supplier_sku,
      price_in:   parseFloat(String(priceRaw).replace(',', '.')) || 0,
      stock_qty:  Number(offer?.Количество ?? offer?.Quantity ?? offer?.Остаток ?? 0),
      sample_name: String(offer?.Наименование ?? offer?.Name ?? '').trim() || undefined,
    };
  }).filter(r => r.supplier_sku);
}

// ── Скачування файлу ──────────────────────────────────────────────────────────

async function fetchFile(url: string): Promise<Buffer> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} при завантаженні файлу`);
  return Buffer.from(await res.arrayBuffer());
}

// ── Головна функція ───────────────────────────────────────────────────────────

export async function syncSupplier(supplierId: number): Promise<SyncResult> {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  // 1. Завантажуємо налаштування постачальника
  const { data: supplier, error: supErr } = await supabase
    .from('suppliers')
    .select('*, brand_discounts:supplier_brand_discounts(*)')
    .eq('id', supplierId)
    .single();

  if (supErr || !supplier) throw new Error('Постачальника не знайдено');
  if (!supplier.source_url) throw new Error('URL файлу не вказано');

  // 2. Скачуємо і парсимо файл
  const buffer = await fetchFile(supplier.source_url);

  let parsed: ParsedRow[];
  if (supplier.file_format === '1c_xml') {
    parsed = parse1cXml(buffer);
  } else if (supplier.file_format === 'xls') {
    parsed = parseXlsx(buffer);
  } else {
    parsed = parseCsv(buffer);
  }

  if (parsed.length === 0) throw new Error('Файл порожній або не вдалось розпізнати формат');

  // 3. Завантажуємо маппінг артикулів (supplier_sku_map + старий product_stock.supplier_sku)
  const [{ data: skuMapRows }, { data: stockRows }, { data: productBrands }] = await Promise.all([
    supabase
      .from('supplier_sku_map')
      .select('supplier_sku, our_sku')
      .eq('supplier_id', supplierId),
    supabase
      .from('product_stock')
      .select('sku, supplier_sku'),
    supabase
      .from('products')
      .select('sku, brand'),
  ]);

  // supplier_sku → our_sku
  const skuMap: Record<string, string> = {};
  (skuMapRows ?? []).forEach(r => { skuMap[r.supplier_sku] = r.our_sku; });
  // Fallback: старий спосіб через product_stock.supplier_sku
  (stockRows ?? []).forEach(r => { if (r.supplier_sku && !skuMap[r.supplier_sku]) skuMap[r.supplier_sku] = r.sku; });

  // our_sku → brand
  const brandMap: Record<string, string> = {};
  (productBrands ?? []).forEach(p => { brandMap[p.sku] = p.brand; });

  // brand → discount_pct
  const discountMap: Record<string, number> = {};
  (supplier.brand_discounts ?? []).forEach((d: { brand: string; discount_pct: number }) => {
    discountMap[d.brand] = d.discount_pct;
  });

  // 4. Обробляємо кожен рядок
  const logId = await supabase
    .from('supplier_sync_log')
    .insert({ supplier_id: supplierId, rows_total: parsed.length })
    .select('id')
    .single()
    .then(r => r.data?.id);

  let updated = 0, skipped = 0, unmapped = 0;
  const unmappedBatch: { supplier_id: number; supplier_sku: string; sample_name?: string; price_in: number }[] = [];

  for (const row of parsed) {
    const ourSku = skuMap[row.supplier_sku];

    if (!ourSku) {
      unmapped++;
      unmappedBatch.push({
        supplier_id:  supplierId,
        supplier_sku: row.supplier_sku,
        sample_name:  row.sample_name,
        price_in:     row.price_in,
      });
      continue;
    }

    // Застосовуємо знижку на бренд → реальний вхід
    const brand = brandMap[ourSku] ?? '';
    const discountPct = discountMap[brand] ?? 0;
    const priceCost = row.price_in * (1 - discountPct / 100);

    // Рахуємо ціни продажу
    const priceUnit   = parseFloat((priceCost * (1 + supplier.markup_wholesale / 100)).toFixed(2));
    const priceRetail = parseFloat((priceCost * (1 + supplier.markup_retail   / 100)).toFixed(2));
    const priceDrop   = parseFloat((priceCost * (1 + supplier.markup_drop     / 100)).toFixed(2));
    const stockStatus = row.stock_qty > 0 ? 'in_stock' : 'out_of_stock';

    const { error } = await supabase
      .from('product_stock')
      .upsert({
        sku:             ourSku,
        price_cost:      parseFloat(priceCost.toFixed(2)),
        price_unit:      priceUnit,
        price_retail:    priceRetail,
        price_drop:      priceDrop,
        stock_qty:       row.stock_qty,
        stock_status:    stockStatus,
        updated_at:      new Date().toISOString(),
      }, { onConflict: 'sku' });

    if (error) { skipped++; } else { updated++; }
  }

  // 5. Зберігаємо немаплені артикули (upsert — щоб не дублювати)
  if (unmappedBatch.length > 0) {
    await supabase
      .from('supplier_unmapped_skus')
      .upsert(unmappedBatch, { onConflict: 'supplier_id,supplier_sku' });
  }

  // 6. Оновлюємо лог і last_synced_at
  const finishedAt = new Date().toISOString();
  await Promise.all([
    logId && supabase
      .from('supplier_sync_log')
      .update({ finished_at: finishedAt, rows_total: parsed.length, rows_updated: updated, rows_skipped: skipped, rows_unmapped: unmapped })
      .eq('id', logId),
    supabase
      .from('suppliers')
      .update({ last_synced_at: finishedAt })
      .eq('id', supplierId),
  ]);

  return { rows_total: parsed.length, rows_updated: updated, rows_skipped: skipped, rows_unmapped: unmapped, error_message: null };
}
