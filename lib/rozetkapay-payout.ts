/**
 * Проводки виплати RozetkaPay з виписки Monobank.
 *
 *   DR bank (нетто) + DR marketplace_fee[rozetkapay] (винагорода)
 *                                        / CR customer[mp:rozetkapay] (брутто)
 *
 * Рознесення по замовленнях на mp:prom / mp:rozetka — окремий крок з реєстру
 * Reports API (lib/rozetkapay-api), коли будуть ключі. Розбір рядка виписки —
 * lib/rozetkapay-statement (чистий, під тести).
 */
import { recordTxn } from './accounting/money';
import { SALE_DEBTOR } from './accounting/sale-party';
import type { RzPayPayout } from './rozetkapay-statement';

export { parseRzPayPayout, type RzPayPayout } from './rozetkapay-statement';

/**
 * Ідемпотентно за id рядка виписки (rzpay-payout:{id}, rzpay-fee:{id}).
 * Повертає false, якщо все вже було проведено.
 */
export async function postRzPayPayout(txnId: string, payout: RzPayPayout, businessDate: string, createdBy: string): Promise<boolean> {
  const isDup = (err: unknown) => /unique|duplicate|23505/.test(String(err instanceof Error ? err.message : err));
  const period = payout.periodFrom === payout.periodTo ? payout.periodFrom : `${payout.periodFrom}…${payout.periodTo}`;
  let posted = false;
  try {
    await recordTxn({
      debitAccount: 'bank', debitParty: null,
      creditAccount: 'customer', creditParty: SALE_DEBTOR.rozetkapay,
      amount: payout.net, businessDate, docType: 'payment',
      description: `Виплата RozetkaPay за операції ${period} (дог. ${payout.contract})`,
      idempotencyKey: `rzpay-payout:${txnId}`, createdBy,
      meta: { rzpay: payout, mono_txn_id: txnId },
    });
    posted = true;
  } catch (err) { if (!isDup(err)) throw err; }
  if (payout.fee > 0) {
    try {
      await recordTxn({
        debitAccount: 'marketplace_fee', debitParty: 'rozetkapay',
        creditAccount: 'customer', creditParty: SALE_DEBTOR.rozetkapay,
        amount: payout.fee, businessDate, docType: 'commission',
        description: `Винагорода RozetkaPay за переказ (операції ${period})`,
        idempotencyKey: `rzpay-fee:${txnId}`, createdBy,
        meta: { rzpay: payout, mono_txn_id: txnId },
      });
      posted = true;
    } catch (err) { if (!isDup(err)) throw err; }
  }
  return posted;
}
