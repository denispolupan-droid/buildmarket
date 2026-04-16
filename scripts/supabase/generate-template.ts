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
  { key: 'sku',          label: 'SKU *',               example: 'SIKA-001',        comment: 'Унікальний артикул (обов\'язково)' },
  { key: 'name',         label: 'Назва *',              example: 'Sikaflex-221',    comment: 'Повна назва товару' },
  { key: 'brand',        label: 'Бренд *',              example: 'Sika',            comment: 'Виробник' },
  { key: 'category_slug',label: 'Категорія *',          example: 'germetyky',       comment: 'germetyky | montazhni-piny | ridki-tsviakhy | klei | gruntovky | strichky' },
  { key: 'product_type', label: 'Тип матеріалу',        example: 'Поліуретановий',  comment: 'Акриловий, Силіконовий, Поліуретановий тощо' },
  { key: 'color',        label: 'Колір',                example: 'Білий',           comment: '' },
  { key: 'volume',       label: 'Об\'єм / Вага',        example: '300 мл',          comment: '300 мл, 600 мл, 12 кг тощо' },
  { key: 'pack_qty',     label: 'В упаковці (шт)',      example: '12',              comment: 'Кількість в транспортній упаковці' },
  { key: 'min_order',    label: 'Мін. замовлення (шт)', example: '1',               comment: '' },
  { key: 'description',  label: 'Опис',                 example: 'Еластичний клей-герметик для...',comment: '' },
  { key: 'image',        label: 'Фото (шлях)',          example: '/products/sika-001.jpg', comment: 'Відносний шлях від /public' },
  { key: 'img_type',     label: 'Тип SVG',              example: 'tube',            comment: 'tube | canister' },
  { key: 'nl1',          label: 'SVG рядок 1',          example: 'SIKAFLEX',        comment: 'Текст на SVG-заглушці (рядок 1)' },
  { key: 'nl2',          label: 'SVG рядок 2',          example: '221',             comment: 'Текст на SVG-заглушці (рядок 2)' },
  { key: 'bc',           label: 'SVG колір тіла',       example: '#4A6080',         comment: 'HEX колір' },
  { key: 'ac',           label: 'SVG колір акценту',    example: '#2A4060',         comment: 'HEX колір' },
  { key: 'sort_order',   label: 'Порядок сортування',   example: '10',              comment: 'Менше = вище' },
  // Ціни та залишки
  { key: 'supplier_sku', label: 'Артикул постачальника', example: 'SUP-12345',       comment: 'Артикул в системі постачальника (для авто-синхронізації)' },
  { key: 'price_unit',   label: 'Ціна (грн/шт)',        example: '125.50',          comment: 'Роздрібна ціна за штуку' },
  { key: 'price_old',    label: 'Стара ціна',           example: '150.00',          comment: 'Якщо є знижка — попередня ціна' },
  { key: 'stock_qty',    label: 'Залишок (шт)',         example: '240',             comment: 'Кількість на складі' },
  { key: 'stock_status', label: 'Статус',               example: 'in_stock',        comment: 'in_stock | out_of_stock | on_order' },
  // Характеристики — окремі стовпці, розділені "|"
  { key: 'char_1',       label: 'Характеристика 1',     example: 'Тип|Поліуретановий', comment: 'Формат: Назва|Значення' },
  { key: 'char_2',       label: 'Характеристика 2',     example: 'Об\'єм|300 мл',   comment: '' },
  { key: 'char_3',       label: 'Характеристика 3',     example: 'Колір|Білий',     comment: '' },
  { key: 'char_4',       label: 'Характеристика 4',     example: '',                comment: '' },
  { key: 'char_5',       label: 'Характеристика 5',     example: '',                comment: '' },
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
