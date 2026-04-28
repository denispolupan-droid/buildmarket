/**
 * clean-categories.ts
 * Видаляє всі категорії крім фінальних.
 * Запуск: npx tsx scripts/supabase/clean-categories.ts
 */

import * as dotenv from 'dotenv';
import path from 'path';
import { createServiceClient } from '../../lib/supabase';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const keepSlugs = new Set([
  'germetyky', 'montazhna-pina', 'klei', 'farby', 'gruntivky',
  'hidroizolyatsiya', 'kriplennya', 'instrumenty',
  'sylikonovi-germetyky', 'akrylovi-germetyky', 'poliuretanovi-germetyky',
  'bitumni-germetyky', 'sanitarni-germetyky',
  'pistoletna-pina', 'pobutova-pina', 'vohnezakhysna-pina',
  'ridki-tsvyakhy', 'montazhnyi-klei', 'klei-dlya-shpaler',
  'kontaktnyi-klei', 'pva-ta-stolyarnyi',
  'fasadni-farby', 'interierni-farby', 'antykoroziyni-farby', 'laky',
  'gruntivky-hlyboki', 'shpaklivky', 'shtukaturky',
  'bitumni-mastyky', 'praimery', 'izolyatsiyni-strichky',
  'dyubeli-ta-ankery', 'shurupy-ta-samorizy',
  'pistolety', 'shpateli', 'kysti-ta-valy', 'shlifuvalny', 'vymiriuvalny',
]);

async function main() {
  const supabase = createServiceClient();

  const { data: all, error } = await supabase.from('categories').select('slug, name');
  if (error) { console.error('❌', error.message); process.exit(1); }

  const toDelete = (all ?? []).filter(c => !keepSlugs.has(c.slug));

  if (toDelete.length === 0) {
    console.log('✅ Старих категорій немає — все чисто.');
    return;
  }

  console.log(`\n🗑  Видаляю ${toDelete.length} старих категорій:`);
  toDelete.forEach(c => console.log(`   - ${c.name} (${c.slug})`));

  const slugsToDelete = toDelete.map(c => c.slug);

  // Знімаємо category_slug з товарів що мали ці категорії
  await supabase
    .from('products')
    .update({ category_slug: null })
    .in('category_slug', slugsToDelete);

  // Видаляємо самі категорії
  const { error: delErr } = await supabase
    .from('categories')
    .delete()
    .in('slug', slugsToDelete);

  if (delErr) { console.error('❌', delErr.message); process.exit(1); }

  console.log('\n✅ Старі категорії видалено!\n');
}

main().catch(err => {
  console.error('\n❌ Критична помилка:', err.message);
  process.exit(1);
});
