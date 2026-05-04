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

/**
 * Розумний парсер для нестандартних файлів (Google Sheets, прайси з групами).
 * Не шукає заголовок — сканує кожен рядок і витягує дані там,
 * де є артикул у форматі ХXXX-XXX (наприклад 1548-377).
 */
function parseSmartCsv(buffer: Buffer): ParsedRow[] {
  const text = buffer.toString('utf-8');
  const lines = text.split(/\r?\n/).filter(Boolean);
  const sep = lines[0]?.includes(';') ? ';' : ',';

  // Артикул постачальника: 3+ цифр, дефіс, 2+ цифр (1548-377, 1610-100 тощо)
  const SKU_RE = /^\d{3,}-\d{2,}$/;
  // Ціна: число з крапкою або комою (224,30 або 224.30)
  const PRICE_RE = /^\d+[.,]\d+$|^\d+$/;

  const rows: ParsedRow[] = [];

  for (const line of lines) {
    const cells = line.split(sep).map(c => c.trim().replace(/^["']|["']$/g, ''));

    // Шукаємо колонку з артикулом
    const skuIdx = cells.findIndex(c => SKU_RE.test(c));
    if (skuIdx < 0) continue;

    const supplier_sku = cells[skuIdx];

    // Шукаємо ціну — найближча числова колонка праворуч від артикулу
    let price_in = 0;
    for (let i = skuIdx + 1; i < cells.length; i++) {
      const val = cells[i].replace(',', '.');
      if (PRICE_RE.test(cells[i]) && parseFloat(val) > 0) {
        price_in = parseFloat(val);
        break;
      }
    }

    // Назва товару — перша непорожня колонка ліворуч від артикулу
    let sample_name: string | undefined;
    for (let i = skuIdx - 1; i >= 0; i--) {
      if (cells[i]) { sample_name = cells[i]; break; }
    }

    rows.push({ supplier_sku, price_in, stock_qty: 0, sample_name });
  }

  return rows;
}

type ColMap = { sku?: string | null; price?: string | null; qty?: string | null; name?: string | null };

function parseCsv(buffer: Buffer, cm: ColMap = {}): ParsedRow[] {
  const text = buffer.toString('utf-8');
  const lines = text.split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) return [];

  const sep = lines[0].includes(';') ? ';' : ',';
  const headers = lines[0].split(sep).map(h => h.trim().toLowerCase().replace(/['"]/g, ''));

  const col = (override: string | null | undefined, ...names: string[]) => {
    if (override) {
      const idx = headers.indexOf(override.toLowerCase().trim());
      if (idx >= 0) return idx;
    }
    return names.reduce<number>((f, n) => (f >= 0 ? f : headers.indexOf(n)), -1);
  };

  const iSku   = col(cm.sku,   'sku', 'supplier_sku', 'артикул', 'article', 'код');
  const iPrice = col(cm.price, 'price', 'ціна', 'цена', 'price_unit', 'прайс');
  const iQty   = col(cm.qty,   'qty', 'quantity', 'залишок', 'остаток', 'кількість', 'количество', 'наявність', 'наличие');
  const iName  = col(cm.name,  'name', 'назва', 'наименование', 'товар');

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
      stock_qty:   iQty >= 0 ? (parseInt(cells[iQty] ?? '0', 10) || 0) : 0,
      sample_name: iName >= 0 ? cells[iName] : undefined,
    });
  }
  return rows;
}

function parseXlsx(buffer: Buffer, sheetName?: string | null, cm: ColMap = {}): ParsedRow[] {
  const wb = XLSX.read(buffer, { type: 'buffer' });

  const col = (obj: Record<string, unknown>, override: string | null | undefined, ...names: string[]) => {
    const allNames = override ? [override.toLowerCase().trim(), ...names] : names;
    const key = Object.keys(obj).find(k => allNames.includes(k.toLowerCase().trim()));
    return key ? String(obj[key]).trim() : '';
  };

  const parseSheet = (name: string): ParsedRow[] => {
    const ws = wb.Sheets[name];
    if (!ws) return [];
    const raw = XLSX.utils.sheet_to_json<Record<string, string | number>>(ws, { defval: '' });
    return raw.map(r => ({
      supplier_sku: col(r, cm.sku,   'sku', 'артикул', 'article', 'код'),
      price_in:     parseFloat(String(col(r, cm.price, 'price', 'ціна', 'цена', 'прайс')).replace(',', '.')) || 0,
      stock_qty:    parseInt(col(r, cm.qty,   'qty', 'залишок', 'остаток', 'кількість', 'наявність', 'наличие') || '0', 10) || 0,
      sample_name:  col(r, cm.name,  'name', 'назва', 'наименование', 'товар') || undefined,
    })).filter(r => r.supplier_sku);
  };

  // Якщо вказано конкретний аркуш — використовуємо його
  if (sheetName && wb.Sheets[sheetName]) {
    return parseSheet(sheetName);
  }

  // Інакше перебираємо всі листи (включно з прихованими) і беремо той з найбільшою кількістю розпізнаних рядків
  let best: ParsedRow[] = [];
  for (const name of wb.SheetNames) {
    const rows = parseSheet(name);
    if (rows.length > best.length) best = rows;
  }
  return best;
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

// ── Google Sheets → пряме посилання на CSV ────────────────────────────────────

function normalizeUrl(url: string): { url: string; isGoogleSheets: boolean } {
  const gsheets = url.match(
    /docs\.google\.com\/spreadsheets\/d\/([^/]+).*?[#&?]gid=(\d+)/
  );
  if (gsheets) {
    const [, id, gid] = gsheets;
    return {
      url: `https://docs.google.com/spreadsheets/d/${id}/export?format=csv&gid=${gid}`,
      isGoogleSheets: true,
    };
  }
  const gsheetsNoGid = url.match(/docs\.google\.com\/spreadsheets\/d\/([^/]+)/);
  if (gsheetsNoGid) {
    return {
      url: `https://docs.google.com/spreadsheets/d/${gsheetsNoGid[1]}/export?format=csv`,
      isGoogleSheets: true,
    };
  }
  return { url, isGoogleSheets: false };
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

  // 2. Нормалізуємо URL (Google Sheets → export CSV) і скачуємо файл
  const { url: fetchUrl, isGoogleSheets } = normalizeUrl(supplier.source_url);
  const buffer = await fetchFile(fetchUrl);

  const useSmartParser = isGoogleSheets || supplier.file_format === 'google_sheets';

  const cm: ColMap = {
    sku:   supplier.col_sku   ?? null,
    price: supplier.col_price ?? null,
    qty:   supplier.col_qty   ?? null,
    name:  supplier.col_name  ?? null,
  };

  let parsed: ParsedRow[];
  if (useSmartParser) {
    parsed = parseSmartCsv(buffer);
  } else if (supplier.file_format === '1c_xml') {
    parsed = parse1cXml(buffer);
  } else if (supplier.file_format === 'xls') {
    parsed = parseXlsx(buffer, supplier.sheet_name ?? null, cm);
  } else {
    parsed = parseCsv(buffer, cm);
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
