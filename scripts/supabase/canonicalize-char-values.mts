/**
 * Разова чистка ЗНАЧЕНЬ характеристик «Тип використання» і «Призначення» за
 * правилами lib/char-values.ts (ті самі, що тепер працюють у normalizeChars
 * для всіх нових записів).
 *
 * БЕЗ --apply нічого не пише (dry-run: таблиця «було → стало» з кількостями):
 *   npx tsx --env-file=.env.local scripts/supabase/canonicalize-char-values.mts
 *   npx tsx --env-file=.env.local scripts/supabase/canonicalize-char-values.mts --apply
 *
 * Перед записом зберігає бекап {id, product_sku, label, value} усіх змінених
 * рядків у scripts/supabase/backups/ — відкат = зворотний update по id.
 */
import fs from 'node:fs';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';
// tsx: .mts → .ts у CJS-режимі не бачить іменованих експортів — беремо через default
type Canon = (l: string, v: string, c?: string | null) => string;
const _cv: { canonicalCharValue?: Canon; default?: { canonicalCharValue: Canon } } = await import('../../lib/char-values');
const canonicalCharValue: Canon = (_cv.canonicalCharValue ?? _cv.default!.canonicalCharValue);

const APPLY = process.argv.includes('--apply');
const LABELS = ['Тип використання', 'Призначення'];

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

type Row = { id: number; product_sku: string; label: string; value: string };

async function main() {
  const catOf = new Map<string, string | null>();
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db.from('products').select('sku, category_slug').order('sku').range(from, from + 999);
    if (error) throw error;
    for (const p of data ?? []) catOf.set(p.sku, p.category_slug);
    if (!data || data.length < 1000) break;
  }
  const canon = (r: Row) => canonicalCharValue(r.label, r.value, catOf.get(r.product_sku));

  const rows: Row[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db.from('product_characteristics')
      .select('id, product_sku, label, value').in('label', LABELS).order('id').range(from, from + 999);
    if (error) throw error;
    rows.push(...(data as Row[]));
    if (!data || data.length < 1000) break;
  }

  const changes = rows
    .map(r => ({ ...r, next: canon(r) }))
    .filter(r => r.next !== r.value.trim());

  for (const label of LABELS) {
    const mine = changes.filter(c => c.label === label);
    const map = new Map<string, { n: number; from: Map<string, number> }>();
    for (const c of mine) {
      const e = map.get(c.next) ?? { n: 0, from: new Map() };
      e.n++; e.from.set(c.value, (e.from.get(c.value) ?? 0) + 1); map.set(c.next, e);
    }
    const untouched = new Map<string, number>();
    for (const r of rows.filter(r => r.label === label && canon(r) === r.value.trim()))
      untouched.set(r.value.trim(), (untouched.get(r.value.trim()) ?? 0) + 1);

    console.log(`\n===== ${label}: ${rows.filter(r => r.label === label).length} рядків, змінюється ${mine.length}`);
    for (const [next, e] of [...map].sort((a, b) => b[1].n - a[1].n)) {
      console.log(`→ ${next}  (${e.n})`);
      for (const [from, n] of [...e.from].sort((a, b) => b[1] - a[1])) console.log(`     ${n}× ${from}`);
    }
    console.log(`-- без змін (${untouched.size} значень):`);
    for (const [v, n] of [...untouched].sort((a, b) => b[1] - a[1])) console.log(`     ${n}× ${v}`);
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
