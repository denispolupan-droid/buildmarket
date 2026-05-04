/**
 * fix-paint-types.mjs
 * Заповнює product_type для товарів категорії Фарби на основі їх підкатегорії
 * Запуск: node scripts/supabase/fix-paint-types.mjs
 */
import * as dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
);

// Маппінг: category_slug → product_type
const TYPE_MAP = {
  'vodoemiulsiyni-interierni': 'Водоемульсійна',
  'vodoemiulsiyni-fasadni':    'Водоемульсійна',
  'alkidni-farby':             'Алкідна емаль',
  'farby-3v1':                 'Фарба 3 в 1',
  'farby-3v1-akrylovi':        'Фарба 3 в 1',
  'farby-3v1-alkidni':         'Фарба 3 в 1',
  'moltkovi-farby':            'Молоткова',
  'farby-dlya-pidlohy':        'Для підлоги',
  'koloranty':                 'Колорант',
  'rozchynnyky':               'Розчинник',
  'laky':                      'Лак',
  'grunty':                    'Ґрунтовка',
};

async function main() {
  console.log('=== Заповнення product_type для фарб ===\n');

  for (const [slug, productType] of Object.entries(TYPE_MAP)) {
    const { count, error } = await supabase
      .from('products')
      .update({ product_type: productType }, { count: 'exact' })
      .eq('category_slug', slug);

    if (error) {
      console.error(`❌ ${slug}:`, error.message);
    } else {
      console.log(`✅ ${slug} → "${productType}" — ${count} товарів`);
    }
  }

  // Фінальна статистика
  console.log('\n📋 Фінальний розподіл product_type для фарб:');

  const slugs = Object.keys(TYPE_MAP);
  const { data: products } = await supabase
    .from('products')
    .select('product_type')
    .in('category_slug', slugs);

  const counts = {};
  for (const p of products ?? []) {
    const t = p.product_type || '(пусто)';
    counts[t] = (counts[t] || 0) + 1;
  }

  const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  for (const [t, cnt] of sorted) {
    console.log(`   [${cnt}] ${t}`);
  }

  console.log('\n✅ Готово!');
}

main().catch(err => {
  console.error('\n❌ Помилка:', err.message);
  process.exit(1);
});
