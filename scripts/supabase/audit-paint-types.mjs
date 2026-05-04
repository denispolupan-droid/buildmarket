/**
 * audit-paint-types.mjs
 * Витягує всі унікальні значення product_type для категорії Фарби
 * Запуск: node scripts/supabase/audit-paint-types.mjs
 */
import * as dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
);

// Категорія "Фарби" та її підкатегорії
const { data: allCats } = await supabase.from('categories').select('slug, parent_slug, name');
const farbyChildren = allCats.filter(c => c.parent_slug === 'farby').map(c => c.slug);
const farbyGrandchildren = allCats.filter(c => farbyChildren.includes(c.parent_slug)).map(c => c.slug);
const slugs = ['farby', ...farbyChildren, ...farbyGrandchildren];

console.log('Категорії:', slugs.join(', '));

// Всі товари у цих категоріях
const { data: products, error } = await supabase
  .from('products')
  .select('sku, name, product_type, category_slug')
  .in('category_slug', slugs);

if (error) { console.error('Помилка:', error.message); process.exit(1); }
console.log(`\nТоварів: ${products.length}\n`);

// Збираємо статистику по product_type
const stats = new Map();

for (const p of products) {
  const val = p.product_type || '(пусто)';
  if (!stats.has(val)) stats.set(val, { count: 0, cats: new Map(), examples: [] });
  const s = stats.get(val);
  s.count++;
  s.cats.set(p.category_slug, (s.cats.get(p.category_slug) || 0) + 1);
  if (s.examples.length < 2) s.examples.push(p.name.slice(0, 50));
}

// Сортуємо по кількості
const sorted = [...stats.entries()].sort((a, b) => b[1].count - a[1].count);

// Мапа slug → name для зручності
const catNames = new Map(allCats.map(c => [c.slug, c.name]));

console.log('=== product_type (по частоті) ===\n');
for (const [val, { count, cats, examples }] of sorted) {
  const catList = [...cats.entries()]
    .map(([slug, cnt]) => `${catNames.get(slug) || slug}(${cnt})`)
    .join(', ');
  console.log(`[${count}] "${val}"`);
  console.log(`    Кат: ${catList}`);
  console.log(`    Прикл: ${examples.join(' | ')}`);
  console.log();
}

console.log(`Всього унікальних значень: ${stats.size}`);
