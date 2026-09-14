import { NextRequest, NextResponse } from 'next/server';
import * as XLSX from 'xlsx';
import { createClient } from '@supabase/supabase-js';
import { requireCustomer } from '../../../../../lib/auth-guard';
import { DROPSHIP_MIN } from '../../../../../lib/site';
import { getDropshipCustomer, loadDropshipCatalog } from '../../../../../lib/dropship-order-create';
import { validateDropshipLine, dropshipParcelKey } from '../../../../../lib/dropship-order';

// xlsx (SheetJS 0.18.x) має відомі CVE при парсингу недовірених файлів; обмежуємо розмір,
// щоб зняти вектор zip-bomb / OOM від завантажень партнерів.
const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
const MAX_ROWS = 300;

const NP_URL = 'https://api.novaposhta.ua/v2.0/json/';

const serviceClient = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

// Ключ НП — той самий пріоритет, що в адмінці: app_settings, потім env.
async function npApiKey(): Promise<string> {
  const { data } = await serviceClient.from('app_settings').select('value').eq('key', 'np_api_key').maybeSingle();
  return data?.value || process.env.NOVA_POSHTA_API_KEY || '';
}

async function npPost(apiKey: string, modelName: string, calledMethod: string, props: object) {
  const res = await fetch(NP_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ apiKey, modelName, calledMethod, methodProperties: props }),
  });
  const data = await res.json();
  return data.success ? data.data : [];
}

// Пошук міста за назвою → повертає { ref, name }
async function findCity(apiKey: string, name: string): Promise<{ ref: string; name: string } | null> {
  const results = await npPost(apiKey, 'Address', 'searchSettlements', {
    CityName: name.trim(),
    Limit:    5,
    Page:     1,
  });
  const addresses = results[0]?.Addresses ?? [];
  // Пріоритет: місто (м.) над селом
  const city = addresses.find((a: Record<string, unknown>) => a.SettlementTypeCode === 'м.')
    ?? addresses[0];
  return city ? { ref: city.Ref, name: city.Present } : null;
}

// Пошук відділення за ref міста + номером відділення
async function findWarehouse(apiKey: string, cityRef: string, branchNum: string): Promise<{ ref: string; name: string } | null> {
  const results = await npPost(apiKey, 'AddressGeneral', 'getWarehouses', {
    SettlementRef:     cityRef,
    WarehouseId:       branchNum.trim(),
    CategoryOfWarehouse: 'Branch',
    Limit:             5,
  });
  const wh = results[0];
  return wh ? { ref: wh.Ref, name: wh.ShortAddress ?? wh.Description } : null;
}

type ParsedRow = {
  row_num:        number;
  sku:            string;
  product_name:   string;
  qty:            number;
  cost_price:     number;
  selling_price:  number;
  last_name:      string;
  first_name:     string;
  mid_name:       string;
  phone:          string;
  city_name:      string;
  city_ref:       string;
  warehouse_name: string;
  warehouse_ref:  string;
  branch_number:  string;
  parcel_key:     string;
  status:         'valid' | 'error';
  errors:         string[];
};

export async function POST(req: NextRequest) {
  const auth = await requireCustomer('dropship');
  if (!auth.ok) return auth.response;

  const customer = await getDropshipCustomer(serviceClient, auth.user.id);
  if (!customer) return NextResponse.json({ error: 'Партнера не знайдено' }, { status: 404 });

  const { data: bal } = await serviceClient
    .from('customers').select('balance, balance_held').eq('id', customer.id).single();
  const balanceAvail = Number(bal?.balance ?? 0) - Number(bal?.balance_held ?? 0);

  // ── Читаємо файл ──────────────────────────────────────────────────────────────
  const formData = await req.formData();
  const file = formData.get('file') as File | null;
  if (!file) return NextResponse.json({ error: 'Файл не знайдено' }, { status: 400 });
  if (file.size > MAX_UPLOAD_BYTES) {
    return NextResponse.json({ error: 'Файл завеликий (максимум 5 МБ)' }, { status: 413 });
  }

  const buf = Buffer.from(await file.arrayBuffer());
  const wb  = XLSX.read(buf, { type: 'buffer' });
  const ws  = wb.Sheets[wb.SheetNames[0]];
  const raw = XLSX.utils.sheet_to_json<string[]>(ws, { header: 1, defval: '' });

  // Перший рядок — заголовки, беремо з другого
  const dataRows = raw.slice(1).filter((r: string[]) => r.some(c => String(c).trim()));

  if (!dataRows.length) {
    return NextResponse.json({ error: 'Файл порожній або містить тільки заголовки' }, { status: 400 });
  }
  if (dataRows.length > MAX_ROWS) {
    return NextResponse.json({ error: `Забагато рядків (${dataRows.length}). Максимум — ${MAX_ROWS} за один файл.` }, { status: 400 });
  }

  const apiKey = await npApiKey();
  if (!apiKey) return NextResponse.json({ error: 'Сервіс Нової Пошти тимчасово недоступний' }, { status: 503 });

  const catalog = await loadDropshipCatalog(serviceClient, dataRows.map((r: unknown[]) => String(r[0] ?? '').trim()));

  // ── Батч-пошук міст (дедуплікація) ────────────────────────────────────────────
  const cityNames = [...new Set(dataRows.map((r: unknown[]) => String(r[7] ?? '').trim()).filter(Boolean))];
  const cityCache = new Map<string, { ref: string; name: string } | null>();
  await Promise.all(cityNames.map(async n => {
    cityCache.set(n.toLowerCase(), await findCity(apiKey, n));
  }));
  const whCache = new Map<string, { ref: string; name: string } | null>();

  // ── Обробка рядків ────────────────────────────────────────────────────────────
  const parsed: ParsedRow[] = [];

  for (let i = 0; i < dataRows.length; i++) {
    const r = dataRows[i] as unknown[];
    const rowNum  = i + 2; // +2 бо рядок 1 = заголовок
    const errors: string[] = [];

    const cell = (idx: number) => String(r[idx] ?? '').trim();
    const sku          = cell(0);
    const qtyRaw       = cell(1);
    const qty          = qtyRaw === '' ? 1 : Number(qtyRaw.replace(',', '.'));
    const sellingPrice = Number(cell(2).replace(/\s/g, '').replace(',', '.'));
    const lastName     = cell(3);
    const firstName    = cell(4);
    const midName      = cell(5);
    const phone        = cell(6);
    const cityName     = cell(7);
    const branchNum    = cell(8);

    if (!sku)        errors.push('Артикул порожній');
    if (!lastName)   errors.push('Прізвище порожнє');
    if (!firstName)  errors.push("Ім'я порожнє");
    if (phone.replace(/\D/g, '').length < 10) errors.push('Телефон порожній або неповний');
    if (!cityName)   errors.push('Місто порожнє');
    if (!branchNum)  errors.push('Відділення порожнє');

    // Товар, кількість, ціна — та сама перевірка, що й на створенні замовлення.
    const product = catalog.get(sku);
    let costPrice = Number(product?.price_drop ?? 0);
    let productName = sku;
    if (sku) {
      const v = validateDropshipLine({ sku, qty, selling_price: sellingPrice }, catalog);
      if (v.ok) { costPrice = v.line.cost_price; productName = v.line.name; }
      else errors.push(v.error);
    }

    // НП: місто і відділення
    let cityRef = '', resolvedCity = '', warehouseRef = '', warehouseName = '';
    if (cityName) {
      const city = cityCache.get(cityName.toLowerCase());
      if (!city) {
        errors.push(`Місто "${cityName}" не знайдено в НП`);
      } else {
        cityRef      = city.ref;
        resolvedCity = city.name;
        if (branchNum) {
          const whKey = `${cityRef}|${branchNum}`;
          if (!whCache.has(whKey)) whCache.set(whKey, await findWarehouse(apiKey, cityRef, branchNum));
          const wh = whCache.get(whKey);
          if (!wh) {
            errors.push(`Відділення №${branchNum} не знайдено в "${cityName}"`);
          } else {
            warehouseRef  = wh.ref;
            warehouseName = wh.name;
          }
        }
      }
    }

    parsed.push({
      row_num:        rowNum,
      sku,
      product_name:   productName,
      qty:            Number.isFinite(qty) ? qty : 0,
      cost_price:     costPrice,
      selling_price:  Number.isFinite(sellingPrice) ? sellingPrice : 0,
      last_name:      lastName,
      first_name:     firstName,
      mid_name:       midName,
      phone,
      city_name:      resolvedCity || cityName,
      city_ref:       cityRef,
      warehouse_name: warehouseName,
      warehouse_ref:  warehouseRef,
      branch_number:  branchNum,
      parcel_key:     dropshipParcelKey({ phone, city_name: cityName, branch_number: branchNum }),
      status:         errors.length === 0 ? 'valid' : 'error',
      errors,
    });
  }

  // ── Посилки: рядки одного отримувача → одне замовлення ───────────────────────
  // Мінімальна сума і повтор артикула — на посилку, бо саме вона стане замовленням.
  const groups = new Map<string, ParsedRow[]>();
  for (const row of parsed.filter(r => r.status === 'valid')) {
    groups.set(row.parcel_key, [...(groups.get(row.parcel_key) ?? []), row]);
  }
  for (const rows of groups.values()) {
    const seen = new Set<string>();
    for (const row of rows) {
      if (seen.has(row.sku)) { row.status = 'error'; row.errors.push(`Артикул ${row.sku} вже є в цій посилці — об'єднайте кількість в один рядок`); }
      seen.add(row.sku);
    }
    const ok = rows.filter(r => r.status === 'valid');
    const cost = ok.reduce((s, r) => s + r.cost_price * r.qty, 0);
    if (ok.length && cost < DROPSHIP_MIN) {
      for (const row of ok) {
        row.status = 'error';
        row.errors.push(`Мінімальна сума посилки — ${DROPSHIP_MIN} ₴ за закупочними цінами, у цій посилці ${cost.toFixed(2)} ₴`);
      }
    }
  }

  const validRows   = parsed.filter(r => r.status === 'valid');
  const totalCost   = Math.round(validRows.reduce((s, r) => s + r.cost_price * r.qty, 0) * 100) / 100;
  const totalCod    = Math.round(validRows.reduce((s, r) => s + r.selling_price * r.qty, 0) * 100) / 100;
  const parcelCount = new Set(validRows.map(r => r.parcel_key)).size;

  return NextResponse.json({
    rows:          parsed,
    valid_count:   validRows.length,
    error_count:   parsed.length - validRows.length,
    parcel_count:  parcelCount,
    total_cost:    totalCost,
    total_cod:     totalCod,
    balance_avail: balanceAvail,
    can_submit:    totalCost <= balanceAvail,
  });
}
