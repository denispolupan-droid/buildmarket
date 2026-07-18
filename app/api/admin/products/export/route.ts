import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServer } from '../../../../../lib/supabase-server';
import { createClient } from '@supabase/supabase-js';
import * as XLSX from 'xlsx';

const serviceClient = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

export async function GET(req: NextRequest) {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user || user.app_metadata?.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const [{ data: categories }, { data: products }] = await Promise.all([
    serviceClient.from('categories').select('*').order('sort_order'),
    serviceClient
      .from('products')
      .select('*, stock:product_stock(*), characteristics:product_characteristics(*)')
      .order('category_slug, name'),
  ]);

  const wb = XLSX.utils.book_new();

  // ── Збираємо всі унікальні характеристики відсортовані за частотою ──────────

  const labelFreq: Record<string, number> = {};
  (products ?? []).forEach(p => {
    const chars = Array.isArray(p.characteristics) ? p.characteristics : [];
    chars.forEach((c: { label: string }) => {
      labelFreq[c.label] = (labelFreq[c.label] ?? 0) + 1;
    });
  });
  const uniqueLabels = Object.entries(labelFreq)
    .sort((a, b) => b[1] - a[1])
    .map(([label]) => label);

  // ── Аркуш "Товари" ──────────────────────────────────────────────────────────

  const rows = (products ?? []).map(p => {
    const stock = Array.isArray(p.stock) ? p.stock[0] : p.stock;
    const chars: { label: string; value: string; sort_order: number }[] =
      Array.isArray(p.characteristics) ? [...p.characteristics] : [];
    chars.sort((a, b) => a.sort_order - b.sort_order);

    const row: Record<string, string | number> = {
      'SKU':                    p.sku ?? '',
      'Артикул постачальника':  stock?.supplier_sku ?? '',
      'Назва':                  p.name ?? '',
      'Бренд':                  p.brand ?? '',
      'Категорія (slug)':       p.category_slug ?? '',
      "Об'єм / Вага":           p.volume ?? '',
      'Тип матеріалу':          p.product_type ?? '',
      'Колір':                  p.color ?? '',
      'В упаковці (шт)':        p.pack_qty ?? 1,
      'Мін. замовлення (шт)':   p.min_order ?? 1,
      'Наш вхід (грн)':         stock?.price_cost ?? '',
      'Ціна каталог (грн/шт)':  stock?.price_unit ?? '',
      'Стара ціна каталог':     stock?.price_old ?? '',
      'Ціна магазин (грн/шт)':  stock?.price_retail ?? '',
      'Стара ціна магазин':     stock?.price_retail_old ?? '',
      'Ціна дроп (грн/шт)':     stock?.price_drop ?? '',
      'Залишок (шт)':           stock?.stock_qty ?? '',
      'Статус':                 stock?.stock_status ?? '',
      'Опис (УКР)':             p.description ?? '',
      'Опис (РУС)':             p.description_ru ?? '',
      'Повний опис (УКР)':      p.description_full ?? '',
      'Повний опис (РУС)':      p.description_full_ru ?? '',
      'Фото (URL)':             p.image ?? '',
      'Тип SVG':                p.img_type ?? 'tube',
      'SVG рядок 1':            p.nl1 ?? '',
      'SVG рядок 2':            p.nl2 ?? '',
      'SVG колір тіла':         p.bc ?? '',
      'SVG колір акценту':      p.ac ?? '',
      'Порядок сортування':     p.sort_order ?? 0,
    };

    const charMap: Record<string, string> = {};
    chars.forEach(c => { charMap[c.label] = c.value; });
    uniqueLabels.forEach(label => { row[label] = charMap[label] ?? ''; });

    return row;
  });

  const wsProducts = XLSX.utils.json_to_sheet(rows);

  const standardWidths = [
    12, 22, 55, 15, 25, 12, 18, 12, 14, 18,
    14, 16, 16, 18, 18, 16, 12, 12,
    40, 40, 60, 60, 45, 10, 18, 18, 16, 18, 12,
  ];
  wsProducts['!cols'] = [
    ...standardWidths,
    ...uniqueLabels.map(() => 22),
  ].map(w => ({ wch: w }));

  const range = XLSX.utils.decode_range(wsProducts['!ref'] ?? 'A1');
  for (let c = range.s.c; c <= range.e.c; c++) {
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
    { 'Поле': 'SKU',                    'Опис': 'Унікальний артикул. Для існуючих — не змінювати!',      'Приклад': '1001-001' },
    { 'Поле': 'Артикул постачальника',  'Опис': 'Код постачальника для синхронізації цін',               'Приклад': '1606-012' },
    { 'Поле': 'Назва',                  'Опис': 'Повна назва товару',                                    'Приклад': 'Герметик силіконовий Lacrysil 280 мл' },
    { 'Поле': 'Бренд',                  'Опис': 'Виробник',                                              'Приклад': 'Lacrysil' },
    { 'Поле': 'Категорія (slug)',        'Опис': 'Slug категорії — дивись аркуш Категорії',               'Приклад': 'germetyky' },
    { 'Поле': "Об'єм / Вага",           'Опис': "Об'єм або вага з одиницею виміру",                     'Приклад': '280 мл' },
    { 'Поле': 'Тип матеріалу',          'Опис': 'Підтип для фільтрації на сайті',                        'Приклад': 'Силіконовий' },
    { 'Поле': 'Колір',                  'Опис': 'Колір товару',                                          'Приклад': 'Білий' },
    { 'Поле': 'Наш вхід (грн)',         'Опис': 'Закупівельна ціна (не відображається на сайті)',        'Приклад': '85.00' },
    { 'Поле': 'Ціна каталог (грн/шт)', 'Опис': 'Оптова ціна',                                           'Приклад': '120.50' },
    { 'Поле': 'Ціна магазин (грн/шт)', 'Опис': 'Роздрібна ціна',                                        'Приклад': '150.00' },
    { 'Поле': 'Ціна дроп (грн/шт)',    'Опис': 'Ціна для дропшиперів',                                  'Приклад': '130.00' },
    { 'Поле': 'Залишок (шт)',          'Опис': 'Кількість на складі',                                    'Приклад': '50' },
    { 'Поле': 'Статус',                'Опис': 'in_stock / out_of_stock / on_order',                     'Приклад': 'in_stock' },
    { 'Поле': 'Опис (УКР/РУС)',        'Опис': 'Короткий SEO-опис, 150-300 символів',                   'Приклад': 'Силіконовий герметик для санвузлів...' },
    { 'Поле': 'Повний опис (УКР/РУС)', 'Опис': 'Детальний опис для картки товару',                      'Приклад': 'Lacrysil — універсальний герметик...' },
    { 'Поле': 'Фото (URL)',            'Опис': 'Посилання на фото або шлях /img/products/...',           'Приклад': '/img/products/lacrysil/001.jpg' },
    { 'Поле': 'Тип SVG',              'Опис': 'Тип генерованого зображення: tube або canister',          'Приклад': 'tube' },
    { 'Поле': 'SVG рядок 1 / 2',      'Опис': 'Текст на заглушці товару',                               'Приклад': 'LACRYSIL' },
    { 'Поле': 'SVG колір тіла / акц.', 'Опис': 'HEX-кольори заглушки',                                  'Приклад': '#4A6080' },
    { 'Поле': '<Назва характеристики>', 'Опис': 'Колонки після стандартних — характеристики товару. Порожня = не відображається. Нова колонка = нова характеристика.', 'Приклад': 'Матеріал → Силіконовий' },
  ];
  const wsHelp = XLSX.utils.json_to_sheet(helpRows);
  wsHelp['!cols'] = [25, 55, 40].map(w => ({ wch: w }));
  XLSX.utils.book_append_sheet(wb, wsHelp, 'Довідка');

  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  const date = new Date().toISOString().slice(0, 10);

  return new NextResponse(buf, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="catalog-export-${date}.xlsx"`,
    },
  });
}
