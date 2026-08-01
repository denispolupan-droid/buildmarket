// Аудит етапу 3: значення без одиниць виміру.
//   1) «Вага» дослівно дорівнює «Об'єм» — у вагу скопійовано число об'єму;
//   2) температури записані голим числом («5» замість «+5 °C»);
//   3) інші числові лейбли з одиницями у словнику, де значення — голе число.
import { createClient } from '@supabase/supabase-js';
import * as dictNS from './char-dictionary.mjs';
const D = (dictNS as unknown as { default: typeof dictNS }).default ?? dictNS;

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const norm = (s: string) => s.replace(/['`´ʼ']/g, "'").replace(/\s+/g, ' ').trim().toLowerCase();

type Char = { id: number; product_sku: string; label: string; value: string };
const all: Char[] = [];
for (let f = 0; ; f += 1000) {
  const { data, error } = await db.from('product_characteristics').select('id, product_sku, label, value').range(f, f + 999);
  if (error) throw error;
  all.push(...(data as Char[]));
  if (!data || data.length < 1000) break;
}
const { data: prods } = await db.from('products').select('sku, name, volume, category_slug').eq('is_active', true);
const info = new Map((prods ?? []).map(p => [p.sku as string, p]));
const byProduct = new Map<string, Char[]>();
for (const c of all) {
  if (!info.has(c.product_sku)) continue;
  const a = byProduct.get(c.product_sku) ?? []; a.push(c); byProduct.set(c.product_sku, a);
}

const STD = D.CATEGORY_STANDARDS as Record<string, { req: string[]; def?: Record<string, string> }>;
const inReq = (cat: string, label: string) => !!STD[cat]?.req?.some(l => norm(l) === norm(label));

// ── 1. Вага == Об'єм ────────────────────────────────────────────────────────
console.log("## «Вага» дослівно дорівнює «Об'єм»");
const weightEqVol: { sku: string; cat: string; val: string; volCol: string | null; wReq: boolean }[] = [];
for (const [sku, list] of byProduct) {
  const w = list.find(c => norm(c.label) === 'вага');
  const v = list.find(c => norm(c.label) === "об'єм");
  if (!w || !v || norm(w.value) !== norm(v.value)) continue;
  const cat = info.get(sku)!.category_slug as string;
  weightEqVol.push({ sku, cat, val: w.value, volCol: (info.get(sku)!.volume as string) ?? null, wReq: inReq(cat, 'Вага') });
}
console.log(`   знайдено: ${weightEqVol.length}`);
for (const r of weightEqVol)
  console.log(`   ${r.sku} · ${r.cat.padEnd(22)} вага=об'єм=«${r.val}» · колонка volume=«${r.volCol ?? '—'}» · «Вага» в req: ${r.wReq ? 'ТАК' : 'ні'}`);

// ── 2. Температури голим числом ─────────────────────────────────────────────
console.log('\n## Температури без одиниць');
const bareTemp: { sku: string; cat: string; label: string; value: string }[] = [];
for (const [sku, list] of byProduct) for (const c of list) {
  if (!/температур/i.test(c.label)) continue;
  if (/°|℃|градус/i.test(c.value)) continue;          // одиниця вже є
  if (!/\d/.test(c.value)) continue;                   // текстове значення — не наш випадок
  bareTemp.push({ sku, cat: info.get(sku)!.category_slug as string, label: c.label, value: c.value });
}
console.log(`   знайдено: ${bareTemp.length} рядків у ${new Set(bareTemp.map(b => b.sku)).size} товарах`);
const tSku = new Map<string, typeof bareTemp>();
for (const b of bareTemp) { const a = tSku.get(b.sku) ?? []; a.push(b); tSku.set(b.sku, a); }
for (const [sku, rows] of tSku) {
  console.log(`   ${sku} · ${info.get(sku)?.category_slug} · ${info.get(sku)?.name}`);
  for (const r of rows) console.log(`       ${r.label.padEnd(38)} «${r.value}»`);
}

// ── 3. Інші лейбли з одиницею у словнику, але голим числом у значенні ───────
const unitOf = new Map<string, string>();
for (const d of D.DICTIONARY as { label: string; unit?: string }[]) if (d.unit) unitOf.set(norm(d.label), d.unit);
console.log('\n## Інші лейблі з одиницею у словнику, а значення — голе число');
const bareOther = new Map<string, { n: number; ex: string[] }>();
for (const [sku, list] of byProduct) for (const c of list) {
  const u = unitOf.get(norm(c.label));
  if (!u || /температур/i.test(c.label)) continue;
  if (!/^\s*[+-]?\d+(?:[.,]\d+)?\s*$/.test(c.value)) continue;   // саме голе число
  const e = bareOther.get(c.label) ?? { n: 0, ex: [] };
  e.n++; if (e.ex.length < 3) e.ex.push(`${sku}=«${c.value}» (одиниця ${u})`);
  bareOther.set(c.label, e);
}
if (!bareOther.size) console.log('   немає');
for (const [l, e] of [...bareOther.entries()].sort((a, b) => b[1].n - a[1].n))
  console.log(`   ${String(e.n).padStart(3)}  ${l}  ·  ${e.ex.join(', ')}`);
