/**
 * Бекфіл виручки по вже проведених продажах (K1 з docs/ACCOUNTING-AUDIT.md).
 *
 * Раніше recordShipment викликався тільки для документів з customer_id —
 * продажі маркетплейсів/гостей потрапляли в COGS, але не у виручку.
 * Скрипт дозаписує виручку (і сторно для сторно-документів) по всіх
 * підтверджених РН, де проводки shipment/storno-shipment відсутні.
 * Дебет-сторона визначається каналом замовлення (np:cod / mp:* / guest).
 *
 * Використання:
 *   npx tsx --env-file=.env.local scripts/backfill-sale-revenue.ts          # dry-run
 *   npx tsx --env-file=.env.local scripts/backfill-sale-revenue.ts --apply
 */
import { createServiceClient } from '../lib/supabase';
import { recordShipment, recordReturn } from '../lib/accounting/money';

const APPLY = process.argv.includes('--apply');

async function resolveParty(
  db: ReturnType<typeof createServiceClient>,
  doc: { customer_id: string | null; order_id: string | null },
): Promise<string> {
  if (doc.customer_id) return doc.customer_id;
  if (doc.order_id) {
    const { data: order } = await db
      .from('orders')
      .select('payment_type, channel_code')
      .eq('id', doc.order_id)
      .maybeSingle();
    if (order?.payment_type === 'cod')     return 'np:cod';
    if (order?.channel_code === 'prom')    return 'mp:prom';
    if (order?.channel_code === 'rozetka') return 'mp:rozetka';
  }
  return 'guest';
}

async function main() {
  const db = createServiceClient();

  const { data: docs, error } = await db
    .from('acc_documents')
    .select('id, doc_number, order_id, customer_id, contract_id, total_amount, doc_date, reversal_of, status')
    .eq('doc_type', 'sale')
    .eq('status', 'confirmed')
    .order('doc_date', { ascending: true })
    .limit(5000);
  if (error) throw error;
  if (!docs?.length) { console.log('Підтверджених РН немає.'); return; }

  const docIds = docs.map(d => d.id);
  const { data: existing } = await db
    .from('money_entries')
    .select('idempotency_key')
    .in('idempotency_key', docIds.flatMap(id => [`shipment:${id}`, `storno-shipment:${id}`]));
  const existingKeys = new Set((existing ?? []).map(e => e.idempotency_key));

  const originals = docs.filter(d => !d.reversal_of);
  const reversals = docs.filter(d => d.reversal_of);

  const toShip = originals.filter(d => Number(d.total_amount) > 0 && !existingKeys.has(`shipment:${d.id}`));
  // Сторно постимо тільки якщо в оригінала виручка Є (була або буде дозаписана зараз)
  const originalHasShipment = (origId: string) =>
    existingKeys.has(`shipment:${origId}`) || toShip.some(d => d.id === origId);
  const toStorno = reversals.filter(d =>
    Number(d.total_amount) > 0 &&
    !existingKeys.has(`storno-shipment:${d.id}`) &&
    originalHasShipment(d.reversal_of as string));

  console.log(`РН всього: ${docs.length} (оригіналів ${originals.length}, сторно ${reversals.length})`);
  console.log(`Дозаписати виручку: ${toShip.length}, дозаписати сторно: ${toStorno.length}\n`);

  for (const d of toShip) {
    const party = await resolveParty(db, d);
    console.log(`  + виручка ${d.doc_number}: ${Number(d.total_amount).toFixed(2)} грн → дебітор "${party}" (дата ${d.doc_date?.slice(0, 10)})`);
    if (APPLY) {
      await recordShipment({
        customerId:     party,
        contractId:     d.contract_id ?? undefined,
        orderId:        d.order_id ?? undefined,
        docId:          d.id,
        amount:         Number(d.total_amount),
        businessDate:   d.doc_date?.slice(0, 10),
        createdBy:      'backfill-revenue-script',
        idempotencyKey: `shipment:${d.id}`,
      });
    }
  }

  for (const d of toStorno) {
    const party = await resolveParty(db, d);
    console.log(`  − сторно ${d.doc_number}: ${Number(d.total_amount).toFixed(2)} грн ← дебітор "${party}" (дата ${d.doc_date?.slice(0, 10)})`);
    if (APPLY) {
      await recordReturn({
        customerId:     party,
        orderId:        d.order_id ?? undefined,
        docId:          d.id,
        amount:         Number(d.total_amount),
        businessDate:   d.doc_date?.slice(0, 10),
        createdBy:      'backfill-revenue-script',
        idempotencyKey: `storno-shipment:${d.id}`,
      });
    }
  }

  if (!APPLY) console.log('\nDry-run. Запустіть з --apply, щоб записати проводки.');
  else console.log('\nГотово. Перевірте оборотку: revenue має зійтись із сумами РН.');
}

main().catch(err => { console.error(err); process.exit(1); });
