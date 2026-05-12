import { NextRequest, NextResponse } from 'next/server';
import { revalidateTag } from 'next/cache';
import { createSupabaseServer } from '../../../../../lib/supabase-server';
import { createClient } from '@supabase/supabase-js';
import * as XLSX from 'xlsx';

const serviceClient = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

// Всі стандартні колонки — все що не тут = характеристика (новий формат)
const KNOWN_COLUMNS = new Set([
  'SKU', 'Артикул постачальника', 'Назва', 'Бренд',
  'Категорія (slug)', 'Категорія (назва)',
  "Об'єм / Вага", 'Тип матеріалу', 'Колір',
  'В упаковці (шт)', 'Мін. замовлення (шт)',
  'Наш вхід (грн)', 'Ціна каталог (грн/шт)', 'Стара ціна каталог',
  'Ціна магазин (грн/шт)', 'Стара ціна магазин', 'Ціна дроп (грн/шт)',
  'Залишок (шт)', 'Статус',
  'Опис (УКР)', 'Опис (РУС)', 'Опис',
  'Повний опис (УКР)', 'Повний опис (РУС)',
  'Фото (URL)', 'Фото (шлях)',
  'Тип SVG', 'SVG рядок 1', 'SVG рядок 2',
  'SVG колір тіла', 'SVG колір акценту',
  'Порядок сортування',
  // Старий формат — для зворотної сумісності
  ...Array.from({ length: 10 }, (_, i) => `Характеристика ${i + 1}`),
]);

function col(row: Record<string, unknown>, ...keys: string[]): string {
  for (const k of keys) {
    const v = row[k];
    if (v !== undefined && v !== '') return String(v);
  }
  return '';
}

function parseChars(row: Record<string, unknown>) {
  const isOldFormat = Object.keys(row).some(k => /^Характеристика \d+$/.test(k));

  if (isOldFormat) {
    // Старий формат: Характеристика N = "Назва|Значення"
    const chars: { label: string; value: string; sort_order: number }[] = [];
    for (let i = 1; i <= 10; i++) {
      const raw = String(row[`Характеристика ${i}`] ?? '').trim();
      if (!raw) continue;
      const pipeIdx = raw.indexOf('|');
      if (pipeIdx > 0) {
        const label = raw.slice(0, pipeIdx).trim();
        const value = raw.slice(pipeIdx + 1).trim();
        if (label && value) chars.push({ label, value, sort_order: i });
      }
    }
    return chars;
  }

  // Новий формат: невідома колонка = характеристика, значення = комірка
  const chars: { label: string; value: string; sort_order: number }[] = [];
  let order = 0;
  for (const [key, val] of Object.entries(row)) {
    if (KNOWN_COLUMNS.has(key)) continue;
    const value = String(val ?? '').trim();
    if (value) chars.push({ label: key.trim(), value, sort_order: order++ });
  }
  return chars;
}

export async function GET(req: NextRequest) {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user || user.user_metadata?.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const template = req.nextUrl.searchParams.get('template');
  if (!template) {
    return NextResponse.json({ error: 'Bad request' }, { status: 400 });
  }

  // Унікальні характеристики — для конкретної категорії або для всіх
  const categorySlug = req.nextUrl.searchParams.get('category');

  let charsData: { label: string }[] = [];

  if (categorySlug) {
    // Збираємо slug самої категорії + всіх підкатегорій (1 рівень)
    const { data: allCats } = await serviceClient
      .from('categories')
      .select('slug, parent_slug');

    const slugs = (allCats ?? [])
      .filter(c => c.slug === categorySlug || c.parent_slug === categorySlug)
      .map(c => c.slug);

    if (slugs.length > 0) {
      const { data: productsInCat } = await serviceClient
        .from('products')
        .select('sku')
        .in('category_slug', slugs);

      const skus = (productsInCat ?? []).map((p: { sku: string }) => p.sku);

      if (skus.length > 0) {
        const { data } = await serviceClient
          .from('product_characteristics')
          .select('label')
          .in('product_sku', skus);
        charsData = data ?? [];
      }
    }
  } else {
    // Загальний шаблон — всі характеристики
    const { data } = await serviceClient
      .from('product_characteristics')
      .select('label');
    charsData = data ?? [];
  }

  const labelFreq: Record<string, number> = {};
  charsData.forEach(c => {
    labelFreq[c.label] = (labelFreq[c.label] ?? 0) + 1;
  });
  const uniqueLabels = Object.entries(labelFreq)
    .sort((a, b) => b[1] - a[1])
    .map(([label]) => label);

  // Категорії для аркуша "Категорії"
  const { data: categories } = await serviceClient
    .from('categories')
    .select('slug, name, parent_slug, sort_order')
    .order('sort_order');

  const wb = XLSX.utils.book_new();

  // ── Аркуш "Товари" ──────────────────────────────────────────────────────────

  const standardHeaders = [
    'SKU', 'Артикул постачальника', 'Назва', 'Бренд',
    'Категорія (slug)', "Об'єм / Вага", 'Тип матеріалу', 'Колір',
    'В упаковці (шт)', 'Мін. замовлення (шт)',
    'Наш вхід (грн)', 'Ціна каталог (грн/шт)', 'Стара ціна каталог',
    'Ціна магазин (грн/шт)', 'Стара ціна магазин', 'Ціна дроп (грн/шт)',
    'Залишок (шт)', 'Статус',
    'Опис (УКР)', 'Опис (РУС)', 'Повний опис (УКР)', 'Повний опис (РУС)',
    'Фото (URL)', 'Тип SVG', 'SVG рядок 1', 'SVG рядок 2',
    'SVG колір тіла', 'SVG колір акценту', 'Порядок сортування',
  ];

  const headers = [...standardHeaders, ...uniqueLabels];

  const exampleRow: (string | number)[] = [
    'EXAMPLE-001', 'SUP-SKU-001', 'Герметик силіконовий Lacrysil 280 мл', 'Lacrysil',
    'germetyky', '280 мл', 'Силіконовий', 'Білий',
    12, 1,
    85, 125, '', 150, '', 110,
    50, 'in_stock',
    'Опис укр', 'Опис рус', 'Повний опис укр', 'Повний опис рус',
    '/img/products/lacrysil/example-001.jpg', 'tube', 'LACRYSIL', 'UNIVERSAL',
    '#4A6080', '#2A4060', 0,
    // Значення для характеристик — порожні в прикладному рядку
    ...uniqueLabels.map(() => ''),
  ];

  const wsProducts = XLSX.utils.aoa_to_sheet([headers, exampleRow]);

  const standardWidths = [
    12, 22, 55, 15, 25, 12, 18, 12, 14, 18,
    14, 16, 16, 18, 18, 16, 12, 12,
    40, 40, 60, 60, 45, 10, 18, 18, 16, 18, 12,
  ];
  wsProducts['!cols'] = [
    ...standardWidths,
    ...uniqueLabels.map(() => 22),
  ].map(w => ({ wch: w }));

  // Жирний заголовок + блакитний фон
  for (let c = 0; c < headers.length; c++) {
    const cell = wsProducts[XLSX.utils.encode_cell({ r: 0, c })];
    if (cell) cell.s = { font: { bold: true }, fill: { fgColor: { rgb: 'EFF6FF' } } };
  }

  XLSX.utils.book_append_sheet(wb, wsProducts, 'Товари');

  // ── Аркуш "Категорії" ───────────────────────────────────────────────────────

  const catRows = (categories ?? []).map(c => ({
    'Slug':        c.slug,
    'Назва':       c.name,
    'Батьківська': c.parent_slug ?? '',
    'Порядок':     c.sort_order,
  }));
  const wsCats = XLSX.utils.json_to_sheet(catRows.length ? catRows : [{}]);
  wsCats['!cols'] = [28, 35, 28, 10].map(w => ({ wch: w }));
  XLSX.utils.book_append_sheet(wb, wsCats, 'Категорії');

  // ── Аркуш "Довідка" ─────────────────────────────────────────────────────────

  const helpRows = [
    { 'Поле': 'SKU',                   'Опис': 'Унікальний артикул. Для існуючих — не змінювати!',      'Приклад': '1001-001' },
    { 'Поле': 'Артикул постачальника', 'Опис': 'Код постачальника для синхронізації цін',               'Приклад': '1606-012' },
    { 'Поле': 'Назва',                 'Опис': 'Повна назва товару',                                    'Приклад': 'Герметик силіконовий Lacrysil 280 мл' },
    { 'Поле': 'Бренд',                 'Опис': 'Виробник',                                              'Приклад': 'Lacrysil' },
    { 'Поле': 'Категорія (slug)',       'Опис': 'Slug категорії — дивись аркуш Категорії',               'Приклад': 'germetyky' },
    { 'Поле': "Об'єм / Вага",          'Опис': "Об'єм або вага з одиницею виміру",                     'Приклад': '280 мл' },
    { 'Поле': 'Тип матеріалу',         'Опис': 'Підтип для фільтрації на сайті',                        'Приклад': 'Силіконовий' },
    { 'Поле': 'Колір',                 'Опис': 'Колір товару',                                          'Приклад': 'Білий' },
    { 'Поле': 'Наш вхід (грн)',        'Опис': 'Закупівельна ціна (не відображається на сайті)',        'Приклад': '85.00' },
    { 'Поле': 'Ціна каталог (грн/шт)', 'Опис': 'Оптова ціна',                                          'Приклад': '120.50' },
    { 'Поле': 'Ціна магазин (грн/шт)', 'Опис': 'Роздрібна ціна',                                       'Приклад': '150.00' },
    { 'Поле': 'Ціна дроп (грн/шт)',    'Опис': 'Ціна для дропшиперів',                                 'Приклад': '130.00' },
    { 'Поле': 'Залишок (шт)',          'Опис': 'Кількість на складі',                                   'Приклад': '50' },
    { 'Поле': 'Статус',                'Опис': 'in_stock / out_of_stock / on_order',                    'Приклад': 'in_stock' },
    { 'Поле': 'Опис (УКР/РУС)',        'Опис': 'Короткий SEO-опис, 150-300 символів',                  'Приклад': 'Силіконовий герметик для санвузлів...' },
    { 'Поле': 'Повний опис (УКР/РУС)', 'Опис': 'Детальний опис для картки товару',                     'Приклад': 'Lacrysil — універсальний герметик...' },
    { 'Поле': 'Фото (URL)',            'Опис': 'Посилання на фото або шлях /img/products/...',          'Приклад': '/img/products/lacrysil/001.jpg' },
    { 'Поле': 'Тип SVG',              'Опис': 'Тип генерованого зображення: tube або canister',         'Приклад': 'tube' },
    { 'Поле': 'SVG рядок 1 / 2',      'Опис': 'Текст на заглушці товару',                              'Приклад': 'LACRYSIL' },
    { 'Поле': 'SVG колір тіла / акц.', 'Опис': 'HEX-кольори заглушки',                                 'Приклад': '#4A6080' },
    { 'Поле': '<Назва характеристики>','Опис': 'Колонки після стандартних — це характеристики товару. Порожня клітинка = не відображається на сайті. Нова колонка = нова характеристика.', 'Приклад': 'Матеріал → Силіконовий' },
  ];
  const wsHelp = XLSX.utils.json_to_sheet(helpRows);
  wsHelp['!cols'] = [25, 55, 40].map(w => ({ wch: w }));
  XLSX.utils.book_append_sheet(wb, wsHelp, 'Довідка');

  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

  return new NextResponse(buf, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': 'attachment; filename="products_template.xlsx"',
    },
  });
}

export async function POST(req: NextRequest) {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user || user.user_metadata?.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const formData = await req.formData();
  const file = formData.get('file') as File;
  const isPreview = formData.get('preview') === 'true';

  if (!file) {
    return NextResponse.json({ error: 'No file provided' }, { status: 400 });
  }

  const buffer = await file.arrayBuffer();
  const wb = XLSX.read(buffer, { type: 'array' });
  const ws = wb.Sheets['Товари'] ?? wb.Sheets[wb.SheetNames[0]];
  const rows: Record<string, unknown>[] = XLSX.utils.sheet_to_json(ws);

  if (isPreview) {
    return NextResponse.json({ preview: rows.slice(0, 10) });
  }

  const results = { success: 0, errors: [] as { row: number; sku: string; error: string }[] };

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const sku   = col(row, 'SKU').trim();
    const name  = col(row, 'Назва').trim();
    const brand = col(row, 'Бренд').trim();

    if (!sku || !name || !brand) {
      results.errors.push({ row: i + 2, sku, error: 'Відсутній SKU, Назва або Бренд' });
      continue;
    }

    const product: Record<string, unknown> = {
      sku,
      name,
      brand,
      category_slug:       col(row, 'Категорія (slug)') || null,
      product_type:        col(row, 'Тип матеріалу') || null,
      color:               col(row, 'Колір') || null,
      volume:              col(row, "Об'єм / Вага") || null,
      pack_qty:            Number(row['В упаковці (шт)'] ?? 1) || 1,
      min_order:           Number(row['Мін. замовлення (шт)'] ?? 1) || 1,
      description:         col(row, 'Опис (УКР)', 'Опис') || null,
      description_ru:      col(row, 'Опис (РУС)') || null,
      description_full:    col(row, 'Повний опис (УКР)') || null,
      description_full_ru: col(row, 'Повний опис (РУС)') || null,
      image:               col(row, 'Фото (URL)', 'Фото (шлях)') || null,
      img_type:            col(row, 'Тип SVG') || 'tube',
      nl1:                 col(row, 'SVG рядок 1') || null,
      nl2:                 col(row, 'SVG рядок 2') || null,
      bc:                  col(row, 'SVG колір тіла') || '#4A6080',
      ac:                  col(row, 'SVG колір акценту') || '#2A4060',
      sort_order:          Number(row['Порядок сортування'] ?? 0) || 0,
      is_active:           true,
    };

    const characteristics = parseChars(row);

    const supplierSku    = col(row, 'Артикул постачальника') || null;
    const priceCost      = parseFloat(col(row, 'Наш вхід (грн)').replace(',', '.')) || null;
    const priceUnit      = parseFloat(col(row, 'Ціна каталог (грн/шт)').replace(',', '.')) || 0;
    const priceOld       = parseFloat(col(row, 'Стара ціна каталог').replace(',', '.')) || null;
    const priceRetail    = parseFloat(col(row, 'Ціна магазин (грн/шт)').replace(',', '.')) || null;
    const priceRetailOld = parseFloat(col(row, 'Стара ціна магазин').replace(',', '.')) || null;
    const priceDrop      = parseFloat(col(row, 'Ціна дроп (грн/шт)').replace(',', '.')) || null;
    const stockQty       = parseInt(col(row, 'Залишок (шт)') || '0', 10) || 0;
    const rawStatus      = col(row, 'Статус');
    const stockStatus    = ['in_stock', 'out_of_stock', 'on_order'].includes(rawStatus)
      ? rawStatus
      : stockQty > 0 ? 'in_stock' : 'out_of_stock';

    const stock: Record<string, unknown> = {
      sku,
      supplier_sku:      supplierSku,
      price_cost:        priceCost,
      price_unit:        priceUnit,
      price_old:         priceOld,
      price_retail:      priceRetail,
      price_retail_old:  priceRetailOld,
      price_drop:        priceDrop,
      stock_qty:         stockQty,
      stock_status:      stockStatus,
      updated_at:        new Date().toISOString(),
    };

    try {
      const { error: productErr } = await serviceClient
        .from('products')
        .upsert(product, { onConflict: 'sku' });

      if (productErr) {
        results.errors.push({ row: i + 2, sku, error: productErr.message });
        continue;
      }

      const { error: stockErr } = await serviceClient
        .from('product_stock')
        .upsert(stock, { onConflict: 'sku' });

      if (stockErr) {
        results.errors.push({ row: i + 2, sku, error: `stock: ${stockErr.message}` });
        continue;
      }

      // Характеристики оновлюємо тільки якщо хоч одна заповнена (виправлення бага)
      if (characteristics.length > 0) {
        await serviceClient
          .from('product_characteristics')
          .delete()
          .eq('product_sku', sku);
        await serviceClient
          .from('product_characteristics')
          .insert(characteristics.map(c => ({ ...c, product_sku: sku })));
      }

      results.success++;
    } catch (err) {
      results.errors.push({ row: i + 2, sku, error: String(err) });
    }
  }

  // Скидаємо кеш продуктів одразу після імпорту
  // @ts-ignore — Next.js 16 requires second arg 'max', type definitions lag behind
  revalidateTag('products', 'max');
  // @ts-ignore
  revalidateTag('categories', 'max');
  // @ts-ignore
  revalidateTag('brands', 'max');

  return NextResponse.json(results);
}
