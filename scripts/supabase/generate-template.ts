/**
 * generate-template.ts
 * Генерує Excel-шаблон для заповнення каталогу товарів.
 *
 * Запуск:  npx tsx scripts/supabase/generate-template.ts
 * Результат: products-template.xlsx у корені проєкту
 */

import * as XLSX from 'xlsx';
import path from 'path';

// ── Колонки шаблону ───────────────────────────────────────────────────────────

const COLUMNS = [
  // Обов'язкові поля
  { key: 'sku',              label: 'SKU *',                  example: 'SIKA-001',        comment: 'Унікальний артикул (обов\'язково)' },
  { key: 'name',             label: 'Назва *',                example: 'Sikaflex-221',    comment: 'Повна назва товару' },
  { key: 'brand',            label: 'Бренд *',                example: 'Sika',            comment: 'Виробник' },
  { key: 'category_slug',    label: 'Категорія *',            example: 'germetyky',       comment: 'germetyky | montazhni-piny | ridki-tsviakhy | klei | gruntovky | strichky' },
  // Базові характеристики
  { key: 'product_type',     label: 'Тип матеріалу',          example: 'Поліуретановий',  comment: 'Акриловий, Силіконовий, Поліуретановий тощо' },
  { key: 'color',            label: 'Колір',                  example: 'Білий',           comment: '' },
  { key: 'volume',           label: 'Об\'єм / Вага',          example: '300 мл',          comment: '300 мл, 600 мл, 12 кг тощо' },
  { key: 'pack_qty',         label: 'В упаковці (шт)',        example: '12',              comment: 'Кількість в транспортній упаковці' },
  { key: 'min_order',        label: 'Мін. замовлення (шт)',   example: '1',               comment: '' },
  // Описи — обидві мови
  { key: 'description',      label: 'Опис (УКР)',             example: 'Еластичний клей-герметик...', comment: 'Короткий SEO-опис українською, 150-300 символів' },
  { key: 'description_ru',   label: 'Опис (РУС)',             example: 'Эластичный клей-герметик...', comment: 'Короткий SEO-опис російською, 150-300 символів' },
  { key: 'description_full', label: 'Повний опис (УКР)',      example: 'Sikaflex-221 — високоеластичний поліуретановий клей-герметик...', comment: 'Детальний опис для картки товару' },
  { key: 'description_full_ru', label: 'Повний опис (РУС)',   example: 'Sikaflex-221 — высокоэластичный полиуретановый клей-герметик...', comment: 'Детальний опис російською' },
  // Ціни — всі типи
  { key: 'supplier_sku',     label: 'Артикул постачальника',  example: 'SUP-12345',       comment: 'Артикул в системі постачальника (для авто-синхронізації)' },
  { key: 'price_cost',       label: 'Наш вхід (грн)',         example: '85.00',           comment: 'Закупівельна ціна (не видно на сайті)' },
  { key: 'price_unit',       label: 'Ціна каталог (грн/шт)',  example: '125.50',          comment: 'Оптова ціна (каталог)' },
  { key: 'price_old',        label: 'Стара ціна каталог',     example: '150.00',          comment: 'Попередня оптова ціна (для знижки)' },
  { key: 'price_retail',     label: 'Ціна магазин (грн/шт)',  example: '165.00',          comment: 'Роздрібна ціна (магазин)' },
  { key: 'price_retail_old', label: 'Стара ціна магазин',     example: '180.00',          comment: 'Попередня роздрібна ціна' },
  { key: 'price_drop',       label: 'Ціна дроп (грн/шт)',     example: '135.00',          comment: 'Ціна для дропшиперів' },
  // Залишки
  { key: 'stock_qty',        label: 'Залишок (шт)',           example: '240',             comment: 'Кількість на складі' },
  { key: 'stock_status',     label: 'Статус',                 example: 'in_stock',        comment: 'in_stock | out_of_stock | on_order' },
  // Зображення
  { key: 'image',            label: 'Фото (URL)',             example: '/products/sika-001.jpg', comment: 'Шлях до фото або URL' },
  { key: 'img_type',         label: 'Тип SVG',                example: 'tube',            comment: 'tube | canister' },
  { key: 'nl1',              label: 'SVG рядок 1',            example: 'SIKAFLEX',        comment: 'Текст на SVG-заглушці (рядок 1)' },
  { key: 'nl2',              label: 'SVG рядок 2',            example: '221',             comment: 'Текст на SVG-заглушці (рядок 2)' },
  { key: 'bc',               label: 'SVG колір тіла',         example: '#4A6080',         comment: 'HEX колір' },
  { key: 'ac',               label: 'SVG колір акценту',      example: '#2A4060',         comment: 'HEX колір' },
  { key: 'sort_order',       label: 'Порядок сортування',     example: '10',              comment: 'Менше = вище' },
  // Характеристики — до 10 штук
  { key: 'char_1',           label: 'Характеристика 1',       example: 'Тип|Поліуретановий', comment: 'Формат: Назва|Значення' },
  { key: 'char_2',           label: 'Характеристика 2',       example: 'Об\'єм|300 мл',   comment: '' },
  { key: 'char_3',           label: 'Характеристика 3',       example: 'Колір|Білий',     comment: '' },
  { key: 'char_4',           label: 'Характеристика 4',       example: '',                comment: '' },
  { key: 'char_5',           label: 'Характеристика 5',       example: '',                comment: '' },
  { key: 'char_6',           label: 'Характеристика 6',       example: '',                comment: '' },
  { key: 'char_7',           label: 'Характеристика 7',       example: '',                comment: '' },
  { key: 'char_8',           label: 'Характеристика 8',       example: '',                comment: '' },
  { key: 'char_9',           label: 'Характеристика 9',       example: '',                comment: '' },
  { key: 'char_10',          label: 'Характеристика 10',      example: '',                comment: '' },
];

// ── Рядок-приклад ─────────────────────────────────────────────────────────────

const exampleRow: Record<string, string> = {};
COLUMNS.forEach((col) => { exampleRow[col.label] = col.example; });

// ── Збірка ────────────────────────────────────────────────────────────────────

const wb = XLSX.utils.book_new();

// Аркуш 1: шаблон
const ws = XLSX.utils.json_to_sheet([exampleRow], { header: COLUMNS.map((c) => c.label) });

// Ширина стовпців
ws['!cols'] = COLUMNS.map((c) => ({ wch: Math.max(c.label.length, c.example.length, 18) }));

XLSX.utils.book_append_sheet(wb, ws, 'Товари');

// Аркуш 2: категорії (редагується користувачем)
const categoryCols = [
  { label: 'slug *',         example: 'germetyky',      comment: 'Латиниця + дефіс, унікальний ID' },
  { label: 'Назва *',        example: 'Герметики',       comment: 'Назва категорії на сайті' },
  { label: 'sort_order',     example: '1',               comment: 'Порядок у меню (менше = вище)' },
];

const catExamples = [
  { 'slug *': 'germetyky',      'Назва *': 'Герметики',      'sort_order': '1' },
  { 'slug *': 'montazhni-piny', 'Назва *': 'Монтажні піни',  'sort_order': '2' },
  { 'slug *': 'ridki-tsviakhy', 'Назва *': 'Рідкі цвяхи',   'sort_order': '3' },
  { 'slug *': 'klei',           'Назва *': 'Клеї',           'sort_order': '4' },
  { 'slug *': 'gruntovky',      'Назва *': 'Ґрунтовки',      'sort_order': '5' },
  { 'slug *': 'strichky',       'Назва *': 'Стрічки',        'sort_order': '6' },
];

const wsCats = XLSX.utils.json_to_sheet(catExamples, { header: categoryCols.map((c) => c.label) });
wsCats['!cols'] = categoryCols.map((c) => ({ wch: Math.max(c.label.length, c.example.length, 20) }));
XLSX.utils.book_append_sheet(wb, wsCats, 'Категорії');

const outPath = path.resolve(process.cwd(), 'products-template.xlsx');
XLSX.writeFile(wb, outPath);
console.log(`✅  Шаблон збережено: ${outPath}`);
console.log('   Аркуш "Категорії" — додайте/змініть категорії');
console.log('   Аркуш "Товари"    — заповніть товари');
console.log('   Потім: npm run db:import');
