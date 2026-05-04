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

const GLUE_CATS = ['klei','ridki-tsvyakhy','montazhnyi-klei','klei-dlya-shpaler',
  'kontaktnyi-klei','pva-ta-stolyarnyi','super-klei','epoksydni-klei'];

// Стандартний набір по підкатегоріях
const CHARS_BY_CAT = {
  'ridki-tsvyakhy': [
    'Тип клею','Стан','Колір','Кількість компонентів',
    'Мінімальна температура застосування','Максимальна температура застосування',
    'Мінімальна температура експлуатації','Максимальна температура експлуатації',
    'Час початкового схоплення','Міцність клейового з\'єднання','Країна виробник'
  ],
  'montazhnyi-klei': [
    'Тип клею','Стан','Колір','Кількість компонентів',
    'Мінімальна температура застосування','Максимальна температура застосування',
    'Мінімальна температура експлуатації','Максимальна температура експлуатації',
    'Час початкового схоплення','Міцність клейового з\'єднання','Країна виробник'
  ],
  'klei-dlya-shpaler': [
    'Тип клею','Призначення','Наявність індикатора',
    'Витрата на рулон','Країна виробник'
  ],
  'kontaktnyi-klei': [
    'Тип клею','Стан','Кількість компонентів',
    'Мінімальна температура застосування','Максимальна температура застосування',
    'Час відкритої витримки','Країна виробник'
  ],
  'pva-ta-stolyarnyi': [
    'Тип клею','Клас водостійкості','Колір','Кількість компонентів',
    'Мінімальна температура застосування','Час повного затвердіння','Країна виробник'
  ],
  'super-klei': [
    'Тип клею','Стан (консистенція)','Час схоплення',
    'Міцність клейового з\'єднання','Країна виробник'
  ],
  'epoksydni-klei': [
    'Тип клею','Кількість компонентів','Час повного затвердіння',
    'Міцність клейового з\'єднання','Країна виробник'
  ],
  'klei': [
    'Тип клею','Стан','Колір','Кількість компонентів',
    'Мінімальна температура застосування','Максимальна температура застосування',
    'Час повного затвердіння','Країна виробник'
  ],
};

const PROMPT_HINTS = {
  'ridki-tsvyakhy':   'Рідкі цвяхи — конструкційний монтажний клей. Тип: Акриловий або MS-полімерний або Поліуретановий. Стан: Готова паста або Рідина.',
  'montazhnyi-klei':  'Монтажний клей. Тип: Акриловий/Поліуретановий/MS-полімерний. Час схоплення зазвичай 10-30 хв.',
  'klei-dlya-shpaler':'Клей для шпалер. Призначення: Флізелінові/Вінілові/Паперові/Всі види. Наявність індикатора: Так/Ні.',
  'kontaktnyi-klei':  'Контактний клей — наносять на обидві поверхні, зєднують після витримки. Тип: Неопреновий або Поліуретановий.',
  'pva-ta-stolyarnyi':'ПВА або столярний клей. Клас водостійкості: D2 (стандартний) або D3 (вологостійкий) або D4 (водостійкий).',
  'super-klei':       'Суперклей (ціанакрилат). Час схоплення: 5-30 сек. Стан: Рідкий або Гель.',
  'epoksydni-klei':   'Епоксидний клей. Завжди двокомпонентний. Час затвердіння: 5 хв або 24 год залежно від типу.',
  'klei':             'Клей загальний. Визнач тип з назви.',
};

async function main() {
  const { data: products } = await supabase
    .from('products').select('sku,name,brand,volume,category_slug').in('category_slug', GLUE_CATS).eq('is_active', true);

  console.log('Товарів клеїв:', products.length);

  let done = 0, added = 0;
  for (const p of products) {
    await new Promise(r => setTimeout(r, 1800));

    const chars = CHARS_BY_CAT[p.category_slug] ?? CHARS_BY_CAT['klei'];
    const hint  = PROMPT_HINTS[p.category_slug] ?? '';

    const msg = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001', max_tokens: 400,
      messages: [{ role: 'user', content:
        'Заповни характеристики клею:\nТовар: ' + p.name + (p.volume?' '+p.volume:'') + '\nБренд: ' + p.brand +
        '\nПідказка: ' + hint +
        '\n\nХарактеристики:\n' + chars.join('\n') +
        '\n\nПравила:\n- Температури: "+5 °C", "-20 °C"\n- Час: "10 хв", "24 год"\n- Міцність: "1.5 МПа"\n- Клас водостійкості: "D3"\n- Якщо не впевнений — не включай\nJSON: [{"label":"...","value":"..."}]'
      }]
    });

    const text = msg.content[0]?.text ?? '[]';
    const newChars = JSON.parse(text.match(/\[[\s\S]*\]/)?.[0] ?? '[]');

    if (newChars.length > 0) {
      await supabase.from('product_characteristics').insert(
        newChars.map((c,i) => ({ product_sku: p.sku, label: c.label, value: c.value, sort_order: i+1 }))
      );
      added += newChars.length;
    }
    done++;
    process.stdout.write(`\r  ${done}/${products.length} — додано ${added} характеристик   `);
  }
  console.log('\n\n✅ Готово! Додано:', added);
}

main().catch(err => { console.error('\n❌', err.message); process.exit(1); });
