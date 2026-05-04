import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';

const envLines = readFileSync('.env.local', 'utf-8').split('\n');
const env = {};
for (const line of envLines) {
  const m = line.match(/^([^#=\s]+)\s*=\s*(.*)$/);
  if (m) env[m[1]] = m[2].trim();
}
const supabase = createClient(env['NEXT_PUBLIC_SUPABASE_URL'], env['SUPABASE_SERVICE_ROLE_KEY']);

async function audit() {
  // Get all products with their category
  const { data: products, error } = await supabase
    .from('products')
    .select('sku, name, brand, category_slug, product_type, color, volume')
    .eq('is_active', true);

  if (error) {
    console.error('Error fetching products:', error);
    return;
  }

  // Get categories
  const { data: categories } = await supabase
    .from('categories')
    .select('slug, name, parent_slug');

  const catMap = Object.fromEntries(categories.map(c => [c.slug, c]));

  // Group products by category
  const byCategory = {};
  for (const p of products) {
    const slug = p.category_slug ?? 'uncategorized';
    (byCategory[slug] ??= []).push(p);
  }

  console.log('\n=== АУДИТ ФІЛЬТРІВ МАГАЗИНУ ===\n');

  for (const [slug, prods] of Object.entries(byCategory).sort((a,b) => b[1].length - a[1].length)) {
    const cat = catMap[slug];
    const catName = cat?.name ?? slug;

    // Collect unique filter values
    const brands = new Set(prods.map(p => p.brand).filter(Boolean));
    const types = new Set(prods.map(p => p.product_type).filter(Boolean));
    const volumes = new Set(prods.map(p => p.volume).filter(Boolean));
    const colors = new Set(prods.map(p => p.color).filter(Boolean));

    // Find products without filter values
    const noType = prods.filter(p => !p.product_type || p.product_type === 'Не вказано');
    const noVolume = prods.filter(p => !p.volume || p.volume === 'Не вказано');
    const noColor = prods.filter(p => !p.color || p.color === 'Не вказано');

    // Only report categories with issues
    if (noType.length > 0 || noVolume.length > 0) {
      console.log(`\n📁 ${catName} (${slug}) — ${prods.length} товарів`);
      console.log(`   Бренди: ${[...brands].join(', ')}`);
      console.log(`   Типи: ${[...types].join(', ') || '(немає)'}`);
      console.log(`   Об\'єми: ${[...volumes].join(', ') || '(немає)'}`);

      if (noType.length > 0 && types.size > 0) {
        console.log(`\n   ⚠️  БЕЗ ТИПУ (${noType.length}):`);
        noType.slice(0, 10).forEach(p => console.log(`      - ${p.sku}: ${p.name}`));
        if (noType.length > 10) console.log(`      ... та ще ${noType.length - 10}`);
      }

      if (noVolume.length > 0 && volumes.size > 0) {
        console.log(`\n   ⚠️  БЕЗ ОБ'ЄМУ (${noVolume.length}):`);
        noVolume.slice(0, 10).forEach(p => console.log(`      - ${p.sku}: ${p.name}`));
        if (noVolume.length > 10) console.log(`      ... та ще ${noVolume.length - 10}`);
      }
    }
  }

  // Summary
  const totalNoType = products.filter(p => !p.product_type || p.product_type === 'Не вказано').length;
  const totalNoVolume = products.filter(p => !p.volume || p.volume === 'Не вказано').length;

  console.log('\n\n=== ПІДСУМОК ===');
  console.log(`Всього товарів: ${products.length}`);
  console.log(`Без типу: ${totalNoType}`);
  console.log(`Без об'єму: ${totalNoVolume}`);
}

audit();
