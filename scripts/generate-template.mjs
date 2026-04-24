import * as XLSX from 'xlsx';

// ── Sheet 1: Товари ───────────────────────────────────────────────────────────
const productsHeaders = [
  'sku',
  'supplier_sku',
  'name',
  'brand',
  'category_slug',
  'volume',
  'product_type',
  'color',
  'description',
  'pack_qty',
  'min_order',
  'price_cost',
  'price_unit',
  'price_old',
  'stock_qty',
  'is_active',
  'sort_order',
];

const productsComments = [
  'Твій артикул (унікальний)',
  'Артикул постачальника — для синхронізації даних',
  'Назва товару (бренд + продукт + обʼєм)',
  'Бренд',
  'Slug категорії (з листа Категорії)',
  'Обʼєм або розмір (300 мл, 600 мл, 5 л)',
  'Тип товару (силіконовий, поліуретановий...)',
  'Колір (білий, прозорий, чорний...)',
  'Унікальний опис 3-5 речень — ВАЖЛИВО для SEO',
  'Кількість в упаковці (шт)',
  'Мінімальне замовлення (шт)',
  'Вхідна ціна від постачальника (грн) — не показується клієнту',
  'Ціна продажу (грн)',
  'Стара ціна для акції (грн, необовʼязково)',
  'Залишок на складі (шт)',
  'Активний: TRUE або FALSE',
  'Порядок сортування (1, 2, 3...)',
];

const productsExample = [
  'FX-SD-WS-300',
  'SD-WS-300',
  'Герметик силіконовий санітарний білий 300 мл',
  'Soudal',
  'germetyky',
  '300 мл',
  'силіконовий',
  'білий',
  'Санітарний силіконовий герметик Soudal для ванних кімнат і кухонь. Стійкий до вологи, цвілі та побутової хімії. Температурний діапазон від -40°C до +150°C. Ідеальний для герметизації стиків між ванною, душовою кабіною та керамічною плиткою.',
  6,
  6,
  120,
  185,
  220,
  144,
  'TRUE',
  1,
];

const productsData = [productsHeaders, productsComments, productsExample];

// ── Sheet 2: Категорії ────────────────────────────────────────────────────────
const categoriesData = [
  ['slug', 'name', 'sort_order'],
  ['slug — латиниця, без пробілів', 'Назва українською', 'Порядок (1, 2, 3...)'],
  ['germetyky',    'Герметики',        1],
  ['montazhni-piny', 'Монтажні піни',  2],
  ['kley',         'Клеї',             3],
  ['ridki-tsvyakhy', 'Рідкі цвяхи',   4],
  ['grunt',        'Ґрунтовки',        5],
];

// ── Sheet 3: Характеристики ───────────────────────────────────────────────────
const charsData = [
  ['sku', 'label', 'value', 'sort_order'],
  ['Артикул товару (з листа Товари)', 'Назва параметру', 'Значення', 'Порядок'],
  ['SD-WS-300', 'Колір',                    'Білий',              1],
  ['SD-WS-300', 'Обʼєм',                    '300 мл',             2],
  ['SD-WS-300', 'Тип',                      'Санітарний',         3],
  ['SD-WS-300', 'Основа',                   'Силіконова',         4],
  ['SD-WS-300', 'Температура застосування', 'від +5°C до +40°C',  5],
  ['SD-WS-300', 'Температура експлуатації', 'від -40°C до +150°C',6],
  ['SD-WS-300', 'Час утворення плівки',     '5-10 хв',            7],
  ['SD-WS-300', 'Повне затвердіння',        '24 год',             8],
  ['SD-WS-300', 'Стійкість до цвілі',       'Так',                9],
  ['SD-WS-300', 'Країна виробника',         'Бельгія',           10],
];

// ── Build workbook ────────────────────────────────────────────────────────────
const wb = XLSX.utils.book_new();

function addSheet(name, data, colWidths) {
  const ws = XLSX.utils.aoa_to_sheet(data);

  // Column widths
  ws['!cols'] = colWidths.map(w => ({ wch: w }));

  // Style header row (bold) — note: xlsx community edition has limited styling
  const range = XLSX.utils.decode_range(ws['!ref']);
  for (let C = range.s.c; C <= range.e.c; C++) {
    const cell = ws[XLSX.utils.encode_cell({ r: 0, c: C })];
    if (cell) cell.s = { font: { bold: true }, fill: { fgColor: { rgb: 'E8EEF5' } } };
    const commentCell = ws[XLSX.utils.encode_cell({ r: 1, c: C })];
    if (commentCell) commentCell.s = { font: { italic: true, color: { rgb: '94A3B8' } } };
  }

  XLSX.utils.book_append_sheet(wb, ws, name);
}

addSheet('Товари', productsData, [15, 18, 45, 12, 18, 10, 18, 12, 60, 12, 12, 14, 12, 12, 12, 10, 10]);
addSheet('Категорії', categoriesData, [20, 25, 14]);
addSheet('Характеристики', charsData, [15, 25, 30, 12]);

XLSX.writeFile(wb, 'products-template.xlsx');
console.log('✅ products-template.xlsx створено');
