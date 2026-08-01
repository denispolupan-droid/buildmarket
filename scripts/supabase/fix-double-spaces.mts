// Прибирає подвійні пробіли з назв товарів (name, name_ru).
//
// Звідки взялися: назви збиралися конкатенацією «бренд + назва + фасовка», і там,
// де якийсь із шматків був порожній, лишався зайвий пробіл. У HTML браузер їх
// схлопує, тому на сайті це не видно — але в title фідів Merchant/Prom/Rozetka,
// у JSON-LD і в <title> сторінки вони їдуть як є.
//
// Безпечність: назва ніде не є ключем — товар скрізь шукається по sku, слаг уже
// збережений окремою колонкою, у замовленнях назва лежить копією в items.
//
// Запуск:
//   npx tsx --env-file=.env.local scripts/supabase/fix-double-spaces.mts          — сухий прогін
//   npx tsx --env-file=.env.local scripts/supabase/fix-double-spaces.mts --apply  — записати
//   npx tsx --env-file=.env.local scripts/supabase/fix-double-spaces.mts --revert backup.json
import { createClient } from '@supabase/supabase-js';
import { writeFileSync, readFileSync } from 'fs';

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const APPLY = process.argv.includes('--apply');
const revertIdx = process.argv.indexOf('--revert');

type Row = { sku: string; name: string; name_ru: string | null };

/** Тільки схлопування пробілів і обрізка країв — жодних інших змін тексту. */
const tidy = (s: string) => s.replace(/\s+/g, ' ').trim();

async function allProducts(): Promise<Row[]> {
  const out: Row[] = [];
  for (let f = 0; ; f += 1000) {
    const { data, error } = await db.from('products').select('sku, name, name_ru').range(f, f + 999);
    if (error) throw error;
    out.push(...(data as Row[]));
    if (!data || data.length < 1000) return out;
  }
}

if (revertIdx !== -1) {
  const backup = JSON.parse(readFileSync(process.argv[revertIdx + 1], 'utf8')) as Row[];
  for (const r of backup) {
    const { error } = await db.from('products').update({ name: r.name, name_ru: r.name_ru }).eq('sku', r.sku);
    if (error) throw error;
  }
  console.log(`відкочено ${backup.length} назв`);
  process.exit(0);
}

const rows = await allProducts();
const changed = rows
  .map(r => ({ sku: r.sku, name: r.name, name_ru: r.name_ru, newName: tidy(r.name), newRu: r.name_ru ? tidy(r.name_ru) : null }))
  .filter(r => r.newName !== r.name || r.newRu !== r.name_ru);

console.log(`товарів ${rows.length} · потребують правки ${changed.length}\n`);
for (const r of changed.slice(0, 12)) {
  if (r.newName !== r.name) console.log(`  ${r.sku} uk «${r.name}»\n           «${r.newName}»`);
  if (r.newRu !== r.name_ru) console.log(`  ${r.sku} ru «${r.name_ru}»\n           «${r.newRu}»`);
}
if (changed.length > 12) console.log(`  … і ще ${changed.length - 12}`);

// Захист від випадкової втрати тексту: правка має лише прибирати пробіли,
// набір непробільних символів зобов'язаний лишитися незмінним.
for (const r of changed) {
  const strip = (s: string) => s.replace(/\s/g, '');
  if (strip(r.name) !== strip(r.newName) || strip(r.name_ru ?? '') !== strip(r.newRu ?? '')) {
    throw new Error(`${r.sku}: правка змінює не лише пробіли — зупиняюсь`);
  }
}
console.log('\n✓ перевірка: змінюються лише пробіли, текст незайманий');

if (!APPLY) { console.log('\nсухий прогін. для запису — прапорець --apply'); process.exit(0); }

const backupPath = `scripts/supabase/fix-double-spaces.backup.json`;
writeFileSync(backupPath, JSON.stringify(changed.map(r => ({ sku: r.sku, name: r.name, name_ru: r.name_ru })), null, 2));
console.log(`\nбекап старих назв: ${backupPath}`);

let done = 0;
for (const r of changed) {
  const { error } = await db.from('products').update({ name: r.newName, name_ru: r.newRu }).eq('sku', r.sku);
  if (error) throw new Error(`${r.sku}: ${error.message}`);
  done++;
}
console.log(`оновлено ${done} назв`);
