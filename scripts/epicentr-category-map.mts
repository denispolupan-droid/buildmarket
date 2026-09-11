/**
 * Мапа наших категорій на коди дерева Епіцентру (categories.epicentr_category_code).
 *
 * Коди — з /v2/pim/categories (Merchant API) станом на 2026-09-11. Скрипт
 * ідемпотентний: пише лише порожні коди (або всі — з --force), перед записом
 * зберігає бекап у scripts/.epicentr-category-map-backup-<ts>.json.
 *
 *   npx tsx --env-file=.env.local scripts/epicentr-category-map.mts [--force] [--dry]
 */
import { writeFileSync } from 'node:fs';
import * as supabaseNS from '../lib/supabase';
type Mod<T> = T & { default?: T };
const { createServiceClient } = (supabaseNS as Mod<typeof supabaseNS>).default ?? supabaseNS;

export const EPICENTR_CATEGORY_MAP: Record<string, string> = {
  // Будівельна хімія
  'akrylovi-germetyky': '4030', 'bitumni-germetyky': '4030', 'neytralny-germetyky': '4030', 'poliuretanovi-germetyky': '4030',
  'sylikonovi-germetyky': '4030', 'zharostiyki-germetyky': '4030', 'ms-polymerni-hermetyky': '4030',
  'nytka-dlya-trub': '6903',                       // Сантехніка > Засоби герметизації
  'pistoletna-pina': '4029', 'pobutova-pina': '4029', 'vohnezakhysna-pina': '4029', 'ochysnyky': '4029',
  'pina-klei': '4052',
  'bitumni-mastyky': '4035', 'hidroizolyatsiyni-mastyky': '4035', 'praimery': '4036',
  'antygrybok': '4038', 'gruntivky-gotovi': '4036', 'gruntivky-kontsentraty': '4036', 'grunty': '4036',
  'betonokontakt': '4037', 'shpaklivky': '3939', 'plastyfikatory-dlya-betonu': '4031',
  // Клеї
  'epoksydni-klei': '4051', 'kontaktnyi-klei': '4051', 'super-klei': '4051', 'klei-dlya-shpaler': '3216',
  'montazhnyi-klei': '4041', 'pva-ta-stolyarnyi': '4043', 'klei-dlya-plytky': '4046',
  // Затирки
  'zamazky-tsementni': '2326', 'zamazky-epoksydni': '2326',
  // Лакофарбові
  'antyseptyki': '3206', 'zakhysni-pokryttya': '3206', 'morylky': '3206', 'laky': '3199', 'koloranty': '3203', 'rozchynnyky': '3207',
  'farby-3v1-alkidni': '3198', 'farby-3v1-akrylovi': '3198', 'moltkovi-farby': '3198', 'alkidni-farby': '3198',
  'vodoemiulsiyni-interierni': '3198', 'farby-dlya-pidlohy': '3198', 'vodoemiulsiyni-fasadni': '3198', 'farby-dlya-radiatoriv': '3198',
  // Стрічки, сітки
  'izolyatsiyni-strichky': '5330', 'hermetyzuyucha-strichka': '5330', 'montazhna-strichka': '4295',
  'zvukoizolyatsiyna-strichka': '4027', 'malyarna-strichka': '2660', 'strichka-dlya-shviv': '3960',
  'sitky-armuvalni': '3957', 'sklopolotno': '3956',
  // Інше
  'vologopoglinachi': '4856', 'dyubeli-ta-ankery': '4269', 'shurupy-ta-samorizy': '4275',
  // Інструмент
  'vidrizni-dysky': '2587', 'shlifuvalny': '3009', 'vytratni-materialy': '2599', 'bury-ta-sverdla': '2591',
  'pistolety-dlya-piny': '2624', 'pistolety': '2624', 'vymiriuvalny': '2650', 'kysti-ta-valy': '2659',
  'shpateli': '2665', 'elektrody': '2594',
};

const force = process.argv.includes('--force');
const dry   = process.argv.includes('--dry');
const db = createServiceClient();

const { data: cats, error } = await db.from('categories').select('slug, name, epicentr_category_code').order('slug').limit(1000);
if (error) throw error;

const backup = `scripts/.epicentr-category-map-backup-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
writeFileSync(backup, JSON.stringify(cats, null, 2));
console.log('backup:', backup);

let updated = 0, skipped = 0, unmapped: string[] = [];
for (const c of cats ?? []) {
  const code = EPICENTR_CATEGORY_MAP[c.slug];
  if (!code) { unmapped.push(c.slug); continue; }
  if (c.epicentr_category_code && !force) { skipped++; continue; }
  if (!dry) {
    const { error: e } = await db.from('categories').update({ epicentr_category_code: code }).eq('slug', c.slug);
    if (e) { console.error('update failed', c.slug, e.message); continue; }
  }
  updated++;
  console.log(`${c.slug} → ${code}`);
}
console.log({ updated, skipped, unmapped });
