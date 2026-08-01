// Етап 3: одиниці виміру в характеристиках.
//
// A. Температури. 961 рядок записаний голим числом («5»), ще ~140 — у
//    різнобої («Від +5 °C», «до +30 °C», «+5°C»), і лише 337 у канонічному
//    вигляді «+5 °C». Зводимо до канону словника. Чіпаємо ТІЛЬКИ рядки з
//    одним числом і без зайвих слів: «близько +20 °C» чи діапазон усередині
//    поля «Мінімальна…» лишаємо людині.
//
// B. Вага, скопійована з об'єму. У 11 монтажних пін «Вага» дослівно дорівнює
//    числу об'єму в мілілітрах («800»), тобто вага просто неправдива — 800 мл
//    піни важать близько 850 г, а не 800. Правильної ваги ми не знаємо, тому
//    прибираємо хибну (у req категорій її немає), а «Об'єм» дописуємо з
//    колонки products.volume, де одиниця вже є.
//    У 2105-012 дефект дзеркальний: у полі «Об'єм» стоїть вага «2,2 кг»
//    (у решти лаків там літри), і вона дублює «Вага». Прибираємо «Об'єм».
//
// Запуск:
//   npx tsx --env-file=.env.local scripts/supabase/fix-unit-defects.mts          — сухий прогін
//   npx tsx --env-file=.env.local scripts/supabase/fix-unit-defects.mts --apply
//   npx tsx --env-file=.env.local scripts/supabase/fix-unit-defects.mts --revert <backup.json>
import { createClient } from '@supabase/supabase-js';
import { writeFileSync, readFileSync, existsSync } from 'fs';

/** Бекап ніколи не затирає попередній: повторний запуск скрипта інакше знищує
 *  можливість відкотити перший захід. */
function freeBackupPath(base: string): string {
  if (!existsSync(base)) return base;
  for (let i = 2; ; i++) {
    const p = base.replace(/\.json$/, `.${i}.json`);
    if (!existsSync(p)) return p;
  }
}


const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const APPLY = process.argv.includes('--apply');
const revertIdx = process.argv.indexOf('--revert');

type Char = { id: number; product_sku: string; label: string; value: string; sort_order: number };
const norm = (s: string) => s.replace(/['`´ʼ']/g, "'").replace(/\s+/g, ' ').trim().toLowerCase();

if (revertIdx !== -1) {
  const b = JSON.parse(readFileSync(process.argv[revertIdx + 1], 'utf8')) as
    { updated: { id: number; value: string }[]; deleted: Omit<Char, 'id'>[] };
  for (const u of b.updated) {
    const { error } = await db.from('product_characteristics').update({ value: u.value }).eq('id', u.id);
    if (error) throw error;
  }
  for (const d of b.deleted) {
    const { error } = await db.from('product_characteristics').insert(d);
    if (error) throw error;
  }
  console.log(`відкочено: ${b.updated.length} значень, повернуто ${b.deleted.length} рядків`);
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
const { data: prods } = await db.from('products').select('sku, name, volume, category_slug').eq('is_active', true);
const info = new Map((prods ?? []).map(p => [p.sku as string, p]));
const mine = all.filter(c => info.has(c.product_sku));

const toUpdate: { row: Char; to: string; why: string }[] = [];
const toDelete: { row: Char; why: string }[] = [];

// ── A. температури ──────────────────────────────────────────────────────────
const skippedTemp: Char[] = [];
for (const c of mine) {
  if (!/температур/i.test(c.label)) continue;
  const v = c.value.replace(/[−–—]/g, '-').replace(/℃/g, '°C');
  const ns = [...v.matchAll(/[+-]?\d+(?:[.,]\d+)?/g)].map(m => m[0]);
  if (ns.length === 0) continue;                       // текстове значення — не наш випадок
  if (ns.length > 1) { skippedTemp.push(c); continue; } // діапазон у полі крайньої точки — людині
  // Усе, що лишилось після числа, має бути службовим. Порівнюємо зі списком
  // дослівно, БЕЗ \b: у JS межа слова спирається на \w, тобто на латиницю, і
  // /\bвід\b/ по кирилиці мовчки не збігається ніколи.
  const rest = v.replace(ns[0], '').replace(/°\s*c/gi, '').replace(/[\s+]/g, '').toLowerCase();
  if (!['', 'від', 'до'].includes(rest)) { skippedTemp.push(c); continue; } // «близько», «не нижче» — людині
  const n = parseFloat(ns[0].replace(',', '.'));
  const canon = `${n > 0 ? '+' : ''}${String(n).replace('.', ',')} °C`;
  if (canon !== c.value) toUpdate.push({ row: c, to: canon, why: 'температура' });
}

// ── B. вага, скопійована з об'єму ───────────────────────────────────────────
const byProduct = new Map<string, Char[]>();
for (const c of mine) { const a = byProduct.get(c.product_sku) ?? []; a.push(c); byProduct.set(c.product_sku, a); }
for (const [sku, list] of byProduct) {
  const w = list.find(c => norm(c.label) === 'вага');
  const v = list.find(c => norm(c.label) === "об'єм");
  if (!w || !v || norm(w.value) !== norm(v.value)) continue;
  const volCol = (info.get(sku)!.volume as string | null)?.trim() ?? '';
  if (/^\d+([.,]\d+)?\s*(мл|л)$/i.test(volCol)) {
    // піни: об'єм у мілілітрах, вага — його копія без одиниці
    toDelete.push({ row: w, why: 'вага = число об\'єму, неправдива' });
    if (v.value.trim() !== volCol) toUpdate.push({ row: v, to: volCol, why: "об'єм з колонки products.volume" });
  } else {
    // лак: у полі «Об'єм» стоїть вага, а «Вага» вже є окремо
    toDelete.push({ row: v, why: "у полі «Об'єм» вага, дублює «Вага»" });
  }
}

// ── звіт ────────────────────────────────────────────────────────────────────
const tempUpd = toUpdate.filter(u => u.why === 'температура');
console.log(`## A. Температури\n   до канону «+N °C»: ${tempUpd.length} рядків у ${new Set(tempUpd.map(u => u.row.product_sku)).size} товарах`);
const shapes = new Map<string, number>();
for (const u of tempUpd) shapes.set(u.row.value.replace(/-?\d+([.,]\d+)?/g, 'N'), (shapes.get(u.row.value.replace(/-?\d+([.,]\d+)?/g, 'N')) ?? 0) + 1);
for (const [s, n] of [...shapes].sort((a, b) => b[1] - a[1]).slice(0, 8)) console.log(`     ${String(n).padStart(4)}  «${s}»  →  «+N °C»`);
console.log(`   не чіпаю (діапазон або зайві слова): ${skippedTemp.length}`);
for (const c of skippedTemp.slice(0, 8)) console.log(`     ${c.product_sku} · ${c.label}: «${c.value}»`);
if (skippedTemp.length > 8) console.log(`     … і ще ${skippedTemp.length - 8}`);

console.log(`\n## B. Вага / Об'єм\n   прибрати: ${toDelete.length} · виправити: ${toUpdate.length - tempUpd.length}`);
for (const d of toDelete) console.log(`     – ${d.row.product_sku} · «${d.row.label}» = «${d.row.value}» — ${d.why}`);
for (const u of toUpdate.filter(u => u.why !== 'температура')) console.log(`     ~ ${u.row.product_sku} · «${u.row.label}»: «${u.row.value}» → «${u.to}»`);

// Запобіжники
for (const u of tempUpd) {
  if (!/^[+-]?\d+(,\d+)? °C$/.test(u.to)) throw new Error(`нечистий канон: «${u.to}»`);
  const a = parseFloat(u.row.value.replace(/[−–—]/g, '-').match(/[+-]?\d+(?:[.,]\d+)?/)![0].replace(',', '.'));
  const b = parseFloat(u.to.replace(',', '.'));
  if (a !== b) throw new Error(`${u.row.product_sku}: число змінилося ${a} → ${b}`);
}
console.log('\n✓ перевірка: жодне число не змінилося, лише запис одиниці');

if (!APPLY) { console.log('\nсухий прогін. для запису — прапорець --apply'); process.exit(0); }

const backupPath = freeBackupPath('scripts/supabase/fix-unit-defects.backup.json');
writeFileSync(backupPath, JSON.stringify({
  updated: toUpdate.map(u => ({ id: u.row.id, value: u.row.value })),
  deleted: toDelete.map(d => ({ product_sku: d.row.product_sku, label: d.row.label, value: d.row.value, sort_order: d.row.sort_order })),
}, null, 2));
console.log(`\nбекап: ${backupPath}`);

let n = 0;
for (const u of toUpdate) {
  const { error } = await db.from('product_characteristics').update({ value: u.to }).eq('id', u.row.id);
  if (error) throw new Error(`update ${u.row.id}: ${error.message}`);
  if (++n % 200 === 0) console.log(`   ${n}/${toUpdate.length}`);
}
console.log(`оновлено ${toUpdate.length} значень`);
const { error } = await db.from('product_characteristics').delete().in('id', toDelete.map(d => d.row.id));
if (error) throw error;
console.log(`прибрано ${toDelete.length} рядків`);
