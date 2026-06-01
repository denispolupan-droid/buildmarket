/**
 * Rule-based keyword generation for Ukrainian building materials catalog.
 * No API needed — uses product name, brand, category, and characteristics.
 *
 * Usage: node scripts/generate-keywords-rules.mjs
 */
import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const env = Object.fromEntries(
  fs.readFileSync(path.join(__dirname, '../.env.local'), 'utf8').split('\n')
    .filter(l => l.includes('=') && !l.startsWith('#'))
    .map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; })
);

const supabase = createClient(env['NEXT_PUBLIC_SUPABASE_URL'], env['SUPABASE_SERVICE_ROLE_KEY']);

// ── Category → keyword templates ─────────────────────────────────────────────
const CATEGORY_KEYWORDS = {
  'sylikonovi-germetyky':      ['герметик силіконовий', 'силіконовий герметик', 'герметизація', 'ущільнення швів'],
  'akrylovi-germetyky':        ['герметик акриловий', 'акриловий герметик', 'герметизація стиків', 'герметик під фарбування'],
  'poliuretanovi-germetyky':   ['герметик поліуретановий', 'поліуретановий герметик', 'герметик для бетону'],
  'bitumni-germetyky':         ['герметик бітумний', 'бітумний герметик', 'герметик для покрівлі', 'покрівельний герметик'],
  'ms-polymerni-hermetyky':    ['МС-полімерний герметик', 'гібридний герметик', 'клей-герметик', 'монтажний клей-герметик'],
  'zharostiyki-germetyky':     ['жаростійкий герметик', 'термостійкий герметик', 'герметик для каміна', 'герметик для пічей'],
  'neytralny-germetyky':       ['нейтральний герметик', 'герметик для металу', 'герметик для скла'],
  'nytka-dlya-trub':           ['пакля', 'ущільнювач різьби', 'герметизуюча нитка', 'нитка для труб'],
  'germetyky':                 ['герметик', 'будівельний герметик', 'герметизація', 'ущільнення'],

  'montazhna-pina':            ['монтажна піна', 'піна монтажна', 'поліуретанова піна', 'будівельна піна'],
  'pistoletna-pina':           ['піна під пістолет', 'пістолетна піна', 'професійна піна', 'монтажна піна'],
  'pobutova-pina':             ['побутова піна', 'одноразова піна', 'монтажна піна', 'піна для ремонту'],
  'vohnezakhysna-pina':        ['вогнезахисна піна', 'протипожежна піна', 'вогнетривка піна'],
  'pina-klei':                 ['піна-клей', 'клей-піна', 'монтажна піна-клей', 'піна для монтажу'],
  'ochysnyky':                 ['очисник піни', 'розчинник піни', 'очиститель монтажної піни'],

  'montazhnyi-klei':           ['монтажний клей', 'клей для монтажу', 'рідкі цвяхи монтажний', 'клей будівельний'],
  'ridki-tsvyakhy':            ['рідкі цвяхи', 'монтажний клей', 'клей для важких матеріалів', 'рідкі гвоздики'],
  'kontaktnyi-klei':           ['контактний клей', 'клей гума', 'клей для гуми', 'клей для шкіри'],
  'pva-ta-stolyarnyi':         ['клей ПВА', 'столярний клей', 'клей для дерева', 'деревний клей'],
  'epoksydni-klei':            ['епоксидний клей', 'двокомпонентний клей', 'клей для металу', 'холодне зварювання'],
  'super-klei':                ['суперклей', 'секундний клей', 'цианакрилатний клей', 'клей момент'],
  'klei-dlya-shpaler':         ['клей для шпалер', 'шпалерний клей', 'клей флізелін', 'клей для вінілових шпалер'],
  'klei':                      ['будівельний клей', 'монтажний клей', 'клей купити'],

  'gruntivky-gotovi':          ['ґрунтовка', 'ґрунт', 'ґрунтування стін', 'ґрунтовка глибокого проникнення'],
  'gruntivky-kontsentraty':    ['ґрунтовка концентрат', 'ґрунт концентрат', 'ґрунтування'],
  'betonokontakt':             ['бетоноконтакт', 'адгезійна ґрунтовка', 'ґрунт адгезійний', 'контактна ґрунтовка'],
  'antygrybok':                ['антигрибок', 'антиплісень', 'засіб від грибка', 'фунгіцид'],
  'shpaklivky':                ['шпаклівка', 'шпаклювання', 'шпаклівка фінішна', 'шпаклівка стартова'],
  'gruntivky':                 ['ґрунтовка', 'будівельна ґрунтовка', 'ґрунт для стін'],

  'bitumni-mastyky':           ['бітумна мастика', 'бітумна гідроізоляція', 'мастика покрівельна', 'покрівельна мастика'],
  'hidroizolyatsiyni-mastyky': ['гідроізоляційна мастика', 'мастика гідроізоляція', 'рідка гідроізоляція'],
  'izolyatsiyni-strichky':     ['ізоляційна стрічка', 'гідроізоляційна стрічка', 'бутилова стрічка'],
  'praimery':                  ['праймер бітумний', 'бітумний праймер', 'підготовка основи'],
  'hidroizolyatsiya':          ['гідроізоляція', 'гідроізоляційний матеріал', 'захист від вологи'],

  'alkidni-farby':             ['алкідна емаль', 'алкідна фарба', 'емаль ПФ-115', 'фарба по металу'],
  'vodoemiulsiyni-interierni': ['інтер\'єрна фарба', 'фарба для стін', 'водоемульсійна фарба', 'латексна фарба'],
  'vodoemiulsiyni-fasadni':    ['фасадна фарба', 'фарба для фасаду', 'зовнішня фарба', 'атмосферостійка фарба'],
  'farby-dlya-pidlohy':        ['фарба для підлоги', 'підлогова фарба', 'фарба по бетону підлога'],
  'farby-3v1':                 ['фарба 3 в 1', 'ґрунт-фарба', 'захисна фарба', 'фарба по іржі'],
  'koloranty':                 ['колорант', 'барвник для фарби', 'пігмент для фарби', 'колер'],
  'laky':                      ['лак для дерева', 'акриловий лак', 'захисний лак', 'лак паркетний'],
  'morylky':                   ['морилка', 'тонуючий засіб', 'пропитка для дерева', 'колер для дерева'],
  'grunty':                    ['ґрунт-фарба', 'фарба-ґрунт', 'ґрунтуюча фарба'],
  'rozchynnyky':               ['розчинник', 'очисник', 'розчинник для фарби', 'уайт-спіріт'],
  'farby':                     ['фарба будівельна', 'лакофарбові матеріали', 'купити фарбу'],

  'antyseptyki':               ['антисептик для дерева', 'захист дерева', 'просочення дерева', 'деревозахист'],
  'zakhysni-pokryttya':        ['захисне покриття для дерева', 'масло для дерева', 'віск для дерева'],
  'zakhyst-derevyny':          ['захист деревини', 'просочення деревини', 'обробка дерева'],

  'malyarna-strichka':         ['малярна стрічка', 'малярний скотч', 'маскуюча стрічка'],
  'hermetyzuyucha-strichka':   ['герметизуюча стрічка', 'бутилова стрічка', 'покрівельна стрічка'],
  'zvukoizolyatsiyna-strichka':['звукоізоляційна стрічка', 'демпферна стрічка', 'ізоляція від шуму'],
  'strichka-dlya-shviv':       ['стрічка для швів', 'серпянка', 'армуюча стрічка', 'склосітка'],
  'strichky':                  ['будівельна стрічка', 'скотч будівельний'],

  'pistolety-dlya-piny':       ['пістолет для піни', 'піновий пістолет', 'пістолет монтажний'],
  'pistolety':                 ['пістолет для піни та герметика', 'будівельний пістолет', 'монтажний пістолет'],
  'kysti-ta-valy':             ['малярний валик', 'малярна кисть', 'фарбування стін', 'малярні інструменти'],
  'shpateli':                  ['шпатель', 'кельма', 'шпатель для шпаклівки', 'будівельний шпатель'],
  'shlifuvalny':               ['шліфувальний круг', 'відрізний круг', 'абразивний інструмент', 'болгарка диск'],
  'vymiriuvalny':              ['будівельне правило', 'рівень будівельний', 'правило трапеція'],
  'instrumenty':               ['будівельний інструмент', 'ручний інструмент', 'малярний інструмент'],

  'dyubeli-ta-ankery':         ['дюбель', 'анкер', 'кріплення', 'монтажний дюбель'],
  'shurupy-ta-samorizy':       ['шуруп', 'саморіз', 'кріплення для гіпсокартону', 'будівельний шуруп'],
  'kriplennya':                ['кріплення', 'монтажне кріплення', 'будівельне кріплення'],

  'zamazky-epoksydni':         ['епоксидна затірка', 'затірка для плитки', 'швоза для плитки'],
  'zamazky-tsementni':         ['цементна затірка', 'затірка для швів', 'фуга для плитки'],
  'zamazky-dlya-shviv':        ['затірка для плитки', 'замазка для швів', 'фуга', 'шовна маса'],

  'plastyfikatory-dlya-betonu':['пластифікатор для бетону', 'добавка в бетон', 'пластифікатор', 'добавка для розчину'],
  'plastyfikatory':            ['пластифікатор', 'добавка для будівництва', 'пластифікуюча добавка'],

  'vologopoglinachi':          ['вологопоглинач', 'осушувач повітря', 'засіб від вологи', 'поглинач вологи'],
};

// ── Characteristic labels → keyword suffixes ──────────────────────────────────
const CHAR_TO_KEYWORD = {
  'Колір':      (v) => `${v.toLowerCase()}`,
  'Об\'єм':    (v) => null,  // already in volume
  'Область застосування': (v) => v.toLowerCase(),
  'Матеріал':  (v) => `${v.toLowerCase()} герметик`,
  'Країна виробник': (v) => null,
};

// ── Generate keywords for one product ────────────────────────────────────────
function generateKeywords(product, chars, catName) {
  const parts = new Set();

  // Base: name without brand at start (brand is already separate)
  const nameClean = product.name
    .replace(new RegExp('^' + (product.brand ?? '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*', 'i'), '')
    .split(',')[0]
    .trim();

  // Add category keywords
  const catKws = CATEGORY_KEYWORDS[product.category_slug] ?? [];
  catKws.forEach(k => parts.add(k));

  // Add color if exists in characteristics
  const colorChar = chars.find(c => c.label === 'Колір');
  if (colorChar && colorChar.value !== 'Безбарвний') {
    const catBase = catKws[0] ?? nameClean;
    parts.add(`${catBase} ${colorChar.value.toLowerCase()}`);
  }

  // Application area
  const areaChar = chars.find(c => c.label === 'Область застосування');
  if (areaChar) {
    parts.add(`${catKws[0] ?? nameClean} ${areaChar.value.toLowerCase()}`);
  }

  // Volume-based: "купити 5 кг"
  if (product.volume) {
    parts.add(`${catKws[0] ?? nameClean} ${product.volume}`);
  }

  // General buying intent
  parts.add(`купити ${catKws[0] ?? nameClean}`);
  parts.add(`${catKws[0] ?? nameClean} оптом`);
  parts.add(`${nameClean.toLowerCase()}`);

  // Cap at 8 keywords, join
  return [...parts].filter(Boolean).slice(0, 8).join(', ');
}

// ── Main ─────────────────────────────────────────────────────────────────────

const { data: products } = await supabase
  .from('products')
  .select('sku, name, brand, volume, category_slug')
  .eq('is_active', true)
  .is('keywords', null)
  .order('sku');

const { data: characteristics } = await supabase
  .from('product_characteristics')
  .select('product_sku, label, value');

const { data: categories } = await supabase
  .from('categories')
  .select('slug, name');

const charsMap = new Map();
for (const c of (characteristics ?? [])) {
  if (!charsMap.has(c.product_sku)) charsMap.set(c.product_sku, []);
  charsMap.get(c.product_sku).push(c);
}
const catNameMap = new Map(categories?.map(c => [c.slug, c.name]) ?? []);

console.log(`\nGenerating keywords for ${products?.length ?? 0} products...\n`);

let done = 0;
let errors = 0;

// Process in batches for DB efficiency
const BATCH = 50;
for (let i = 0; i < (products?.length ?? 0); i += BATCH) {
  const batch = products.slice(i, i + BATCH);
  const updates = batch.map(p => ({
    sku:      p.sku,
    keywords: generateKeywords(p, charsMap.get(p.sku) ?? [], catNameMap.get(p.category_slug) ?? ''),
  }));

  for (const upd of updates) {
    const { error } = await supabase
      .from('products')
      .update({ keywords: upd.keywords })
      .eq('sku', upd.sku);

    if (error) { console.log(`✗ ${upd.sku}: ${error.message}`); errors++; }
    else { process.stdout.write('.'); done++; }
  }
}

console.log(`\n\n=== DONE ===`);
console.log(`✅ Generated: ${done}`);
console.log(`✗  Errors:    ${errors}`);

// Show 5 examples
console.log('\n=== SAMPLES ===');
const { data: samples } = await supabase
  .from('products')
  .select('sku, name, keywords')
  .not('keywords', 'is', null)
  .order('sku')
  .limit(5);
samples?.forEach(s => console.log(`\n${s.sku} | ${s.name}\n  → ${s.keywords}`));
