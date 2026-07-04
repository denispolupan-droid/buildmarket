/**
 * remove-aura-backgrounds.mjs
 *
 * Downloads each AURA product image from Supabase Storage (1200×1200 PNG with
 * white background), removes the white background via BFS flood-fill from the
 * image edges, and re-uploads the result as a transparent PNG.
 *
 * The uploaded images have ~72 px of pure-white padding on all sides, so the
 * flood-fill seeds from every edge pixel and reliably reaches the product
 * background without touching white areas INSIDE the product.
 *
 * Usage:  node scripts/remove-aura-backgrounds.mjs
 */

import { createClient } from '@supabase/supabase-js';
import sharp from 'sharp';
import { readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

/* ── Config ─────────────────────────────────────────────────────────────── */
const __dirname = path.dirname(fileURLToPath(import.meta.url));

function loadEnv() {
  const raw = readFileSync(path.join(__dirname, '../.env.local'), 'utf8');
  return Object.fromEntries(
    raw.split('\n')
      .filter(l => l.includes('=') && !l.startsWith('#'))
      .map(l => { const [k, ...v] = l.split('='); return [k.trim(), v.join('=').trim()]; })
  );
}

const env = loadEnv();
const SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY  = env.SUPABASE_SERVICE_ROLE_KEY;
const BUCKET       = 'products';
// Pixels with all channels >= this value are considered background
// 252 = only near-pure white; keeps light-coloured product surfaces intact
const THRESHOLD    = 252;
// If more than this fraction of pixels become transparent the image is flagged
// as "product eaten" and restored to white background
const MAX_TRANSP   = 0.35;

/* ── Background removal ─────────────────────────────────────────────────── */
async function removeBackground(inputBuffer) {
  const { data, info } = await sharp(inputBuffer)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const { width, height } = info;
  const CH  = 4;           // RGBA
  const ROW = width * CH;

  const isWhite = (x, y) => {
    const i = y * ROW + x * CH;
    return data[i] >= THRESHOLD && data[i + 1] >= THRESHOLD && data[i + 2] >= THRESHOLD;
  };

  const visited = new Uint8Array(width * height);
  // Use flat [x, y, x, y …] pairs on a stack (DFS — no per-element allocations)
  const stack = new Int32Array(width * height * 2);
  let top = 0;

  const push = (x, y) => {
    const vi = y * width + x;
    if (visited[vi] || !isWhite(x, y)) return;
    visited[vi] = 1;
    stack[top++] = x;
    stack[top++] = y;
  };

  // Seed from all four edges
  for (let x = 0; x < width; x++) {
    push(x, 0);
    push(x, height - 1);
  }
  for (let y = 1; y < height - 1; y++) {
    push(0, y);
    push(width - 1, y);
  }

  // DFS flood fill
  while (top > 0) {
    const y = stack[--top];
    const x = stack[--top];

    // Make transparent
    data[y * ROW + x * CH + 3] = 0;

    if (x > 0)         push(x - 1, y);
    if (x < width - 1) push(x + 1, y);
    if (y > 0)         push(x, y - 1);
    if (y < height - 1) push(x, y + 1);
  }

  // Count how many pixels were made transparent
  let transparentCount = 0;
  for (let i = 3; i < data.length; i += CH) {
    if (data[i] === 0) transparentCount++;
  }
  const transparentFraction = transparentCount / (width * height);

  return {
    buffer: await sharp(Buffer.from(data.buffer), {
      raw: { width, height, channels: CH },
    })
      .png({ compressionLevel: 8 })
      .toBuffer(),
    transparentFraction,
  };
}

/* ── Main ───────────────────────────────────────────────────────────────── */
async function main() {
  const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

  // Fetch all products with AURA images
  const { data: products, error } = await supabase
    .from('products')
    .select('id, name, image')
    .like('image', '/img/products/aura/%');

  if (error) throw error;
  console.log(`\nFound ${products.length} AURA products with images\n`);

  let done = 0, reverted = 0, failed = 0;
  const revertList = [];

  for (const product of products) {
    // "/img/products/aura/2108-012.png?v=abc123"  →  "aura/2108-012.png"
    const storagePath = product.image.replace('/img/products/', '').split('?')[0];
    const n = done + reverted + failed + 1;
    const label = `[${n}/${products.length}]`;

    try {
      // 1. Download current PNG from Supabase Storage
      const { data: fileData, error: dlErr } = await supabase.storage
        .from(BUCKET)
        .download(storagePath);

      if (dlErr) throw new Error(`download: ${dlErr.message}`);

      const inputBuf = Buffer.from(await fileData.arrayBuffer());

      // 2. Remove background (now with threshold 252)
      const { buffer: processed, transparentFraction } = await removeBackground(inputBuf);

      // 3. Safety check — if too many pixels were removed the product itself was
      //    likely affected (e.g. clear-bottle products like Lasur Aqua).
      //    Restore a clean white-background version instead.
      if (transparentFraction > MAX_TRANSP) {
        console.log(`⚠  ${label} ${Math.round(transparentFraction * 100)}% transparent → restoring white bg  ${storagePath}`);

        // Re-create 1200×1200 with flat white background from the download
        const whiteVersion = await sharp(inputBuf)
          .flatten({ background: { r: 255, g: 255, b: 255 } })
          .resize(1200, 1200, { fit: 'contain', background: { r: 255, g: 255, b: 255 } })
          .png({ compressionLevel: 8 })
          .toBuffer();

        const { error: ulErr2 } = await supabase.storage
          .from(BUCKET)
          .update(storagePath, whiteVersion, { contentType: 'image/png', upsert: true });

        if (ulErr2) throw new Error(`upload(revert): ${ulErr2.message}`);
        reverted++;
        revertList.push(storagePath);
        continue;
      }

      // 4. Verify dimensions
      const outMeta = await sharp(processed).metadata();
      if (outMeta.width !== 1200 || outMeta.height !== 1200) {
        throw new Error(`unexpected output size: ${outMeta.width}×${outMeta.height}`);
      }

      // 5. Re-upload transparent version
      const { error: ulErr } = await supabase.storage
        .from(BUCKET)
        .update(storagePath, processed, {
          contentType: 'image/png',
          upsert: true,
          cacheControl: '3600',
        });

      if (ulErr) throw new Error(`upload: ${ulErr.message}`);

      done++;
      const sizeKb = Math.round(processed.length / 1024);
      const pct = Math.round(transparentFraction * 100);
      console.log(`✓ ${label} ${storagePath}  (${sizeKb} KB, ${pct}% transp)`);
    } catch (err) {
      failed++;
      console.error(`✗ ${label} ${storagePath}: ${err.message}`);
    }
  }

  console.log(`\n──────────────────────────────────`);
  console.log(`Transparent: ${done}  White-restored: ${reverted}  Failed: ${failed}`);
  if (revertList.length > 0) {
    console.log('\nRestored to white background (clear/light product):');
    revertList.forEach(p => console.log('  •', p));
  }
  if (failed > 0) console.log('Re-run the script to retry failed items.');
}

main().catch(err => { console.error(err); process.exit(1); });
