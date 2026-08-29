/**
 * Лінійки фасовок: призначає головну фасовку (products.variant_main_sku) і —
 * де одна фасовка вже домінує у видачі — вмикає canonical на неї
 * (variant_canonical). Див. lib/seo/variants.ts і міграцію 108.
 *
 *   npx tsx --env-file=.env.local scripts/seo-variant-lines.mts                # звіт
 *   npx tsx --env-file=.env.local scripts/seo-variant-lines.mts --apply        # записати variant_main_sku (лише де ще порожньо)
 *   … --apply --canonical                                                      # + variant_canonical для домінантних лінійок
 *   … --apply --canonical --all                                                # canonical для ВСІХ лінійок (фаза 2 повністю)
 *   … --set-main 1203-001                                                      # руками змінити головну для лінійки цього товару
 *
 * Головна — фасовка з найбільшою вагою у Search Console за 90 днів (кліки ×10 +
 * покази); без даних — середня за об'ємом. Уже призначена головна НЕ
 * перепризначається (canonical, що скаче між фасовками, гірший за його
 * відсутність) — лише --set-main.
 * «Домінантна» лінійка: головна має ≥ 70 % показів лінійки і ≥ 20 показів.
 */
import { createClient } from '@supabase/supabase-js';

const args = process.argv.slice(2);
const APPLY = args.includes('--apply'), CANON = args.includes('--canonical'), ALL = args.includes('--all');
const SET_MAIN = args[args.indexOf('--set-main') + 1];
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const all = async (q: any) => { const out: any[] = []; for (let f = 0; ; f += 1000) { const { data, error } = await q.range(f, f + 999); if (error) throw error; out.push(...(data ?? [])); if (!data || data.length < 1000) break; } return out; };
const m: any = await import('../lib/seo/meta');
const findVariants = m.findVariants ?? m.default.findVariants, volumeValue = m.volumeValue ?? m.default.volumeValue;

type P = { sku: string; slug: string | null; name: string; brand: string; category_slug: string | null; volume: string | null; variant_main_sku: string | null; variant_canonical: boolean };
const prods: P[] = await all(db.from('products').select('sku, slug, name, brand, category_slug, volume, variant_main_sku, variant_canonical').eq('is_active', true));

if (SET_MAIN && args.includes('--set-main')) {
  const p = prods.find(x => x.sku === SET_MAIN); if (!p) throw new Error(`немає товару ${SET_MAIN}`);
  const line = [p, ...findVariants(prods.filter(x => x.category_slug === p.category_slug), p)];
  const { error } = await db.from('products').update({ variant_main_sku: p.sku }).in('sku', line.map(x => x.sku)); if (error) throw error;
  console.log(`головна лінійки → ${p.sku} (${line.length} фасовок: ${line.map(x => x.volume).join(', ')})`); process.exit(0);
}

// Вага у видачі за 90 днів
const since = new Date(Date.now() - 90 * 864e5).toISOString().slice(0, 10);
const gsc = await all(db.from('gsc_daily').select('page_path, impressions, clicks').gte('date', since).like('page_path', '%/product/%'));
const bySlug = new Map(prods.map(p => [p.slug ?? p.sku, p.sku])); const bySku = new Set(prods.map(p => p.sku));
const weight: Record<string, { i: number; c: number }> = {};
for (const r of gsc) { const key = r.page_path.replace(/^https?:\/\/[^/]+/, '').replace(/^\/ru/, '').replace('/product/', '').split('?')[0]; const sku = bySku.has(key) ? key : bySlug.get(key); if (!sku) continue; (weight[sku] ??= { i: 0, c: 0 }); weight[sku].i += r.impressions; weight[sku].c += r.clicks; }
const w = (sku: string) => (weight[sku]?.c ?? 0) * 10 + (weight[sku]?.i ?? 0);

// Лінійки
const byCat = new Map<string, P[]>(); for (const p of prods) byCat.set(p.category_slug ?? '', [...(byCat.get(p.category_slug ?? '') ?? []), p]);
const seen = new Set<string>(); const lines: P[][] = [];
for (const p of prods) { if (seen.has(p.sku)) continue; const line = [p, ...findVariants(byCat.get(p.category_slug ?? '') ?? [], p)] as P[]; if (line.length < 2) continue; for (const x of line) seen.add(x.sku); lines.push(line.sort((a, b) => volumeValue(a.volume) - volumeValue(b.volume))); }

const report = { assigned: 0, kept: 0, canonical: 0, dominant: 0 };
const updates: { sku: string; variant_main_sku: string; variant_canonical: boolean }[] = [];
for (const line of lines) {
  const existing = line.find(x => x.variant_main_sku && line.some(y => y.sku === x.variant_main_sku))?.variant_main_sku ?? null;
  let main = existing;
  if (!main) {
    const ranked = [...line].sort((a, b) => w(b.sku) - w(a.sku));
    main = w(ranked[0].sku) > 0 ? ranked[0].sku : line[Math.floor((line.length - 1) / 2)].sku;
    report.assigned++;
  } else report.kept++;
  const total = line.reduce((s, x) => s + (weight[x.sku]?.i ?? 0), 0);
  const share = total ? (weight[main]?.i ?? 0) / total : 0;
  const dominant = total >= 20 && share >= 0.7;
  if (dominant) report.dominant++;
  const canonical = CANON && (ALL || dominant);
  if (canonical) report.canonical++;
  for (const x of line) updates.push({ sku: x.sku, variant_main_sku: main, variant_canonical: canonical || (x.variant_canonical && !CANON) });
  const mainP = line.find(x => x.sku === main)!;
  if (!APPLY || dominant) console.log(`${dominant ? 'DOM ' : '    '}${canonical ? 'CANON ' : '      '}${mainP.brand} ${mainP.name} | головна ${mainP.volume} (${weight[main]?.i ?? 0} пок${total ? `, ${Math.round(share * 100)} %` : ''}) | ${line.map(x => `${x.volume}:${weight[x.sku]?.i ?? 0}`).join(' ')}`);
}
console.log(`\nлінійок ${lines.length}, товарів у них ${updates.length}; головних призначено ${report.assigned}, збережено наявних ${report.kept}; домінантних ${report.dominant}; canonical увімкнено ${report.canonical}`);
if (APPLY) {
  for (let i = 0; i < updates.length; i += 1) { const { error } = await db.from('products').update({ variant_main_sku: updates[i].variant_main_sku, variant_canonical: updates[i].variant_canonical }).eq('sku', updates[i].sku); if (error) throw error; }
  console.log('записано');
}
