/**
 * Рознесення всіх виплат RozetkaPay з виписки Mono по замовленнях (lib/rozetkapay-allocate).
 * Ідемпотентно (rzpay-alloc:{txn}:{order}); повторний запуск добирає нові кандидати.
 *
 *   npx tsx --env-file=.env.local scripts/backfill-rzpay-allocate.mts [--dry]
 */
import * as supabaseNS from '../lib/supabase';
import * as allocNS from '../lib/rozetkapay-allocate';
type Mod<T> = T & { default?: T };
const { createServiceClient } = ((supabaseNS as Mod<typeof supabaseNS>).default ?? supabaseNS);
const { allocateRzPayPayouts } = ((allocNS as Mod<typeof allocNS>).default ?? allocNS);
const db = createServiceClient();

const s = await allocateRzPayPayouts(db, 'script:backfill-rzpay-allocate');
console.log(`виплат до рознесення ${s.payouts}: рознесено ${s.allocated} (${s.orders} замовлень, ${s.amount} ₴)`);
for (const u of s.unmatched) console.log(`  не підібрано: ${u.date} брутто ${u.gross} (кандидатів ${u.candidates})`);

const { data: bal } = await db.from('counterparty_balances').select('counterparty_id, balance').eq('account_type', 'customer').in('counterparty_id', ['mp:prom', 'mp:rozetka', 'mp:rozetkapay']);
console.log('баланси:', bal);
