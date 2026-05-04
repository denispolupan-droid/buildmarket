import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';

const envLines = readFileSync('.env.local', 'utf-8').split('\n');
const env = {};
for (const line of envLines) {
  const m = line.match(/^([^#=\s]+)\s*=\s*(.*)$/);
  if (m) env[m[1]] = m[2].trim();
}
const supabase = createClient(env['NEXT_PUBLIC_SUPABASE_URL'], env['SUPABASE_SERVICE_ROLE_KEY']);

// Rules for determining product_type from name
const TYPE_RULES = [
  // Шліфувальний інструмент
  { pattern: /^Круг відрізний по каменю/i, type: 'Круг по каменю' },
  { pattern: /^Круг відрізний по металу/i, type: 'Круг по металу' },
  { pattern: /^Круг (шліфувальний|зачисний)/i, type: 'Круг шліфувальний' },
  { pattern: /^Круг пелюстковий/i, type: 'Круг пелюстковий' },
  { pattern: /^Круг алмазний/i, type: 'Круг алмазний' },
  { pattern: /^Свердло/i, type: 'Свердло' },
  { pattern: /^Фреза/i, type: 'Фреза' },
  { pattern: /^Коронка/i, type: 'Коронка' },
  { pattern: /^Диск/i, type: 'Диск' },
  { pattern: /^Бур /i, type: 'Бур' },
  { pattern: /^Шліфшкурка|^Папір шліфувальний/i, type: 'Шліфшкурка' },

  // Дюбелі та анкери
  { pattern: /^Дюбель/i, type: 'Дюбель' },
  { pattern: /^Анкер/i, type: 'Анкер' },
  { pattern: /^Суміш.*кріплення/i, type: 'Клейова суміш' },

  // Шурупи та саморізи
  { pattern: /^Саморіз/i, type: 'Саморіз' },
  { pattern: /^Шуруп/i, type: 'Шуруп' },

  // Стрічки
  { pattern: /^Стрічка малярна/i, type: 'Стрічка малярна' },
  { pattern: /^Стрічка.*швів|для швів/i, type: 'Стрічка для швів' },
  { pattern: /^(Стрічка герметизуюча|Герметизуюча стрічка)/i, type: 'Стрічка герметизуюча' },
  { pattern: /^Монтажна стрічка/i, type: 'Стрічка монтажна' },

  // Ножі та леза
  { pattern: /^Лезо/i, type: 'Лезо' },
  { pattern: /^Ніж/i, type: 'Ніж' },
  { pattern: /^Стрічка гідроізоляційна/i, type: 'Стрічка гідроізоляційна' },
  { pattern: /^Стрічка звукоізоляційна/i, type: 'Стрічка звукоізоляційна' },
  { pattern: /^Плівка ізоляційна/i, type: 'Плівка ізоляційна' },

  // Пістолети
  { pattern: /^Пістолет для герметика/i, type: 'Пістолет для герметика' },
  { pattern: /^Пістолет для піни/i, type: 'Пістолет для піни' },
  { pattern: /^Скоби для степлера/i, type: 'Скоби' },

  // Вимірювальний інструмент
  { pattern: /^Правило/i, type: 'Правило' },
  { pattern: /^Рівень/i, type: 'Рівень' },
  { pattern: /^Рулетка/i, type: 'Рулетка' },
];

function detectType(name) {
  for (const rule of TYPE_RULES) {
    if (rule.pattern.test(name)) {
      return rule.type;
    }
  }
  return null;
}

async function fillTypes() {
  // Categories without product_type
  const targetSlugs = [
    'shlifuvalny', 'dyubeli-ta-ankery', 'shurupy-ta-samorizy',
    'malyarna-strichka', 'pistolety', 'pistolety-dlya-piny',
    'hermetyzuyucha-strichka', 'izolyatsiyni-strichky',
    'zvukoizolyatsiyna-strichka', 'vymiriuvalny'
  ];

  const { data: products, error } = await supabase
    .from('products')
    .select('sku, name, product_type, category_slug')
    .in('category_slug', targetSlugs)
    .eq('is_active', true);

  if (error) {
    console.error('Error:', error);
    return;
  }

  console.log(`Знайдено ${products.length} товарів у цільових категоріях\n`);

  const updates = [];
  const unmatched = [];

  for (const p of products) {
    if (p.product_type && p.product_type !== 'Не вказано') continue;

    const type = detectType(p.name);
    if (type) {
      updates.push({ sku: p.sku, name: p.name, type });
    } else {
      unmatched.push(p);
    }
  }

  console.log('=== БУДЕ ОНОВЛЕНО ===\n');

  // Group by type
  const byType = {};
  for (const u of updates) {
    (byType[u.type] ??= []).push(u);
  }

  for (const [type, items] of Object.entries(byType).sort()) {
    console.log(`${type} (${items.length}):`);
    items.slice(0, 3).forEach(i => console.log(`  - ${i.sku}: ${i.name}`));
    if (items.length > 3) console.log(`  ... та ще ${items.length - 3}`);
    console.log();
  }

  if (unmatched.length > 0) {
    console.log('\n=== НЕ РОЗПІЗНАНО ===\n');
    unmatched.forEach(p => console.log(`  - ${p.sku}: ${p.name}`));
  }

  console.log(`\nВсього: ${updates.length} оновлень, ${unmatched.length} не розпізнано`);

  // Ask for confirmation
  if (updates.length === 0) {
    console.log('Немає що оновлювати.');
    return;
  }

  const args = process.argv.slice(2);
  if (!args.includes('--apply')) {
    console.log('\nДодайте --apply для застосування змін');
    return;
  }

  console.log('\nЗастосування змін...');

  let success = 0;
  for (const u of updates) {
    const { error } = await supabase
      .from('products')
      .update({ product_type: u.type })
      .eq('sku', u.sku);

    if (error) {
      console.error(`Помилка ${u.sku}:`, error.message);
    } else {
      success++;
    }
  }

  console.log(`\nОновлено: ${success}/${updates.length}`);
}

fillTypes();
