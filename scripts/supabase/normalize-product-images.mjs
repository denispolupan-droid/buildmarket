/**
 * normalize-product-images.mjs
 *
 * Product photos have inconsistent padding baked in by suppliers — some fill the
 * frame, some sit tiny in the middle of a mostly-white square. That makes the
 * shop grid look uneven card-to-card. This trims each image down to its content
 * bounding box, then re-frames it onto a consistent canvas so every product
 * occupies roughly the same share of the frame.
 *
 * Before overwriting anything in Storage, the original bytes are backed up
 * locally so a bad run can be undone by re-uploading from the backup folder.
 *
 * Usage:
 *   npx tsx scripts/supabase/normalize-product-images.mjs             # full run
 *   npx tsx scripts/supabase/normalize-product-images.mjs --limit 5   # test on 5 images first
 *   npx tsx scripts/supabase/normalize-product-images.mjs --dry-run   # process + report, don't upload
 */

import * as dotenv from 'dotenv';
import * as path from 'path';
import * as fs from 'fs';
import sharp from 'sharp';
import { createClient } from '@supabase/supabase-js';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

const BUCKET = 'products';
const CANVAS = 800;     // final image is CANVAS x CANVAS
const MARGIN = 40;      // uniform white margin on each side
const INNER  = CANVAS - MARGIN * 2; // the trimmed product is scaled to fit inside this

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const limitArg = args.find(a => a.startsWith('--limit'));
const limit = limitArg ? parseInt(limitArg.split('=')[1] ?? args[args.indexOf(limitArg) + 1], 10) : null;

const BACKUP_DIR = path.resolve(process.cwd(), 'scripts/supabase/.image-backup');

async function main() {
  const { data: rows, error } = await supabase
    .from('products')
    .select('image')
    .like('image', '/img/products/%')
    .not('image', 'is', null);
  if (error) throw new Error(`Fetch failed: ${error.message}`);

  const uniquePaths = [...new Set(rows.map(r => r.image.replace('/img/products/', '')))];
  const targets = limit ? uniquePaths.slice(0, limit) : uniquePaths;

  console.log(`${uniquePaths.length} unique images total, processing ${targets.length}${dryRun ? ' (dry run)' : ''}\n`);

  fs.mkdirSync(BACKUP_DIR, { recursive: true });

  let ok = 0, failed = 0, skipped = 0;
  const failures = [];

  for (const [i, storagePath] of targets.entries()) {
    process.stdout.write(`[${i + 1}/${targets.length}] ${storagePath} ... `);
    try {
      const { data: fileBlob, error: dlErr } = await supabase.storage.from(BUCKET).download(storagePath);
      if (dlErr || !fileBlob) { console.log('SKIP (download failed: ' + (dlErr?.message ?? 'no data') + ')'); skipped++; continue; }

      const inputBuffer = Buffer.from(await fileBlob.arrayBuffer());

      // Backup original bytes before touching anything remote
      const backupPath = path.join(BACKUP_DIR, storagePath);
      fs.mkdirSync(path.dirname(backupPath), { recursive: true });
      fs.writeFileSync(backupPath, inputBuffer);

      const trimmed = await sharp(inputBuffer)
        .trim({ threshold: 20 })
        .toBuffer();

      const normalized = await sharp(trimmed)
        .resize(INNER, INNER, { fit: 'contain', background: { r: 255, g: 255, b: 255, alpha: 1 } })
        .extend({ top: MARGIN, bottom: MARGIN, left: MARGIN, right: MARGIN, background: { r: 255, g: 255, b: 255, alpha: 1 } })
        .webp({ quality: 82 })
        .toBuffer();

      if (dryRun) {
        const outPath = path.join(BACKUP_DIR, '.preview', storagePath);
        fs.mkdirSync(path.dirname(outPath), { recursive: true });
        fs.writeFileSync(outPath, normalized);
        console.log(`OK (preview saved, ${Math.round(normalized.length / 1024)} KB)`);
      } else {
        const { error: upErr } = await supabase.storage.from(BUCKET)
          .upload(storagePath, normalized, { contentType: 'image/webp', upsert: true });
        if (upErr) throw new Error(upErr.message);
        console.log(`OK (${Math.round(normalized.length / 1024)} KB)`);
      }
      ok++;
    } catch (e) {
      console.log('FAIL: ' + (e instanceof Error ? e.message : String(e)));
      failed++;
      failures.push({ storagePath, error: e instanceof Error ? e.message : String(e) });
    }
  }

  console.log(`\nDone. ok=${ok} failed=${failed} skipped=${skipped}`);
  if (failures.length) {
    console.log('\nFailures:');
    for (const f of failures) console.log(`  ${f.storagePath}: ${f.error}`);
  }
  console.log(`\nBackups of originals saved under: ${BACKUP_DIR}`);
}

main().catch(e => { console.error(e); process.exit(1); });
