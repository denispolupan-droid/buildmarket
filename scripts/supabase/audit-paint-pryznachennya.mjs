/**
 * audit-paint-pryznachennya.mjs
 * Витягує всі унікальні значення "Призначення" для категорії Фарби
 * Запуск: node scripts/supabase/audit-paint-pryznachennya.mjs
 */
import * as dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
);

// Категорія "Фарби" та її підкатегорії (включно з вкладеними)
const { data: allCats } = await supabase.from('categories').select('slug, parent_slug');
const farbyChildren = allCats.filter(c => c.parent_slug === 'farby').map(c => c.slug);
const farbyGrandchildren = allCats.filter(c => farbyChildren.includes(c.parent_slug)).map(c => c.slug);
const slugs = ['farby', ...farbyChildren, ...farbyGrandchildren];
console.log('Категорії:', slugs.join(', '));

// Всі товари у цих категоріях
const { data: products, error } = await supabase
  .from('products')
  .select('sku, name, product_type, category_slug')
  .in('category_slug', slugs);

if (error) { console.error('Помилка products:', error.message); process.exit(1); }
console.log(`\nТоварів: ${products?.length ?? 0}\n`);

// Витягуємо характеристики "Призначення" для цих SKU
const skus = products.map(p => p.sku);
const { data: chars, error: chErr } = await supabase
  .from('product_characteristics')
  .select('product_sku, label, value')
  .in('product_sku', skus)
  .eq('label', 'Призначення');

if (chErr) { console.error('Помилка chars:', chErr.message); process.exit(1); }

// Map SKU → product info
const prodMap = new Map(products.map(p => [p.sku, p]));

// Збираємо статистику по "Призначення"
const stats = new Map();

for (const c of chars) {
  const p = prodMap.get(c.product_sku);
  if (!p) continue;
  const val = c.value;
  if (!stats.has(val)) stats.set(val, { count: 0, types: new Set(), cats: new Set(), examples: [] });
  const s = stats.get(val);
  s.count++;
  s.types.add(p.product_type || '—');
  s.cats.add(p.category_slug || '—');
  if (s.examples.length < 2) s.examples.push(p.name.slice(0, 50));
}

// Сортуємо по кількості
const sorted = [...stats.entries()].sort((a, b) => b[1].count - a[1].count);

console.log('=== Призначення (по частоті) ===\n');
for (const [val, { count, types, cats, examples }] of sorted) {
  console.log(`[${count}] "${val}"`);
  console.log(`    Типи: ${[...types].join(', ')}`);
  console.log(`    Кат:  ${[...cats].join(', ')}`);
  console.log(`    Прикл: ${examples.join(' | ')}`);
  console.log();
}

console.log(`\nВсього унікальних значень: ${stats.size}`);
