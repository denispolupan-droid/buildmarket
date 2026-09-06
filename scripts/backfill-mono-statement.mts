/**
 * Бекфіл виписки Mono (ФОП) з дати старту обліку: усі операції — і надходження, і
 * списання — через той самий ingestMonoTxn (дедуп по id: уже оброблене пропускається,
 * тож повторний запуск безпечний). Списання лягають у mono_bank_txns як unmatched —
 * категоризація на екрані «Банк». Покриття еквайрингу проводяться (acq-settle/acq-fee).
 *
 * Monobank Personal: вікно ≤ 31 доба, не частіше 1 запиту на 60 с → між вікнами пауза.
 *
 *   npx tsx --env-file=.env.local scripts/backfill-mono-statement.mts [2026-07-01]
 */
import * as supabaseNS from '../lib/supabase';
import * as ingestNS from '../lib/mono-ingest';

type Mod<T> = T & { default?: T };
const { createServiceClient } = ((supabaseNS as Mod<typeof supabaseNS>).default ?? supabaseNS);
const { fetchAndIngestMonoStatement, postPendingAcquiringSettlements } = ((ingestNS as Mod<typeof ingestNS>).default ?? ingestNS);

const startArg = process.argv[2] ?? '2026-07-01';
const db = createServiceClient();
const WINDOW = 31 * 86400;
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

let from = Math.floor(Date.parse(`${startArg}T00:00:00Z`) / 1000);
const now = Math.floor(Date.now() / 1000);
let first = true;
while (from < now) {
  const to = Math.min(from + WINDOW - 1, now);
  if (!first) { console.log('  … пауза 61 с (ліміт Monobank)'); await sleep(61_000); }
  first = false;
  try {
    const s = await fetchAndIngestMonoStatement(db, 0, from, to);
    console.log(`${s.from}…${s.to}: ${s.total} операцій — зараховано ${s.matched}, виплат RozetkaPay ${s.payouts}, еквайринг ${s.acquiring}, списань ${s.debits}, на сверку ${s.unmatched}, пропущено (дублі) ${s.skipped}`);
  } catch (err) {
    console.error(`${new Date(from * 1000).toISOString().slice(0, 10)}: ERR ${err instanceof Error ? err.message : err}`);
    if (/ 429 /.test(String(err))) { await sleep(61_000); continue; }
  }
  from = to + 1;
}
const acq = await postPendingAcquiringSettlements(db, 'script:backfill-mono-statement');
console.log(`Покриттів еквайрингу проведено: ${acq}`);
const { data: out } = await db.from('mono_bank_txns').select('amount').eq('direction', 'out').eq('status', 'unmatched');
console.log(`Списань на категоризацію: ${(out ?? []).length} на ${(out ?? []).reduce((s, r) => s + Number(r.amount), 0).toFixed(2)} ₴`);
