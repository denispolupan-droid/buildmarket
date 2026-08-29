/**
 * Разова чистка ЗНАЧЕНЬ характеристик-фасетів за довідником characteristic_values
 * (міграція 105) — тими самими правилами, що працюють у normalizeChars для всіх
 * нових записів. Обробляються ВСІ лейбли, для яких у БД є значення (Тип
 * використання, Ступінь блиску, Основа, Розчинник, Поверхня, Ефект, Клас
 * зносостійкості, Призначення…); правила з прив'язкою до категорій діють лише
 * на товари цих категорій (і підкатегорій).
 *
 * БЕЗ --apply нічого не пише (dry-run: таблиця «було → стало» з кількостями):
 *   npx tsx --env-file=.env.local scripts/supabase/canonicalize-char-values.mts
 *   npx tsx --env-file=.env.test  scripts/supabase/canonicalize-char-values.mts --apply
 *   … [--label "Основа"] — лише один лейбл
 *
 * Перед записом зберігає бекап {id, product_sku, label, value} усіх змінених
 * рядків у scripts/supabase/backups/ — відкат = зворотний update по id.
 */
import fs from 'node:fs';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';
// tsx транспілює lib/*.ts у CJS — іменовані експорти опиняються в default
import * as charsNS from '../../lib/characteristics';
import * as valuesNS from '../../lib/char-values';
const { loadCharDictionary } = ((charsNS as Record<string, unknown>).default ?? charsNS) as typeof charsNS;
const { canonicalCharValue } = ((valuesNS as Record<string, unknown>).default ?? valuesNS) as typeof valuesNS;

const APPLY = process.argv.includes('--apply');
const labelArg = process.argv.indexOf('--label');
const ONLY_LABEL = labelArg > -1 ? process.argv[labelArg + 1] : null;

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

type Row = { id: number; product_sku: string; label: string; value: string };

async function main() {
  const dict = await loadCharDictionary(db);
  const labels = [...dict.values.keys()].filter(l => !ONLY_LABEL || l === ONLY_LABEL);
  if (!labels.length) throw new Error('У characteristic_values немає правил (seed-char-dictionary не запускали?)');
  console.log(`БД: ${process.env.NEXT_PUBLIC_SUPABASE_URL}${APPLY ? '' : ' (DRY-RUN)'}\nЛейбли з правилами: ${labels.join(', ')}`);

  const catOf = new Map<string, string | null>();
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db.from('products').select('sku, category_slug').order('sku').range(from, from + 999);
    if (error) throw error;
    for (const p of data ?? []) catOf.set(p.sku, p.category_slug);
    if (!data || data.length < 1000) break;
  }
  const canon = (r: Row) => canonicalCharValue(r.label, r.value, {
    rules: dict.values, category: catOf.get(r.product_sku), parentOf: dict.parentOf, multiselect: dict.multiselect.has(r.label),
  });

  const rows: Row[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db.from('product_characteristics')
      .select('id, product_sku, label, value').in('label', labels).order('id').range(from, from + 999);
    if (error) throw error;
    rows.push(...(data as Row[]));
    if (!data || data.length < 1000) break;
  }

  const changes = rows
    .map(r => ({ ...r, next: canon(r) }))
    .filter(r => r.next !== r.value.trim());

  for (const label of labels) {
    const all = rows.filter(r => r.label === label);
    if (!all.length) continue;
    const mine = changes.filter(c => c.label === label);
    const map = new Map<string, { n: number; from: Map<string, number> }>();
    for (const c of mine) {
      const e = map.get(c.next) ?? { n: 0, from: new Map() };
      e.n++; e.from.set(c.value, (e.from.get(c.value) ?? 0) + 1); map.set(c.next, e);
    }
    const untouched = new Map<string, number>();
    for (const r of all.filter(r => canon(r) === r.value.trim()))
      untouched.set(r.value.trim(), (untouched.get(r.value.trim()) ?? 0) + 1);
    const known = new Set(dict.values.get(label)!.map(v => v.value.toLowerCase()));
    const offDict = [...untouched].filter(([v]) => !known.has(v.toLowerCase()));

    console.log(`\n===== ${label}: ${all.length} рядків, змінюється ${mine.length}`);
    for (const [next, e] of [...map].sort((a, b) => b[1].n - a[1].n)) {
      console.log(`→ ${next}  (${e.n})`);
      for (const [from, n] of [...e.from].sort((a, b) => b[1] - a[1])) console.log(`     ${n}× ${from}`);
    }
    console.log(`-- без змін, у довіднику (${untouched.size - offDict.length} значень)`);
    if (offDict.length) {
      console.log(`-- без змін, ПОЗА довідником (${offDict.length} значень; для категорій без правил — норма):`);
      for (const [v, n] of offDict.sort((a, b) => b[1] - a[1]).slice(0, 40)) console.log(`     ${n}× ${v}`);
    }
  }

  if (!APPLY) { console.log(`\nDRY-RUN: ${changes.length} рядків до зміни. Запусти з --apply, щоб записати.`); return; }

  const dir = path.join(process.cwd(), 'scripts', 'supabase', 'backups');
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `char-values-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
  fs.writeFileSync(file, JSON.stringify(changes.map(({ id, product_sku, label, value }) => ({ id, product_sku, label, value })), null, 1));
  console.log(`\nбекап: ${file}`);

  let done = 0;
  for (const c of changes) {
    const { error } = await db.from('product_characteristics').update({ value: c.next }).eq('id', c.id);
    if (error) throw new Error(`id ${c.id}: ${error.message}`);
    done++;
  }
  console.log(`записано ${done} рядків`);
}

main().catch(e => { console.error(e); process.exit(1); });
