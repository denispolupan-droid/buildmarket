/**
 * import-new-products.mjs
 * Імпортує аркуш "Нові товари" з catalog-export.xlsx (формат Prom.ua)
 *
 * Запуск (dry-run):
 *   node scripts/supabase/import-new-products.mjs --dry-run
 * Реальний імпорт:
 *   node scripts/supabase/import-new-products.mjs
 */

import { readFileSync } from 'fs';
import { createRequire } from 'module';
import { createClient } from '@supabase/supabase-js';

const require = createRequire(import.meta.url);
const XLSX    = require('xlsx');

// ── Конфіг ────────────────────────────────────────────────────────────────────

const envLines = readFileSync('.env.local', 'utf-8').split('\n');
const env = {};
for (const line of envLines) {
  const m = line.match(/^([^#=\s]+)\s*=\s*(.*)$/);
  if (m) env[m[1]] = m[2].trim();
}
const supabase = createClient(env['NEXT_PUBLIC_SUPABASE_URL'], env['SUPABASE_SERVICE_ROLE_KEY']);
const DRY_RUN = process.argv.includes('--dry-run');

// ── Маппінг груп Prom.ua → наші категорії ────────────────────────────────────

const GROUP_CATEGORY = {
  'Затирка для швів':                          'zamazky-dlya-shviv',
  'Емалі':                                     'alkidni-farby',
  'Малярські кисті':                           'kysti-ta-valy',
  'Герметики і силікони':                      null, // detect from name
  'Комплектуючі для плиткових робіт':          'zamazky-dlya-shviv',
  'Мийні та чистячі засоби':                   'ochysnyky',
  'Рулонні і листові гідроізоляційні матеріали': 'hidroizolyatsiya',
  'Малярні стрічки, скотч':                   'malyarna-strichka',
  'Шурупи, саморізи':                          'shurupy-ta-samorizy',
  'Поглиначі вологи':                          'vologopoglinachi',
  'Звукоізоляційні матеріали':                 'zvukoizolyatsiyna-strichka',
  'Обмащувальні гідроізоляційні матеріали':    'hidroizolyatsiyni-mastyky',
  'Грунтовки':                                 'gruntivky-gotovi',
  'Будівельні та промислові клеї':             'montazhnyi-klei',
  'Пластифікатори і добавки в розчини':        'plastyfikatory-dlya-betonu',
  'Захисні просочення':                        'laky',
  'Шпателі':                                   'shpateli',
  'Дюбелі':                                    'dyubeli-ta-ankery',
  'Відрізні, зачисні, шліфувальні, пильні круги': 'shlifuvalny',
  'Монтажна піна':                             'pistoletna-pina',
  'Канцелярський і пакувальний скотч':         'malyarna-strichka',
  'Штукатурка':                                'gruntivky',
  // Пропускаємо:
  'Автомобільні універсальні мастила':  null,
  'Сигнальний одяг':                    null,
  'Штукатурні маяки і куточки':         null,
  'Електроди':                          null,
  'Харчова плівка, папір і фольга':     null,
  'Робочі рукавички':                   null,
  'Комплектуючі до запірної арматури':  null,
};

// ── Визначення підкатегорії герметиків ────────────────────────────────────────

function detectSealantCat(name) {
  const n = name.toLowerCase();
  if (n.includes('силіконов') || n.includes('силікон'))  return 'sylikonovi-germetyky';
  if (n.includes('акриловий') || n.includes('акрил'))    return 'akrylovi-germetyky';
  if (n.includes('поліуретановий'))                      return 'poliuretanovi-germetyky';
  if (n.includes('нейтральний'))                         return 'neytralny-germetyky';
  if (n.includes('бітумний'))                            return 'bitumni-germetyky';
  if (n.includes('жаростійк') || n.includes('вогнестійк')) return 'zharostiyki-germetyky';
  return 'germetyky';
}

// ── Витяг об'єму ─────────────────────────────────────────────────────────────

function extractVolume(name) {
  const m = name.match(/(\d+(?:[,.]\d+)?)\s*(мл|л\b|кг\b|г\b(?!\w))/i);
  return m ? `${m[1].replace(',','.')} ${m[2].toLowerCase()}` : null;
}

// ── Нумерація категорій ───────────────────────────────────────────────────────

const CAT_CODE = {
  'germetyky':'10','hidroizolyatsiya':'11','gruntivky':'12',
  'zamazky-dlya-shviv':'13','zakhyst-derevyny':'14','instrumenty':'15',
  'klei':'16','kriplennya':'17','montazhna-pina':'18',
  'plastyfikatory':'19','strichky':'20','farby':'21','vologopoglinachi':'22',
};
const SUBCAT_PARENT = {
  'sylikonovi-germetyky':'germetyky','akrylovi-germetyky':'germetyky',
  'poliuretanovi-germetyky':'germetyky','bitumni-germetyky':'germetyky',
  'neytralny-germetyky':'germetyky','zharostiyki-germetyky':'germetyky',
  'hidroizolyatsiyni-mastyky':'hidroizolyatsiya','bitumni-mastyky':'hidroizolyatsiya',
  'praimery':'hidroizolyatsiya','izolyatsiyni-strichky':'hidroizolyatsiya',
  'gruntivky-gotovi':'gruntivky','gruntivky-kontsentraty':'gruntivky',
  'betonokontakt':'gruntivky','shpaklivky':'gruntivky','antygrybok':'gruntivky',
  'zamazky-epoksydni':'zamazky-dlya-shviv','zamazky-tsementni':'zamazky-dlya-shviv',
  'antyseptyki':'zakhyst-derevyny','morylky':'zakhyst-derevyny','zakhysni-pokryttya':'zakhyst-derevyny',
  'kysti-ta-valy':'instrumenty','pistolety':'instrumenty','shlifuvalny':'instrumenty',
  'shpateli':'instrumenty','vymiriuvalny':'instrumenty',
  'klei-dlya-shpaler':'klei','kontaktnyi-klei':'klei','montazhnyi-klei':'klei',
  'pva-ta-stolyarnyi':'klei','ridki-tsvyakhy':'klei','super-klei':'klei','epoksydni-klei':'klei',
  'dyubeli-ta-ankery':'kriplennya','shurupy-ta-samorizy':'kriplennya',
  'ochysnyky':'montazhna-pina','pina-klei':'montazhna-pina',
  'pistoletna-pina':'montazhna-pina','pobutova-pina':'montazhna-pina','vohnezakhysna-pina':'montazhna-pina',
  'plastyfikatory-dlya-betonu':'plastyfikatory',
  'hermetyzuyucha-strichka':'strichky','malyarna-strichka':'strichky',
  'strichka-dlya-shviv':'strichky','zvukoizolyatsiyna-strichka':'strichky',
  'alkidni-farby':'farby','farby-3v1':'farby','farby-3v1-alkidni':'farby-3v1',
  'moltkovi-farby':'farby-3v1','farby-3v1-akrylovi':'farby-3v1',
  'farby-dlya-pidlohy':'farby','koloranty':'farby','laky':'farby',
  'rozchynnyky':'farby','vodoemiulsiyni-fasadni':'farby','vodoemiulsiyni-interierni':'farby',
};
const SUBCAT_CODE = {
  'sylikonovi-germetyky':'05','akrylovi-germetyky':'01','poliuretanovi-germetyky':'04',
  'bitumni-germetyky':'02','neytralny-germetyky':'03','zharostiyki-germetyky':'06',
  'bitumni-mastyky':'01','hidroizolyatsiyni-mastyky':'02','izolyatsiyni-strichky':'03','praimery':'04',
  'antygrybok':'01','betonokontakt':'02','gruntivky-gotovi':'03','gruntivky-kontsentraty':'04','shpaklivky':'05',
  'zamazky-epoksydni':'01','zamazky-tsementni':'02',
  'antyseptyki':'01','morylky':'02','zakhysni-pokryttya':'03',
  'kysti-ta-valy':'01','pistolety':'02','shlifuvalny':'03','shpateli':'04','vymiriuvalny':'05',
  'klei-dlya-shpaler':'01','kontaktnyi-klei':'02','montazhnyi-klei':'03',
  'pva-ta-stolyarnyi':'04','ridki-tsvyakhy':'05','super-klei':'06','epoksydni-klei':'07',
  'dyubeli-ta-ankery':'01','shurupy-ta-samorizy':'02',
  'ochysnyky':'01','pina-klei':'02','pistoletna-pina':'03','pobutova-pina':'04','vohnezakhysna-pina':'05',
  'plastyfikatory-dlya-betonu':'01',
  'hermetyzuyucha-strichka':'01','malyarna-strichka':'02','strichka-dlya-shviv':'03','zvukoizolyatsiyna-strichka':'04',
  'alkidni-farby':'01','farby-3v1':'02','farby-dlya-pidlohy':'03','koloranty':'04',
  'laky':'05','moltkovi-farby':'06','rozchynnyky':'07','vodoemiulsiyni-fasadni':'08','vodoemiulsiyni-interierni':'09',
};

// ── Головна функція ───────────────────────────────────────────────────────────

async function main() {
  if (DRY_RUN) console.log('🔍 DRY RUN\n');

  const wb   = XLSX.readFile('catalog-export.xlsx');
  const ws   = wb.Sheets['Нові товари'];
  const rows = XLSX.utils.sheet_to_json(ws, { defval: '' });
  console.log(`📦 Знайдено рядків: ${rows.length}`);

  // Завантажуємо поточні SKU для підрахунку позицій
  const { data: existing } = await supabase.from('products').select('sku, category_slug');
  const counters = {};
  (existing ?? []).forEach(p => {
    const cs  = p.category_slug ?? '';
    const par = SUBCAT_PARENT[cs] ?? cs;
    const cc  = CAT_CODE[par] ?? '99';
    const sc  = SUBCAT_CODE[cs] ?? '00';
    const key = `${cc}${sc}`;
    const m   = p.sku?.match(/-(\d+)$/);
    if (m) counters[key] = Math.max(counters[key] ?? 0, parseInt(m[1]));
  });

  const products = [], stocks = [], skipped = [];

  for (const r of rows) {
    const group = r['Назва_групи'];
    let catSlug = GROUP_CATEGORY[group];

    // Герметики — визначаємо підкатегорію за назвою
    if (catSlug === null && group === 'Герметики і силікони') {
      const n = r['Назва_позиції_укр'] || r['Назва_позиції'];
      catSlug = detectSealantCat(n);
    }

    if (!catSlug) { skipped.push(`${group}: ${String(r['Назва_позиції_укр'] || r['Назва_позиції']).slice(0,50)}`); continue; }

    const name  = String(r['Назва_позиції_укр'] || r['Назва_позиції']).trim();
    const brand = String(r['Виробник'] || '').trim();
    if (!name || !brand) { skipped.push(`no name/brand: ${group}`); continue; }

    // Генерація SKU
    const par = SUBCAT_PARENT[catSlug] ?? catSlug;
    const cc  = CAT_CODE[par] ?? '99';
    const sc  = SUBCAT_CODE[catSlug] ?? '00';
    const key = `${cc}${sc}`;
    counters[key] = (counters[key] ?? 0) + 1;
    const sku = `${cc}${sc}-${String(counters[key]).padStart(3,'0')}`;

    const supplierSku = String(r['Код_товару'] || r['Ідентифікатор_товару'] || '').trim();
    const imageRaw    = String(r['Посилання_зображення'] || '').trim();
    const image       = imageRaw.split(',')[0].trim() || null;
    const minOrder    = Math.max(1, Math.round(parseFloat(String(r['Мінімальне_замовлення_опт']).replace(',','.')) || 1));
    const priceUnit   = parseFloat(String(r['Оптова_ціна']).replace(',','.')) || 0;
    const priceRetail = parseFloat(String(r['Ціна']).replace(',','.')) || 0;
    const stockQty    = parseInt(String(r['Кількість']).replace(',','.')) || 0;
    const volume      = extractVolume(name);

    products.push({
      sku, name, brand,
      category_slug: catSlug,
      volume, min_order: minOrder, pack_qty: minOrder,
      description: null, image,
      nl1: null, nl2: null,
      bc: '#E8EEF5', ac: '#1E3A5F',
      img_type: 'tube',
      supplier_sku: supplierSku || null,
      is_active: true, sort_order: 0,
    });

    stocks.push({
      sku, supplier_sku: supplierSku || null,
      price_unit: priceUnit, price_retail: priceRetail,
      price_old: null, price_retail_old: null,
      stock_qty: stockQty,
      stock_status: stockQty > 0 ? 'in_stock' : 'out_of_stock',
    });
  }

  console.log(`✅ Для імпорту: ${products.length}`);
  console.log(`⚠️  Пропущено:  ${skipped.length}`);

  const byCat = {};
  products.forEach(p => { byCat[p.category_slug] = (byCat[p.category_slug]||0)+1; });
  console.log('\nРозподіл:');
  Object.entries(byCat).sort((a,b)=>b[1]-a[1]).forEach(([c,n]) => console.log(`  ${c.padEnd(35)} ${n}`));

  if (skipped.length) {
    console.log('\nПропущені групи:');
    skipped.slice(0,10).forEach(s => console.log(' ', s));
  }

  if (DRY_RUN) { console.log('\n✅ DRY RUN завершено.'); return; }

  console.log('\n🚀 Записую...');
  for (let i = 0; i < products.length; i += 100) {
    const { error } = await supabase.from('products').upsert(products.slice(i,i+100), { onConflict: 'sku' });
    if (error) console.error('products:', error.message);
  }
  for (let i = 0; i < stocks.length; i += 100) {
    const { error } = await supabase.from('product_stock').upsert(stocks.slice(i,i+100), { onConflict: 'sku' });
    if (error) console.error('stocks:', error.message);
  }
  console.log(`\n🎉 Імпортовано ${products.length} товарів!`);
}

main().catch(err => { console.error('❌', err.message); process.exit(1); });
