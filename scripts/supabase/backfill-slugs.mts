// Бекфіл ЧПУ-слагів для всіх товарів (включно з неактивними — щоб 308 працював скрізь).
// Ідемпотентний: пропускає товари, у яких slug уже є.
// Запуск: npx tsx --env-file=.env.local scripts/supabase/backfill-slugs.mts
import { createClient } from '@supabase/supabase-js';
import { pathToFileURL } from 'node:url';
import path from 'node:path';

const slugLib = await import(pathToFileURL(path.resolve('lib/seo/slug.ts')).href) as
  typeof import('../../lib/seo/slug');
const { generateProductSlug } = slugLib;

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

const { data: products, error } = await supabase
  .from('products')
  .select('sku, name, brand, volume, slug')
  .order('sku');
if (error) throw error;

const used = new Set((products ?? []).map(p => p.slug).filter(Boolean) as string[]);
let ok = 0, skipped = 0, collisions = 0;

for (const p of products ?? []) {
  if (p.slug) { skipped++; continue; }
  let slug = generateProductSlug(p);
  if (!slug) slug = p.sku.toLowerCase();
  if (used.has(slug)) { slug = `${slug}-${p.sku.toLowerCase()}`; collisions++; }
  used.add(slug);
  const { error: upErr } = await supabase.from('products').update({ slug }).eq('sku', p.sku);
  if (upErr) { console.error(`FAIL ${p.sku}: ${upErr.message}`); continue; }
  ok++;
  if (ok <= 5 || ok % 100 === 0) console.log(`${p.sku} -> ${slug}`);
}
console.log(`DONE ok=${ok} skipped=${skipped} collisions=${collisions}`);
