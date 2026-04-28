/**
 * import-pricelist.mjs
 * Імпортує товари з CSV-прайсу постачальника в Supabase.
 *
 * Запуск (dry-run):
 *   node scripts/supabase/import-pricelist.mjs "k:\Users\polupan.denis\Downloads\Прайс категории.csv" --dry-run
 *
 * Реальний імпорт:
 *   node scripts/supabase/import-pricelist.mjs "k:\Users\polupan.denis\Downloads\Прайс категории.csv"
 */

import { readFileSync } from 'fs';
import { createClient } from '@supabase/supabase-js';

// ── Конфіг ────────────────────────────────────────────────────────────────────

const envLines = readFileSync('.env.local', 'utf-8').split('\n');
const env = {};
for (const line of envLines) {
  const m = line.match(/^([^#=\s]+)\s*=\s*(.*)$/);
  if (m) env[m[1]] = m[2].trim();
}

const supabase = createClient(env['NEXT_PUBLIC_SUPABASE_URL'], env['SUPABASE_SERVICE_ROLE_KEY']);
const FILE_PATH = process.argv[2];
const DRY_RUN   = process.argv.includes('--dry-run');

if (!FILE_PATH) {
  console.error('Usage: node scripts/supabase/import-pricelist.mjs <path-to-csv> [--dry-run]');
  process.exit(1);
}

// ── Секції та підсекції для імпорту ──────────────────────────────────────────

const TARGET_SECTIONS = new Set(['12', '15', '16', '17', '27', '55']);

// Підсекції яких пропускаємо (цемент, металочерепиця, газобетон тощо)
const SKIP_SUBSECTIONS = new Set(['1596', '2061', '2702', '2704', '2707', '5592']);

// Бренд за замовчуванням для підсекції
const SUBSECTION_BRAND = {
  '1507': 'Lotus',     '1539': 'Siltek',   '1566': 'Polifarb',
  '1567': 'Polifarb',  '1568': 'Polifarb', '1579': 'ЗИП',
  '1606': 'Pattex',    '1610': 'Ceresit',  '1615': 'Lacrysil',
  '1616': 'Lacrysil',  '1686': 'Pufas',    '1687': 'Quelyd',
  '1690': 'BudMonster','1691': 'Дивоцвіт', '1695': 'Soudal',
  '1503': 'Krumix',    '1532': 'Knauf',    '1548': 'Ceresit',
  '1551': 'Дивоцвіт',  '1583': 'Eskaro',   '1780': 'Байрис',
  '1783': 'Weco',      '1784': 'Rigips',   '1800': 'Siltek',
  '2709': 'Aquaizol',  '2712': 'Onduline',
};

// ── Визначення категорії за назвою ────────────────────────────────────────────

function detectCategory(name, subsection) {
  const n = name.toLowerCase();

  // Герметики
  if (n.includes('герметик')) {
    if (n.includes('силіконовий') || n.includes('силікон')) return 'sylikonovi-germetyky';
    if (n.includes('акриловий') || n.includes('акрил'))    return 'akrylovi-germetyky';
    if (n.includes('поліуретановий') || n.includes('pu'))  return 'poliuretanovi-germetyky';
    if (n.includes('бітумний') || n.includes('бітум'))     return 'bitumni-germetyky';
    if (n.includes('нейтральний'))                         return 'neytralny-germetyky';
    if (n.includes('силікатний'))                          return 'sylikonovi-germetyky';
    return 'germetyky';
  }
  if (n.includes('клей-герметик')) return 'germetyky';

  // Монтажна піна
  if (n.includes('очисник піни') || n.includes('очищувач піни')) return 'ochysnyky';
  if (n.includes('піна-клей'))   return 'pina-klei';
  if (n.includes('піна монтажна') || n.includes('піна  монтажна')) {
    if (n.includes('вогнестійка') || n.includes('вогнезахисна') || n.includes(' в1') || n.includes(' в2')) return 'vohnezakhysna-pina';
    if (n.includes('побутова'))                            return 'pobutova-pina';
    if (n.includes('професійна') || n.includes('зимня'))  return 'pistoletna-pina';
    return 'montazhna-pina';
  }

  // Клеї
  if (n.includes('рідкі цвяхи') || n.includes('рідких цвяхів'))  return 'ridki-tsvyakhy';
  if (n.includes('клей')) {
    if (n.includes('для шпалер') || n.includes('шпалер'))        return 'klei-dlya-shpaler';
    if (n.includes(' пва') || n.includes('пва ') || n.includes('столяр') || n.includes('бустилат')) return 'pva-ta-stolyarnyi';
    if ((n.includes('супер') || n.includes('505')) && (n.includes('гель') || n.includes('секунд') || n.includes('момент'))) return 'super-klei';
    if (n.includes('для підлогових') || n.includes('ультра ліп') || n.includes('для коркових') || n.includes('для мозаїки')) return 'ridki-tsvyakhy';
    if (n.includes('монтажний') || n.includes('монтажна') || n.includes('super fix') || n.includes('надміцний') || n.includes('скажена липучка')) return 'montazhnyi-klei';
    if (n.includes('контактний') || n.includes('неопрен'))       return 'kontaktnyi-klei';
    return 'klei';
  }
  if (n.includes('солідол') || n.includes('мастило'))           return 'kontaktnyi-klei';

  // Пластифікатори
  if (n.includes('пластифікатор')) return 'plastyfikatory-dlya-betonu';

  // Захист дерева
  if (n.includes('вогнебіозахист') || n.includes('біозахист') || n.includes('захист деревини')) return 'zakhysni-pokryttya';

  // Рідке скло
  if (n.includes('рідке скло')) return 'gruntivky-gotovi';

  // Кріплення для маяків
  if (n.includes('кріплення') || n.includes('маяк')) return 'dyubeli-ta-ankery';

  // Мастики та гідроізоляція
  if (n.includes('мастика гідроізоляційна') || n.includes('water block')) return 'hidroizolyatsiyni-mastyky';
  if (n.includes('мастика') || n.includes('праймер бітум') || n.includes('бітумне покриттів')) return 'bitumni-mastyky';
  if (n.includes('праймер'))                                    return 'praimery';

  // Стрічки
  if (n.includes('стрічка') || n.includes('скотч') || n.includes('лента')) {
    if (n.includes('малярн') || n.includes('маляр'))            return 'malyarna-strichka';
    if (n.includes('бутилов') || n.includes('герметизуюча') || n.includes('покрівельна') || n.includes('пароізоляційна')) return 'hermetyzuyucha-strichka';
    if (n.includes('шов') || n.includes('серп') || n.includes('сіток') || n.includes('сітка')) return 'strichka-dlya-shviv';
    if (n.includes('звукоізол'))                                return 'zvukoizolyatsiyna-strichka';
    return 'strichky';
  }

  // Ґрунтовки та шпаклівки
  if (n.includes('бетоноконтакт') || n.includes('бетон-контакт')) return 'betonokontakt';
  if (n.includes('ґрунт-емаль') || n.includes('грунт-емаль'))    return 'betonokontakt';
  if (n.includes('антигрибк') || n.includes('протигрибков'))     return 'antygrybok';
  if (n.includes('концентрат'))                                  return 'gruntivky-kontsentraty';
  if (n.includes('гф-0') || n.includes('гф 0'))                 return 'betonokontakt';
  if (n.includes('грунт polifarb') || n.includes('профі-грунт') || n.includes('профі грунт')) return 'gruntivky-gotovi';
  if (n.includes('грунтовка') || n.includes('ґрунтовка') || n.includes('грунт-концентрат') || n.includes('ґрунт-концентрат') || n.includes('грундірміттель')) return 'gruntivky-gotovi';
  if (n.includes('шпатлівка') || n.includes('шпаклівка') || n.includes('фінішна') || n.includes('finish')) return 'shpaklivky';
  if (n.includes('гіпс'))                                        return 'shpaklivky';
  if (n.includes('штукатурка'))                                  return 'shtukaturky';

  // Замазки для швів
  if ((n.includes('замазка') && n.includes('шов')) || n.includes('ce 33') || n.includes('ce 40') || n.includes('cs 33') || n.includes('cs 40')) return 'zamazky-dlya-shviv';

  // Фарби та покриття
  if (n.includes('розчинник') || n.includes('уайт-спірит') || n.includes('перетворювач іржі')) return 'rozchynnyky';
  if (n.includes('колорант') || n.includes('барвник'))           return 'koloranty';
  if (n.includes('морилка'))                                     return 'morylky';
  if (n.includes('антисептик'))                                  return 'antyseptyki';
  if (n.includes('лак') || n.includes('просочення') || n.includes('лазур')) return 'laky';
  if (n.includes('фарба') || n.includes('емаль')) {
    if (n.includes('для підлоги') || n.includes('для підлог'))   return 'farby-dlya-pidlohy';
    if (n.includes('молоткова') || n.includes('молотков'))       return 'moltkovi-farby';
    if ((n.includes('3 в 1') || n.includes('3в1')))              return 'farby-3v1';
    if (n.includes('алкідна') || n.includes('алкід') || n.includes('пф-') || n.includes(' пф ') || n.includes('емаль')) return 'alkidni-farby';
    if (n.includes('фасадна') || n.includes('зовнішніх') || n.includes('фасад')) return 'vodoemiulsiyni-fasadni';
    if (n.includes("інтер'єр") || n.includes('внутрішніх') || n.includes('інтер')) return 'vodoemiulsiyni-interierni';
    return 'farby';
  }

  // Кріплення
  if (n.includes('дюбель') || n.includes('анкер') || n.includes('фіксатор-стойка')) return 'dyubeli-ta-ankery';
  if (n.includes('шуруп') || n.includes('саморіз') || n.includes('скоба') || n.includes('гвіздок')) return 'shurupy-ta-samorizy';

  // Інструменти
  if (n.includes('пістолет'))                                    return 'pistolety';
  if (n.includes('степлер'))                                     return 'pistolety';
  if (n.includes('шпатель') || n.includes('кельма'))            return 'shpateli';
  if (n.includes('кисть') || n.includes('валик') || n.includes('ванночка') || n.includes('таз') || n.includes('мішалка')) return 'kysti-ta-valy';
  if (n.includes('диск') || n.includes('круг') || n.includes('бур ') || n.includes('свердло') || n.includes('шліфуваль')) return 'shlifuvalny';
  if (n.includes('ніж') || n.includes('лезо') || n.includes('ножиці'))                           return 'shlifuvalny';
  if (n.includes('рівень') || n.includes('рулетка') || n.includes('правило'))                    return 'vymiriuvalny';

  return null;
}

// ── Витяг бренду ──────────────────────────────────────────────────────────────

const BRANDS = ['Lacrysil','Ceresit','Pattex','Knauf','Polifarb','Siltek','Soudal',
  'Masterplast','Bostik','BudMonster','Дивоцвіт','Pufas','Quelyd','Lotus','Krumix',
  'Aquaizol','Onduline','Werk','Сталь','Koelner','ЗИП','Ataman','Spitce','Eskaro',
  'Байрис','Weco','Rigips','Хімік','Хімконтакт','Momental'];

function extractBrand(name, subsectionBrand) {
  if (subsectionBrand) return subsectionBrand;
  for (const b of BRANDS) {
    if (name.includes(b)) return b;
  }
  return '';
}

// ── Витяг об'єму/ваги ─────────────────────────────────────────────────────────

function extractVolume(name) {
  const m = name.match(/(\d+(?:[,.]\d+)?)\s*(мл|л\b|кг\b|г\b(?!\w))/i);
  return m ? `${m[1].replace(',','.')} ${m[2].toLowerCase()}` : null;
}

// ── Парсинг ціни ──────────────────────────────────────────────────────────────

function parsePrice(raw) {
  if (!raw) return 0;
  return parseFloat(String(raw).replace(/\s/g,'').replace(',','.').replace(' грн','')) || 0;
}

// ── Головна функція ───────────────────────────────────────────────────────────

async function main() {
  console.log(`\n📂 Читаю файл: ${FILE_PATH}`);
  if (DRY_RUN) console.log('🔍 DRY RUN — дані НЕ записуються\n');

  const text  = readFileSync(FILE_PATH, 'utf-8');
  const lines = text.split(/\r?\n/);

  let currentSection    = null;
  let currentSubsection = null;
  let subsectionBrand   = null;
  let skipSubsection    = false;

  const products   = [];
  const stocks     = [];
  const skipped    = [];

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;

    // Секція: "16. Клеї, піни, герметики;;;"
    const sectionMatch = line.match(/^(\d{2})\.\s+.+;;;$/);
    if (sectionMatch) {
      currentSection    = sectionMatch[1];
      currentSubsection = null;
      subsectionBrand   = null;
      skipSubsection    = false;
      continue;
    }

    // Підсекція: "1606. HENKEL - Pattex;;;"
    const subMatch = line.match(/^(\d{4})\.\s+(.+?);;;$/);
    if (subMatch) {
      currentSubsection = subMatch[1];
      skipSubsection    = SKIP_SUBSECTIONS.has(currentSubsection);
      subsectionBrand   = SUBSECTION_BRAND[currentSubsection] ?? null;
      continue;
    }

    // Пропускаємо якщо секція не наша
    if (!TARGET_SECTIONS.has(currentSection)) continue;
    if (skipSubsection) continue;

    // Заголовок (";;;" або "Ціна..." рядки)
    if (line.startsWith(';') || line.includes(';;Цiна') || line.includes(';;Ціна')) continue;

    // Товар: "Назва;Код;Ціна;Од."
    const parts = line.split(';');
    if (parts.length < 3) continue;

    const name  = parts[0].replace(/^["']|["']$/g, '').trim();
    const code  = parts[1].trim();
    const price = parsePrice(parts[2]);

    if (!name || !code || code.startsWith(';')) continue;
    // Пропускаємо заголовки таблиць
    if (name === 'Цінова група/ Номенклатура/ Характеристика номенклатури') continue;

    const category = detectCategory(name, currentSubsection);
    if (!category) {
      skipped.push({ name, code, reason: 'Не вдалось визначити категорію' });
      continue;
    }

    const brand  = extractBrand(name, subsectionBrand);
    const volume = extractVolume(name);
    const sku    = code;

    // img_type: canister для фарб, мастик, ґрунтовок у відрах; tube для решти
    const isCanister = ['farby','gruntivky','mastyky','hidroizol'].some(k => category.includes(k)) ||
                       (volume && (volume.includes(' кг') || volume.includes(' л')) && parseFloat(volume) >= 1);
    const imgType = isCanister ? 'canister' : 'tube';

    products.push({
      sku,
      name,
      brand,
      category_slug: category,
      volume,
      pack_qty:   1,
      min_order:  1,
      description: null,
      image:      null,
      nl1:        null, nl2: null,
      bc:         '#E8EEF5',
      ac:         '#1E3A5F',
      img_type:   imgType,
      is_active:  true,
      sort_order: 0,
    });

    stocks.push({
      sku,
      supplier_sku: sku,
      price_unit:   price,
      price_old:    null,
      stock_qty:    0,
      stock_status: price > 0 ? 'in_stock' : 'out_of_stock',
    });
  }

  // ── Звіт ─────────────────────────────────────────────────────────────────────

  console.log(`✅ Знайдено товарів для імпорту: ${products.length}`);
  console.log(`⚠️  Пропущено (немає категорії): ${skipped.length}\n`);

  // Категорії розподіл
  const byCategory = {};
  products.forEach(p => { byCategory[p.category_slug] = (byCategory[p.category_slug] || 0) + 1; });
  console.log('📊 Розподіл по категоріях:');
  Object.entries(byCategory).sort((a,b) => b[1]-a[1]).forEach(([cat, cnt]) => {
    console.log(`   ${cat.padEnd(35)} ${cnt}`);
  });

  if (skipped.length > 0) {
    console.log('\n⚠️  Перші 20 пропущених:');
    skipped.slice(0,20).forEach(s => console.log(`   ${s.code} — ${s.name.slice(0,60)}`));
  }

  if (DRY_RUN) {
    console.log('\n✅ DRY RUN завершено. Запустіть без --dry-run щоб записати.\n');
    return;
  }

  // ── Запис у Supabase ──────────────────────────────────────────────────────────

  console.log('\n🚀 Записую в Supabase...');

  // Перевіряємо які SKU вже мають кастомний опис (не перезаписуємо)
  const allSkus = products.map(p => p.sku);
  const { data: existing } = await supabase.from('products').select('sku,description').in('sku', allSkus).not('description','is',null);
  const customDesc = new Set((existing ?? []).map(r => r.sku));

  const toUpsert = products.map(p => customDesc.has(p.sku) ? { ...p, description: undefined } : p);

  // Батчами по 200
  for (let i = 0; i < toUpsert.length; i += 200) {
    const batch = toUpsert.slice(i, i + 200);
    const { error } = await supabase.from('products').upsert(batch, { onConflict: 'sku' });
    if (error) console.error(`❌ products batch ${i}: ${error.message}`);
    else process.stdout.write(`\r   products: ${Math.min(i+200, toUpsert.length)}/${toUpsert.length}`);
  }
  console.log();

  for (let i = 0; i < stocks.length; i += 200) {
    const batch = stocks.slice(i, i + 200);
    const { error } = await supabase.from('product_stock').upsert(batch, { onConflict: 'sku' });
    if (error) console.error(`❌ stocks batch ${i}: ${error.message}`);
    else process.stdout.write(`\r   stocks:   ${Math.min(i+200, stocks.length)}/${stocks.length}`);
  }
  console.log();

  console.log('\n🎉 Імпорт завершено!\n');
}

main().catch(err => { console.error('\n❌ Помилка:', err.message); process.exit(1); });
