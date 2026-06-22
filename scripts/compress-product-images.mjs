/**
 * Compress and convert all product images in Supabase Storage to WebP.
 * Downloads each image, converts via sharp (max 800×800, quality 82), re-uploads.
 * Updates `products.image` in DB where the extension changes.
 *
 * Usage: node scripts/compress-product-images.mjs [--dry-run] [--brand=aura]
 */
import { createClient } from '@supabase/supabase-js';
import sharp from 'sharp';
import fs from 'fs';

const args = process.argv.slice(2);
const DRY_RUN     = args.includes('--dry-run');
const BRAND_FILTER = args.find(a => a.startsWith('--brand='))?.split('=')[1] ?? null;

const env = Object.fromEntries(
  fs.readFileSync('.env.local', 'utf8').split('\n')
    .filter(l => l.includes('=') && !l.startsWith('#'))
    .map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; })
);

const SUPABASE_URL = env['NEXT_PUBLIC_SUPABASE_URL'];
const SERVICE_KEY  = env['SUPABASE_SERVICE_ROLE_KEY'];
const BUCKET       = 'products';

const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

async function fetchImage(publicUrl) {
  const res = await fetch(publicUrl);
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${publicUrl}`);
  return Buffer.from(await res.arrayBuffer());
}

async function processOne({ sku, image, brand }) {
  // image looks like "/img/products/aura/1604-021.png"
  const match = image.match(/^\/img\/products\/(.+)$/);
  if (!match) {
    console.warn(`  ⚠ ${sku}: unexpected image path: ${image}`);
    return null;
  }
  const storagePath = match[1]; // e.g. "aura/1604-021.png"
  const publicUrl = `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${storagePath}`;

  // Download
  let srcBuf;
  try {
    srcBuf = await fetchImage(publicUrl);
  } catch (e) {
    console.warn(`  ⚠ ${sku}: download failed — ${e.message}`);
    return null;
  }
  if (!srcBuf.length) {
    console.warn(`  ⚠ ${sku}: empty file at ${storagePath}`);
    return null;
  }

  const srcKB = Math.round(srcBuf.length / 1024);

  // Convert to WebP via sharp
  let webpBuf;
  try {
    webpBuf = await sharp(srcBuf)
      .resize(800, 800, { fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 82 })
      .toBuffer();
  } catch (e) {
    console.warn(`  ⚠ ${sku}: sharp failed — ${e.message}`);
    return null;
  }

  const dstKB = Math.round(webpBuf.length / 1024);
  const saving = Math.round((1 - webpBuf.length / srcBuf.length) * 100);

  // New storage path: same folder but .webp extension
  const basePath = storagePath.replace(/\.[^.]+$/, '');
  const newStoragePath = `${basePath}.webp`;
  const newImageUrl = `/img/products/${newStoragePath}`;
  const pathChanged  = newStoragePath !== storagePath;

  console.log(`  ${sku}: ${srcKB}KB → ${dstKB}KB (${saving}% smaller)  ${pathChanged ? `[${storagePath} → ${newStoragePath}]` : ''}`);

  if (DRY_RUN) return null;

  // Upload WebP
  const { error: upErr } = await supabase.storage
    .from(BUCKET)
    .upload(newStoragePath, webpBuf, {
      contentType: 'image/webp',
      upsert: true,
    });

  if (upErr) {
    console.error(`    ✗ Upload failed: ${upErr.message}`);
    return null;
  }

  return pathChanged ? { sku, newImageUrl } : null;
}

async function main() {
  console.log(`Mode: ${DRY_RUN ? 'DRY RUN (no changes)' : 'LIVE'}`);
  if (BRAND_FILTER) console.log(`Brand filter: ${BRAND_FILTER}`);
  console.log('');

  let query = supabase.from('products').select('sku, brand, image').not('image', 'is', null);
  if (BRAND_FILTER) query = query.eq('brand', BRAND_FILTER.toUpperCase());

  const { data: products, error } = await query;
  if (error) { console.error(error.message); process.exit(1); }

  console.log(`Found ${products.length} products with images\n`);

  const dbUpdates = [];
  let ok = 0, skip = 0;

  for (const p of products) {
    const result = await processOne(p);
    if (result) dbUpdates.push(result);
    else skip++;
    ok++;
  }

  console.log(`\nProcessed ${ok} images, ${dbUpdates.length} DB path updates needed\n`);

  if (!DRY_RUN && dbUpdates.length > 0) {
    console.log('Updating DB...');
    for (const { sku, newImageUrl } of dbUpdates) {
      const { error: dbErr } = await supabase
        .from('products')
        .update({ image: newImageUrl })
        .eq('sku', sku);
      if (dbErr) {
        console.error(`  ✗ DB update failed for ${sku}: ${dbErr.message}`);
      } else {
        console.log(`  ✓ ${sku} → ${newImageUrl}`);
      }
    }
  }

  console.log('\nDone!');
}

main().catch(console.error);
