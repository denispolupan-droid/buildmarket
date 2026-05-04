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

const STANDARD = {
  'pistoletna-pina':           ['Основа','Тип','Первинне розширення','Вторинне розширення','Вихід піни','Мінімальна температура застосування','Максимальна температура застосування','Час поверхневого висихання','Країна виробник'],
  'pobutova-pina':             ['Основа','Тип','Первинне розширення','Вторинне розширення','Вихід піни','Мінімальна температура застосування','Максимальна температура застосування','Країна виробник'],
  'ridki-tsvyakhy':            ['Тип клею','Стан','Колір','Кількість компонентів','Мінімальна температура застосування','Максимальна температура застосування','Час початкового схоплення','Країна виробник'],
  'montazhnyi-klei':           ['Тип клею','Стан','Колір','Кількість компонентів','Мінімальна температура застосування','Максимальна температура застосування','Час початкового схоплення','Країна виробник'],
  'klei-dlya-shpaler':         ['Тип клею','Призначення','Наявність індикатора','Країна виробник'],
  'pva-ta-stolyarnyi':         ['Тип клею','Клас водостійкості','Колір','Кількість компонентів','Мінімальна температура застосування','Час повного затвердіння','Країна виробник'],
  'super-klei':                ['Тип клею','Стан (консистенція)','Час схоплення','Міцність клейового з\'єднання','Країна виробник'],
  'vodoemiulsiyni-fasadni':    ['Основа','Ступінь блиску','Витрата матеріалу','Мінімальна температура застосування','Час висихання','Країна виробник'],
  'vodoemiulsiyni-interierni': ['Основа','Ступінь блиску','Витрата матеріалу','Мінімальна температура застосування','Час висихання','Країна виробник'],
  'alkidni-farby':             ['Основа','Колір','Ступінь блиску','Витрата матеріалу','Час висихання','Розчинник','Країна виробник'],
  'gruntivky-gotovi':          ['Тип','Основа','Витрата матеріалу','Мінімальна температура застосування','Час висихання','Країна виробник'],
  'shpaklivky':                ['Тип','Основа','Колір','Мінімальна температура застосування','Час висихання','Країна виробник'],
};

const HINTS = {
  'alkidni-farby': 'Алкідна фарба/емаль. Основа: Алкідна. Розчинник: Уайт-спірит. Ступінь блиску: Глянцевий або Напівглянцевий.',
  'super-klei': 'Ціанакрилатний суперклей. Час схоплення: 5-30 сек. Стан: Рідкий або Гель.',
  'klei-dlya-shpaler': 'Клей для шпалер. Призначення: для Флізелінових або Вінілових або Паперових шпалер.',
  'pistoletna-pina': 'Пістолетна монтажна піна. Основа: Поліуретан. Первинне розширення: 40-60%. Вторинне: до 20%.',
  'pobutova-pina': 'Побутова монтажна піна. Основа: Поліуретан.',
};

async function main() {
  console.log('Завантажую дані...');

  // Всі поточні характеристики
  let allChars = [];
  let pg = 0;
  while (true) {
    const { data } = await supabase.from('product_characteristics')
      .select('product_sku,label,sort_order').range(pg*1000,(pg+1)*1000-1);
    if (!data?.length) break;
    allChars.push(...data);
    if (data.length < 1000) break;
    pg++;
  }

  const byProduct = {};
  allChars.forEach(c => {
    if (!byProduct[c.product_sku]) byProduct[c.product_sku] = { labels: new Set(), max: 0 };
    byProduct[c.product_sku].labels.add(c.label);
    byProduct[c.product_sku].max = Math.max(byProduct[c.product_sku].max, c.sort_order);
  });

  let totalAdded = 0;
  let totalProducts = 0;

  for (const [cat, required] of Object.entries(STANDARD)) {
    const { data: prods } = await supabase.from('products')
      .select('sku,name,brand,volume,category_slug').eq('category_slug', cat).eq('is_active', true);

    const incomplete = prods.filter(p => {
      const has = byProduct[p.sku]?.labels ?? new Set();
      return required.some(r => !has.has(r));
    });

    if (incomplete.length === 0) { console.log(`✅ ${cat}: всі повні`); continue; }
    console.log(`\n📋 ${cat}: ${incomplete.length} неповних з ${prods.length}`);

    for (const p of incomplete) {
      await new Promise(r => setTimeout(r, 2000));
      const has = byProduct[p.sku]?.labels ?? new Set();
      const missing = required.filter(r => !has.has(r));

      const prompt = `Заповни характеристики товару:
Товар: ${p.name}${p.volume ? ' ' + p.volume : ''}
Бренд: ${p.brand}
${HINTS[cat] ? 'Підказка: ' + HINTS[cat] : ''}

Потрібно заповнити:
${missing.join('\n')}

Формат: температури "+5 °C", час "24 год", "1.5 кг/м2". Якщо не впевнений — не включай.
JSON: [{"label":"...","value":"..."}]`;

      const msg = await anthropic.messages.create({
        model: 'claude-haiku-4-5-20251001', max_tokens: 350,
        messages: [{ role: 'user', content: prompt }],
      });

      const text = msg.content[0]?.text ?? '[]';
      const chars = JSON.parse(text.match(/\[[\s\S]*\]/)?.[0] ?? '[]');

      if (chars.length > 0) {
        const maxOrder = byProduct[p.sku]?.max ?? 0;
        await supabase.from('product_characteristics').insert(
          chars.map((c, i) => ({ product_sku: p.sku, label: c.label, value: c.value, sort_order: maxOrder + i + 1 }))
        );
        totalAdded += chars.length;
        if (!byProduct[p.sku]) byProduct[p.sku] = { labels: new Set(), max: maxOrder };
        chars.forEach(c => byProduct[p.sku].labels.add(c.label));
      }
      totalProducts++;
      process.stdout.write(`\r  ${p.sku} — +${chars.length}   `);
    }
  }

  console.log(`\n\n✅ Готово! Оброблено: ${totalProducts} товарів, додано: ${totalAdded} характеристик`);
}

main().catch(err => { console.error('\n❌', err.message); process.exit(1); });
