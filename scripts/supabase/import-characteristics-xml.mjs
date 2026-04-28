/**
 * import-characteristics-xml.mjs
 * Імпортує характеристики товарів з YML-фіду постачальника (Rozetka).
 * Зіставляє по supplier_sku → offer id.
 *
 * Запуск (dry-run):
 *   node scripts/supabase/import-characteristics-xml.mjs --dry-run
 * Реальний:
 *   node scripts/supabase/import-characteristics-xml.mjs
 */

import { readFileSync } from 'fs';
import { createClient } from '@supabase/supabase-js';
import { XMLParser } from 'fast-xml-parser';
import https from 'https';

const envLines = readFileSync('.env.local', 'utf-8').split('\n');
const env = {};
for (const line of envLines) {
  const m = line.match(/^([^#=\s]+)\s*=\s*(.*)$/);
  if (m) env[m[1]] = m[2].trim();
}
const supabase = createClient(env['NEXT_PUBLIC_SUPABASE_URL'], env['SUPABASE_SERVICE_ROLE_KEY']);
const DRY_RUN  = process.argv.includes('--dry-run');
const XML_URL  = 'https://ftp1.master.co.ua/images/priceRZTK.xml';

// Параметри які пропускаємо (технічні, не потрібні покупцю)
const SKIP_PARAMS = new Set(['vendor', 'Артикул', 'Вес 1 п.м.', 'Срок хранения']);

function fetchXml(url) {
  return new Promise((resolve, reject) => {
    https.get(url, res => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')));
      res.on('error', reject);
    }).on('error', reject);
  });
}

async function main() {
  console.log('\n📡 Завантажую XML від постачальника...');
  const xml = await fetchXml(XML_URL);
  console.log(`   Розмір: ${(xml.length / 1024 / 1024).toFixed(1)} МБ`);

  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
    isArray: (name) => ['offer', 'param', 'picture'].includes(name),
  });
  const doc = parser.parse(xml);
  const offers = doc?.yml_catalog?.shop?.offers?.offer ?? [];
  console.log(`   Товарів в XML: ${offers.length}`);

  // Будуємо map: supplier_sku → характеристики
  const xmlMap = {};
  for (const offer of offers) {
    const id = String(offer['@_id'] ?? '').trim();
    if (!id) continue;
    const params = Array.isArray(offer.param) ? offer.param : (offer.param ? [offer.param] : []);
    const chars = [];
    for (const p of params) {
      const name  = String(p['@_name'] ?? '').trim();
      const value = String(p['#text'] ?? p ?? '').trim();
      if (!name || !value || SKIP_PARAMS.has(name)) continue;
      chars.push({ label: name, value });
    }
    if (chars.length > 0) xmlMap[id] = chars;
  }

  console.log(`   Товарів з характеристиками: ${Object.keys(xmlMap).length}`);

  // Завантажуємо наші товари з supplier_sku
  const { data: products } = await supabase
    .from('products')
    .select('sku, supplier_sku, name')
    .not('supplier_sku', 'is', null);

  console.log(`   Наших товарів з supplier_sku: ${products?.length ?? 0}\n`);

  let matched = 0, skipped = 0;
  const toInsert = [];

  for (const p of products ?? []) {
    const supplierSku = p.supplier_sku?.trim();
    const chars = xmlMap[supplierSku];
    if (!chars || chars.length === 0) { skipped++; continue; }

    matched++;
    chars.forEach((c, i) => {
      toInsert.push({
        product_sku: p.sku,
        label:       c.label,
        value:       c.value,
        sort_order:  i + 1,
      });
    });

    if (DRY_RUN && matched <= 3) {
      console.log(`[${p.sku}] ${p.name?.slice(0, 50)}`);
      chars.forEach(c => console.log(`  ${c.label}: ${c.value}`));
      console.log();
    }
  }

  console.log(`✅ Знайдено співпадінь: ${matched}`);
  console.log(`⚠️  Без співпадінь:     ${skipped}`);
  console.log(`📝 Характеристик для запису: ${toInsert.length}`);

  if (DRY_RUN) { console.log('\n🔍 DRY RUN — дані не записано.\n'); return; }

  // Видаляємо старі характеристики для цих товарів
  const skusToUpdate = [...new Set(toInsert.map(r => r.product_sku))];
  console.log('\n🗑  Видаляю старі характеристики...');
  await supabase.from('product_characteristics').delete().in('product_sku', skusToUpdate);

  // Вставляємо нові батчами
  console.log('➕ Записую нові характеристики...');
  for (let i = 0; i < toInsert.length; i += 500) {
    const { error } = await supabase.from('product_characteristics').insert(toInsert.slice(i, i + 500));
    if (error) console.error('❌', error.message);
    else process.stdout.write(`\r   ${Math.min(i + 500, toInsert.length)}/${toInsert.length}`);
  }

  console.log(`\n\n✅ Імпорт характеристик завершено!\n`);
}

main().catch(err => { console.error('\n❌', err.message); process.exit(1); });
