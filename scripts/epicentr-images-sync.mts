/**
 * Генерує статичні JPEG для Епіцентру (R2: epicentr/{шлях фото}.jpg) для всіх
 * активних товарів і оновлює маніфест. Лише додає нові об'єкти під префіксом
 * epicentr/ — фото сайту не чіпає.
 *
 *   npx tsx --env-file=.env.local scripts/epicentr-images-sync.mts [--force]
 */
import * as supabaseNS from '../lib/supabase';
import * as pagNS from '../lib/db-paginate';
import * as imgNS from '../lib/epicentr-images';
type Mod<T> = T & { default?: T };
const { createServiceClient } = (supabaseNS as Mod<typeof supabaseNS>).default ?? supabaseNS;
const { fetchAllRows } = (pagNS as Mod<typeof pagNS>).default ?? pagNS;
const { ensureEpicentrJpegs, webpRelFromImage } = (imgNS as Mod<typeof imgNS>).default ?? imgNS;

const db = createServiceClient();
const rows = await fetchAllRows<{ sku: string; image: string | null }>((f, t) =>
  db.from('products').select('sku, image').eq('is_active', true).order('sku').range(f, t));
const rels = rows.map(r => webpRelFromImage(r.image)).filter((r): r is string => !!r);
console.log('товарів:', rows.length, 'WebP-фото:', new Set(rels).size);

const started = Date.now();
const r = await ensureEpicentrJpegs(rels, { concurrency: 8, force: process.argv.includes('--force') });
console.log({ ...r, seconds: Math.round((Date.now() - started) / 1000) });
