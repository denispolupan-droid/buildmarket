/**
 * lib/rozetka-fees-sync.ts — проводимо ФАКТИЧНІ збори Rozetka з її ж балансів.
 *
 * Досі збір за організацію видачі в точці проводився при НАШІЙ відгрузці — тобто
 * за передбаченням. Це залишало дірку: замовлення 26071055 (покупець відмовився
 * забирати) до відгрузки не дійшло, ТТН створювали в кабінеті, і Rozetka зняла
 * 30 ₴ 30.07 — а в обліку їх не було й не могло з'явитися. Тепер джерело —
 * логістичний баланс: там є operation_type 34 «Доставка відправлення» з order_id,
 * ттн і сумою, незалежно від того, хто створив накладну і чим скінчився заказ.
 *
 * Ключ ідемпотентності НАВМИСНО той самий, що в ship-route
 * (`rz-delivery-fee:rozetka:<order_id>`): якщо відгрузка вже провела збір, синк
 * нічого не дублює; якщо ні — проводить. Розбіжність суми не «виправляємо»
 * автоматично — про неї пишемо в лог, бо автосторно в обліку небезпечніше за
 * ручну правку.
 *
 * Абонплата (operation_type 5) — щомісячна, знімається за умови хоча б одного
 * замовлення. До замовлення не прив'язана, тож іде як витрата площадки з ключем
 * по id операції.
 */
import { createServiceClient } from './supabase';
import { rozetkaFetch } from './rozetka-api';
import { recordMarketplaceServiceFee } from './accounting/money';
import { recordTxn } from './accounting/money';

/** Операція логістичного балансу. debit від'ємний — це списання. */
type LogisticOp = {
  operation_id: number;
  operation_type: number;
  order_id: string | null;
  ttn: string | null;
  transaction_ts: string;
  debit: number;
  credit: number;
  operation_type_title: string;
};

/** Рядок основного балансу (машиночитаний аналог виписки з кабінету). */
type BalanceOp = {
  logId: number;
  orderId: number;
  operationType: number;
  debit: string | number;
  credit: string | number;
  transaction_ts: string;
};

export const OP_DELIVERY = 34;      // «Доставка відправлення» — логістичний баланс
export const OP_SUBSCRIPTION = 5;   // «Списання абонплати» — основний баланс

/** Вікно пошуку абонплати: з запасом на пропущені прогони, але без обходу всієї історії. */
const SUBSCRIPTION_WINDOW_DAYS = 60;
/** Стеля перебору сторінок — щоб збій пагінації не крутив запити нескінченно. */
const MAX_PAGES = 20;

const num = (v: unknown) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
const dateOf = (ts: string) => String(ts).slice(0, 10);

export async function syncRozetkaFees(perPage = 100): Promise<{
  delivery: number; subscription: number; skipped: number; errors: number;
}> {
  const db = createServiceClient();
  let delivery = 0, subscription = 0, skipped = 0, errors = 0;

  // ── Збір за організацію видачі в точці ────────────────────────────────────
  try {
    const c = await rozetkaFetch<{ logisticBalances: LogisticOp[] }>(
      `/balance-logistic/search?per_page=${perPage}`);
    const charges = (c.logisticBalances ?? []).filter(o => o.operation_type === OP_DELIVERY && num(o.debit) < 0);

    if (charges.length) {
      const rzIds = [...new Set(charges.map(o => Number(o.order_id)).filter(Boolean))];
      const { data: ours } = await db.from('orders')
        .select('id, order_number, rozetka_order_id')
        .in('rozetka_order_id', rzIds);
      const byRz = new Map((ours ?? []).map(o => [Number(o.rozetka_order_id), o]));

      for (const op of charges) {
        const order = byRz.get(Number(op.order_id));
        if (!order) { skipped++; continue; }   // замовлення не наше або ще не імпортоване
        const amount = Math.abs(num(op.debit));
        if (!(amount > 0)) { skipped++; continue; }
        try {
          await recordMarketplaceServiceFee({
            orderId:        order.id,
            amount,
            marketplace:    'rozetka',
            description:    `Rozetka Доставка — організація видачі відправлення (замовлення #${order.order_number})`,
            // Той самий ключ, що й у ship-route: подвійного проведення не буде.
            idempotencyKey: `rz-delivery-fee:rozetka:${order.id}`,
            businessDate:   dateOf(op.transaction_ts),
            createdBy:      'sync:rozetka-fees',
            meta:           { kind: 'rz_delivery_fee', ttn: op.ttn, operation_id: op.operation_id },
          });
          delivery++;
        } catch (err) {
          errors++;
          console.error('[rozetka-fees] delivery fee failed:', op.operation_id, err);
        }
      }
    }
  } catch (err) {
    errors++;
    console.error('[rozetka-fees] logistic balance pull failed:', err);
  }

  // ── Абонплата ─────────────────────────────────────────────────────────────
  // Знімається раз на місяць, а операцій на балансі десятки на день — тож без
  // вікна по датах і перебору сторінок вона просто не потрапляє у вибірку
  // (перевірено: у першій сотні операцій списання від 31.07 уже немає).
  try {
    const from = new Date(Date.now() - SUBSCRIPTION_WINDOW_DAYS * 86400_000).toISOString().slice(0, 10);
    const to   = new Date(Date.now() + 86400_000).toISOString().slice(0, 10);
    const fees: BalanceOp[] = [];
    let page = 1, pages = 1;
    do {
      const c = await rozetkaFetch<{ billingLogUserBalances: BalanceOp[]; _meta?: { pageCount?: number } }>(
        `/balances/search?date_from=${from}&date_to=${to}&per_page=${perPage}&page=${page}`);
      fees.push(...(c.billingLogUserBalances ?? []).filter(o => o.operationType === OP_SUBSCRIPTION && num(o.debit) > 0));
      pages = Number(c._meta?.pageCount ?? 1);
      page++;
    } while (page <= pages && page <= MAX_PAGES);

    for (const op of fees) {
      const amount = num(op.debit);
      if (!(amount > 0)) continue;
      try {
        await recordTxn({
          debitAccount:   'marketplace_fee',
          debitParty:     'rozetka',
          creditAccount:  'marketplace_balance',
          creditParty:    'rozetka',
          amount,
          docType:        'subscription_fee',
          businessDate:   dateOf(op.transaction_ts),
          description:    `Rozetka — абонплата за ${dateOf(op.transaction_ts).slice(0, 7)}`,
          idempotencyKey: `rz-subscription:${op.logId}`,
          createdBy:      'sync:rozetka-fees',
          meta:           { kind: 'rz_subscription', log_id: op.logId },
        });
        subscription++;
      } catch (err) {
        errors++;
        console.error('[rozetka-fees] subscription fee failed:', op.logId, err);
      }
    }
  } catch (err) {
    errors++;
    console.error('[rozetka-fees] balance pull failed:', err);
  }

  return { delivery, subscription, skipped, errors };
}
