#!/usr/bin/env node
/**
 * Рознесення історичних оплат постачальникам по боргах (FIFO).
 *
 *   node scripts/allocate-supplier-history.mjs            # тільки показати
 *   node scripts/allocate-supplier-history.mjs --apply    # записати
 *   node scripts/allocate-supplier-history.mjs --reset --apply   # перерахувати з нуля
 *
 * Навіщо: таблиця supplier_payment_allocations зʼявилась пізніше за самі оплати.
 * Поки вона порожня, кожна давня накладна виглядає неоплаченою, хоча гроші за неї
 * пішли ще влітку. Проходимо історію по кожному постачальнику: оплати за
 * датою, кожна гасить найстаріші відкриті борги.
 *
 * Таблиця похідна — її можна стерти й порахувати заново, сам облік не зачеплений.
 */
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(here, '../.env.local') });

const apply = process.argv.includes('--apply');
const reset = process.argv.includes('--reset');
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const kop = n => Math.round(Number(n) * 100);

const { data: entries, error } = await db
  .from('money_entries')
  .select('id, counterparty_id, amount, business_date, created_at, description')
  .eq('account_type', 'supplier')
  .not('counterparty_id', 'is', null)
  .order('business_date', { ascending: true })
  .order('created_at', { ascending: true });
if (error) { console.error(error.message); process.exit(1); }

if (reset) {
  if (apply) {
    const { error: delErr } = await db.from('supplier_payment_allocations').delete().neq('amount', -1);
    if (delErr) { console.error('reset:', delErr.message); process.exit(1); }
    console.log('попередні рознесення стерто');
  } else {
    console.log('(--reset без --apply нічого не стирає)');
  }
}

// Уже наявні рознесення враховуємо, щоб повторний запуск не подвоїв суми
const { data: existing } = await db.from('supplier_payment_allocations').select('payment_entry_id, charge_entry_id, amount');
const usedByCharge = new Map();
const usedByPayment = new Map();
for (const a of (existing ?? [])) {
  usedByCharge.set(a.charge_entry_id, (usedByCharge.get(a.charge_entry_id) ?? 0) + kop(a.amount));
  usedByPayment.set(a.payment_entry_id, (usedByPayment.get(a.payment_entry_id) ?? 0) + kop(a.amount));
}

const bySupplier = new Map();
for (const e of entries) {
  const k = String(e.counterparty_id);
  if (!bySupplier.has(k)) bySupplier.set(k, []);
  bySupplier.get(k).push(e);
}

const rows = [];
let totalPaid = 0, totalMatched = 0;

for (const [supplierId, list] of bySupplier) {
  const charges = list.filter(e => Number(e.amount) < 0)
    .map(e => ({ id: e.id, left: Math.abs(kop(e.amount)) - (usedByCharge.get(e.id) ?? 0) }))
    .filter(c => c.left > 0);
  const payments = list.filter(e => Number(e.amount) > 0)
    .map(e => ({ id: e.id, left: kop(e.amount) - (usedByPayment.get(e.id) ?? 0) }))
    .filter(p => p.left > 0);

  let ci = 0;
  for (const p of payments) {
    totalPaid += p.left;
    while (p.left > 0 && ci < charges.length) {
      const c = charges[ci];
      if (c.left <= 0) { ci++; continue; }
      const take = Math.min(p.left, c.left);
      rows.push({ payment_entry_id: p.id, charge_entry_id: c.id, amount: take / 100, created_by: 'backfill' });
      p.left -= take; c.left -= take; totalMatched += take;
      if (c.left === 0) ci++;
    }
  }
  const openLeft = charges.reduce((s, c) => s + Math.max(0, c.left), 0);
  const advance = payments.reduce((s, p) => s + Math.max(0, p.left), 0);
  console.log(`постачальник ${supplierId}: боргів ${charges.length}, оплат ${payments.length} → лишиться неоплаченим ${(openLeft / 100).toFixed(2)} ₴` + (advance > 0 ? `, аванс ${(advance / 100).toFixed(2)} ₴` : ''));
}

console.log(`\nрознесень: ${rows.length} · оплат на ${(totalPaid / 100).toFixed(2)} ₴ · зіставлено ${(totalMatched / 100).toFixed(2)} ₴`);

if (!apply) { console.log('\n(це прогін без запису; додайте --apply)'); process.exit(0); }

for (let i = 0; i < rows.length; i += 500) {
  const { error: insErr } = await db.from('supplier_payment_allocations').insert(rows.slice(i, i + 500));
  if (insErr) { console.error('insert:', insErr.message); process.exit(1); }
}
console.log('записано');
