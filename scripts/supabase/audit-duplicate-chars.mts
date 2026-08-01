// Аудит надлишкових характеристик: коли той самий факт написаний у картці
// кілька разів під різними лейблами.
//
// Звідки береться. У словнику є і діапазонний лейбл («Температура нанесення:
// від +5 °C до +30 °C»), і пара крайніх точок («Мінімальна/Максимальна
// температура застосування»). Пара крайніх точок стоїть у req більшості
// категорій, тож fill-required-chars дописує її з дефолтів — а діапазонний
// лейбл уже приїхав із фіду постачальника. Виходить три рядки про одне.
//
// Запуск: npx tsx --env-file=.env.local scripts/supabase/audit-duplicate-chars.mts
import { createClient } from '@supabase/supabase-js';

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

type Char = { product_sku: string; label: string; value: string };

async function allChars(): Promise<Char[]> {
  const out: Char[] = [];
  for (let f = 0; ; f += 1000) {
    const { data, error } = await db.from('product_characteristics')
      .select('product_sku, label, value').range(f, f + 999);
    if (error) throw error;
    out.push(...(data as Char[]));
    if (!data || data.length < 1000) return out;
  }
}

const { data: prods } = await db.from('products')
  .select('sku, category_slug, is_active').eq('is_active', true);
const catOf = new Map((prods ?? []).map(p => [p.sku as string, (p.category_slug as string) ?? '—']));

const chars = (await allChars()).filter(c => catOf.has(c.product_sku));
const byProduct = new Map<string, Char[]>();
for (const c of chars) {
  const a = byProduct.get(c.product_sku) ?? [];
  a.push(c); byProduct.set(c.product_sku, a);
}
console.log(`активних товарів з характеристиками: ${byProduct.size} · рядків ${chars.length}\n`);

/** Числа зі значення, зі знаком: "від +5 °C до +30 °C" → [5, 30]; "-50 °C" → [-50]. */
function nums(v: string): number[] {
  return [...v.matchAll(/([+-]?\d+(?:[.,]\d+)?)/g)].map(m => parseFloat(m[1].replace(',', '.')));
}
const norm = (s: string) => s.replace(/\s+/g, ' ').trim().toLowerCase();

// ── 1. Діапазон + пара крайніх точок про те саме ────────────────────────────
const RANGE_GROUPS = [
  { range: 'температура нанесення',                 min: 'мінімальна температура застосування',  max: 'максимальна температура застосування' },
  { range: 'температурний діапазон експлуатації',   min: 'мінімальна температура експлуатації',  max: 'максимальна температура експлуатації' },
];

type Hit = { sku: string; cat: string; group: string; range: string; min?: string; max?: string; covered: boolean };
const rangeHits: Hit[] = [];
for (const [sku, list] of byProduct) {
  const find = (l: string) => list.find(c => norm(c.label) === l);
  for (const g of RANGE_GROUPS) {
    const r = find(g.range), mn = find(g.min), mx = find(g.max);
    if (!r || (!mn && !mx)) continue;
    const rn = nums(r.value);
    // «покрито» = діапазон містить рівно ті самі числа, що й крайні точки
    const covered =
      (!mn || rn.includes(nums(mn.value)[0])) &&
      (!mx || rn.includes(nums(mx.value)[0]));
    rangeHits.push({ sku, cat: catOf.get(sku)!, group: g.range, range: r.value, min: mn?.value, max: mx?.value, covered });
  }
}
console.log(`## Діапазон + крайні точки про те саме: ${rangeHits.length} товарів`);
const byCat = new Map<string, Hit[]>();
for (const h of rangeHits) { const a = byCat.get(h.cat) ?? []; a.push(h); byCat.set(h.cat, a); }
for (const [cat, hs] of [...byCat.entries()].sort((a, b) => b[1].length - a[1].length)) {
  const same = hs.filter(h => h.covered).length;
  console.log(`  ${String(hs.length).padStart(3)}  ${cat.padEnd(30)} (значення збігаються: ${same}, розходяться: ${hs.length - same})`);
}
console.log('\n  приклади:');
for (const h of rangeHits.slice(0, 4))
  console.log(`    ${h.sku} · «${h.group}» = ${h.range} · min=${h.min ?? '—'} · max=${h.max ?? '—'}${h.covered ? '' : '  ⚠ РОЗХОДЯТЬСЯ'}`);
const conflicts = rangeHits.filter(h => !h.covered);
if (conflicts.length) {
  console.log(`\n  ⚠ розходяться (тут авто-чистка небезпечна): ${conflicts.length}`);
  for (const h of conflicts.slice(0, 15))
    console.log(`    ${h.sku} · діапазон ${h.range} · min=${h.min ?? '—'} · max=${h.max ?? '—'}`);
}

// ── 2. Той самий лейбл двічі в одного товару ────────────────────────────────
let dupLabel = 0;
const dupLabelEx: string[] = [];
for (const [sku, list] of byProduct) {
  const seen = new Map<string, string[]>();
  for (const c of list) { const a = seen.get(norm(c.label)) ?? []; a.push(c.value); seen.set(norm(c.label), a); }
  for (const [l, vals] of seen) if (vals.length > 1) {
    dupLabel++;
    if (dupLabelEx.length < 10) dupLabelEx.push(`${sku} · «${l}» = ${vals.join(' | ')}`);
  }
}
console.log(`\n## Один лейбл двічі в одного товару: ${dupLabel}`);
for (const e of dupLabelEx) console.log(`    ${e}`);

// ── 3. Одне значення під різними лейблами ───────────────────────────────────
const pairCount = new Map<string, number>();
const pairEx = new Map<string, string>();
for (const [sku, list] of byProduct) {
  for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
    if (norm(list[i].label) === norm(list[j].label)) continue;
    if (norm(list[i].value) !== norm(list[j].value)) continue;
    if (nums(list[i].value).length === 0 && list[i].value.length < 4) continue; // «Так»/«Ні» збігаються законно
    const k = [norm(list[i].label), norm(list[j].label)].sort().join('  ⟷  ');
    pairCount.set(k, (pairCount.get(k) ?? 0) + 1);
    if (!pairEx.has(k)) pairEx.set(k, `${sku} = «${list[i].value}»`);
  }
}
console.log(`\n## Однакове значення під двома лейблами: ${[...pairCount.values()].reduce((a, b) => a + b, 0)} випадків, ${pairCount.size} пар лейблів`);
for (const [k, v] of [...pairCount.entries()].sort((a, b) => b[1] - a[1]).slice(0, 20))
  console.log(`  ${String(v).padStart(3)}  ${k}   (напр. ${pairEx.get(k)})`);

// ── 4. Скільки взагалі лейблів у вжитку ─────────────────────────────────────
const labelUse = new Map<string, number>();
for (const c of chars) labelUse.set(norm(c.label), (labelUse.get(norm(c.label)) ?? 0) + 1);
console.log(`\n## Різних лейблів у вжитку: ${labelUse.size}`);
