/** Статистика пробілів SEO-черги (те, що бачить /admin/seo/products), без UI.
 *   npx tsx --env-file=.env.local scripts/supabase/seo-gap-stats.mts */
import * as ns from '../../lib/seo/product-gaps';
const { loadProductQueue } = (((ns as Record<string, unknown>).default ?? ns)) as typeof ns;
const { items, total } = await loadProductQueue();
const counts: Record<string, number> = {};
for (const i of items) for (const [k, v] of Object.entries(i.gaps)) if (v) counts[k] = (counts[k] ?? 0) + 1;
console.log(`товарів: ${total}, з пробілами: ${items.length}`);
for (const [k, v] of Object.entries(counts).sort((a, b) => b[1] - a[1])) console.log(`  ${k}: ${v}`);
const off = items.filter(i => i.gaps.offDict);
const byLabel: Record<string, number> = {};
for (const i of off) for (const l of i.offDictLabels) byLabel[l] = (byLabel[l] ?? 0) + 1;
console.log('поза довідником за лейблами:', byLabel);
const byCat: Record<string, number> = {};
for (const i of off) byCat[i.category] = (byCat[i.category] ?? 0) + 1;
console.log('поза довідником за категоріями:', byCat);
