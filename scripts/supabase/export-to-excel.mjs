/**
 * export-to-excel.mjs
 * Вивантажує всі товари та категорії з Supabase в Excel.
 * Заповнені поля вже є, порожні — для ручного заповнення.
 *
 * Запуск:
 *   node scripts/supabase/export-to-excel.mjs
 *   node scripts/supabase/export-to-excel.mjs --out=my-catalog.xlsx
 */

import { readFileSync, writeFileSync } from 'fs';
import { createRequire } from 'module';
import path from 'path';
import { createClient } from '@supabase/supabase-js';

const require = createRequire(import.meta.url);
const XLSX = require('xlsx');

// ── Конфіг ────────────────────────────────────────────────────────────────────

const envLines = readFileSync('.env.local', 'utf-8').split('\n');
const env = {};
for (const line of envLines) {
  const m = line.match(/^([^#=\s]+)\s*=\s*(.*)$/);
  if (m) env[m[1]] = m[2].trim();
}
const supabase = createClient(env['NEXT_PUBLIC_SUPABASE_URL'], env['SUPABASE_SERVICE_ROLE_KEY']);

const outArg  = process.argv.find(a => a.startsWith('--out='))?.slice(6);
const outPath = path.resolve(process.cwd(), outArg ?? 'catalog-export.xlsx');

// ── Завантаження даних ────────────────────────────────────────────────────────

async function main() {
  console.log('\n📦 Завантажую дані з Supabase...');

  const [{ data: categories }, { data: products }] = await Promise.all([
    supabase.from('categories').select('*').order('sort_order'),
    supabase.from('products')
      .select('*, stock:product_stock(*), characteristics:product_characteristics(*)')
      .eq('is_active', true)
      .order('category_slug, name'),
  ]);

  console.log(`   Категорій: ${categories.length}`);
  console.log(`   Товарів:   ${products.length}`);

  // Будуємо map slug → назва категорії
  const catName = {};
  categories.forEach(c => { catName[c.slug] = c.name; });
  const catParent = {};
  categories.forEach(c => { if (c.parent_slug) catParent[c.slug] = c.parent_slug; });

  // ── Аркуш "Товари" ─────────────────────────────────────────────────────────

  const rows = products.map(p => {
    const stock = Array.isArray(p.stock) ? p.stock[0] : p.stock;
    const chars = Array.isArray(p.characteristics) ? p.characteristics : [];
    chars.sort((a, b) => a.sort_order - b.sort_order);

    const parentSlug = catParent[p.category_slug] ?? p.category_slug;
    const catLabel   = p.category_slug
      ? `${catName[parentSlug] ?? parentSlug} › ${catParent[p.category_slug] ? catName[p.category_slug] ?? p.category_slug : ''}`
      : '';

    const row = {
      'SKU':                    p.sku ?? '',
      'Артикул постачальника':  stock?.supplier_sku ?? '',
      'Назва':                  p.name ?? '',
      'Бренд':                  p.brand ?? '',
      'Категорія (slug)':       p.category_slug ?? '',
      'Категорія (назва)':      catLabel.replace(/ › $/, ''),
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

    // Характеристики (до 10)
    for (let i = 0; i < 10; i++) {
      const c = chars[i];
      row[`Характеристика ${i + 1}`] = c ? `${c.label}|${c.value}` : '';
    }

    return row;
  });

  const wsProducts = XLSX.utils.json_to_sheet(rows);

  // Ширина колонок
  const colWidths = [
    12, 22, 55, 15, 25, 35, 12, 18, 12, 14, 18,
    14, 12, 12, 14, 50, 35, 10, 14, 14, 16, 18,
    25, 25, 25, 25, 25, 25, 25, 25, 25, 25,
  ];
  wsProducts['!cols'] = colWidths.map(w => ({ wch: w }));

  // Жирний заголовок
  const range = XLSX.utils.decode_range(wsProducts['!ref'] ?? 'A1');
  for (let c = range.s.c; c <= range.e.c; c++) {
    const cell = wsProducts[XLSX.utils.encode_cell({ r: 0, c })];
    if (cell) cell.s = { font: { bold: true }, fill: { fgColor: { rgb: 'EFF6FF' } } };
  }

  // ── Аркуш "Категорії" ──────────────────────────────────────────────────────

  const catRows = categories.map(c => ({
    'Slug':            c.slug,
    'Назва':           c.name,
    'Батьківська':     c.parent_slug ?? '',
    'Порядок':         c.sort_order,
    'К-ть товарів':    products.filter(p => p.category_slug === c.slug).length,
  }));

  const wsCats = XLSX.utils.json_to_sheet(catRows);
  wsCats['!cols'] = [28, 35, 28, 10, 14].map(w => ({ wch: w }));

  // Жирний заголовок
  const catRange = XLSX.utils.decode_range(wsCats['!ref'] ?? 'A1');
  for (let c = catRange.s.c; c <= catRange.e.c; c++) {
    const cell = wsCats[XLSX.utils.encode_cell({ r: 0, c })];
    if (cell) cell.s = { font: { bold: true }, fill: { fgColor: { rgb: 'EFF6FF' } } };
  }

  // ── Аркуш "Довідка" ───────────────────────────────────────────────────────

  const helpRows = [
    { 'Поле': 'SKU',                   'Опис': 'Наш унікальний артикул (не змінювати!)',       'Приклад': '1001-001' },
    { 'Поле': 'Артикул постачальника',  'Опис': 'Код постачальника для синхронізації цін',      'Приклад': '1606-012' },
    { 'Поле': 'Назва',                  'Опис': 'Повна назва товару',                           'Приклад': 'Герметик силіконовий Lacrysil 280 мл' },
    { 'Поле': 'Бренд',                  'Опис': 'Виробник',                                     'Приклад': 'Lacrysil' },
    { 'Поле': "Об'єм / Вага",           'Опис': 'Об\'єм або вага з одиницею виміру',            'Приклад': '280 мл' },
    { 'Поле': 'Тип матеріалу',          'Опис': 'Підтип товару для фільтрації',                 'Приклад': 'Силіконовий' },
    { 'Поле': 'Колір',                  'Опис': 'Колір товару',                                 'Приклад': 'Білий' },
    { 'Поле': 'В упаковці (шт)',        'Опис': 'Кількість у транспортній упаковці',            'Приклад': '12' },
    { 'Поле': 'Мін. замовлення (шт)',   'Опис': 'Мінімальна кількість для замовлення',         'Приклад': '1' },
    { 'Поле': 'Наш вхід (грн)',          'Опис': 'Закупівельна ціна (не відображається на сайті)', 'Приклад': '85.00' },
    { 'Поле': 'Ціна каталог (грн/шт)',  'Опис': 'Оптова ціна (оптовий каталог)',                'Приклад': '120.50' },
    { 'Поле': 'Стара ціна каталог',     'Опис': 'Попередня оптова ціна (якщо є знижка)',        'Приклад': '140.00' },
    { 'Поле': 'Ціна магазин (грн/шт)',  'Опис': 'Роздрібна ціна (магазин)',                    'Приклад': '150.00' },
    { 'Поле': 'Стара ціна магазин',     'Опис': 'Попередня роздрібна ціна',                    'Приклад': '180.00' },
    { 'Поле': 'Ціна дроп (грн/шт)',     'Опис': 'Ціна для дропшиперів',                       'Приклад': '130.00' },
    { 'Поле': 'Залишок (шт)',           'Опис': 'Кількість на складі',                          'Приклад': '50' },
    { 'Поле': 'Статус',                 'Опис': 'in_stock / out_of_stock / on_order',           'Приклад': 'in_stock' },
    { 'Поле': 'Опис (УКР)',              'Опис': 'Короткий SEO-опис українською, 150-300 символів', 'Приклад': 'Силіконовий герметик для санвузлів...' },
    { 'Поле': 'Опис (РУС)',              'Опис': 'Короткий SEO-опис російською, 150-300 символів', 'Приклад': 'Силиконовый герметик для санузлов...' },
    { 'Поле': 'Повний опис (УКР)',       'Опис': 'Детальний опис для картки товару українською', 'Приклад': 'Герметик Ceresit CS 11 — універсальний акриловий герметик...' },
    { 'Поле': 'Повний опис (РУС)',       'Опис': 'Детальний опис для картки товару російською', 'Приклад': 'Герметик Ceresit CS 11 — универсальный акриловый герметик...' },
    { 'Поле': 'Фото (URL)',             'Опис': 'Посилання на фото або шлях /public/...',       'Приклад': 'https://example.com/photo.jpg' },
    { 'Поле': 'Тип SVG',               'Опис': 'Тип генерованого зображення',                  'Приклад': 'tube / canister' },
    { 'Поле': 'SVG рядок 1',           'Опис': 'Перший рядок тексту на заглушці',              'Приклад': 'LACRYSIL' },
    { 'Поле': 'SVG рядок 2',           'Опис': 'Другий рядок тексту на заглушці',              'Приклад': 'UNIVERSAL' },
    { 'Поле': 'Характеристика N',      'Опис': 'Формат: Назва|Значення',                       'Приклад': 'Температура застосування|-10°C...+40°C' },
  ];

  const wsHelp = XLSX.utils.json_to_sheet(helpRows);
  wsHelp['!cols'] = [25, 45, 40].map(w => ({ wch: w }));

  // ── Збірка книги ──────────────────────────────────────────────────────────

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, wsProducts, 'Товари');
  XLSX.utils.book_append_sheet(wb, wsCats,     'Категорії');
  XLSX.utils.book_append_sheet(wb, wsHelp,     'Довідка');

  XLSX.writeFile(wb, outPath);

  console.log(`\n✅ Файл збережено: ${outPath}`);
  console.log(`   Аркуш "Товари"     — ${products.length} товарів`);
  console.log(`   Аркуш "Категорії"  — ${categories.length} категорій`);
  console.log(`   Аркуш "Довідка"    — опис полів\n`);
  console.log('   Відредагуйте файл і імпортуйте назад:');
  console.log('   npx tsx scripts/supabase/import-from-excel.ts catalog-export.xlsx\n');
}

main().catch(err => { console.error('\n❌ Помилка:', err.message); process.exit(1); });
