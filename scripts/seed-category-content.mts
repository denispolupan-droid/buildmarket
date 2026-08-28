/**
 * Засіває category_content зі знімка supabase/seed/category_content.json —
 * знімок словників lib/category-descriptions*.ts на момент переїзду в БД
 * (28.08.2026, 79 uk + 79 ru, 44 гайди).
 *
 *   npx tsx --env-file=.env.local scripts/seed-category-content.mts            # prod (.env.local)
 *   npx tsx --env-file=.env.test  scripts/seed-category-content.mts            # test
 *   … --force   # перезаписати і ті рядки, які вже правили в адмінці (source != seed)
 *
 * Без --force рядки з source 'manual'/'ai' не чіпаються — знімок старіший за них.
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';

const FORCE = process.argv.includes('--force');
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const rows = JSON.parse(readFileSync('supabase/seed/category_content.json', 'utf8')) as { slug: string; lang: string; source: string }[];

const { data: existing, error } = await db.from('category_content').select('slug, lang, source');
if (error) throw error;
const edited = new Set((existing ?? []).filter(r => r.source !== 'seed').map(r => `${r.slug}|${r.lang}`));

const toWrite = rows.filter(r => FORCE || !edited.has(`${r.slug}|${r.lang}`));
for (let i = 0; i < toWrite.length; i += 50) {
  const { error: e } = await db.from('category_content').upsert(toWrite.slice(i, i + 50).map(r => ({ ...r, updated_by: 'seed' })), { onConflict: 'slug,lang' });
  if (e) throw e;
}
console.log(`${process.env.NEXT_PUBLIC_SUPABASE_URL}: записано ${toWrite.length} з ${rows.length}, пропущено правлених ${rows.length - toWrite.length}`);
