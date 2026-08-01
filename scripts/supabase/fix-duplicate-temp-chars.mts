// Етап 1 чистки характеристик: прибирає діапазонний лейбл температури там, де
// той самий факт уже записаний парою «Мінімальна/Максимальна».
//
// Канонічною лишається пара крайніх точок: вона стоїть у req більшості
// категорій, по ній можна фільтрувати й порівнювати товари. Діапазонний лейбл
// приїхав із фіду постачальника і дублює її.
//
// Головне тут — НЕ просто видалити. Там, де значення розходяться, правий лист
// постачальника, а не дефолт категорії: «Aura Aqua Lack 20» має +10…+25, а
// дефолт категорії проставив +5…+30. Тому спершу переписуємо крайні точки з
// діапазону і лише потім прибираємо діапазон.
//
// Запуск:
//   npx tsx --env-file=.env.local scripts/supabase/fix-duplicate-temp-chars.mts          — сухий прогін
//   npx tsx --env-file=.env.local scripts/supabase/fix-duplicate-temp-chars.mts --apply
//   npx tsx --env-file=.env.local scripts/supabase/fix-duplicate-temp-chars.mts --revert <backup.json>
import { createClient } from '@supabase/supabase-js';
import { writeFileSync, readFileSync } from 'fs';

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const APPLY = process.argv.includes('--apply');
const revertIdx = process.argv.indexOf('--revert');

type Char = { id: number; product_sku: string; label: string; value: string; sort_order: number };

const GROUPS = [
  { range: 'температура нанесення',               min: 'Мінімальна температура застосування', max: 'Максимальна температура застосування' },
  { range: 'температурний діапазон експлуатації', min: 'Мінімальна температура експлуатації', max: 'Максимальна температура експлуатації' },
];

const norm = (s: string) => s.replace(/\s+/g, ' ').trim().toLowerCase();
const nums = (v: string) => [...v.matchAll(/([+-]?\d+(?:[.,]\d+)?)/g)].map(m => parseFloat(m[1].replace(',', '.')));
/** Канонічний запис температури, як у дефолтах словника: "+5 °C", "-40 °C". */
const fmt = (n: number) => `${n > 0 ? '+' : ''}${String(n).replace('.', ',')} °C`;

// ── revert ──────────────────────────────────────────────────────────────────
if (revertIdx !== -1) {
  const b = JSON.parse(readFileSync(process.argv[revertIdx + 1], 'utf8')) as
    { deleted: Omit<Char, 'id'>[]; updated: { id: number; value: string }[] };
  for (const u of b.updated) {
    const { error } = await db.from('product_characteristics').update({ value: u.value }).eq('id', u.id);
    if (error) throw error;
  }
  for (const d of b.deleted) {
    const { error } = await db.from('product_characteristics').insert(d);
    if (error) throw error;
  }
  console.log(`відкочено: повернуто ${b.deleted.length} рядків, відновлено ${b.updated.length} значень`);
  process.exit(0);
}

// ── збір ────────────────────────────────────────────────────────────────────
const all: Char[] = [];
for (let f = 0; ; f += 1000) {
  const { data, error } = await db.from('product_characteristics')
    .select('id, product_sku, label, value, sort_order').range(f, f + 999);
  if (error) throw error;
  all.push(...(data as Char[]));
  if (!data || data.length < 1000) break;
}
const { data: prods } = await db.from('products').select('sku, name, category_slug').eq('is_active', true);
const info = new Map((prods ?? []).map(p => [p.sku as string, p]));

const byProduct = new Map<string, Char[]>();
for (const c of all) {
  if (!info.has(c.product_sku)) continue;
  const a = byProduct.get(c.product_sku) ?? [];
  a.push(c); byProduct.set(c.product_sku, a);
}

const toDelete: Char[] = [];
const toUpdate: { row: Char; from: string; to: string }[] = [];
const skipped: string[] = [];

for (const [sku, list] of byProduct) {
  for (const g of GROUPS) {
    const r  = list.find(c => norm(c.label) === g.range);
    const mn = list.find(c => norm(c.label) === norm(g.min));
    const mx = list.find(c => norm(c.label) === norm(g.max));
    if (!r || (!mn && !mx)) continue;               // не дубль — лишаємо як є

    const rn = nums(r.value);
    if (rn.length === 0) { skipped.push(`${sku}: «${r.value}» — жодного числа, не чіпаю`); continue; }

    // Один бік діапазону: «від +5°C» — це мінімум, «до +30°C» — максимум.
    const openMax = rn.length === 1 && /\bдо\b/i.test(r.value) && !/\bвід\b/i.test(r.value);
    const lo = rn.length >= 2 ? Math.min(...rn) : (openMax ? null : rn[0]);
    const hi = rn.length >= 2 ? Math.max(...rn) : (openMax ? rn[0] : null);

    // Переписуємо крайню точку лише якщо вона реально розходиться з діапазоном.
    if (mn && lo !== null && nums(mn.value)[0] !== lo) toUpdate.push({ row: mn, from: mn.value, to: fmt(lo) });
    if (mx && hi !== null && nums(mx.value)[0] !== hi) toUpdate.push({ row: mx, from: mx.value, to: fmt(hi) });
    toDelete.push(r);
  }
}

// ── звіт ────────────────────────────────────────────────────────────────────
console.log(`товарів з характеристиками: ${byProduct.size}`);
console.log(`прибрати діапазонних рядків: ${toDelete.length}`);
console.log(`переписати крайніх точок:    ${toUpdate.length}\n`);

if (toUpdate.length) {
  console.log('## Крайні точки, що розходилися з листом постачальника');
  const bySku = new Map<string, typeof toUpdate>();
  for (const u of toUpdate) { const a = bySku.get(u.row.product_sku) ?? []; a.push(u); bySku.set(u.row.product_sku, a); }
  for (const [sku, us] of bySku) {
    const rng = toDelete.find(d => d.product_sku === sku);
    console.log(`  ${sku} · ${info.get(sku)?.category_slug} · діапазон «${rng?.value}»`);
    for (const u of us) console.log(`      ${u.row.label}: «${u.from}» → «${u.to}»`);
  }
  console.log();
}
if (skipped.length) { console.log('## Пропущено'); for (const s of skipped) console.log(`  ${s}`); console.log(); }

console.log('## Приклади рядків, які прибираються (перші 5)');
for (const d of toDelete.slice(0, 5)) console.log(`  ${d.product_sku} · «${d.label}» = ${d.value}`);

// Запобіжник: чистимо тільки те, про що домовлялися.
const allowed = new Set(GROUPS.map(g => g.range));
for (const d of toDelete) if (!allowed.has(norm(d.label))) throw new Error(`несподіваний лейбл до видалення: ${d.label}`);

if (!APPLY) { console.log('\nсухий прогін. для запису — прапорець --apply'); process.exit(0); }

// ── запис ───────────────────────────────────────────────────────────────────
const backupPath = 'scripts/supabase/fix-duplicate-temp-chars.backup.json';
writeFileSync(backupPath, JSON.stringify({
  deleted: toDelete.map(({ product_sku, label, value, sort_order }) => ({ product_sku, label, value, sort_order })),
  updated: toUpdate.map(u => ({ id: u.row.id, value: u.from })),
}, null, 2));
console.log(`\nбекап: ${backupPath}`);

for (const u of toUpdate) {
  const { error } = await db.from('product_characteristics').update({ value: u.to }).eq('id', u.row.id);
  if (error) throw new Error(`update ${u.row.id}: ${error.message}`);
}
console.log(`переписано ${toUpdate.length} значень`);

for (let i = 0; i < toDelete.length; i += 100) {
  const ids = toDelete.slice(i, i + 100).map(d => d.id);
  const { error } = await db.from('product_characteristics').delete().in('id', ids);
  if (error) throw new Error(`delete: ${error.message}`);
}
console.log(`прибрано ${toDelete.length} рядків`);
