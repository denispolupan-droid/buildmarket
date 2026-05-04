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

const CATS = ['gruntivky','gruntivky-gotovi','gruntivky-kontsentraty','betonokontakt','shpaklivky','antygrybok','zamazky-dlya-shviv','zamazky-tsementni','zamazky-epoksydni'];

const CHARS = {
  'gruntivky-gotovi':       ['Тип','Основа','Витрата матеріалу','Мінімальна температура застосування','Максимальна температура застосування','Час висихання','Спосіб нанесення','Країна виробник'],
  'gruntivky-kontsentraty': ['Тип','Основа','Розведення водою','Витрата матеріалу','Мінімальна температура застосування','Час висихання','Країна виробник'],
  'betonokontakt':          ['Тип','Основа','Колір','Витрата матеріалу','Мінімальна температура застосування','Час висихання','Країна виробник'],
  'shpaklivky':             ['Тип','Основа','Колір','Зернистість','Мінімальна температура застосування','Час висихання','Витрата матеріалу','Країна виробник'],
  'antygrybok':             ['Тип','Призначення','Спосіб нанесення','Час дії','Площа обробки','Країна виробник'],
  'zamazky-dlya-shviv':     ['Тип','Основа','Колір','Ширина шва','Мінімальна температура застосування','Водостійкість','Країна виробник'],
  'zamazky-tsementni':      ['Тип','Основа','Колір','Мінімальна ширина шва','Максимальна ширина шва','Мінімальна температура застосування','Водостійкість','Країна виробник'],
  'zamazky-epoksydni':      ['Тип','Кількість компонентів','Колір','Мінімальна ширина шва','Максимальна ширина шва','Час затвердіння','Водостійкість','Країна виробник'],
  'gruntivky':              ['Тип','Основа','Витрата матеріалу','Мінімальна температура застосування','Час висихання','Країна виробник'],
};

const HINTS = {
  'gruntivky-gotovi':       'Готова до використання ґрунтовка. Тип: Глибокого проникнення або Адгезійна.',
  'gruntivky-kontsentraty': 'Ґрунтовка-концентрат, розводиться водою 1:5 або 1:10. Витрата — після розведення.',
  'betonokontakt':          'Адгезійна ґрунтовка (бетоноконтакт) рожевого/червоного кольору. Основа: Акрил з кварцовим піском.',
  'shpaklivky':             'Шпаклівка. Тип: Фінішна або Стартова або Універсальна. Основа: Гіпс або Цемент або Акрил.',
  'antygrybok':             'Антигрибковий/антицвіль засіб. Площа обробки зазвичай 5-20 м2 на 1 л.',
  'zamazky-tsementni':      'Цементна затирка для плитки. Тип: Цементна. Ширина шва зазвичай 1-6 мм або 2-20 мм.',
  'zamazky-epoksydni':      'Епоксидна затирка. Кількість компонентів: Двокомпонентна. Дуже водостійка.',
  'zamazky-dlya-shviv':     'Затирка для швів. Основа залежить від типу.',
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
    const chars = CHARS[p.category_slug] ?? CHARS['gruntivky'];
    const hint  = HINTS[p.category_slug] ?? '';

    const prompt = `Заповни характеристики будівельного матеріалу:
Товар: ${p.name}${p.volume ? ' ' + p.volume : ''}
Бренд: ${p.brand}
Підказка: ${hint}

Характеристики:
${chars.join('\n')}

Правила:
- Температури: "+5 °C", "-20 °C"
- Витрата: "0.15 кг/м2", "200 г/м2"
- Час: "30 хв", "24 год"
- Зернистість: "0-0.6 мм"
- Ширина шва: "1-6 мм"
- Якщо не впевнений — не включай
JSON: [{"label":"...","value":"..."}]`;

    const msg = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001', max_tokens: 400,
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
  console.log(`\n\n✅ Ґрунтовки готові! Додано: ${added}`);
}

main().catch(err => { console.error('\n❌', err.message); process.exit(1); });
