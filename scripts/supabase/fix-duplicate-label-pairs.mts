// Етап 2 чистки характеристик: прибирає лейбл-синонім там, де в того самого
// товара вже є головний лейбл із ТИМ САМИМ значенням.
//
// Головний лейбл у кожній парі вибрав власник каталогу. Прибираємо тільки при
// точному збігу значень: «Час висихання: 30–60 хв» і «Час до наступного шару:
// 2–4 год» — це два різні факти, і обидва лишаються.
//
// Пара «Сумісність → Розчинник» свідомо НЕ входить сюди: усі 12 випадків
// у категорії koloranty, де «Сумісність» стоїть у req, а «Розчинник» — ні.
// fill-required-chars повернув би її назад, та й по суті це не дубль, а
// недозаповнене поле: у решти товарів там перелік сумісних фарб, а тут «Вода».
//
// Запуск:
//   npx tsx --env-file=.env.local scripts/supabase/fix-duplicate-label-pairs.mts          — сухий прогін
//   npx tsx --env-file=.env.local scripts/supabase/fix-duplicate-label-pairs.mts --apply
//   npx tsx --env-file=.env.local scripts/supabase/fix-duplicate-label-pairs.mts --revert <backup.json>
import { createClient } from '@supabase/supabase-js';
import { writeFileSync, readFileSync } from 'fs';

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const APPLY = process.argv.includes('--apply');
const revertIdx = process.argv.indexOf('--revert');

const PAIRS = [
  { keep: 'Матеріал',             drop: 'Основа' },
  { keep: 'Область застосування', drop: 'Тип використання' },
  { keep: 'Вага',                 drop: 'Вага упаковки' },
  { keep: 'Час висихання',        drop: 'Час до наступного шару' },
  { keep: 'Колір',                drop: 'Відтінок' },
];

const norm = (s: string) => s.replace(/['`´ʼ']/g, "'").replace(/\s+/g, ' ').trim().toLowerCase();
type Char = { id: number; product_sku: string; label: string; value: string; sort_order: number };

if (revertIdx !== -1) {
  const rows = JSON.parse(readFileSync(process.argv[revertIdx + 1], 'utf8')) as Omit<Char, 'id'>[];
  for (const r of rows) {
    const { error } = await db.from('product_characteristics').insert(r);
    if (error) throw error;
  }
  console.log(`відкочено: повернуто ${rows.length} рядків`);
  process.exit(0);
}

const all: Char[] = [];
for (let f = 0; ; f += 1000) {
  const { data, error } = await db.from('product_characteristics')
    .select('id, product_sku, label, value, sort_order').range(f, f + 999);
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

const toDelete: { row: Char; pair: string; value: string }[] = [];
for (const [sku, list] of byProduct) {
  for (const p of PAIRS) {
    const k = list.find(c => norm(c.label) === norm(p.keep));
    const d = list.find(c => norm(c.label) === norm(p.drop));
    if (!k || !d) continue;
    if (norm(k.value) !== norm(d.value)) continue;   // різні факти — лишаємо обидва
    toDelete.push({ row: d, pair: `${p.drop} → ${p.keep}`, value: k.value });
  }
  void sku;
}

console.log(`товарів з характеристиками: ${byProduct.size}`);
console.log(`прибрати рядків: ${toDelete.length}\n`);
const byPair = new Map<string, typeof toDelete>();
for (const t of toDelete) { const a = byPair.get(t.pair) ?? []; a.push(t); byPair.set(t.pair, a); }
for (const [pair, rows] of byPair) {
  console.log(`## ${pair} — ${rows.length}`);
  for (const r of rows.slice(0, 3)) console.log(`    ${r.row.product_sku} · ${catOf.get(r.row.product_sku)} · «${r.value}»`);
  if (rows.length > 3) console.log(`    … і ще ${rows.length - 3}`);
}

// Запобіжники: прибираємо лише узгоджені лейбли і лише при точному збігу значень.
const allowedDrop = new Set(PAIRS.map(p => norm(p.drop)));
for (const t of toDelete) {
  if (!allowedDrop.has(norm(t.row.label))) throw new Error(`несподіваний лейбл: ${t.row.label}`);
  if (norm(t.row.value) !== norm(t.value)) throw new Error(`${t.row.product_sku}: значення не збігаються, зупиняюсь`);
}
console.log('\n✓ перевірка: тільки узгоджені лейбли, тільки при точному збігу значень');

if (!APPLY) { console.log('\nсухий прогін. для запису — прапорець --apply'); process.exit(0); }

const backupPath = 'scripts/supabase/fix-duplicate-label-pairs.backup.json';
writeFileSync(backupPath, JSON.stringify(
  toDelete.map(t => ({ product_sku: t.row.product_sku, label: t.row.label, value: t.row.value, sort_order: t.row.sort_order })),
  null, 2));
console.log(`\nбекап: ${backupPath}`);

for (let i = 0; i < toDelete.length; i += 100) {
  const ids = toDelete.slice(i, i + 100).map(t => t.row.id);
  const { error } = await db.from('product_characteristics').delete().in('id', ids);
  if (error) throw new Error(`delete: ${error.message}`);
}
console.log(`прибрано ${toDelete.length} рядків`);
