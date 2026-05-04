/**
 * fix-paint-pryznachennya.mjs
 * Очищає та стандартизує значення "Призначення" для категорії Фарби
 * Запуск: node scripts/supabase/fix-paint-pryznachennya.mjs
 */
import * as dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
);

// 1. Видалити ці значення (не є призначенням фарб)
const TO_DELETE = [
  'Розчинник для фарб та лаків',
  'Очищувач від клею і скотчу',
  'Універсальний розчинник',
];

// 2. Замінити ці значення
const TO_RENAME = {
  'Захист від корозії': 'Антикорозійний',
  'Захист від іржі': 'Антикорозійний',
  'Тонування водоемульсійних фарб': 'Тонування фарб',
  'Універсальний захист': 'Універсальна',
};

async function main() {
  console.log('=== Очищення "Призначення" для фарб ===\n');

  // Видалення
  console.log('🗑  Видаляю непотрібні значення...');
  for (const val of TO_DELETE) {
    const { count, error } = await supabase
      .from('product_characteristics')
      .delete({ count: 'exact' })
      .eq('label', 'Призначення')
      .eq('value', val);

    if (error) console.error(`   ❌ "${val}":`, error.message);
    else console.log(`   ✅ "${val}" — видалено ${count} записів`);
  }

  // Перейменування
  console.log('\n✏️  Перейменовую значення...');
  for (const [oldVal, newVal] of Object.entries(TO_RENAME)) {
    const { count, error } = await supabase
      .from('product_characteristics')
      .update({ value: newVal }, { count: 'exact' })
      .eq('label', 'Призначення')
      .eq('value', oldVal);

    if (error) console.error(`   ❌ "${oldVal}":`, error.message);
    else console.log(`   ✅ "${oldVal}" → "${newVal}" — ${count} записів`);
  }

  // Фінальний список
  console.log('\n📋 Фінальний список значень "Призначення":');
  const { data } = await supabase
    .from('product_characteristics')
    .select('value')
    .eq('label', 'Призначення');

  const counts = {};
  for (const r of data ?? []) {
    counts[r.value] = (counts[r.value] || 0) + 1;
  }

  const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  for (const [val, cnt] of sorted) {
    console.log(`   [${cnt}] ${val}`);
  }

  console.log('\n✅ Готово!');
}

main().catch(err => {
  console.error('\n❌ Помилка:', err.message);
  process.exit(1);
});
