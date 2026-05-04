import Anthropic from '@anthropic-ai/sdk';
import { readFileSync } from 'fs';
import { createClient } from '@supabase/supabase-js';

const envLines = readFileSync('.env.local', 'utf-8').split('\n');
const env = {};
for (const line of envLines) {
  const m = line.match(/^([^#=\s]+)\s*=\s*(.*)$/);
  if (m) env[m[1]] = m[2].trim();
}
const supabase  = createClient(env['NEXT_PUBLIC_SUPABASE_URL'], env['SUPABASE_SERVICE_ROLE_KEY']);
const anthropic = new Anthropic({ apiKey: env['ANTHROPIC_API_KEY'] });

const CATS = ['hidroizolyatsiya','bitumni-mastyky','hidroizolyatsiyni-mastyky','izolyatsiyni-strichky','praimery'];

const CHARS = {
  'bitumni-mastyky':           ['Тип','Основа','Спосіб нанесення','Витрата матеріалу','Мінімальна температура застосування','Максимальна температура застосування','Армування','Країна виробник'],
  'hidroizolyatsiyni-mastyky': ['Тип','Основа','Консистенція','Спосіб нанесення','Витрата матеріалу','Мінімальна температура застосування','Максимальна температура застосування','Кількість компонентів','Країна виробник'],
  'izolyatsiyni-strichky':     ['Тип','Основа','Ширина','Довжина','Армування','Країна виробник'],
  'praimery':                  ['Тип','Основа','Консистенція','Витрата матеріалу','Мінімальна температура застосування','Час висихання','Країна виробник'],
  'hidroizolyatsiya':          ['Тип','Основа','Спосіб нанесення','Витрата матеріалу','Мінімальна температура застосування','Максимальна температура застосування','Країна виробник'],
};

async function main() {
  const { data: products } = await supabase.from('products')
    .select('sku,name,brand,volume,category_slug').in('category_slug', CATS).eq('is_active', true);

  const skus = products.map(p => p.sku);
  await supabase.from('product_characteristics').delete().in('product_sku', skus);
  console.log('Старі видалено. Генерую для', products.length, 'товарів...');

  let done = 0, added = 0;
  for (const p of products) {
    await new Promise(r => setTimeout(r, 1800));
    const chars = CHARS[p.category_slug] ?? CHARS['hidroizolyatsiya'];

    const prompt = `Заповни характеристики гідроізоляційного матеріалу:
Товар: ${p.name}${p.volume ? ' ' + p.volume : ''}
Бренд: ${p.brand}

Характеристики:
${chars.join('\n')}

Правила:
- Температури: "+5 °C", "-20 °C"
- Витрата: "1.5 кг/м2"
- Ширина/довжина з одиницями (мм, м)
- Основа: Бітум/Акрил/Бутил/Поліуретан
- Тип: Мастика/Праймер/Стрічка/Мембрана
- Якщо не впевнений — не включай
JSON: [{"label":"...","value":"..."}]`;

    const msg = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001', max_tokens: 350,
      messages: [{ role: 'user', content: prompt }],
    });

    const text = msg.content[0]?.text ?? '[]';
    const newChars = JSON.parse(text.match(/\[[\s\S]*\]/)?.[0] ?? '[]');

    if (newChars.length > 0) {
      await supabase.from('product_characteristics').insert(
        newChars.map((c, i) => ({ product_sku: p.sku, label: c.label, value: c.value, sort_order: i + 1 }))
      );
      added += newChars.length;
    }
    done++;
    process.stdout.write(`\r  ${done}/${products.length} — ${added} характеристик   `);
  }
  console.log(`\n\n✅ Гідроізоляція готова! Додано: ${added}`);
}

main().catch(err => { console.error('\n❌', err.message); process.exit(1); });
