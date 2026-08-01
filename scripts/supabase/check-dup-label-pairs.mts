// Перевірка перед етапом 2: чи не поверне fill-required-chars те, що ми приберемо.
// Дублі чистимо лише там, де обидва лейбли є в ОДНОГО товару з ОДНАКОВИМ значенням.
import { createClient } from '@supabase/supabase-js';
import * as dictNS from './char-dictionary.mjs';
const D = (dictNS as unknown as { default: typeof dictNS }).default ?? dictNS;

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

// keep — той, що лишається; drop — той, що прибираємо (вибір власника каталогу)
const PAIRS = [
  { keep: 'Матеріал',              drop: 'Основа' },
  { keep: 'Область застосування',  drop: 'Тип використання' },
  { keep: 'Розчинник',             drop: 'Сумісність' },
  { keep: 'Вага',                  drop: 'Вага упаковки' },
  { keep: 'Час висихання',         drop: 'Час до наступного шару' },
  { keep: 'Колір',                 drop: 'Відтінок' },
];

const norm = (s: string) => s.replace(/['`´ʼ']/g, "'").replace(/\s+/g, ' ').trim().toLowerCase();

type Char = { id: number; product_sku: string; label: string; value: string };
const all: Char[] = [];
for (let f = 0; ; f += 1000) {
  const { data, error } = await db.from('product_characteristics').select('id, product_sku, label, value').range(f, f + 999);
  if (error) throw error;
  all.push(...(data as Char[]));
  if (!data || data.length < 1000) break;
}
const { data: prods } = await db.from('products').select('sku, category_slug').eq('is_active', true);
const catOf = new Map((prods ?? []).map(p => [p.sku as string, (p.category_slug as string) ?? '—']));

const byProduct = new Map<string, Char[]>();
for (const c of all) {
  if (!catOf.has(c.product_sku)) continue;
  const a = byProduct.get(c.product_sku) ?? []; a.push(c); byProduct.set(c.product_sku, a);
}

const STD = D.CATEGORY_STANDARDS as Record<string, { req: string[]; def?: Record<string, string> }>;

for (const p of PAIRS) {
  const hits: { sku: string; cat: string; value: string }[] = [];
  const differ: { sku: string; cat: string; keep: string; drop: string }[] = [];
  for (const [sku, list] of byProduct) {
    const k = list.find(c => norm(c.label) === norm(p.keep));
    const d = list.find(c => norm(c.label) === norm(p.drop));
    if (!k || !d) continue;
    if (norm(k.value) === norm(d.value)) hits.push({ sku, cat: catOf.get(sku)!, value: k.value });
    else differ.push({ sku, cat: catOf.get(sku)!, keep: k.value, drop: d.value });
  }
  console.log(`\n## «${p.drop}» → прибрати на користь «${p.keep}»`);
  console.log(`   збігається значення: ${hits.length}  ·  значення різні (НЕ чіпаємо): ${differ.length}`);

  // Чи повернеться прибране назад
  const cats = [...new Set(hits.map(h => h.cat))];
  const reAdd = cats.filter(c => STD[c]?.req?.some(l => norm(l) === norm(p.drop)));
  const keepMissing = cats.filter(c => STD[c]?.req?.some(l => norm(l) === norm(p.keep)) === false);
  if (reAdd.length) {
    console.log(`   ⚠ «${p.drop}» стоїть у req цих категорій — fill-required-chars поверне його назад:`);
    for (const c of reAdd) console.log(`       ${c} (дефолт: ${STD[c].def?.[p.drop] ?? '—'})`);
  } else {
    console.log(`   ✓ «${p.drop}» немає в req жодної зачепленої категорії — назад не повернеться`);
  }
  if (keepMissing.length) console.log(`   і «${p.keep}» не в req у: ${keepMissing.join(', ')}`);
  const catTally = new Map<string, number>();
  for (const h of hits) catTally.set(h.cat, (catTally.get(h.cat) ?? 0) + 1);
  console.log('   по категоріях: ' + [...catTally].map(([c, n]) => `${c}=${n}`).join(', '));
  if (differ.length) {
    console.log('   приклади різних значень (лишаються обидва):');
    for (const d of differ.slice(0, 3)) console.log(`       ${d.sku} · ${p.keep}=«${d.keep}» · ${p.drop}=«${d.drop}»`);
  }
}
