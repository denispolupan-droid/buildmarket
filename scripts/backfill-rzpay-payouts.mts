/**
 * Проводить виплати RozetkaPay, які вже лежать у mono_bank_txns як unmatched
 * (до 09.2026 крон лишав їх «на ручну сверку», і ніхто не зносив).
 *
 *   npx tsx --env-file=.env.local scripts/backfill-rzpay-payouts.mts           # показати
 *   npx tsx --env-file=.env.local scripts/backfill-rzpay-payouts.mts --apply   # провести
 *
 * Та сама логіка, що в lib/mono-ingest для нових рядків: DR bank (нетто) +
 * DR marketplace_fee[rozetkapay] (винагорода) / CR customer[mp:rozetkapay] (брутто).
 * Ідемпотентно за id рядка виписки. Дата проводки = дата зарахування.
 */
import * as supabaseNS from '../lib/supabase';
import * as payoutNS from '../lib/rozetkapay-payout';

type Mod<T> = T & { default?: T };
const { createServiceClient } = ((supabaseNS as Mod<typeof supabaseNS>).default ?? supabaseNS);
const { parseRzPayPayout, postRzPayPayout } = ((payoutNS as Mod<typeof payoutNS>).default ?? payoutNS);

const apply = process.argv.includes('--apply');
const db = createServiceClient();
const fmt = (n: number) => n.toLocaleString('uk-UA', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const { data: rows, error } = await db
  .from('mono_bank_txns')
  .select('id, txn_time, amount, comment, description, counter_name, status')
  .eq('status', 'unmatched')
  .gt('amount', 0)
  .order('txn_time')
  .limit(2000);
if (error) throw error;

type Plan = { id: string; date: string; payout: NonNullable<ReturnType<typeof parseRzPayPayout>> };
const plan: Plan[] = [];
for (const r of rows ?? []) {
  // у mono_bank_txns сума в гривнях; парсер чекає копійки, як у сирій виписці
  const p = parseRzPayPayout({ amount: Math.round(Number(r.amount) * 100), comment: r.comment, description: r.description, counterName: r.counter_name });
  if (p) plan.push({ id: r.id as string, date: String(r.txn_time).slice(0, 10), payout: p });
}

const sum = (f: (p: Plan) => number) => plan.reduce((s, p) => s + f(p), 0);
console.log(`Виплат RozetkaPay до проведення: ${plan.length} — брутто ${fmt(sum(p => p.payout.gross))}, винагорода ${fmt(sum(p => p.payout.fee))}, нетто ${fmt(sum(p => p.payout.net))}`);
for (const p of plan) console.log(`  ${p.date}  ${fmt(p.payout.net).padStart(12)} ₴  (операції ${p.payout.periodFrom}${p.payout.periodTo !== p.payout.periodFrom ? '…' + p.payout.periodTo : ''}, брутто ${fmt(p.payout.gross)}, винагор. ${fmt(p.payout.fee)})`);

if (!apply) { console.log('\nРежим перегляду. Щоб провести: --apply'); process.exit(0); }

let done = 0;
for (const p of plan) {
  const posted = await postRzPayPayout(p.id, p.payout, p.date, 'script:backfill-rzpay-payouts');
  const { error: uErr } = await db.from('mono_bank_txns').update({ status: 'matched' }).eq('id', p.id);
  if (uErr) console.warn(`  ! ${p.id}: ${uErr.message}`);
  if (posted) done++;
}
console.log(`\nПроведено ${done} з ${plan.length}.`);
const { data: bal } = await db.from('counterparty_balances').select('balance').eq('account_type', 'customer').eq('counterparty_id', 'mp:rozetkapay').maybeSingle();
console.log('mp:rozetkapay тепер:', fmt(Number(bal?.balance ?? 0)));
