/**
 * update-categories.ts
 * Оновлює структуру категорій: видаляє застарілі, додає нові.
 * Запуск: npx tsx scripts/supabase/update-categories.ts
 */

import * as dotenv from 'dotenv';
import path from 'path';
import { createServiceClient } from '../../lib/supabase';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

// Видалити ці застарілі підкатегорії
const toDelete = [
  'fasadni-farby',
  'interierni-farby',
  'antykoroziyni-farby',
  'gruntivky-hlyboki',
];

// Додати нові категорії
const toAdd = [
  // ── Фарби та покриття (розширення) ───────────────────────────────────────
  { slug: 'vodoemiulsiyni-fasadni',   name: 'Водоемульсійні фасадні фарби',       parent_slug: 'farby',       sort_order: 41 },
  { slug: 'vodoemiulsiyni-interierni',name: "Водоемульсійні інтер'єрні фарби",    parent_slug: 'farby',       sort_order: 42 },
  { slug: 'alkidni-farby',            name: 'Алкідні емалі',                      parent_slug: 'farby',       sort_order: 43 },
  { slug: 'farby-3v1',                name: 'Фарби 3 в 1',                        parent_slug: 'farby',       sort_order: 44 },
  { slug: 'moltkovi-farby',           name: 'Молоткові фарби',                    parent_slug: 'farby',       sort_order: 45 },
  { slug: 'farby-dlya-pidlohy',       name: 'Фарба для підлоги',                  parent_slug: 'farby',       sort_order: 46 },
  // laky — вже є, sort_order: 47
  { slug: 'koloranty',                name: 'Колоранти',                          parent_slug: 'farby',       sort_order: 48 },
  { slug: 'rozchynnyky',              name: 'Розчинники та перетворювачі іржі',   parent_slug: 'farby',       sort_order: 49 },

  // ── Ґрунтовки та шпаклівки (розширення) ──────────────────────────────────
  { slug: 'gruntivky-gotovi',         name: 'Ґрунтовки готові',                  parent_slug: 'gruntivky',   sort_order: 51 },
  { slug: 'gruntivky-kontsentraty',   name: 'Ґрунтовки-концентрати',             parent_slug: 'gruntivky',   sort_order: 52 },
  { slug: 'betonokontakt',            name: 'Бетоноконтакт та фарба-ґрунт',      parent_slug: 'gruntivky',   sort_order: 53 },
  // shpaklivky — вже є, sort_order: 54
  // shtukaturky — вже є, sort_order: 55
  { slug: 'zamazky-dlya-shviv',       name: 'Замазки для швів',                  parent_slug: 'gruntivky',   sort_order: 56 },
  { slug: 'antygrybok',               name: 'Антигрибкові засоби',               parent_slug: 'gruntivky',   sort_order: 57 },

  // ── Нова батьківська: Захист дерева ──────────────────────────────────────
  { slug: 'zakhyst-derevyny',         name: 'Захист дерева',                     parent_slug: null,          sort_order: 45 },
  { slug: 'antyseptyki',              name: 'Антисептики для дерева',            parent_slug: 'zakhyst-derevyny', sort_order: 451 },
  { slug: 'zakhysni-pokryttya',       name: 'Захисні покриття',                  parent_slug: 'zakhyst-derevyny', sort_order: 452 },
  { slug: 'morylky',                  name: 'Морилки та тонуючі засоби',         parent_slug: 'zakhyst-derevyny', sort_order: 453 },

  // ── Нова батьківська: Стрічки ─────────────────────────────────────────────
  { slug: 'strichky',                 name: 'Стрічки',                           parent_slug: null,          sort_order: 55 },
  { slug: 'hermetyzuyucha-strichka',  name: 'Герметизуюча стрічка',             parent_slug: 'strichky',    sort_order: 551 },
  { slug: 'malyarna-strichka',        name: 'Малярна стрічка',                   parent_slug: 'strichky',    sort_order: 552 },
  { slug: 'strichka-dlya-shviv',      name: 'Стрічка для швів',                  parent_slug: 'strichky',    sort_order: 553 },
  { slug: 'zvukoizolyatsiyna-strichka', name: 'Звукоізоляційна стрічка',        parent_slug: 'strichky',    sort_order: 554 },

  // ── Нова батьківська: Пластифікатори та добавки ───────────────────────────
  { slug: 'plastyfikatory',           name: 'Пластифікатори та добавки',         parent_slug: null,          sort_order: 65 },
  { slug: 'plastyfikatory-dlya-betonu', name: 'Пластифікатори для бетону',      parent_slug: 'plastyfikatory', sort_order: 651 },
];

async function main() {
  const supabase = createServiceClient();

  // 1. Видаляємо застарілі
  console.log(`\n🗑  Видаляю ${toDelete.length} застарілих підкатегорій...`);
  await supabase.from('products').update({ category_slug: null }).in('category_slug', toDelete);
  const { error: delErr } = await supabase.from('categories').delete().in('slug', toDelete);
  if (delErr) { console.error('❌', delErr.message); process.exit(1); }
  console.log('   ✅ Видалено:', toDelete.join(', '));

  // 2. Додаємо нові
  console.log(`\n➕ Додаю ${toAdd.length} нових категорій...`);
  const { error: addErr } = await supabase.from('categories').upsert(toAdd, { onConflict: 'slug' });
  if (addErr) { console.error('❌', addErr.message); process.exit(1); }

  // 3. Виводимо фінальну структуру
  const { data: all } = await supabase.from('categories').select('*').order('sort_order');
  const parents = (all ?? []).filter(c => !c.parent_slug);
  const childrenOf = (slug: string) => (all ?? []).filter(c => c.parent_slug === slug);

  console.log('\n✅ Фінальна структура категорій:\n');
  for (const p of parents) {
    const kids = childrenOf(p.slug);
    console.log(`📁 ${p.name} (${p.slug})`);
    for (const c of kids) {
      console.log(`   └── ${c.name} (${c.slug})`);
    }
  }
}

main().catch(err => {
  console.error('\n❌ Критична помилка:', err.message);
  process.exit(1);
});
