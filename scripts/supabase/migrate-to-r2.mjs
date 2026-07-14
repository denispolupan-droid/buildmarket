// One-off migration: copy every object in the Supabase Storage "products" bucket
// to the new Cloudflare R2 bucket, preserving the exact same key (path), so the
// existing /img/products/... URL scheme keeps working unchanged after next.config.ts
// is repointed. Read-only against Supabase — nothing is deleted or modified there.
import { createClient } from '@supabase/supabase-js';
import { S3Client, PutObjectCommand, ListObjectsV2Command, HeadObjectCommand } from '@aws-sdk/client-s3';
import fs from 'fs';
import { createHash } from 'crypto';

const env = Object.fromEntries(
  fs.readFileSync('.env.local', 'utf8').split('\n')
    .filter(l => l.includes('=') && !l.startsWith('#'))
    .map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; })
);

const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
const BUCKET = 'products';

const r2 = new S3Client({
  region: 'auto',
  endpoint: env.R2_ENDPOINT,
  credentials: { accessKeyId: env.R2_ACCESS_KEY_ID, secretAccessKey: env.R2_SECRET_ACCESS_KEY },
});
const R2_BUCKET = env.R2_BUCKET_NAME;

// Recursively list every object under a prefix — Supabase Storage's list() only
// returns one directory level per call, with folders reported as entries whose
// id is null.
async function listAllObjects(prefix = '') {
  const out = [];
  let offset = 0;
  const PAGE = 1000;
  while (true) {
    const { data, error } = await supabase.storage.from(BUCKET).list(prefix, { limit: PAGE, offset });
    if (error) throw new Error(`list(${prefix}) failed: ${error.message}`);
    if (!data || data.length === 0) break;
    for (const entry of data) {
      const fullPath = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.id === null) {
        out.push(...await listAllObjects(fullPath));
      } else {
        out.push({ path: fullPath, size: entry.metadata?.size ?? null, mimetype: entry.metadata?.mimetype ?? null });
      }
    }
    if (data.length < PAGE) break;
    offset += PAGE;
  }
  return out;
}

console.log('Listing all objects in Supabase Storage bucket "products"...');
const objects = await listAllObjects();
console.log(`Found ${objects.length} objects.\n`);

let done = 0, failed = 0, skipped = 0;
const failures = [];
const CONCURRENCY = 10;
let i = 0;

async function worker() {
  while (i < objects.length) {
    const obj = objects[i++];
    try {
      const { data: blob, error: dlErr } = await supabase.storage.from(BUCKET).download(obj.path);
      if (dlErr) throw new Error(`download failed: ${dlErr.message}`);
      const buf = Buffer.from(await blob.arrayBuffer());

      await r2.send(new PutObjectCommand({
        Bucket: R2_BUCKET,
        Key: obj.path,
        Body: buf,
        ContentType: obj.mimetype ?? blob.type ?? 'application/octet-stream',
      }));

      done++;
      if (done % 100 === 0) console.log(`  ${done}/${objects.length} copied...`);
    } catch (e) {
      failed++;
      failures.push({ path: obj.path, error: e.message });
      console.error(`  FAILED: ${obj.path} — ${e.message}`);
    }
  }
}

console.log(`Copying with ${CONCURRENCY} parallel workers...\n`);
await Promise.all(Array.from({ length: CONCURRENCY }, worker));

console.log(`\n=== Copy phase done: ${done} copied, ${failed} failed, ${objects.length} total ===\n`);

if (failures.length) {
  console.log('Failures:');
  for (const f of failures) console.log(`  - ${f.path}: ${f.error}`);
}

// Verification pass: count objects now in R2, compare to source list
console.log('\nVerifying R2 bucket contents...');
let r2Count = 0;
let r2ContinuationToken = undefined;
const r2Keys = new Set();
do {
  const resp = await r2.send(new ListObjectsV2Command({ Bucket: R2_BUCKET, ContinuationToken: r2ContinuationToken }));
  for (const o of resp.Contents ?? []) r2Keys.add(o.Key);
  r2Count += resp.Contents?.length ?? 0;
  r2ContinuationToken = resp.NextContinuationToken;
} while (r2ContinuationToken);

const sourcePaths = new Set(objects.map(o => o.path));
const missingInR2 = [...sourcePaths].filter(p => !r2Keys.has(p));

console.log(`Source objects: ${sourcePaths.size}`);
console.log(`R2 objects:     ${r2Count}`);
console.log(`Missing in R2:  ${missingInR2.length}`);
if (missingInR2.length) {
  console.log('Missing paths:');
  for (const p of missingInR2.slice(0, 50)) console.log(`  - ${p}`);
}

console.log(missingInR2.length === 0 && failed === 0
  ? '\n✅ MIGRATION COMPLETE — all objects verified present in R2.'
  : '\n⚠️  MIGRATION INCOMPLETE — see failures/missing above, do not cut over yet.');
