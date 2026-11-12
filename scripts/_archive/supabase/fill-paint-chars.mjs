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

const CATS = ['farby','vodoemiulsiyni-fasadni','vodoemiulsiyni-interierni','alkidni-farby',
  'farby-3v1','farby-3v1-alkidni','moltkovi-farby','farby-3v1-akrylovi',
  'farby-dlya-pidlohy','koloranty','laky','rozchynnyky','grunty','zakhyst-derevyny',
  'antyseptyki','morylky','zakhysni-pokryttya'];

const CHARS = {
  'vodoemiulsiyni-fasadni':   ['Основа','Колір','Ступінь блиску','Витрата матеріалу','Мінімальна температура застосування','Час висихання','Кількість шарів','Країна виробник'],
  'vodoemiulsiyni-interierni':['Основа','Колір','Ступінь блиску','Витрата матеріалу','Мінімальна температура застосування','Час висихання','Країна виробник'],
  'alkidni-farby':            ['Основа','Колір','Ступінь блиску','Витрата матеріалу','Час висихання','Розчинник','Країна виробник'],
  'farby-3v1':                ['Основа','Колір','Ступінь блиску','Витрата матеріалу','Час висихання','Антикорозійний захист','Країна виробник'],
  'farby-3v1-alkidni':        ['Основа','Колір','Ступінь блиску','Витрата матеріалу','Час висихання','Країна виробник'],
  'moltkovi-farby':           ['Основа','Колір','Фактура','Витрата матеріалу','Час висихання','Країна виробник'],
  'farby-3v1-akrylovi':       ['Основа','Колір','Ступінь блиску','Витрата матеріалу','Час висихання','Країна виробник'],
  'farby-dlya-pidlohy':       ['Основа','Колір','Ступінь блиску','Витрата матеріалу','Час висихання','Стійкість до зносу','Країна виробник'],
  'koloranty':                ['Тип','Основа','Колір/відтінок','Сумісність','Країна виробник'],
  'laky':                     ['Основа','Ступінь блиску','Витрата матеріалу','Час висихання','Призначення','Країна виробник'],
  'rozchynnyky':              ['Тип','Призначення','Країна виробник'],
  'grunty':                   ['Тип','Основа','Витрата матеріалу','Час висихання','Країна виробник'],
  'antyseptyki':              ['Тип','Призначення','Витрата матеріалу','Захист від','Країна виробник'],
  'morylky':                  ['Тип','Колір','Основа','Витрата матеріалу','Час висихання','Країна виробник'],
  'zakhysni-pokryttya':       ['Тип','Основа','Колір','Витрата матеріалу','Час висихання','Країна виробник'],
  'farby':                    ['Основа','Колір','Ступінь блиску','Витрата матеріалу','Час висихання','Країна виробник'],
  'zakhyst-derevyny':         ['Тип','Основа','Призначення','Витрата матеріалу','Час висихання','Країна виробник'],
};

const HINTS = {
  'alkidni-farby':    'Алкідна фарба/емаль. Основа: Алкідна. Розчинник: Уайт-спірит або розчинник 646.',
  'farby-3v1':        'Фарба 3в1: ґрунт+шпаклівка+фарба в одному. Антикорозійний захист: Так.',
  'moltkovi-farby':   'Молоткова фарба. Фактура: Молоткова. Основа: Алкідна.',
  'koloranty':        'Колорант — пігментна паста для тонування фарб.',
  'rozchynnyky':      'Розчинник або перетворювач іржі. Тип: Розчинник або Перетворювач іржі.',
  'antyseptyki':      'Антисептик для дерева. Захист від: Гриб, Цвіль, Комахи.',
  'morylky':          'Морилка/тонуючий засіб для дерева.',
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
    const chars = CHARS[p.category_slug] ?? CHARS['farby'];
    const hint  = HINTS[p.category_slug] ?? '';

    const prompt = `Заповни характеристики фарби/покриття:
Товар: ${p.name}${p.volume ? ' ' + p.volume : ''}
Бренд: ${p.brand}
${hint ? 'Підказка: ' + hint : ''}

Характеристики:
${chars.join('\n')}

Правила:
- Температури: "+5 °C"
- Витрата: "130 г/м2", "0.15 л/м2"
- Час висихання: "2 год", "24 год"
- Ступінь блиску: Матовий/Напівматовий/Глянцевий/Напівглянцевий
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
  console.log(`\n\n✅ Фарби готові! Додано: ${added}`);
}

main().catch(err => { console.error('\n❌', err.message); process.exit(1); });
