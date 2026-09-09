/**
 * Рознесення виплат RozetkaPay по замовленнях БЕЗ API RozetkaPay (відповідь підтримки
 * 07.09.2026: ключів для проєктів маркетплейсів не дають; статус оплати без затримки
 * передається на Prom/Rozetka — беремо його звідти).
 *
 * Що знаємо про виплату (рядок виписки Mono, lib/rozetkapay-statement): період операцій
 * і брутто. Кандидати — замовлення, чиї гроші йдуть через RozetkaPay (правило дебітора:
 * mp:prom / mp:rozetka), ще не рознесені; дата події:
 *   Prom-оплата            — payment_data.status_modified (status = paid)
 *   Rozetka передоплата    — payment.payment_status.created_at (name = paid)
 *   наложка через Rozetka Delivery (будь-який канал) — delivered_at
 * RozetkaPay платить за передоплату в момент оплати (до вручення!), тож і невручені
 * замовлення — кандидати; їхній дебітор mp:* іде в мінус (аванс) і обнуляється продажем.
 * Емпірика 07.09 (30 виплат): гроші приходять з лагом до кількох днів, тому вікно
 * [from − LAG, to]; склад підбирається підмножиною рівно на брутто (26/30 зійшлись).
 *
 * Проводка на замовлення: DR customer[mp:rozetkapay] / CR customer[mp:prom|mp:rozetka],
 * ключ rzpay-alloc:{mono_txn}:{order}. Не підібрані виплати лишаються на клірингу
 * mp:rozetkapay сумою і повторно пробуються кожним запуском (вікно обмежене періодом).
 */
import { createServiceClient } from './supabase';
import { fetchAllRows } from './db-paginate';
import { recordTxn } from './accounting/money';
import { SALE_DEBTOR } from './accounting/sale-party';
import { parseRzPayPayout } from './rozetkapay-statement';
import { rzPayEventFor, rzPayCandidatesFor, matchRzPayPayout, shiftDate, type RzPayCandidateOrder, type RzPayEvent } from './rozetkapay-allocate-rules';

export * from './rozetkapay-allocate-rules';

export type RzPayAllocateSummary = { payouts: number; allocated: number; orders: number; amount: number; unmatched: { date: string; gross: number; candidates: number }[] };

/** Усі не рознесені виплати RozetkaPay з виписки Mono → проводки по замовленнях. Ідемпотентно. */
export async function allocateRzPayPayouts(db = createServiceClient(), createdBy = 'rzpay-allocate'): Promise<RzPayAllocateSummary> {
  const payoutRows = await fetchAllRows<{ id: string; txn_time: string; amount: number; comment: string | null; description: string | null; counter_name: string | null; category: string | null; note: string | null }>((f, t) => db
    .from('mono_bank_txns').select('id, txn_time, amount, comment, description, counter_name, category, note')
    .eq('direction', 'in').eq('status', 'matched').ilike('comment', '%Переказ коштів за операції%')
    .order('txn_time', { ascending: true }).range(f, t));
  const pending = payoutRows.filter(r => r.category !== 'rzpay:allocated');
  const summary: RzPayAllocateSummary = { payouts: pending.length, allocated: 0, orders: 0, amount: 0, unmatched: [] };
  if (pending.length === 0) return summary;

  // Уже рознесені замовлення: НЕТТО дебет mp:rozetkapay по замовленню > 0 (rzpay-alloc:*,
  // ручні перекласифікації; сторно rzpay-alloc-undo знімає — замовлення знову кандидат)
  const allocRows = await fetchAllRows<{ order_id: string | null; amount: number }>((f, t) => db
    .from('money_entries').select('order_id, amount').eq('account_type', 'customer').eq('counterparty_id', SALE_DEBTOR.rozetkapay)
    .not('order_id', 'is', null).range(f, t));
  const netByOrder: Record<string, number> = {};
  for (const r of allocRows) netByOrder[r.order_id as string] = Math.round(((netByOrder[r.order_id as string] ?? 0) + Number(r.amount)) * 100) / 100;
  const allocated = new Set(Object.keys(netByOrder).filter(k => netByOrder[k] > 0.005));
  // Скільки з кожної виплати вже рознесено (у т.ч. сторно rzpay-alloc-undo) — добираємо залишок
  // (ключ ідемпотентності стоїть лише на дебетовому рядку проводки: alloc → дебет mp:rozetkapay,
  // undo → дебет mp:*; тому знак беремо з префікса ключа, а не з рахунку)
  const keyed = await fetchAllRows<{ idempotency_key: string; amount: number }>((f, t) => db
    .from('money_entries').select('idempotency_key, amount').like('idempotency_key', 'rzpay-alloc%').range(f, t));
  // Ключ: {kind}:{txn}:{order}[:{seq}] — після сторно те саме замовлення може знову
  // потрапити в ту саму виплату, тож повторна проводка отримує наступний seq
  // (інакше вона мовчки впала б у дубль і склад виплати лишився б неповним — кейс 08.09).
  const doneByTxn: Record<string, number> = {};
  const keyCount: Record<string, number> = {};
  for (const r of keyed) {
    const [kind, txn, order] = r.idempotency_key.split(':');
    const sign = kind === 'rzpay-alloc-undo' ? -1 : 1;
    doneByTxn[txn] = Math.round(((doneByTxn[txn] ?? 0) + sign * Math.abs(Number(r.amount))) * 100) / 100;
    const pair = `${txn}:${order}`;
    keyCount[pair] = (keyCount[pair] ?? 0) + 1;
  }

  const since = shiftDate(pending[0].txn_time.slice(0, 10), -60);
  const orders = await fetchAllRows<Record<string, unknown>>((f, t) => db
    .from('orders')
    .select('id, order_number, channel_code, payment_type, delivery_type, customer_id, status, total_price, delivered_at, carrier_delivered_at, created_at, prom_payment:prom_data->payment_data, rz_payment:rozetka_data->payment')
    .in('channel_code', ['prom', 'rozetka', 'website', 'retail']).neq('status', 'cancelled').gte('created_at', since)
    .order('created_at', { ascending: true }).range(f, t));
  // Відкритий борг покупця по рахунках Rozetka (no_cash): може закритись виплатою RozetkaPay
  const invoiceIds = orders.filter(o => o.channel_code === 'rozetka' && o.payment_type === 'invoice').map(o => o.id as string);
  const invoiceOpen: Record<string, number> = {};
  if (invoiceIds.length) {
    const rows = await fetchAllRows<{ order_id: string; counterparty_id: string | null; amount: number }>((f, t) => db
      .from('money_entries').select('order_id, counterparty_id, amount').eq('account_type', 'customer').in('order_id', invoiceIds).range(f, t));
    for (const r of rows) if (!r.counterparty_id?.startsWith('mp:')) invoiceOpen[r.order_id] = Math.round(((invoiceOpen[r.order_id] ?? 0) + Number(r.amount)) * 100) / 100;
  }
  const events = orders
    .map(o => rzPayEventFor({ ...(o as unknown as RzPayCandidateOrder), invoice_open: invoiceOpen[o.id as string] ?? 0 }))
    .filter((e): e is RzPayEvent => e !== null);

  for (const row of pending) {
    const rz = parseRzPayPayout({ amount: Math.round(Number(row.amount) * 100), comment: row.comment, description: row.description, counterName: row.counter_name });
    if (!rz) continue;
    const remaining = Math.round((rz.gross - (doneByTxn[row.id] ?? 0)) * 100) / 100;
    if (remaining <= 0) { await db.from('mono_bank_txns').update({ category: 'rzpay:allocated' }).eq('id', row.id); summary.allocated++; continue; }
    const cands = rzPayCandidatesFor(events, rz.periodFrom, rz.periodTo, allocated);
    const pick = matchRzPayPayout(remaining, cands);
    if (!pick) {
      summary.unmatched.push({ date: row.txn_time.slice(0, 10), gross: remaining, candidates: cands.length });
      await db.from('mono_bank_txns').update({ note: `не підібрано: ${remaining} ₴ за операції ${rz.periodFrom}…${rz.periodTo} лишається на клірингу RozetkaPay` }).eq('id', row.id);
      continue;
    }
    const period = rz.periodFrom === rz.periodTo ? rz.periodFrom : `${rz.periodFrom}…${rz.periodTo}`;
    for (const e of pick) {
      try {
        await recordTxn({
          debitAccount: 'customer', debitParty: SALE_DEBTOR.rozetkapay,
          creditAccount: 'customer', creditParty: e.party,
          amount: e.amount, businessDate: row.txn_time.slice(0, 10), docType: 'payment', orderId: e.orderId,
          description: `Виплата RozetkaPay за операції ${period} — замовлення #${e.orderNumber}`,
          idempotencyKey: `rzpay-alloc:${row.id}:${e.orderId}${keyCount[`${row.id}:${e.orderId}`] ? ':' + (keyCount[`${row.id}:${e.orderId}`] + 1) : ''}`, createdBy,
          meta: { mono_txn_id: row.id, rzpay_period: [rz.periodFrom, rz.periodTo], event: e.kind, event_date: e.at, auto: true },
        });
      } catch (err) {
        if (!/unique|duplicate|23505/.test(String(err instanceof Error ? err.message : err))) throw err;
      }
      allocated.add(e.orderId);
      summary.orders++; summary.amount = Math.round((summary.amount + e.amount) * 100) / 100;
    }
    await db.from('mono_bank_txns').update({ category: 'rzpay:allocated', note: `рознесено: ${[row.note?.startsWith('рознесено: ') ? row.note.slice(11) : '', ...pick.map(e => `#${e.orderNumber}`)].filter(Boolean).join(' ')}` }).eq('id', row.id);
    summary.allocated++;
  }
  return summary;
}
