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

const CATS = [
  'kriplennya','dyubeli-ta-ankery','shurupy-ta-samorizy',
  'instrumenty','pistolety','pistolety-dlya-piny','shpateli',
  'kysti-ta-valy','shlifuvalny','vymiriuvalny',
  'strichky','hermetyzuyucha-strichka','malyarna-strichka','strichka-dlya-shviv','zvukoizolyatsiyna-strichka',
  'plastyfikatory','plastyfikatory-dlya-betonu',
  'vologopoglinachi',
];

const CHARS = {
  'dyubeli-ta-ankery':      ['Матеріал','Діаметр','Довжина','Тип','Покриття','Країна виробник'],
  'shurupy-ta-samorizy':    ['Матеріал','Діаметр різьби','Довжина','Тип голівки','Покриття','Країна виробник'],
  'pistolety':              ['Тип','Матеріал корпусу','Довжина картриджа','Країна виробник'],
  'pistolety-dlya-piny':    ['Тип','Матеріал корпусу','Країна виробник'],
  'shpateli':               ['Матеріал леза','Ширина','Тип','Країна виробник'],
  'kysti-ta-valy':          ['Тип','Матеріал ворсу','Ширина','Призначення','Країна виробник'],
  'shlifuvalny':            ['Тип','Матеріал','Діаметр','Зернистість','Призначення','Країна виробник'],
  'vymiriuvalny':           ['Тип','Діапазон вимірювання','Точність','Матеріал','Країна виробник'],
  'hermetyzuyucha-strichka':['Тип','Матеріал','Ширина','Довжина','Товщина','Клейких сторін','Країна виробник'],
  'malyarna-strichka':      ['Тип','Ширина','Довжина','Температура застосування','Країна виробник'],
  'strichka-dlya-shviv':    ['Тип','Матеріал','Ширина','Довжина','Країна виробник'],
  'zvukoizolyatsiyna-strichka':['Тип','Матеріал','Ширина','Товщина','Країна виробник'],
  'plastyfikatory-dlya-betonu':['Тип','Призначення','Витрата','Мінімальна температура застосування','Країна виробник'],
  'vologopoglinachi':       ['Тип','Об`єм поглинання','Площа кімнати','Країна виробник'],
  'default':                ['Тип','Матеріал','Призначення','Країна виробник'],
};

async function main() {
  const { data: products } = await supabase.from('products')
    .select('sku,name,brand,volume,category_slug').in('category_slug', CATS).eq('is_active', true);

  const skus = products.map(p => p.sku);
  for (let i = 0; i < skus.length; i += 200) {
    await supabase.from('product_characteristics').delete().in('product_sku', skus.slice(i, i+200));
  }
  console.log('Старі видалено. Генерую для', products.length, 'товарів...');

  let done = 0, added = 0;
  for (const p of products) {
    await new Promise(r => setTimeout(r, 1800));
    const chars = CHARS[p.category_slug] ?? CHARS['default'];

    const prompt = `Заповни характеристики товару:
Товар: ${p.name}${p.volume ? ' ' + p.volume : ''}
Бренд: ${p.brand}
Категорія: ${p.category_slug}

Характеристики:
${chars.join('\n')}

Правила:
- Розміри з одиницями: "8 мм", "80 мм", "50 м"
- Зернистість: "P80", "P120"
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
  console.log(`\n\n✅ Готово! Додано: ${added}`);
}

main().catch(err => { console.error('\n❌', err.message); process.exit(1); });
