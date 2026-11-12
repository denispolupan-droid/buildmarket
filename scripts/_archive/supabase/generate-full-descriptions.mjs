/**
 * generate-full-descriptions.mjs
 * Генерує розгорнуті описи товарів (UA + RU) на основі:
 * - нашого короткого опису (унікальний)
 * - опису постачальника з Prom.ua (технічна інформація)
 *
 * node scripts/supabase/generate-full-descriptions.mjs --dry-run
 * node scripts/supabase/generate-full-descriptions.mjs
 * node scripts/supabase/generate-full-descriptions.mjs --category=germetyky
 */

import { readFileSync } from 'fs';
import { createRequire } from 'module';
import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@supabase/supabase-js';

const require = createRequire(import.meta.url);
const XLSX    = require('xlsx');

const envLines = readFileSync('.env.local', 'utf-8').split('\n');
const env = {};
for (const line of envLines) {
  const m = line.match(/^([^#=\s]+)\s*=\s*(.*)$/);
  if (m) env[m[1]] = m[2].trim();
}

const supabase  = createClient(env['NEXT_PUBLIC_SUPABASE_URL'], env['SUPABASE_SERVICE_ROLE_KEY']);
const anthropic = new Anthropic({ apiKey: env['ANTHROPIC_API_KEY'] });

const DRY_RUN  = process.argv.includes('--dry-run');
const CATEGORY = process.argv.find(a => a.startsWith('--category='))?.slice(11);
const MISSING  = process.argv.includes('--missing-only');

const clean = s => String(s ?? '')
  .replace(/<[^>]+>/g, ' ')
  .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&')
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  .replace(/\s{2,}/g, ' ').trim();

async function generate(product, supplierUa, supplierRu) {
  const prompt = `Ти SEO-копірайтер для українського B2B магазину будівельної хімії FIXLINE.

Товар: ${product.name}${product.volume ? ' ' + product.volume : ''}
Бренд: ${product.brand}

Наш короткий опис (унікальний, залишити суть):
${product.description ?? ''}

Детальний опис від постачальника (технічна інформація, виділи головне):
${supplierUa.slice(0, 800)}

Завдання: напиши розгорнутий SEO-опис 350-500 символів. Він має:
- починатись з нашого унікального тексту або його суті
- включати ключові технічні переваги з опису постачальника
- бути природним і корисним для покупця
- НЕ бути копією постачальника

Також напиши російськомовну версію на основі:
Наш RU опис: ${product.description_ru ?? ''}
Постачальник RU: ${supplierRu.slice(0, 600)}

Формат відповіді:
UA: [текст]
RU: [текст]`;

  const msg = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 600,
    messages: [{ role: 'user', content: prompt }],
  });

  const text = msg.content[0]?.text ?? '';
  const ua = text.match(/^UA:\s*(.+)$/m)?.[1]?.trim() ?? null;
  const ru = text.match(/^RU:\s*(.+)$/m)?.[1]?.trim() ?? null;
  return { ua, ru };
}

async function main() {
  console.log('\n📝 Генерація розгорнутих описів');
  if (DRY_RUN) console.log('🔍 DRY RUN\n');

  // Завантажуємо Prom файл
  console.log('📊 Читаю Prom.ua файл...');
  const wb   = XLSX.readFile('export-products-28-04-26_20-13-13.xlsx');
  const ws   = wb.Sheets['Export Products Sheet'];
  const rows = XLSX.utils.sheet_to_json(ws, { defval: '' });

  // Будуємо map: supplier_sku → описи
  const promMap = {};
  for (const r of rows) {
    const code = String(r['Код_товару'] ?? '').trim();
    if (!code) continue;
    const ua = clean(r['Опис_укр'] ?? r['Опис'] ?? '');
    const ru = clean(r['Опис'] ?? '');
    if (ua.length > 50) promMap[code] = { ua, ru };
  }
  console.log(`   Товарів з описами в Prom: ${Object.keys(promMap).length}`);

  // Завантажуємо наші товари
  let query = supabase.from('products')
    .select('sku, name, brand, volume, category_slug, supplier_sku, description, description_ru')
    .eq('is_active', true)
    .not('supplier_sku', 'is', null);

  if (CATEGORY) query = query.eq('category_slug', CATEGORY);
  if (MISSING)  query = query.is('description_full', null);

  const { data: products } = await query;
  console.log(`   Наших товарів: ${products?.length ?? 0}`);

  // Знаходимо ті що мають описи в Prom
  const toProcess = (products ?? []).filter(p => promMap[p.supplier_sku]);
  console.log(`   Зі співпадінням в Prom: ${toProcess.length}\n`);

  if (DRY_RUN) {
    const p = toProcess[0];
    if (p) {
      const pd = promMap[p.supplier_sku];
      console.log(`Приклад [${p.sku}] ${p.name}`);
      console.log(`Наш опис: ${p.description}`);
      console.log(`Prom UA (500): ${pd.ua.slice(0, 500)}`);
      const { ua, ru } = await generate(p, pd.ua, pd.ru);
      console.log(`\nРезультат UA: ${ua}`);
      console.log(`Результат RU: ${ru}`);
    }
    return;
  }

  let ok = 0, fail = 0;
  for (const p of toProcess) {
    await new Promise(r => setTimeout(r, 1500));
    try {
      const pd = promMap[p.supplier_sku];
      const { ua, ru } = await generate(p, pd.ua, pd.ru);
      if (!ua || !ru) throw new Error('Порожня відповідь');

      await supabase.from('products').update({
        description_full: ua,
        description_full_ru: ru,
      }).eq('sku', p.sku);

      ok++;
      process.stdout.write(`\r  ✅ ${ok}/${toProcess.length} — ${p.sku}          `);
    } catch (e) {
      fail++;
      console.log(`\n  ❌ ${p.sku}: ${e.message}`);
    }
  }

  console.log(`\n\n📊 Готово! Успішно: ${ok} | Помилки: ${fail}\n`);
}

main().catch(err => { console.error('\n❌', err.message); process.exit(1); });
