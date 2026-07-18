import { NextRequest, NextResponse } from 'next/server';
import * as XLSX from 'xlsx';
import { createClient } from '@supabase/supabase-js';
import { createSupabaseServer } from '../../../../../lib/supabase-server';
import { getRole } from '../../../../../lib/user-role';
import { fetchAllRows } from '../../../../../lib/db-paginate';

// xlsx (SheetJS 0.18.x) має відомі CVE при парсингу недовірених файлів; обмежуємо розмір,
// щоб зняти вектор zip-bomb / OOM від завантажень партнерів.
const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

const NP_URL = 'https://api.novaposhta.ua/v2.0/json/';

const serviceClient = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

async function npPost(modelName: string, calledMethod: string, props: object) {
  const res = await fetch(NP_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      apiKey:           process.env.NOVA_POSHTA_API_KEY,
      modelName,
      calledMethod,
      methodProperties: props,
    }),
  });
  const data = await res.json();
  return data.success ? data.data : [];
}

// Пошук міста за назвою → повертає { ref, name }
async function findCity(name: string): Promise<{ ref: string; name: string } | null> {
  const results = await npPost('Address', 'searchSettlements', {
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
async function findWarehouse(cityRef: string, branchNum: string): Promise<{ ref: string; name: string } | null> {
  const results = await npPost('AddressGeneral', 'getWarehouses', {
    SettlementRef:     cityRef,
    WarehouseId:       branchNum.trim(),
    CategoryOfWarehouse: 'Branch',
    Limit:             5,
  });
  const wh = results[0];
  return wh ? { ref: wh.Ref, name: wh.ShortAddress ?? wh.Description } : null;
}

export async function POST(req: NextRequest) {
  // ── Auth ─────────────────────────────────────────────────────────────────────
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || getRole(user) !== 'dropship') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { data: customer } = await serviceClient
    .from('customers')
    .select('id, balance, balance_held')
    .eq('auth_user_id', user.id)
    .single();

  if (!customer) return NextResponse.json({ error: 'Партнера не знайдено' }, { status: 404 });

  const balanceAvail = Number(customer.balance) - Number(customer.balance_held);

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

  // ── Завантажуємо каталог SKU + ціни ───────────────────────────────────────────
  // Пагінація: без range() каталог > 1000 SKU мовчки обрізався б і частина товарів
  // партнера позначалась би як "не знайдено".
  const stockData = await fetchAllRows<{ sku: string; price_drop: number | null; stock_status: string }>((f, t) => serviceClient
    .from('product_stock')
    .select('sku, price_drop, stock_status')
    .range(f, t));
  const productsData = await fetchAllRows<{ sku: string; name: string; brand: string }>((f, t) => serviceClient
    .from('products')
    .select('sku, name, brand')
    .range(f, t));

  const stockMap   = new Map(stockData.map(s => [s.sku, s]));
  const productMap = new Map(productsData.map(p => [p.sku, p]));

  // ── Батч-пошук міст (дедуплікація) ────────────────────────────────────────────
  const cityNames = [...new Set(dataRows.map((r: unknown[]) => String(r[7] ?? '').trim()).filter(Boolean))];
  const cityCache = new Map<string, { ref: string; name: string } | null>();
  await Promise.all(cityNames.map(async n => {
    cityCache.set(n.toLowerCase(), await findCity(n));
  }));

  // ── Обробка рядків ────────────────────────────────────────────────────────────
  type ParsedRow = {
    row_num:      number;
    sku:          string;
    product_name: string;
    qty:          number;
    cost_price:   number;
    selling_price: number;
    last_name:    string;
    first_name:   string;
    mid_name:     string;
    phone:        string;
    city_name:    string;
    city_ref:     string;
    warehouse_name: string;
    warehouse_ref:  string;
    branch_number:  string;
    status:       'valid' | 'error';
    errors:       string[];
  };

  const parsed: ParsedRow[] = [];

  for (let i = 0; i < dataRows.length; i++) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const r: any[] = dataRows[i] as any[];
    const rowNum  = i + 2; // +2 бо рядок 1 = заголовок
    const errors: string[] = [];

    const sku         = String(r[0] ?? '').trim();
    const qty         = parseInt(r[1] ?? '1') || 1;
    const sellingPrice = parseFloat(r[2] ?? '0') || 0;
    const lastName    = String(r[3] ?? '').trim();
    const firstName   = String(r[4] ?? '').trim();
    const midName     = String(r[5] ?? '').trim();
    const phone       = String(r[6] ?? '').trim();
    const cityName    = String(r[7] ?? '').trim();
    const branchNum   = String(r[8] ?? '').trim();

    // Валідація полів
    if (!sku)        errors.push('Артикул порожній');
    if (!lastName)   errors.push('Прізвище порожнє');
    if (!firstName)  errors.push("Ім'я порожнє");
    if (!phone)      errors.push('Телефон порожній');
    if (!cityName)   errors.push('Місто порожнє');
    if (!branchNum)  errors.push('Відділення порожнє');
    if (sellingPrice <= 0) errors.push('Вкажіть вашу ціну > 0');

    // Перевірка SKU
    const stock   = stockMap.get(sku);
    const product = productMap.get(sku);
    if (!product && sku) errors.push(`Артикул "${sku}" не знайдено в каталозі`);
    else if (stock?.stock_status === 'out_of_stock') errors.push(`"${sku}" немає в наявності`);

    const costPrice = stock?.price_drop ?? 0;

    // НП: місто
    let cityRef       = '';
    let resolvedCity  = '';
    let warehouseRef  = '';
    let warehouseName = '';

    if (cityName) {
      const city = cityCache.get(cityName.toLowerCase());
      if (!city) {
        errors.push(`Місто "${cityName}" не знайдено в НП`);
      } else {
        cityRef      = city.ref;
        resolvedCity = city.name;

        // НП: відділення
        if (branchNum) {
          const wh = await findWarehouse(cityRef, branchNum);
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
      row_num:      rowNum,
      sku,
      product_name: product ? `${product.brand} ${product.name}` : sku,
      qty,
      cost_price:   costPrice,
      selling_price: sellingPrice,
      last_name:    lastName,
      first_name:   firstName,
      mid_name:     midName,
      phone,
      city_name:    resolvedCity || cityName,
      city_ref:     cityRef,
      warehouse_name: warehouseName,
      warehouse_ref: warehouseRef,
      branch_number: branchNum,
      status:       errors.length === 0 ? 'valid' : 'error',
      errors,
    });
  }

  const validRows   = parsed.filter(r => r.status === 'valid');
  const totalCost   = validRows.reduce((s, r) => s + r.cost_price * r.qty, 0);
  const totalCod    = validRows.reduce((s, r) => s + r.selling_price * r.qty, 0);
  const canSubmit   = totalCost <= balanceAvail;

  return NextResponse.json({
    rows:          parsed,
    valid_count:   validRows.length,
    error_count:   parsed.length - validRows.length,
    total_cost:    totalCost,
    total_cod:     totalCod,
    balance_avail: balanceAvail,
    can_submit:    canSubmit,
  });
}
