/**
 * rename-categories.mjs
 * Запуск: node scripts/supabase/rename-categories.mjs
 */
import * as dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
);

const renames = [
  { slug: 'alkidni-farby', name: 'Алкідні емалі' },
  { slug: 'farby-3v1',     name: 'Фарби 3 в 1'   },
];

for (const { slug, name } of renames) {
  const { error } = await supabase.from('categories').update({ name }).eq('slug', slug);
  if (error) console.error(`❌ ${slug}:`, error.message);
  else       console.log(`✅ ${slug} → "${name}"`);
}
