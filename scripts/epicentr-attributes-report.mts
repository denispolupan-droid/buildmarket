/**
 * Звіт покриття атрибутів Епіцентру по наших товарах: скільки обов'язкових
 * полів заповнюється мапером (lib/epicentr-attributes), які значення не
 * зіставились зі словниками. Для ітерацій над синонімами/аліасами.
 *
 *   npx tsx --env-file=.env.local scripts/epicentr-attributes-report.mts [setCode]
 */
import * as supabaseNS from '../lib/supabase';
import * as pagNS from '../lib/db-paginate';
import * as mapNS from '../lib/epicentr-attributes';
type Mod<T> = T & { default?: T };
const { createServiceClient } = (supabaseNS as Mod<typeof supabaseNS>).default ?? supabaseNS;
const { fetchAllRows } = (pagNS as Mod<typeof pagNS>).default ?? pagNS;
const { mapEpicentrAttributes, getEpicentrAttributeSet } = (mapNS as Mod<typeof mapNS>).default ?? mapNS;

const only = process.argv[2];
const db = createServiceClient();
type Row = { sku: string; name: string; volume: string | null; color: string | null; category_slug: string; description_mp: string | null; characteristics: { label: string; value: string }[] | null };
const [products, cats] = await Promise.all([
  fetchAllRows<Row>((f, t) => db.from('products').select('sku, name, volume, color, category_slug, description_mp, characteristics:product_characteristics(label, value)').eq('is_active', true).order('sku').range(f, t)),
  fetchAllRows<{ slug: string; epicentr_category_code: string | null }>((f, t) => db.from('categories').select('slug, epicentr_category_code').order('slug').range(f, t)),
]);
const codeBySlug = new Map(cats.map(c => [c.slug, c.epicentr_category_code]));

type Agg = { n: number; reqTotal: number; reqFilled: number; missing: Map<string, number>; unmatched: Map<string, Map<string, number>> };
const bySet = new Map<string, Agg>();
let totalReq = 0, totalFilled = 0;
for (const p of products) {
  const code = codeBySlug.get(p.category_slug);
  if (!code || (only && code !== only)) continue;
  const set = getEpicentrAttributeSet(code)!;
  const r = mapEpicentrAttributes(code, { ...p, description: p.description_mp });
  const agg = bySet.get(code) ?? { n: 0, reqTotal: 0, reqFilled: 0, missing: new Map(), unmatched: new Map() };
  agg.n++;
  const req = set.attributes.filter(a => a.required && !a.system);
  agg.reqTotal += req.length; totalReq += req.length;
  const filled = req.length - r.missingRequired.length;
  agg.reqFilled += filled; totalFilled += filled;
  for (const m of r.missingRequired) agg.missing.set(`${m.title} [${m.type}]`, (agg.missing.get(`${m.title} [${m.type}]`) ?? 0) + 1);
  for (const u of r.unmatched) {
    const m = agg.unmatched.get(u.title) ?? new Map<string, number>();
    m.set(u.raw, (m.get(u.raw) ?? 0) + 1); agg.unmatched.set(u.title, m);
  }
  bySet.set(code, agg);
}

for (const [code, a] of [...bySet.entries()].sort((x, y) => y[1].n - x[1].n)) {
  const set = getEpicentrAttributeSet(code)!;
  console.log(`\n=== ${code} ${set.title}: товарів ${a.n}, обов'язкових заповнено ${a.reqFilled}/${a.reqTotal} (${Math.round(100 * a.reqFilled / Math.max(1, a.reqTotal))}%)`);
  for (const [k, v] of [...a.missing.entries()].sort((x, y) => y[1] - x[1])) console.log(`  − ${k}: ${v}`);
  for (const [t, m] of a.unmatched) {
    const top = [...m.entries()].sort((x, y) => y[1] - x[1]).slice(0, 6).map(([r, n]) => `«${r.slice(0, 50)}»×${n}`).join(', ');
    console.log(`  ? ${t}: ${top}`);
  }
}
console.log(`\nРАЗОМ обов'язкових: ${totalFilled}/${totalReq} (${Math.round(100 * totalFilled / Math.max(1, totalReq))}%)`);
