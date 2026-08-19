/**
 * lib/supplier-sync.ts
 * Основна логіка синхронізації одного постачальника.
 * Використовується і в ручному запуску (/api/admin/suppliers/[id]/sync),
 * і в cron (/api/cron/sync-suppliers).
 */

import { XMLParser } from 'fast-xml-parser';
import { priceFromMarkup, retailNotBelowWholesale, roundRetail, roundHalf } from './price-formula';
import { fetchAllRows } from './db-paginate';
import { assertPublicUrl } from './safe-fetch-url';
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

  // Автовизначення роздільника: таб (TSV/Google Sheets) → крапка з комою → кома
  const firstLine = lines[0] ?? '';
  const sep = firstLine.includes('\t') ? '\t'
    : firstLine.includes(';') ? ';'
    : ',';

  // Артикул постачальника: 3+ цифр, дефіс, 2+ цифр (1548-377, 2719-011 тощо)
  const SKU_RE = /^\d{3,}-\d{2,}$/;
  // Ціна після очищення: 224,30 або 224.30 або 224
  const PRICE_RE = /^\d+[.,]\d+$|^\d+$/;

  const rows: ParsedRow[] = [];

  for (const line of lines) {
    const cells = line.split(sep).map(c => c.trim().replace(/^["']|["']$/g, ''));

    // Шукаємо колонку з артикулом
    const skuIdx = cells.findIndex(c => SKU_RE.test(c));
    if (skuIdx < 0) continue;

    const supplier_sku = cells[skuIdx];

    // Шукаємо ціну: знімаємо суфікси валюти і пробіли-роздільники тисяч
    // Приклад: "1 277,70 грн" → "1277,70" → 1277.70
    let price_in = 0;
    let priceColIdx = -1;
    for (let i = skuIdx + 1; i < cells.length; i++) {
      const cleaned = cells[i]
        .replace(/\s*(?:грн|₴|uah)\s*\.?$/gi, '')  // прибираємо валюту
        .replace(/\s/g, '')                           // прибираємо пробіли (роздільник тисяч)
        .trim();
      const val = cleaned.replace(',', '.');
      if (cleaned && PRICE_RE.test(cleaned) && parseFloat(val) > 0) {
        price_in = parseFloat(val);
        priceColIdx = i;
        break;
      }
    }

    // Наявність: перший цілочисельний рядок після колонки ціни
    let stock_qty = 0;
    if (priceColIdx >= 0) {
      for (let i = priceColIdx + 1; i < cells.length; i++) {
        const qty = cells[i].trim();
        if (/^\d+$/.test(qty)) {
          stock_qty = parseInt(qty, 10);
          break;
        }
      }
    }

    // Назва товару — перша непорожня колонка ліворуч від артикулу;
    // якщо ліворуч нічого (формат «код, назва, ціна» — напр. Google Sheets ЗРХ) —
    // перша ТЕКСТОВА колонка праворуч від артикулу (не ціна і не кількість).
    let sample_name: string | undefined;
    for (let i = skuIdx - 1; i >= 0; i--) {
      if (cells[i]) { sample_name = cells[i]; break; }
    }
    if (!sample_name) {
      for (let i = skuIdx + 1; i < cells.length; i++) {
        if (i === priceColIdx) continue;
        if (cells[i] && /[a-zа-яіїєґё]/i.test(cells[i])) { sample_name = cells[i]; break; }
      }
    }

    rows.push({ supplier_sku, price_in, stock_qty, sample_name });
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
      url: `https://docs.google.com/spreadsheets/d/${id}/export?format=tsv&gid=${gid}`,
      isGoogleSheets: true,
    };
  }
  const gsheetsNoGid = url.match(/docs\.google\.com\/spreadsheets\/d\/([^/]+)/);
  if (gsheetsNoGid) {
    return {
      url: `https://docs.google.com/spreadsheets/d/${gsheetsNoGid[1]}/export?format=tsv`,
      isGoogleSheets: true,
    };
  }
  return { url, isGoogleSheets: false };
}

// ── Скачування файлу ──────────────────────────────────────────────────────────

async function fetchFile(url: string): Promise<Buffer> {
  assertPublicUrl(url); // SSRF-захист: лише public http(s), не приватні адреси
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

  // 3. Завантажуємо маппінг артикулів + дані для цін
  const syncStartedAt = new Date().toISOString();
  const now = syncStartedAt;
  // fetchAllRows pages past the PostgREST 1000-row cap so the pricing sync never
  // silently drops brand/stock/lock rows once the catalog exceeds 1000 items.
  const [
    skuMapRows,
    stockRows,
    productBrands,
    productOverrides,
    promotions,
    priceLockRows,
    physStockRows,
  ] = await Promise.all([
    fetchAllRows((f, t) => supabase.from('supplier_sku_map').select('supplier_sku, our_sku').eq('supplier_id', supplierId).range(f, t)),
    fetchAllRows((f, t) => supabase.from('product_stock').select('sku, supplier_sku').range(f, t)),
    fetchAllRows((f, t) => supabase.from('products').select('sku, brand').range(f, t)),
    fetchAllRows((f, t) => supabase.from('supplier_product_overrides')
      .select('our_sku, markup_retail, markup_wholesale, markup_drop, fixed_retail, fixed_wholesale, fixed_drop')
      .eq('supplier_id', supplierId).range(f, t)),
    fetchAllRows((f, t) => supabase.from('supplier_promotions')
      .select('our_sku, brand, promo_type, value, apply_retail, apply_wholesale, apply_drop, starts_at, ends_at')
      .eq('supplier_id', supplierId)
      .eq('is_active', true)
      .or(`starts_at.is.null,starts_at.lte.${now}`)
      .or(`ends_at.is.null,ends_at.gte.${now}`).range(f, t)),
    // Заблоковані ціни (встановлені при приході товару)
    fetchAllRows((f, t) => supabase.from('product_stock').select('sku').eq('price_locked', true).range(f, t)),
    // Фізичні залишки на власних складах
    fetchAllRows((f, t) => supabase.from('stock_balance').select('sku').gt('qty_total', 0).range(f, t)),
  ]);

  // SKU з заблокованими цінами, які ще є в наявності → не перезаписуємо
  const priceLockSet  = new Set((priceLockRows  ?? []).map(r => r.sku));
  const physStockSet  = new Set((physStockRows  ?? []).map(r => r.sku));

  // supplier_sku → our_sku
  // Primary source: supplier_sku_map; fallback: product_stock.supplier_sku
  const skuMap: Record<string, string> = {};
  const alreadyMapped = new Set<string>(); // supplier_skus already in supplier_sku_map
  (skuMapRows ?? []).forEach(r => { skuMap[r.supplier_sku] = r.our_sku; alreadyMapped.add(r.supplier_sku); });

  // Fallback rows — track them so we can persist them to supplier_sku_map after sync
  const fallbackMappings: { supplier_id: number; supplier_sku: string; our_sku: string }[] = [];
  (stockRows ?? []).forEach(r => {
    if (r.supplier_sku && !skuMap[r.supplier_sku]) {
      skuMap[r.supplier_sku] = r.sku;
      fallbackMappings.push({ supplier_id: supplierId, supplier_sku: r.supplier_sku, our_sku: r.sku });
    }
  });

  // our_sku → brand
  const brandMap: Record<string, string> = {};
  (productBrands ?? []).forEach(p => { brandMap[p.sku] = p.brand; });

  // brand → { discount_pct, markup_*, keep_price }
  // keep_price = true → ціна продажу рахується від оригінальної вхідної ціни,
  //   а не від ціни після знижки. Знижка зменшує лише собівартість (покращує маржу),
  //   але не впливає на ціну клієнту.
  type BrandSettings = {
    discount_pct:     number;
    markup_retail?:   number | null;
    markup_wholesale?: number | null;
    markup_drop?:     number | null;
    keep_price?:      boolean | null;
  };
  const brandSettingsMap: Record<string, BrandSettings> = {};
  (supplier.brand_discounts ?? []).forEach((d: BrandSettings & { brand: string }) => {
    brandSettingsMap[d.brand] = d;
  });

  // our_sku → product override
  type ProductOverride = { markup_retail?: number | null; markup_wholesale?: number | null; markup_drop?: number | null; fixed_retail?: number | null; fixed_wholesale?: number | null; fixed_drop?: number | null };
  const productOverrideMap: Record<string, ProductOverride> = {};
  (productOverrides ?? []).forEach(o => { productOverrideMap[o.our_sku] = o; });

  // Хелпер: наценка з пріоритетом товар > бренд > постачальник
  const getMarkup = (brand: string, sku: string, field: 'markup_retail' | 'markup_wholesale' | 'markup_drop', supplierDefault: number): number =>
    productOverrideMap[sku]?.[field] ??
    brandSettingsMap[brand]?.[field] ??
    supplierDefault;

  // Акційні ціни: знаходимо найбільш специфічну акцію для SKU/бренду
  type Promo = { our_sku: string | null; brand: string | null; promo_type: string; value: number; apply_retail: boolean; apply_wholesale: boolean; apply_drop: boolean };
  const promoList = (promotions ?? []) as Promo[];

  const findPromo = (sku: string, brand: string): Promo | null =>
    // Пріоритет: конкретний SKU > бренд > всі товари
    promoList.find(p => p.our_sku === sku) ??
    promoList.find(p => !p.our_sku && p.brand === brand) ??
    promoList.find(p => !p.our_sku && !p.brand) ??
    null;

  // Застосовує акцію до ціни; повертає [promoPrice, originalPrice]
  const applyPromo = (regularPrice: number, promo: Promo, roundFn: (v: number) => number): [number, number] => {
    let promoPrice: number;
    if (promo.promo_type === 'fixed_price') {
      promoPrice = roundFn(promo.value);
    } else if (promo.promo_type === 'percent') {
      promoPrice = roundFn(regularPrice * (1 - promo.value / 100));
    } else {
      promoPrice = roundFn(Math.max(0, regularPrice - promo.value));
    }
    return [promoPrice, regularPrice];
  };

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
    const brandSettings = brandSettingsMap[brand];
    const discountPct   = brandSettings?.discount_pct ?? 0;
    const priceCost     = row.price_in * (1 - discountPct / 100);

    // keep_price: знижка зменшує собівартість, але ціна продажу рахується від оригіналу
    const priceBase = brandSettings?.keep_price ? row.price_in : priceCost;

    // Рахуємо базові ціни: товар > бренд > постачальник.
    // Формула й округлення — з lib/price-formula: ту саму лічилку використовує
    // ручна переоцінка в розділі «Ціни», і другої копії тут бути не повинно.
    const override = productOverrideMap[ourSku];

    // Базові ціни (фіксована ціна — найвищий пріоритет)
    const baseRetail = override?.fixed_retail
      ?? priceFromMarkup(priceBase, getMarkup(brand, ourSku, 'markup_retail', supplier.markup_retail), 'retail');
    const baseUnit   = override?.fixed_wholesale
      ?? priceFromMarkup(priceBase, getMarkup(brand, ourSku, 'markup_wholesale', supplier.markup_wholesale), 'wholesale');
    const baseDrop   = override?.fixed_drop
      ?? priceFromMarkup(priceBase, getMarkup(brand, ourSku, 'markup_drop', supplier.markup_drop), 'drop');

    // Акційні ціни
    const promo = !override?.fixed_retail && !override?.fixed_wholesale && !override?.fixed_drop
      ? findPromo(ourSku, brand)
      : null; // якщо є фіксована ціна — акція не застосовується

    let priceRetail = retailNotBelowWholesale(baseRetail, baseUnit), priceRetailOld: number | null = null;
    let priceUnit   = baseUnit,                       priceOld: number | null = null;
    let priceDrop   = baseDrop;

    if (promo) {
      if (promo.apply_retail) {
        [priceRetail, priceRetailOld] = applyPromo(priceRetail, promo, roundRetail);
      }
      if (promo.apply_wholesale) {
        [priceUnit, priceOld] = applyPromo(baseUnit, promo, roundHalf);
      }
      if (promo.apply_drop) {
        [priceDrop] = applyPromo(baseDrop, promo, roundHalf);
      }
    }

    // stock_always_available: сам факт присутності у файлі = в наявності
    // qty_is_flag: число у файлі умовне — зберігаємо 0, статус береться з qty > 0
    const stockStatus = supplier.stock_always_available
      ? 'in_stock'
      : (row.stock_qty > 0 ? 'in_stock' : 'out_of_stock');

    const stockQty = supplier.qty_is_flag ? 0 : row.stock_qty;

    const rowTime = new Date().toISOString();

    // ── product_stock (ціни + публічна наявність) ─────────────────────────────
    // price_cost: не перезаписуємо якщо є фізичний залишок — реальна собівартість
    //             з приходу (avg_cost) точніша за ціну з прайса постачальника
    const isCostProtected = physStockSet.has(ourSku);
    // Ціни продажу: не перезаписуємо якщо вручну заблоковані адміном і є залишок
    const isPriceLocked   = priceLockSet.has(ourSku) && physStockSet.has(ourSku);

    const { error } = await supabase
      .from('product_stock')
      .upsert({
        sku:          ourSku,
        stock_qty:    stockQty,
        stock_status: stockStatus,
        // Довідковий артикул постачальника в картці товару — тримаємо актуальним
        // (раніше замирав на старому коді після зміни номенклатури постачальника)
        supplier_sku: row.supplier_sku,
        updated_at:   rowTime,
        ...(!isCostProtected && { price_cost: parseFloat(priceCost.toFixed(2)) }),
        ...(!isPriceLocked && {
          price_unit:       priceUnit,
          price_old:        priceOld,
          price_retail:     priceRetail,
          price_retail_old: priceRetailOld,
          price_drop:       priceDrop,
        }),
      }, { onConflict: 'sku' });

    // ── supplier_stock (наявність per-supplier для multi-supplier логіки) ──────
    await supabase
      .from('supplier_stock')
      .upsert({
        sku:            ourSku,
        supplier_id:    supplierId,
        supplier_sku:   row.supplier_sku,
        stock_qty:      stockQty,
        stock_status:   stockStatus,
        price_unit:     priceUnit,
        price_cost:     parseFloat(priceCost.toFixed(2)),
        last_synced_at: syncStartedAt,
        updated_at:     rowTime,
      }, { onConflict: 'sku,supplier_id' });

    if (error) { skipped++; } else { updated++; }
  }

  // 5. Позначаємо відсутні товари як out_of_stock (multi-supplier логіка)
  //    Захист від неповного файлу: якщо < 60% від попереднього → пропускаємо
  const { data: prevSyncData } = await supabase
    .from('supplier_sync_log')
    .select('rows_total')
    .eq('supplier_id', supplierId)
    .not('rows_total', 'is', null)
    .order('started_at', { ascending: false })
    .limit(2);  // беремо 2: перший — поточний (ще не завершений), другий — попередній

  const prevRows = (prevSyncData ?? []).length >= 2
    ? (prevSyncData![1] as { rows_total: number }).rows_total
    : null;

  await supabase.rpc('mark_absent_supplier_stock', {
    p_supplier_id:  supplierId,
    p_sync_started: syncStartedAt,
    p_rows_in_file: parsed.length,
    p_prev_rows:    prevRows,
  });

  // Знімаємо in_stock з товарів що не мають ні постачальника, ні фізичного залишку
  await supabase.rpc('reconcile_orphan_stock');

  // 6. Зберігаємо немаплені артикули (upsert — щоб не дублювати)
  if (unmappedBatch.length > 0) {
    await supabase
      .from('supplier_unmapped_skus')
      .upsert(unmappedBatch, { onConflict: 'supplier_id,supplier_sku' });
  }

  // 6b. Чистимо чергу немаплених від кодів, яких БІЛЬШЕ НЕМАЄ у свіжому прайсі.
  //     Інакше черга накопичує застарілі коди з усіх минулих синків, і товар
  //     можна помилково прив'язати до «мертвого» коду — синк потім не має звідки
  //     взяти ціну, картка лишається порожньою. Тільки для повного файлу
  //     (той самий 60%-guard, що й у mark_absent), щоб битий файл не вичистив чергу.
  const isFullFile = prevRows === null || parsed.length >= prevRows * 0.6;
  if (isFullFile) {
    const fileCodes = new Set(parsed.map(r => r.supplier_sku));
    const { data: queued } = await supabase
      .from('supplier_unmapped_skus')
      .select('supplier_sku')
      .eq('supplier_id', supplierId);
    const stale = (queued ?? []).map(r => r.supplier_sku).filter(s => !fileCodes.has(s));
    for (let i = 0; i < stale.length; i += 200) {
      await supabase
        .from('supplier_unmapped_skus')
        .delete()
        .eq('supplier_id', supplierId)
        .in('supplier_sku', stale.slice(i, i + 200));
    }
  }

  // 7. Персистуємо fallback-маппінги в supplier_sku_map (щоб не залежати від product_stock)
  if (fallbackMappings.length > 0) {
    await supabase
      .from('supplier_sku_map')
      .upsert(fallbackMappings, { onConflict: 'supplier_id,supplier_sku', ignoreDuplicates: true });
  }

  // 8. Оновлюємо лог і last_synced_at
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
