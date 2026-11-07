/**
 * Разовий перерахунок історії: винагорода RozetkaPay по замовленнях
 * (order_deal_costs, міграція 158). Леджер НЕ змінюється.
 *
 *   npx tsx --env-file=.env.local scripts/backfill-rzpay-fees.ts            — перегляд (без запису)
 *   npx tsx --env-file=.env.local scripts/backfill-rzpay-fees.ts --write    — запис
 *
 * 1. Реєстри з пошти (з 18.08.2026): файл за посиланням із листа → точна комісія
 *    по рядку (allocateRzPayRegisterFees — без рознесення виплати в леджері).
 * 2. Перекази без розбивки після кроку 1 (ранні 20.07–17.08 без реєстру, або
 *    реєстр не завантажився) — пропорційно сумам замовлень, на які цей переказ
 *    уже рознесено в леджері (rzpay-alloc − undo − refund + refund-undo).
 *    Рішення власника 07.11.2026: ранні — пропорційно.
 * Звіт: по кожному переказу проведена винагорода, рознесено, метод, решта.
 */
import * as XLSX from 'xlsx';
import { createServiceClient } from '../lib/supabase-service';
import { fetchAllRows } from '../lib/db-paginate';
import { zohoFetch, getAccountId } from '../lib/zoho-mail';
import { extractRzPayRegisterLink } from '../lib/mail-registers-rules';
import { parseRzPayRegister } from '../lib/rozetkapay-register';
import { allocateRzPayRegisterFees } from '../lib/rozetkapay-register-apply';
import { allocateProportional } from '../lib/deal-costs-rules';
import { writeRzPayFeeAllocation, allocateAcquiringFee } from '../lib/deal-costs';
import { fetchWithTimeout } from '../lib/fetch-timeout';

const WRITE = process.argv.includes('--write');
const r2 = (n: number) => Math.round(n * 100) / 100;

type Line = { txn: string; date: string; ledger: number; allocated: number; method: string; note: string };

async function main() {
  const db = createServiceClient();
  console.log(WRITE ? '=== ЗАПИС ===' : '=== ПЕРЕГЛЯД (без запису; --write щоб записати) ===');

  // Усі проведені винагороди RozetkaPay
  const fees = await fetchAllRows<{ idempotency_key: string | null; amount: number; business_date: string; meta: unknown }>((f, t) => db
    .from('money_entries').select('idempotency_key, amount, business_date, meta')
    .like('idempotency_key', 'rzpay-fee:%').order('id').range(f, t));
  const ledger = new Map(fees.map(r => [String(r.idempotency_key).slice('rzpay-fee:'.length), {
    amount: r2(Number(r.amount)), date: String(r.business_date),
    period: String((r.meta as { rzpay?: { periodTo?: string } } | null)?.rzpay?.periodTo ?? ''),
  }]));
  const done = new Map<string, Line>();

  // ── 1. Реєстри з пошти ─────────────────────────────────────────────────────
  const { data: mails } = await db.from('mail_register_imports').select('message_id, register_no')
    .eq('kind', 'rzpay-register').in('status', ['done', 'no-doc']).order('received_at').limit(500);
  const acc = await getAccountId();
  const folders = ((await zohoFetch(`/accounts/${acc}/folders`)).data ?? []) as { folderId: string; path: string }[];
  const targets = folders.filter(f => f.path === '/Платежі' || f.path === '/Inbox');
  for (const m of mails ?? []) {
    let link: string | null = null;
    for (const f of targets) {
      const c = await zohoFetch(`/accounts/${acc}/folders/${f.folderId}/messages/${m.message_id}/content`).catch(() => null);
      link = extractRzPayRegisterLink(String(c?.data?.content ?? ''));
      if (link) break;
    }
    if (!link) { console.log(`  ${m.register_no}: посилання в листі не знайдено`); continue; }
    const dl = await fetchWithTimeout(link, undefined, 60_000);
    if (!dl.ok) { console.log(`  ${m.register_no}: файл не завантажився (HTTP ${dl.status})`); continue; }
    const wb = XLSX.read(Buffer.from(await dl.arrayBuffer()), { type: 'buffer' });
    const reg = parseRzPayRegister(XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: '' }));
    for (const p of await allocateRzPayRegisterFees(reg, { dryRun: !WRITE })) {
      if (!p.monoTxnId) { console.log(`  ${m.register_no} ${p.payoutDate}: переказ у виписці Mono не знайдено`); continue; }
      const l = ledger.get(p.monoTxnId);
      const allocated = p.fee?.status === 'written' ? p.fee.allocated : 0;
      done.set(p.monoTxnId, {
        txn: p.monoTxnId, date: l?.date ?? p.payoutDate, ledger: l?.amount ?? 0, allocated, method: 'реєстр',
        note: [p.fee?.status !== 'written' ? p.fee?.status ?? '' : '', p.fee?.status === 'written' && p.fee.capped ? 'обмежено проведеною' : '',
          p.unmatchedFee > 0 ? `без нашого замовлення ${p.unmatchedFee} ₴` : ''].filter(Boolean).join('; '),
      });
    }
  }

  // ── 2. Решта переказів — пропорційно рознесеним у леджері сумам ─────────────
  const alloc = await fetchAllRows<{ idempotency_key: string | null; amount: number; order_id: string | null }>((f, t) => db
    .from('money_entries').select('idempotency_key, amount, order_id')
    .or('idempotency_key.like.rzpay-alloc:%,idempotency_key.like.rzpay-alloc-undo:%,idempotency_key.like.rzpay-refund:%,idempotency_key.like.rzpay-refund-undo:%')
    .order('id').range(f, t));
  const SIGN: Record<string, number> = { 'rzpay-alloc': 1, 'rzpay-alloc-undo': -1, 'rzpay-refund': -1, 'rzpay-refund-undo': 1 };
  const byTxn = new Map<string, Map<string, number>>();
  for (const a of alloc) {
    const [kind, txn, order] = String(a.idempotency_key).split(':');
    if (!txn || !order || !(kind in SIGN)) continue;
    const m = byTxn.get(txn) ?? new Map<string, number>();
    m.set(order, r2((m.get(order) ?? 0) + SIGN[kind] * Math.abs(Number(a.amount))));
    byTxn.set(txn, m);
  }
  for (const [txn, l] of ledger) {
    if (done.has(txn) || !(l.amount > 0)) continue;
    const parts = [...(byTxn.get(txn) ?? new Map()).entries()].map(([orderId, weight]) => ({ orderId, weight }));
    const res = await writeRzPayFeeAllocation(db, { monoTxnId: txn, allocs: allocateProportional(l.amount, parts), method: 'proportional', dryRun: !WRITE });
    done.set(txn, {
      txn, date: l.date, ledger: l.amount, allocated: res.status === 'written' ? res.allocated : 0, method: 'пропорційно',
      note: parts.length ? (l.period >= '2026-08-17' ? 'реєстр не знайдено — пропорційно' : 'ранній, без реєстру') : 'переказ не рознесено по замовленнях',
    });
  }

  // ── Звіт ──────────────────────────────────────────────────────────────────
  const lines = [...done.values()].sort((a, b) => a.date.localeCompare(b.date));
  for (const x of lines) {
    const rest = r2(x.ledger - x.allocated);
    console.log(`${x.date}  проведено ${x.ledger.toFixed(2).padStart(8)}  рознесено ${x.allocated.toFixed(2).padStart(8)}  решта ${rest.toFixed(2).padStart(6)}  ${x.method}${x.note ? '  · ' + x.note : ''}`);
  }
  const tot = (k: 'ledger' | 'allocated') => r2(lines.reduce((s, x) => s + x[k], 0));
  const totalLedger = r2([...ledger.values()].reduce((s, l) => s + l.amount, 0));
  console.log(`\nПереказів: ${lines.length} з ${ledger.size}. Проведено винагороди: ${totalLedger} ₴ (у звіті ${tot('ledger')}).`);
  console.log(`Рознесено по замовленнях: ${tot('allocated')} ₴ (реєстр ${r2(lines.filter(x => x.method === 'реєстр').reduce((s, x) => s + x.allocated, 0))}, пропорційно ${r2(lines.filter(x => x.method === 'пропорційно').reduce((s, x) => s + x.allocated, 0))}).`);
  console.log(`Лишається без замовлення: ${r2(totalLedger - tot('allocated'))} ₴.`);

  // ── 3. Еквайринг Monobank: комісія одного платежу → його замовлення ─────────
  console.log('\n=== Еквайринг ===');
  const acq = await fetchAllRows<{ idempotency_key: string | null; amount: number; business_date: string }>((f, t) => db
    .from('money_entries').select('idempotency_key, amount, business_date')
    .like('idempotency_key', 'acq-fee:%').order('id').range(f, t));
  let acqTotal = 0, acqAlloc = 0;
  for (const r of acq) {
    const id = String(r.idempotency_key).slice('acq-fee:'.length);
    acqTotal = r2(acqTotal + Number(r.amount));
    const res = await allocateAcquiringFee(db, id, { dryRun: !WRITE });
    if (res.status === 'written') acqAlloc = r2(acqAlloc + res.amount);
    const what = res.status === 'written' ? `→ #${res.orderNumber} (${res.by === 'number' ? 'за номером' : 'за сумою'})`
      : res.status === 'topup' ? 'поповнення балансу партнера — без замовлення'
      : res.status === 'no-order' ? `без замовлення: ${res.reason}` : res.status;
    console.log(`${r.business_date}  ${Number(r.amount).toFixed(2).padStart(6)}  ${what}`);
  }
  console.log(`Еквайринг: проведено ${acqTotal} ₴, рознесено ${acqAlloc} ₴, без замовлення ${r2(acqTotal - acqAlloc)} ₴.`);
}

main().catch(e => { console.error(e); process.exit(1); });
