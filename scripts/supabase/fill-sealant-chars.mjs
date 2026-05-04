/**
 * fill-sealant-chars.mjs
 * Заповнює відсутні характеристики герметиків через Claude API.
 * Стандартний набір: Матеріал, Колір, Мін/Макс темп застосування,
 * Мін/Макс темп експлуатації, Кількість компонентів, Під фарбування,
 * Країна виробник, Область застосування, Час висихання поверхні.
 */

import { readFileSync } from 'fs';
import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@supabase/supabase-js';

const envLines = readFileSync('.env.local', 'utf-8').split('\n');
const env = {};
for (const line of envLines) {
  const m = line.match(/^([^#=\s]+)\s*=\s*(.*)$/);
  if (m) env[m[1]] = m[2].trim();
}
const supabase  = createClient(env['NEXT_PUBLIC_SUPABASE_URL'], env['SUPABASE_SERVICE_ROLE_KEY']);
const anthropic = new Anthropic({ apiKey: env['ANTHROPIC_API_KEY'] });

const SEALANT_CATS = [
  'germetyky','sylikonovi-germetyky','akrylovi-germetyky',
  'poliuretanovi-germetyky','bitumni-germetyky','neytralny-germetyky','zharostiyki-germetyky'
];

const STANDARD_CHARS = [
  'Матеріал',
  'Колір',
  'Область застосування',
  'Мінімальна температура застосування',
  'Максимальна температура застосування',
  'Мінімальна температура експлуатації',
  'Максимальна температура експлуатації',
  'Час висихання поверхні',
  'Кількість компонентів',
  'Під фарбування',
  'Країна виробник',
];

async function generateMissingChars(product, existingLabels) {
  existingLabels; // unused but kept for signature compatibility
    const prompt = `Ти технічний консультант з будівельної хімії. Заповни характеристики герметика.
Товар: ${product.name}${product.volume ? ' ' + product.volume : ''}
Бренд: ${product.brand}
Категорія: ${product.category_slug}

Заповни всі характеристики які можеш визначити:
${STANDARD_CHARS.join('\n')}

СУВОРІ правила формату:
- Температури ОБОВ'ЯЗКОВО: "+5 °C", "-40 °C", "+150 °C" (знак + або -, пробіл, °C)
- Час висихання: "30 хв", "2 год", "24 год"
- Під фарбування: "Так" або "Ні"
- Кількість компонентів: "Однокомпонентний" або "Двокомпонентний"
- Матеріал: "Силіконовий", "Акриловий", "Поліуретановий", "Бітумний", "MS-полімер"
- Область застосування: "Універсальний", "Санітарний", "Термостійкий", "Фасадний", "Покрівельний"
- Країна виробник: повна назва країни
- Якщо НЕ впевнений — НЕ включай
- Відповідь ТІЛЬКИ JSON: [{"label":"...","value":"..."}]`;

  try {
    const msg = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 300,
      messages: [{ role: 'user', content: prompt }],
    });
    const text = msg.content[0]?.text ?? '[]';
    const match = text.match(/\[[\s\S]*\]/);
    return match ? JSON.parse(match[0]) : [];
  } catch {
    return [];
  }
}

async function main() {
  console.log('\n📋 Завантажую герметики...');

  const { data: products } = await supabase
    .from('products')
    .select('sku, name, brand, volume, category_slug')
    .in('category_slug', SEALANT_CATS)
    .eq('is_active', true);

  // Завантажуємо існуючі характеристики
  const skus = products.map(p => p.sku);
  let allChars = [];
  let pg = 0;
  while (true) {
    const { data } = await supabase.from('product_characteristics')
      .select('product_sku, label, sort_order').in('product_sku', skus)
      .range(pg * 1000, (pg + 1) * 1000 - 1);
    if (!data || data.length === 0) break;
    allChars.push(...data);
    if (data.length < 1000) break;
    pg++;
  }

  const existingByProduct = {};
  for (const c of allChars) {
    if (!existingByProduct[c.product_sku]) existingByProduct[c.product_sku] = { labels: new Set(), maxOrder: 0 };
    existingByProduct[c.product_sku].labels.add(c.label);
    existingByProduct[c.product_sku].maxOrder = Math.max(existingByProduct[c.product_sku].maxOrder, c.sort_order);
  }

  console.log(`Товарів: ${products.length}\n`);

  let done = 0, added = 0;
  for (const p of products) {
    const existing = existingByProduct[p.sku] ?? { labels: new Set(), maxOrder: 0 };
    const newChars = await generateMissingChars(p, existing.labels);

    if (newChars.length > 0) {
      const toInsert = newChars.map((c, i) => ({
        product_sku: p.sku,
        label: c.label,
        value: c.value,
        sort_order: existing.maxOrder + i + 1,
      }));
      const { error } = await supabase.from('product_characteristics').insert(toInsert);
      if (!error) added += newChars.length;
    }

    done++;
    process.stdout.write(`\r  ${done}/${products.length} — додано ${added} характеристик`);
    await new Promise(r => setTimeout(r, 1500));
  }

  console.log(`\n\n✅ Готово! Додано: ${added} нових характеристик\n`);
}

main().catch(err => { console.error('\n❌', err.message); process.exit(1); });
