/**
 * Увімкнути участь в Епіцентрі для всіх активних товарів (on_epicentr = true).
 * Бекап поточних прапорців — scripts/.epicentr-enable-backup-<ts>.json.
 *   npx tsx --env-file=.env.local scripts/epicentr-enable-all.mts [--off]
 */
import { writeFileSync } from 'node:fs';
import * as supabaseNS from '../lib/supabase';
import * as pagNS from '../lib/db-paginate';
type Mod<T> = T & { default?: T };
const { createServiceClient } = (supabaseNS as Mod<typeof supabaseNS>).default ?? supabaseNS;
const { fetchAllRows } = (pagNS as Mod<typeof pagNS>).default ?? pagNS;

const on = !process.argv.includes('--off');
const db = createServiceClient();
const rows = await fetchAllRows<{ sku: string; on_epicentr: boolean }>((f, t) =>
  db.from('products').select('sku, on_epicentr').eq('is_active', true).order('sku').range(f, t));
const backup = `scripts/.epicentr-enable-backup-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
writeFileSync(backup, JSON.stringify(rows, null, 2));
const { error, count } = await db.from('products').update({ on_epicentr: on }, { count: 'exact' }).eq('is_active', true);
if (error) throw error;
console.log({ backup, before_on: rows.filter(r => r.on_epicentr).length, total: rows.length, updated: count, on });
