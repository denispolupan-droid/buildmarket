/**
 * regen-skus.mjs
 * Перегенерує SKU за власною логікою нумерації.
 * supplier_sku зберігається = оригінальний код постачальника.
 *
 * Запуск (dry-run):
 *   node scripts/supabase/regen-skus.mjs --dry-run
 *
 * Реальний запуск:
 *   node scripts/supabase/regen-skus.mjs
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
const DRY_RUN = process.argv.includes('--dry-run');

// ── Нумерація категорій ───────────────────────────────────────────────────────

const CAT_CODE = {
  'germetyky':          '10',
  'hidroizolyatsiya':   '11',
  'gruntivky':          '12',
  'zamazky-dlya-shviv': '13',
  'zakhyst-derevyny':   '14',
  'instrumenty':        '15',
  'klei':               '16',
  'kriplennya':         '17',
  'montazhna-pina':     '18',
  'plastyfikatory':     '19',
  'strichky':           '20',
  'farby':              '21',
  'vologopoglinachi':   '22',
};

const SUBCAT_CODE = {
  // Герметики (10)
  'akrylovi-germetyky':      '01',
  'bitumni-germetyky':       '02',
  'neytralny-germetyky':     '03',
  'poliuretanovi-germetyky': '04',
  'sylikonovi-germetyky':    '05',

  // Гідроізоляція (11)
  'bitumni-mastyky':          '01',
  'hidroizolyatsiyni-mastyky':'02',
  'izolyatsiyni-strichky':    '03',
  'praimery':                 '04',

  // Ґрунтовки (12)
  'antygrybok':             '01',
  'betonokontakt':          '02',
  'gruntivky-gotovi':       '03',
  'gruntivky-kontsentraty': '04',
  'shpaklivky':             '05',
  'shtukaturky':            '06',

  // Замазки (13)
  'zamazky-epoksydni': '01',
  'zamazky-tsementni': '02',

  // Захист дерева (14)
  'antyseptyki':      '01',
  'morylky':          '02',
  'zakhysni-pokryttya':'03',

  // Інструменти (15)
  'kysti-ta-valy': '01',
  'pistolety':     '02',
  'shlifuvalny':   '03',
  'shpateli':      '04',
  'vymiriuvalny':  '05',

  // Клеї (16)
  'klei-dlya-shpaler': '01',
  'kontaktnyi-klei':   '02',
  'montazhnyi-klei':   '03',
  'pva-ta-stolyarnyi': '04',
  'ridki-tsvyakhy':    '05',
  'super-klei':        '06',

  // Кріплення (17)
  'dyubeli-ta-ankery':   '01',
  'shurupy-ta-samorizy': '02',

  // Монтажна піна (18)
  'ochysnyky':       '01',
  'pina-klei':       '02',
  'pistoletna-pina': '03',
  'pobutova-pina':   '04',
  'vohnezakhysna-pina':'05',

  // Пластифікатори (19)
  'plastyfikatory-dlya-betonu': '01',

  // Стрічки (20)
  'hermetyzuyucha-strichka':    '01',
  'malyarna-strichka':          '02',
  'strichka-dlya-shviv':        '03',
  'zvukoizolyatsiyna-strichka': '04',

  // Фарби (21)
  'alkidni-farby':           '01',
  'farby-3v1':               '02',
  'farby-dlya-pidlohy':      '03',
  'koloranty':               '04',
  'laky':                    '05',
  'moltkovi-farby':          '06',
  'rozchynnyky':             '07',
  'vodoemiulsiyni-fasadni':  '08',
  'vodoemiulsiyni-interierni':'09',
};

// ── Генерація нового SKU ──────────────────────────────────────────────────────

function buildSku(catSlug, subcatSlug, position) {
  const catCode    = CAT_CODE[catSlug]    ?? '99';
  const subcatCode = subcatSlug ? (SUBCAT_CODE[subcatSlug] ?? '00') : '00';
  const pos        = String(position).padStart(3, '0');
  return `${catCode}${subcatCode}-${pos}`;
}

// ── Головна функція ───────────────────────────────────────────────────────────

async function main() {
  console.log('\n📦 Завантажую категорії та товари...');
  if (DRY_RUN) console.log('🔍 DRY RUN — дані НЕ змінюються\n');

  // Завантажуємо категорії
  const { data: cats } = await supabase.from('categories').select('slug, parent_slug');
  const parentOf = {};
  cats.forEach(c => { if (c.parent_slug) parentOf[c.slug] = c.parent_slug; });

  // Завантажуємо всі товари з stock
  const { data: products } = await supabase
    .from('products')
    .select('*, stock:product_stock(*), characteristics:product_characteristics(*)')
    .eq('is_active', true)
    .order('name');

  console.log(`Знайдено ${products.length} товарів\n`);

  // Групуємо по (catCode + subcatCode) для лічильника позицій
  const counters = {};
  const mapping  = []; // { oldSku, newSku, product, stock, chars }

  for (const p of products) {
    const catSlug = p.category_slug;
    if (!catSlug) continue;

    // Визначаємо батьківську і підкатегорію
    const isChild  = !!parentOf[catSlug];
    const parentSlug  = isChild ? parentOf[catSlug] : catSlug;
    const subcatSlug  = isChild ? catSlug : null;

    const catCode    = CAT_CODE[parentSlug]    ?? '99';
    const subcatCode = subcatSlug ? (SUBCAT_CODE[subcatSlug] ?? '00') : '00';
    const groupKey   = `${catCode}${subcatCode}`;

    counters[groupKey] = (counters[groupKey] ?? 0) + 1;
    const newSku = buildSku(parentSlug, subcatSlug, counters[groupKey]);

    const { stock: _s, characteristics: _c, ...productFields } = p;
    mapping.push({
      oldSku: p.sku,
      newSku,
      product: {
        ...productFields,
        sku:          newSku,
        supplier_sku: p.supplier_sku ?? p.sku,
      },
      stock: p.stock ? { ...p.stock, sku: newSku } : null,
      chars: (p.characteristics ?? []).map(c => ({ ...c, product_sku: newSku })),
    });
  }

  // Виводимо preview
  console.log('📋 Приклади нових SKU:');
  mapping.slice(0, 15).forEach(m =>
    console.log(`   ${m.oldSku.padEnd(12)} → ${m.newSku}  (${m.product.name?.slice(0, 45)})`)
  );
  console.log(`   ... і ще ${Math.max(0, mapping.length - 15)} товарів\n`);

  if (DRY_RUN) {
    console.log('✅ DRY RUN завершено.\n');
    return;
  }

  // ── Реальний запис ────────────────────────────────────────────────────────

  console.log('🗑  Очищаю старі дані...');

  const oldSkus = mapping.map(m => m.oldSku);

  // Видаляємо в правильному порядку (спочатку залежні таблиці)
  await supabase.from('product_characteristics').delete().in('product_sku', oldSkus);
  await supabase.from('product_stock').delete().in('sku', oldSkus);
  await supabase.from('products').delete().in('sku', oldSkus);

  console.log('➕ Записую товари з новими SKU...');

  // Вставляємо products батчами
  const productRows = mapping.map(m => m.product);
  for (let i = 0; i < productRows.length; i += 200) {
    const { error } = await supabase.from('products').insert(productRows.slice(i, i + 200));
    if (error) { console.error('❌ products:', error.message); process.exit(1); }
    process.stdout.write(`\r   products: ${Math.min(i + 200, productRows.length)}/${productRows.length}`);
  }
  console.log();

  // Вставляємо product_stock
  const stockRows = mapping.filter(m => m.stock).map(m => m.stock);
  for (let i = 0; i < stockRows.length; i += 200) {
    const { error } = await supabase.from('product_stock').insert(stockRows.slice(i, i + 200));
    if (error) { console.error('❌ stock:', error.message); process.exit(1); }
    process.stdout.write(`\r   stocks:   ${Math.min(i + 200, stockRows.length)}/${stockRows.length}`);
  }
  console.log();

  // Вставляємо characteristics
  const charRows = mapping.flatMap(m => m.chars);
  if (charRows.length > 0) {
    for (let i = 0; i < charRows.length; i += 200) {
      const { error } = await supabase.from('product_characteristics').insert(charRows.slice(i, i + 200));
      if (error) console.error('❌ chars:', error.message);
    }
  }

  console.log(`\n✅ Готово! ${mapping.length} товарів отримали нові SKU.\n`);
}

main().catch(err => { console.error('\n❌ Помилка:', err.message); process.exit(1); });
