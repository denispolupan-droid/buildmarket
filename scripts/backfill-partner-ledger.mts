/**
 * Бекфіл дропшип-партнерів у леджер (після деплою partner-ledger, 09.2026).
 *
 * 1. Поповнення карткою (external_ref mono:topup:*), зараховані на баланс до деплою,
 *    але без проводки DR acquiring / CR partner → проводимо (ключ той самий, що у вебхуку,
 *    тож повтор і сам вебхук нічого не задвоять).
 * 2. Списання під замовлення без order_id (кабінет до 09.2026 не передавав id) →
 *    прив'язуємо до дропшип-замовлення того ж партнера, де закупка з рядків = сума
 *    списання і замовлення створене протягом 5 хв після списання. Лише однозначні збіги.
 *
 * Запуск:
 *   npx tsx --env-file=.env.local scripts/backfill-partner-ledger.mts          # план
 *   npx tsx --env-file=.env.local scripts/backfill-partner-ledger.mts --apply  # провести (з бекапом)
 */
import { writeFileSync } from 'node:fs';
import * as supabaseNS from '../lib/supabase';
import * as ledgerNS from '../lib/accounting/partner-ledger';
type Mod<T> = T & { default?: T };
const { createServiceClient } = ((supabaseNS as Mod<typeof supabaseNS>).default ?? supabaseNS);
const { recordPartnerCardTopup } = ((ledgerNS as Mod<typeof ledgerNS>).default ?? ledgerNS);

const apply = process.argv.includes('--apply');
const db = createServiceClient();

// ── 1. Поповнення карткою без проводки ──────────────────────────────────────
const { data: topups } = await db
  .from('partner_balance_transactions')
  .select('id, customer_id, amount, external_ref, created_at')
  .eq('tx_type', 'top_up')
  .like('external_ref', 'mono:topup:%')
  .order('created_at')
  .limit(1000);

const topupPlan: { id: number; customer_id: string; amount: number; invoiceId: string; date: string }[] = [];
for (const t of topups ?? []) {
  const invoiceId = String(t.external_ref).slice('mono:topup:'.length);
  const { data: posted } = await db.from('money_entries').select('id').eq('idempotency_key', `partner-topup:mono:${invoiceId}`).limit(1);
  if (posted?.length) continue;
  topupPlan.push({ id: t.id, customer_id: t.customer_id, amount: Number(t.amount), invoiceId, date: String(t.created_at).slice(0, 10) });
}

// ── 2. Списання без order_id ─────────────────────────────────────────────────
const { data: charges } = await db
  .from('partner_balance_transactions')
  .select('id, customer_id, amount, created_at')
  .eq('tx_type', 'charge')
  .is('order_id', null)
  .order('created_at')
  .limit(1000);

const linkPlan: { txId: number; orderId: string; orderNumber: number; amount: number }[] = [];
const ambiguous: { txId: number; candidates: number }[] = [];
for (const c of charges ?? []) {
  const from = new Date(c.created_at);
  const to = new Date(from.getTime() + 5 * 60 * 1000);
  const { data: orders } = await db
    .from('orders')
    .select('id, order_number, items, created_at')
    .eq('channel_code', 'dropship')
    .eq('partner_code', c.customer_id)
    .gte('created_at', from.toISOString())
    .lte('created_at', to.toISOString())
    .order('created_at')
    .limit(20);
  const want = Math.round(-Number(c.amount) * 100);
  const hits = (orders ?? []).filter(o => {
    const cost = ((o.items ?? []) as { qty: number; cost_price?: number }[]).reduce((s, i) => s + Number(i.cost_price ?? 0) * Number(i.qty), 0);
    return Math.round(cost * 100) === want;
  });
  if (hits.length === 1) linkPlan.push({ txId: c.id, orderId: hits[0].id, orderNumber: hits[0].order_number, amount: -Number(c.amount) });
  else ambiguous.push({ txId: c.id, candidates: hits.length });
}

console.log('Поповнення карткою без проводки:', topupPlan);
console.log('Списання → замовлення:', linkPlan);
if (ambiguous.length) console.log('Не прив\'язано (немає однозначного збігу):', ambiguous);

if (!apply) {
  console.log('\nПлан. Для проведення: --apply');
  process.exit(0);
}

const backup = `scripts/.backfill-partner-ledger-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
writeFileSync(backup, JSON.stringify({ topupPlan, linkPlan, charges }, null, 2));
console.log('Бекап:', backup);

for (const t of topupPlan) {
  await recordPartnerCardTopup({ customerId: t.customer_id, amount: t.amount, invoiceId: t.invoiceId, businessDate: t.date });
  console.log(`✓ проведено поповнення ${t.amount} ₴ (${t.invoiceId})`);
}
for (const l of linkPlan) {
  const { error } = await db.from('partner_balance_transactions').update({ order_id: l.orderId }).eq('id', l.txId).is('order_id', null);
  if (error) console.error(`✗ списання ${l.txId}: ${error.message}`);
  else console.log(`✓ списання ${l.amount} ₴ → замовлення #${l.orderNumber}`);
}
