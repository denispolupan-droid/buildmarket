// Первинне наповнення вітрини: по одному товару з кожної категорії, у порядку категорій.
//
// Береться перший товар категорії за products.sort_order — тобто той самий, який
// стоїть першим і в каталозі. Категорії йдуть за своїм sort_order, тож вітрина
// повторює структуру магазину: покупець бачить зріз усього асортименту.
//
// Товари без наявності чи без ціни не беремо: вітрина із заглушок гірша за коротшу.
//
// Запуск:
//   npx tsx --env-file=.env.local scripts/seed-showcase.mts            — сухий прогін
//   npx tsx --env-file=.env.local scripts/seed-showcase.mts --apply
//   npx tsx --env-file=.env.local scripts/seed-showcase.mts --apply --surface=shop
//
// Перезаписує вітрину цілком. Якщо там уже щось є — попередить і без --force не чіпатиме.
import { createClient } from '@supabase/supabase-js';

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const args = process.argv.slice(2);
const APPLY = args.includes('--apply');
const FORCE = args.includes('--force');
const only = args.find(a => a.startsWith('--surface='))?.split('=')[1];
const SURFACES = (only ? [only] : ['shop', 'catalog']).filter(s => s === 'shop' || s === 'catalog');

type Stock = { stock_status: string | null; price_retail: number | null };
const oneStock = (v: unknown): Stock | null =>
  Array.isArray(v) ? ((v[0] ?? null) as Stock | null) : ((v ?? null) as Stock | null);

const { data: cats } = await db.from('categories')
  .select('slug, name, sort_order').order('sort_order');

const { data: prods } = await db.from('products')
  .select('sku, name, brand, category_slug, sort_order, is_active, product_stock(stock_status, price_retail)')
  .eq('is_active', true)
  .order('sort_order')
  .limit(5000);

// Перший придатний товар кожної категорії. Порядок вибірки вже за sort_order,
// тож достатньо взяти перше входження.
const firstOf = new Map<string, { sku: string; name: string; brand: string | null }>();
for (const p of prods ?? []) {
  const s = oneStock((p as { product_stock: unknown }).product_stock);
  if (s?.stock_status !== 'in_stock' || Number(s.price_retail ?? 0) <= 0) continue;
  const cat = String(p.category_slug ?? '');
  if (!cat || firstOf.has(cat)) continue;
  firstOf.set(cat, { sku: p.sku as string, name: p.name as string, brand: (p.brand as string) ?? null });
}

const picks: { sku: string; cat: string; label: string }[] = [];
for (const c of cats ?? []) {
  const p = firstOf.get(c.slug as string);
  if (p) picks.push({ sku: p.sku, cat: c.slug as string, label: `${p.brand ? p.brand + ' ' : ''}${p.name}` });
}

console.log(`категорій із придатним товаром: ${picks.length} із ${cats?.length}`);
for (const [i, p] of picks.entries()) {
  console.log(`  ${String(i + 1).padStart(2)}. ${p.cat.padEnd(30)} ${p.sku.padEnd(10)} ${p.label.slice(0, 50)}`);
}

if (!APPLY) {
  console.log('\nсухий прогін — нічого не записано. Додайте --apply.');
  process.exit(0);
}

for (const surface of SURFACES) {
  const { data: existing } = await db.from('showcase_items').select('sku').eq('surface', surface);
  if (existing?.length && !FORCE) {
    console.log(`\n${surface}: у вітрині вже ${existing.length} позицій — пропускаю. Перезаписати: --force`);
    continue;
  }
  await db.from('showcase_items').delete().eq('surface', surface);
  const { error } = await db.from('showcase_items')
    .insert(picks.map((p, i) => ({ surface, sku: p.sku, position: i })));
  console.log(`\n${surface}: ${error ? 'ПОМИЛКА ' + error.message : `записано ${picks.length} позицій`}`);
}
