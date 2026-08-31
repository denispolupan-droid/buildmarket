/**
 * lib/rozetka-fees-sync.ts — проводимо ФАКТИЧНІ збори Rozetka з її ж балансів.
 *
 * Досі збір за організацію видачі в точці проводився при НАШІЙ відгрузці — тобто
 * за передбаченням. Це залишало дірку: замовлення 26071055 (покупець відмовився
 * забирати) до відгрузки не дійшло, ТТН створювали в кабінеті, і Rozetka зняла
 * 30 ₴ 30.07 — а в обліку їх не було й не могло з'явитися. Тепер джерело —
 * логістичний баланс: там списання лежить із order_id, ттн і сумою, незалежно
 * від того, хто створив накладну і чим скінчився заказ. Типи операцій — у
 * ROZETKA_PICKUP_OP_TYPES; вони змінюються (34 → 106/107 у серпні 2026), тому
 * про будь-який НЕВІДОМИЙ тип, що щось списує, синк одразу кричить алертом.
 *
 * Ключ ідемпотентності первинного нарахування НАВМИСНО той самий, що в
 * ship-route (`rz-delivery-fee:rozetka:<order_id>`): якщо відгрузка вже провела
 * збір, синк не дублює.
 *
 * Розбіжність суми ДОВОДИМО до факту окремою проводкою-уточненням. Раніше її
 * лише писали в лог — і облік місяць розходився з кабінетом на 5 ₴ із кожного
 * відправлення, бо при відгрузці ставилась оцінка 30 ₴, а Rozetka з 07.08
 * знімала 35. Автосторно тут безпечне: сума береться не з нашої формули, а з
 * виписки площадки, і ключ уточнення прив'язаний до самої суми факту.
 *
 * Абонплата (operation_type 5) — щомісячна, знімається за умови хоча б одного
 * замовлення. До замовлення не прив'язана, тож іде як витрата площадки з ключем
 * по id операції.
 */
import { createServiceClient } from './supabase';
import { rozetkaFetch, getRozetkaLogisticOps } from './rozetka-api';
import { recordMarketplaceServiceFee } from './accounting/money';
import { recordTxn } from './accounting/money';
import { alertAdmin } from './alert';
import { isRozetkaPickupOp, isUnknownLogisticOp, isRozetkaLogisticAdj } from './rozetka-delivery-tariff';
import { rozetkaFeeKind, rozetkaActualCommission } from './rozetka-fee-kind';

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
  delivery: number; subscription: number; commission: number; skipped: number; errors: number;
}> {
  const db = createServiceClient();
  let delivery = 0, subscription = 0, commission = 0, skipped = 0, errors = 0;

  // ── Збір за організацію видачі в точці ────────────────────────────────────
  try {
    // Через getRozetkaLogisticOps, а не одним запитом: Rozetka ІГНОРУЄ per_page
    // на цьому ендпоінті й віддає по 20 рядків. Синк читав тільки першу сторінку
    // і бачив 12 списань із 38 — дві третини збору не потрапляли в облік навіть
    // по відомому типу 34 (виявлено звіркою 31.08.2026).
    const all: LogisticOp[] = await getRozetkaLogisticOps(perPage);

    // Новий тип операції, який щось списує, — привід дізнатись одразу. Саме на
    // цьому й погоріли: 106/107 з'явились у серпні, синк їх не знав, і збір
    // місяць не потрапляв в облік.
    const unknown = all.filter(o => num(o.debit) < 0 && isUnknownLogisticOp(o.operation_type));
    if (unknown.length) {
      const kinds = [...new Set(unknown.map(o => `${o.operation_type} «${o.operation_type_title}»`))];
      alertAdmin(
        'Rozetka: невідомий тип списання на логістичному балансі',
        `${kinds.join(', ')} — ${unknown.length} операцій на ${unknown.reduce((s, o) => s + Math.abs(num(o.debit)), 0)} ₴. `
        + 'Якщо це збір за видачу — додайте тип у ROZETKA_PICKUP_OP_TYPES, інакше він не потрапить в облік.',
      );
    }

    // Коригування логістичного рахунку. Rozetka перераховує вже списаний збір
    // (06–07.08.2026: зняла за два Meest по 49 ₴, повернула обидва і списала по
    // 30 ₴). order_id у цих рядках немає, рознести по замовленнях нічим — тому
    // проводимо рівнем рахунку, кожну операцію окремо й за її id.
    for (const op of all.filter(o => isRozetkaLogisticAdj(o.operation_type))) {
      const charge = Math.abs(num(op.debit));
      const refund = Math.abs(num(op.credit));
      const amount = charge || refund;
      if (!(amount > 0)) continue;
      try {
        await recordTxn({
          debitAccount:   charge ? 'marketplace_fee' : 'marketplace_balance',
          debitParty:     'rozetka',
          creditAccount:  charge ? 'marketplace_balance' : 'marketplace_fee',
          creditParty:    'rozetka',
          amount,
          docType:        'commission',
          businessDate:   dateOf(op.transaction_ts),
          description:    `Rozetka Доставка — організація видачі, ${op.operation_type_title.toLowerCase()} `
                        + `(операція ${op.operation_id})`,
          idempotencyKey: `rz-logistic-adj:rozetka:${op.operation_id}`,
          createdBy:      'sync:rozetka-fees',
          meta:           { kind: 'rz_logistic_adj', operation_id: op.operation_id, operation_type: op.operation_type },
        });
        delivery++;
      } catch (err) {
        errors++;
        console.error('[rozetka-fees] logistic adjustment failed:', op.operation_id, err);
      }
    }

    const charges = all.filter(o => isRozetkaPickupOp(o.operation_type) && num(o.debit) < 0);

    if (charges.length) {
      // Факт може прийти кількома операціями на одне замовлення — звіряємо СУМУ,
      // а не окремий рядок.
      const wantByRz = new Map<number, { amount: number; ts: string; ttn: string | null; ops: number[] }>();
      for (const op of charges) {
        const rz = Number(op.order_id);
        if (!rz) { skipped++; continue; }
        const cur = wantByRz.get(rz) ?? { amount: 0, ts: op.transaction_ts, ttn: op.ttn, ops: [] };
        cur.amount += Math.abs(num(op.debit));
        cur.ops.push(op.operation_id);
        if (op.transaction_ts > cur.ts) cur.ts = op.transaction_ts;
        wantByRz.set(rz, cur);
      }

      const { data: ours } = await db.from('orders')
        .select('id, order_number, rozetka_order_id')
        .in('rozetka_order_id', [...wantByRz.keys()]);
      const byRz = new Map((ours ?? []).map(o => [Number(o.rozetka_order_id), o]));

      // Скільки збору вже проведено по цих замовленнях — щоб доводити РІЗНИЦЮ,
      // а не проводити вдруге. Ключ ідемпотентності первинного нарахування
      // спільний із ship-route, тож саме нарахування не задвоїться, але сума
      // там оцінкова: з 07.08 Rozetka бере 35 ₴, а оцінка давала 30.
      const orderIds = (ours ?? []).map(o => o.id);
      const posted = new Map<string, number>();
      if (orderIds.length) {
        const { data: rows } = await db.from('money_entries')
          .select('order_id, amount, description')
          .eq('account_type', 'marketplace_fee')
          .eq('counterparty_id', 'rozetka')
          .in('order_id', orderIds)
          .limit(10000);
        for (const r of rows ?? []) {
          if (!r.order_id || !/організація видачі/i.test(String(r.description ?? ''))) continue;
          posted.set(r.order_id, (posted.get(r.order_id) ?? 0) + Number(r.amount));
        }
      }

      for (const [rz, want] of wantByRz) {
        const order = byRz.get(rz);
        if (!order) { skipped++; continue; }   // замовлення не наше або ще не імпортоване
        if (!(want.amount > 0)) { skipped++; continue; }
        const have = Math.round((posted.get(order.id) ?? 0) * 100) / 100;
        const delta = Math.round((want.amount - have) * 100) / 100;
        if (Math.abs(delta) < 0.01) { skipped++; continue; }

        try {
          if (have === 0) {
            await recordMarketplaceServiceFee({
              orderId:        order.id,
              amount:         want.amount,
              marketplace:    'rozetka',
              description:    `Rozetka Доставка — організація видачі відправлення (замовлення #${order.order_number})`,
              // Той самий ключ, що й у ship-route: подвійного проведення не буде.
              idempotencyKey: `rz-delivery-fee:rozetka:${order.id}`,
              businessDate:   dateOf(want.ts),
              createdBy:      'sync:rozetka-fees',
              meta:           { kind: 'rz_delivery_fee', ttn: want.ttn, operation_ids: want.ops },
            });
          } else {
            // Доводимо оцінку до факту. Ключ прив'язаний до САМОЇ суми факту:
            // якщо Rozetka донарахує ще раз, з'явиться новий ключ, а повторний
            // прогін по тій самій сумі нічого не задвоїть.
            await recordTxn({
              debitAccount:   delta > 0 ? 'marketplace_fee' : 'marketplace_balance',
              debitParty:     'rozetka',
              creditAccount:  delta > 0 ? 'marketplace_balance' : 'marketplace_fee',
              creditParty:    'rozetka',
              amount:         Math.abs(delta),
              docType:        'commission',
              orderId:        order.id,
              businessDate:   dateOf(want.ts),
              description:    `Rozetka Доставка — організація видачі відправлення, уточнення до факту `
                            + `(замовлення #${order.order_number}: було ${have} ₴, факт ${want.amount} ₴)`,
              idempotencyKey: `rz-delivery-fee-adj:rozetka:${order.id}:${want.amount.toFixed(2)}`,
              createdBy:      'sync:rozetka-fees',
              meta:           { kind: 'rz_delivery_fee_adj', was: have, actual: want.amount, operation_ids: want.ops },
            });
          }
          delivery++;
        } catch (err) {
          errors++;
          console.error('[rozetka-fees] delivery fee failed:', rz, err);
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

  // ── Комісія: доводимо нараховане до фактично списаного ────────────────────
  try {
    commission = await trueUpCommission(db);
  } catch (err) {
    errors++;
    console.error('[rozetka-fees] commission true-up failed:', err);
  }

  return { delivery, subscription, commission, skipped, errors };
}

/** Вікно звірки комісії: комісія списується при доставці, тож місяця з запасом досить. */
const COMMISSION_WINDOW_DAYS = 45;

/**
 * Наша комісія — це ОЦІНКА за тарифом, і збігтися з площадкою вона може лише
 * випадково. Звірка 31.08.2026: із 124 замовлень 118 зійшлися копійка в копійку,
 * а 6 — ні, і причини різні й обидві непереборні розрахунком:
 *
 *   · Rozetka підняла ставки в середині серпня. Замовлення, зроблене до
 *     підвищення, вона списує за СТАРОЮ ставкою, а ми проводимо його при
 *     доставці — уже за новим тарифом (3 замовлення).
 *   · Тариф заданий по великих вузлах: «Будівельні матеріали» 20 %, а
 *     епоксидний клей усередині цього вузла Rozetka рахує по 18 % (3 замовлення).
 *
 * Наздогнати це формулою не вийде: єдине джерело правди — виписка площадки.
 * Тому нараховуємо оцінку при доставці (щоб звіт не чекав виписки), а потім
 * доводимо до факту окремою проводкою, у назві якої видно і оцінку, і факт.
 *
 * Правимо ЛИШЕ те, де комісія вже проведена: якщо замовлення ще не доставлене,
 * нарахування зробить звичайний потік, а наступний прогін синку його уточнить.
 * Інакше ми провели б комісію двічі — своїм ключем і ключем уточнення.
 */
async function trueUpCommission(db: ReturnType<typeof createServiceClient>): Promise<number> {
  const from = new Date(Date.now() - COMMISSION_WINDOW_DAYS * 86400_000).toISOString().slice(0, 10);
  const to   = new Date(Date.now() + 86400_000).toISOString().slice(0, 10);

  const txns: BalanceOp[] = [];
  let page = 1, pages = 1;
  do {
    const c = await rozetkaFetch<{ billingLogUserBalances: BalanceOp[]; _meta?: { pageCount?: number } }>(
      `/balances/search?date_from=${from}&date_to=${to}&per_page=100&page=${page}`);
    txns.push(...(c.billingLogUserBalances ?? []));
    pages = Number(c._meta?.pageCount ?? 1);
    page++;
  } while (page <= pages && page <= MAX_PAGES);

  const actual = rozetkaActualCommission(txns);
  if (!actual.size) return 0;

  const { data: ours } = await db.from('orders')
    .select('id, order_number, rozetka_order_id')
    .in('rozetka_order_id', [...actual.keys()]);
  if (!ours?.length) return 0;

  const { data: rows } = await db.from('money_entries')
    .select('order_id, amount, description, doc_type, meta')
    .eq('account_type', 'marketplace_fee')
    .eq('counterparty_id', 'rozetka')
    .in('order_id', ours.map(o => o.id))
    .limit(10000);
  const posted = new Map<string, number>();
  for (const r of rows ?? []) {
    if (!r.order_id || rozetkaFeeKind(r) !== 'commission') continue;
    posted.set(r.order_id, Math.round(((posted.get(r.order_id) ?? 0) + Number(r.amount)) * 100) / 100);
  }

  let fixed = 0;
  for (const o of ours) {
    const want = actual.get(Number(o.rozetka_order_id));
    const have = posted.get(o.id) ?? 0;
    if (want == null || have === 0) continue;          // ще не проводили — не наша черга
    const delta = Math.round((want - have) * 100) / 100;
    if (Math.abs(delta) < 0.01) continue;
    try {
      await recordTxn({
        debitAccount:   delta > 0 ? 'marketplace_fee' : 'marketplace_balance',
        debitParty:     'rozetka',
        creditAccount:  delta > 0 ? 'marketplace_balance' : 'marketplace_fee',
        creditParty:    'rozetka',
        amount:         Math.abs(delta),
        docType:        'commission',
        orderId:        o.id,
        description:    `Rozetka — комісія, уточнення до виписки (замовлення #${o.order_number}: `
                      + `нараховано ${have.toFixed(2)} ₴, площадка списала ${want.toFixed(2)} ₴)`,
        idempotencyKey: `rz-commission-adj:rozetka:${o.id}:${want.toFixed(2)}`,
        createdBy:      'sync:rozetka-fees',
        meta:           { kind: 'rz_commission_adj', accrued: have, actual: want },
      });
      fixed++;
    } catch (err) {
      console.error('[rozetka-fees] commission true-up failed:', o.order_number, err);
    }
  }
  return fixed;
}
