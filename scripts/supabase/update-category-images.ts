/**
 * update-category-images.ts
 * Оновлює поле image для всіх товарів у заданій категорії.
 *
 * Запуск:
 *   npx tsx scripts/supabase/update-category-images.ts <category_slug> <image_path>
 *
 * Приклад:
 *   npx tsx scripts/supabase/update-category-images.ts farby-3v1-alkidni /img/products/3v1_red.jpg
 */

import * as dotenv from 'dotenv';
import path from 'path';
import { createServiceClient } from '../../lib/supabase';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

async function main() {
  const [categorySlug, imagePath] = process.argv.slice(2);

  if (!categorySlug || !imagePath) {
    console.error('Usage: npx tsx scripts/supabase/update-category-images.ts <category_slug> <image_path>');
    process.exit(1);
  }

  const supabase = createServiceClient();

  const { data: products, error: fetchErr } = await supabase
    .from('products')
    .select('sku, image')
    .eq('category_slug', categorySlug);

  if (fetchErr) {
    console.error('Fetch error:', fetchErr.message);
    process.exit(1);
  }

  if (!products || products.length === 0) {
    console.log(`No products found in category "${categorySlug}"`);
    return;
  }

  console.log(`Found ${products.length} product(s) in "${categorySlug}". Updating image → ${imagePath}`);

  const skus = products.map((p: { sku: string }) => p.sku);

  const { error: updateErr } = await supabase
    .from('products')
    .update({ image: imagePath })
    .in('sku', skus);

  if (updateErr) {
    console.error('Update error:', updateErr.message);
    process.exit(1);
  }

  console.log(`Done. Updated ${skus.length} product(s):`);
  products.forEach((p: { sku: string; image: string | null }) =>
    console.log(`  ${p.sku}  (was: ${p.image ?? 'null'})`),
  );
}

main();
