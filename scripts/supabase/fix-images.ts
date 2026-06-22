/**
 * fix-images.ts
 * 1. Завантажує 3v1_red.jpg у Supabase Storage (bucket "products")
 * 2. Оновлює image для всіх товарів категорії farby-3v1-alkidni → повний Supabase URL
 * 3. Копіює image з 2100-014 у 2100-015
 *
 * Запуск:
 *   npx tsx scripts/supabase/fix-images.ts
 */

import * as dotenv from 'dotenv';
import * as path from 'path';
import * as fs from 'fs';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

const LOCAL_FILE  = 'K:\\Users\\polupan.denis\\Downloads\\3v1_red.jpg';
const STORAGE_KEY = '3v1_red.jpg';
const BUCKET      = 'products';
const CATEGORY    = 'farby-3v1-alkidni';
const SKU_SRC     = '2100-014';
const SKU_DST     = '2100-015';

async function uploadImage() {
  const fileBuffer = fs.readFileSync(LOCAL_FILE);

  // upsert=true щоб не падало якщо файл вже є
  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(STORAGE_KEY, fileBuffer, {
      contentType: 'image/jpeg',
      upsert: true,
    });

  if (error) throw new Error(`Storage upload failed: ${error.message}`);

  const url = `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${STORAGE_KEY}`;
  console.log(`✓ Uploaded to Storage: ${url}`);
  return url;
}

async function updateCategoryImages(imageUrl: string) {
  const { data: products, error: fetchErr } = await supabase
    .from('products')
    .select('sku')
    .eq('category_slug', CATEGORY);

  if (fetchErr) throw new Error(`Fetch failed: ${fetchErr.message}`);
  if (!products?.length) { console.log('No products in category'); return; }

  const skus = products.map((p: { sku: string }) => p.sku);

  const { error: updateErr } = await supabase
    .from('products')
    .update({ image: imageUrl })
    .in('sku', skus);

  if (updateErr) throw new Error(`Category update failed: ${updateErr.message}`);
  console.log(`✓ Updated ${skus.length} product(s) in "${CATEGORY}"`);
}

async function copyImage() {
  const { data, error: fetchErr } = await supabase
    .from('products')
    .select('sku, image')
    .eq('sku', SKU_SRC)
    .single();

  if (fetchErr || !data) throw new Error(`Cannot fetch ${SKU_SRC}: ${fetchErr?.message}`);
  const srcImage: string = (data as { sku: string; image: string }).image;

  const { error: updateErr } = await supabase
    .from('products')
    .update({ image: srcImage })
    .eq('sku', SKU_DST);

  if (updateErr) throw new Error(`Copy image failed: ${updateErr.message}`);
  console.log(`✓ ${SKU_DST}.image = ${srcImage}  (copied from ${SKU_SRC})`);
}

async function main() {
  try {
    const imageUrl = await uploadImage();
    await updateCategoryImages(imageUrl);
    await copyImage();
    console.log('\nDone.');
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

main();
