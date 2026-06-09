/**
 * seed-categories.ts
 * Заливає фінальну структуру категорій у Supabase.
 * Запуск: npx tsx scripts/supabase/seed-categories.ts
 */

import * as dotenv from 'dotenv';
import path from 'path';
import { createServiceClient } from '../../lib/supabase';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const categories = [
  // ── Батьківські категорії ─────────────────────────────────────────────────
  { slug: 'germetyky',       name: 'Герметики',                parent_slug: null, sort_order: 10 },
  { slug: 'montazhna-pina',  name: 'Монтажна піна',            parent_slug: null, sort_order: 20 },
  { slug: 'klei',            name: 'Клеї',                     parent_slug: null, sort_order: 30 },
  { slug: 'farby',           name: 'Фарби та покриття',        parent_slug: null, sort_order: 40 },
  { slug: 'gruntivky',       name: 'Ґрунтовки та шпаклівки',  parent_slug: null, sort_order: 50 },
  { slug: 'hidroizolyatsiya',name: 'Гідроізоляція',            parent_slug: null, sort_order: 60 },
  { slug: 'kriplennya',      name: 'Кріплення',                parent_slug: null, sort_order: 70 },
  { slug: 'instrumenty',     name: 'Інструменти',              parent_slug: null, sort_order: 80 },

  // ── Герметики ─────────────────────────────────────────────────────────────
  { slug: 'sylikonovi-germetyky',     name: 'Силіконові герметики',     parent_slug: 'germetyky', sort_order: 11 },
  { slug: 'akrylovi-germetyky',       name: 'Акрилові герметики',       parent_slug: 'germetyky', sort_order: 12 },
  { slug: 'poliuretanovi-germetyky',  name: 'Поліуретанові герметики',  parent_slug: 'germetyky', sort_order: 13 },
  { slug: 'bitumni-germetyky',        name: 'Бітумні герметики',        parent_slug: 'germetyky', sort_order: 14 },
  { slug: 'sanitarni-germetyky',      name: 'Санітарні герметики',      parent_slug: 'germetyky', sort_order: 15 },

  // ── Монтажна піна ─────────────────────────────────────────────────────────
  { slug: 'pistoletna-pina',    name: 'Пістолетна піна',    parent_slug: 'montazhna-pina', sort_order: 21 },
  { slug: 'pobutova-pina',      name: 'Побутова піна',      parent_slug: 'montazhna-pina', sort_order: 22 },
  { slug: 'vohnezakhysna-pina', name: 'Вогнезахисна піна',  parent_slug: 'montazhna-pina', sort_order: 23 },

  // ── Клеї ──────────────────────────────────────────────────────────────────
  { slug: 'klei-dlya-plytky',  name: 'Клеї для плитки',        parent_slug: 'klei', sort_order: 31 },
  { slug: 'montazhnyi-klei',   name: 'Монтажний клей',         parent_slug: 'klei', sort_order: 32 },
  { slug: 'klei-dlya-shpaler', name: 'Клей для шпалер',        parent_slug: 'klei', sort_order: 33 },
  { slug: 'kontaktnyi-klei',   name: 'Контактний клей',        parent_slug: 'klei', sort_order: 34 },
  { slug: 'pva-ta-stolyarnyi', name: 'ПВА та столярний клей',  parent_slug: 'klei', sort_order: 35 },

  // ── Фарби та покриття ─────────────────────────────────────────────────────
  { slug: 'fasadni-farby',          name: 'Фасадні фарби',          parent_slug: 'farby', sort_order: 41 },
  { slug: 'interierni-farby',       name: "Інтер'єрні фарби",       parent_slug: 'farby', sort_order: 42 },
  { slug: 'antykoroziyni-farby',    name: 'Антикорозійні фарби',    parent_slug: 'farby', sort_order: 43 },
  { slug: 'laky',                   name: 'Лаки та просочення',     parent_slug: 'farby', sort_order: 44 },
  { slug: 'farby-dlya-radiatoriv',  name: 'Фарби для радіаторів',   parent_slug: 'farby', sort_order: 130 },

  // ── Ґрунтовки та шпаклівки ───────────────────────────────────────────────
  { slug: 'gruntivky-hlyboki',  name: 'Ґрунтовки глибокого проникнення', parent_slug: 'gruntivky', sort_order: 51 },
  { slug: 'shpaklivky',         name: 'Шпаклівки',                       parent_slug: 'gruntivky', sort_order: 52 },
  { slug: 'shtukaturky',        name: 'Штукатурки',                      parent_slug: 'gruntivky', sort_order: 53 },

  // ── Гідроізоляція ─────────────────────────────────────────────────────────
  { slug: 'bitumni-mastyky',     name: 'Бітумні мастики',       parent_slug: 'hidroizolyatsiya', sort_order: 61 },
  { slug: 'praimery',            name: 'Праймери',              parent_slug: 'hidroizolyatsiya', sort_order: 62 },
  { slug: 'izolyatsiyni-strichky', name: 'Ізоляційні стрічки', parent_slug: 'hidroizolyatsiya', sort_order: 63 },

  // ── Кріплення ─────────────────────────────────────────────────────────────
  { slug: 'dyubeli-ta-ankery',   name: 'Дюбелі та анкери',      parent_slug: 'kriplennya', sort_order: 71 },
  { slug: 'shurupy-ta-samorizy', name: 'Шурупи та саморізи',    parent_slug: 'kriplennya', sort_order: 72 },

  // ── Інструменти ───────────────────────────────────────────────────────────
  { slug: 'pistolety',     name: 'Пістолети для піни та герметика', parent_slug: 'instrumenty', sort_order: 81 },
  { slug: 'shpateli',      name: 'Шпателі та кельми',              parent_slug: 'instrumenty', sort_order: 82 },
  { slug: 'kysti-ta-valy', name: 'Кисті та валики',               parent_slug: 'instrumenty', sort_order: 83 },
  { slug: 'shlifuvalny',   name: 'Шліфувальний інструмент',       parent_slug: 'instrumenty', sort_order: 84 },
  { slug: 'vymiriuvalny',  name: 'Вимірювальний інструмент',      parent_slug: 'instrumenty', sort_order: 85 },
];

async function main() {
  const supabase = createServiceClient();

  console.log(`\n🚀 Завантажую ${categories.length} категорій у Supabase...\n`);

  const { error } = await supabase
    .from('categories')
    .upsert(categories, { onConflict: 'slug' });

  if (error) {
    console.error('❌ Помилка:', error.message);
    process.exit(1);
  }

  console.log('✅ Категорії успішно завантажено!\n');
  console.log('Структура:');
  const parents = categories.filter(c => !c.parent_slug);
  for (const p of parents) {
    const children = categories.filter(c => c.parent_slug === p.slug);
    console.log(`  📁 ${p.name} (${p.slug})`);
    for (const c of children) {
      console.log(`     └── ${c.name} (${c.slug})`);
    }
  }
}

main().catch(err => {
  console.error('\n❌ Критична помилка:', err.message);
  process.exit(1);
});
