import { createServiceClient } from './supabase';
import { classifyMonoTxn, type MonoStatementItem } from './mono-statement';
import { parseRzPayPayout, postRzPayPayout } from './rozetkapay-payout';
import { recordTxn } from './accounting/money';
import { applyOrderPayment } from './accounting/order-payment';
import { alertAdmin } from './alert';
import { getMonoToken, getMonoFopAccount } from './mono-config';

// Обробка однієї транзакції виписки Monobank. Ідемпотентна: перший, хто «застовпить»
// рядок у mono_bank_txns (PK = id транзакції), той і обробляє; повторні виклики
// (вебхук + крон-реконсиляція бачать ту саму операцію) пропускаються. Тому вебхук
// і крон безпечно працюють разом.

export type IngestResult =
  | { status: 'skipped'; reason: string }
  | { status: 'matched'; orderNumber: number; amount: number }
  | { status: 'acquiring'; amount: number; orderNumber?: number }
  | { status: 'payout'; amount: number; gross: number; fee: number }
  | { status: 'debit'; amount: number }
  | { status: 'unmatched'; amount: number; orderNumber?: number };

/**
 * Покриття еквайрингу → гроші з рахунку «еквайринг» (де їх записав вебхук у момент
 * карткової оплати) переходять у банк, комісія банку — у витрати:
 *   DR bank (нетто) + DR acquiring_fee (брутто − нетто) / CR acquiring (брутто)
 * До 09.2026 такі рядки лише перевірялись — на acquiring назбиралось 3 718 ₴, які
 * «нікуди не поділись». Ідемпотентно: acq-settle:{id}, acq-fee:{id}.
 */
export async function postAcquiringSettlement(
  db: ReturnType<typeof createServiceClient>,
  row: { id: string; amount: number; gross: number; date: string },
  createdBy = 'monobank',
): Promise<boolean> {
  const isDup = (err: unknown) => /unique|duplicate|23505/.test(String(err instanceof Error ? err.message : err));
  const net = Math.round(row.amount * 100) / 100;
  const gross = Math.round(row.gross * 100) / 100;
  const fee = Math.round((gross - net) * 100) / 100;
  let posted = false;
  try {
    await recordTxn({
      debitAccount: 'bank', creditAccount: 'acquiring', amount: net, businessDate: row.date, docType: 'acquiring_settlement',
      description: `Покриття еквайрингу Monobank (брутто ${gross.toFixed(2)})`,
      idempotencyKey: `acq-settle:${row.id}`, createdBy, meta: { mono_txn_id: row.id, gross, net },
    });
    posted = true;
  } catch (err) { if (!isDup(err)) throw err; }
  if (fee > 0) {
    try {
      await recordTxn({
        debitAccount: 'acquiring_fee', creditAccount: 'acquiring', amount: fee, businessDate: row.date, docType: 'acquiring_fee',
        description: `Комісія банку за еквайринг (${((fee / gross) * 100).toFixed(2)}%)`,
        idempotencyKey: `acq-fee:${row.id}`, createdBy, meta: { mono_txn_id: row.id, gross, net },
      });
      posted = true;
    } catch (err) { if (!isDup(err)) throw err; }
  }
  if (posted) await db.from('mono_bank_txns').update({ posted_at: new Date().toISOString(), posted_by: createdBy, category: 'acquiring_settlement' }).eq('id', row.id);
  return posted;
}

export async function ingestMonoTxn(
  db: ReturnType<typeof createServiceClient>,
  item: MonoStatementItem,
  account: string,
): Promise<IngestResult> {
  // Списання: зберігаємо для категоризації людиною (екран «Банк»), нічого не проводимо.
  // До 09.2026 вони ігнорувались узагалі — 60 тис./міс поза обліком (аудит 06.09).
  if (item.amount < 0) {
    const { data: claimedOut, error: outErr } = await db
      .from('mono_bank_txns')
      .upsert({
        id:             item.id,
        account,
        txn_time:       new Date(item.time * 1000).toISOString(),
        amount:         Math.round(-item.amount) / 100,
        direction:      'out',
        comment:        item.comment ?? null,
        description:    item.description ?? null,
        counter_name:   item.counterName ?? null,
        counter_edrpou: item.counterEdrpou ?? null,
        counter_iban:   item.counterIban ?? null,
        status:         'unmatched',
        raw:            item as unknown as Record<string, unknown>,
      }, { onConflict: 'id', ignoreDuplicates: true })
      .select('id');
    if (outErr) { console.error('[mono-ingest] out claim failed:', outErr.message); return { status: 'skipped', reason: 'claim-error' }; }
    if (!claimedOut || claimedOut.length === 0) return { status: 'skipped', reason: 'duplicate' };
    return { status: 'debit', amount: Math.round(-item.amount) / 100 };
  }

  const m = classifyMonoTxn(item);
  if (!m) return { status: 'skipped', reason: 'not-incoming' };   // нуль

  // Атомарний «замок» через PK: INSERT ... ON CONFLICT DO NOTHING. Якщо рядок уже
  // існує (оброблено раніше) — select поверне порожньо, і ми виходимо.
  const { data: claimed, error: claimErr } = await db
    .from('mono_bank_txns')
    .upsert({
      id:             item.id,
      account,
      txn_time:       new Date(item.time * 1000).toISOString(),
      amount:         m.amount,
      comment:        item.comment ?? null,
      description:    item.description ?? null,
      counter_name:   item.counterName ?? null,
      counter_edrpou: item.counterEdrpou ?? null,
      counter_iban:   item.counterIban ?? null,
      status:         'unmatched',
      raw:            item as unknown as Record<string, unknown>,
    }, { onConflict: 'id', ignoreDuplicates: true })
    .select('id');
  if (claimErr) { console.error('[mono-ingest] claim failed:', claimErr.message); return { status: 'skipped', reason: 'claim-error' }; }
  if (!claimed || claimed.length === 0) return { status: 'skipped', reason: 'duplicate' };

  // Виплата RozetkaPay (усі гроші площадок одним переказом за день): банк + винагорода
  // в розхід, брутто — на кліринговий дебітор mp:rozetkapay. Розбивка по замовленнях —
  // окремо з реєстру Reports API (lib/rozetkapay-api), коли є ключі.
  const rz = parseRzPayPayout(item);
  if (rz) {
    const bizDate = new Date(item.time * 1000).toISOString().slice(0, 10);
    try {
      await postRzPayPayout(item.id, rz, bizDate, 'monobank');
      await db.from('mono_bank_txns').update({ status: 'matched' }).eq('id', item.id);
      alertAdmin(
        `🟢 Виплата RozetkaPay ${rz.net.toFixed(2)} ₴ проведена`,
        `За операції ${rz.periodFrom}${rz.periodTo !== rz.periodFrom ? '…' + rz.periodTo : ''}: брутто ${rz.gross.toFixed(2)}, винагорода ${rz.fee.toFixed(2)}. Лежить на «RozetkaPay — отримано, не рознесено» до рознесення по замовленнях.`,
      );
      return { status: 'payout', amount: rz.net, gross: rz.gross, fee: rz.fee };
    } catch (err) {
      alertAdmin(`⚠ Виплата RozetkaPay ${rz.net.toFixed(2)} ₴ не проведена`, String(err instanceof Error ? err.message : err));
      return { status: 'unmatched', amount: m.amount };
    }
  }

  // Є номер замовлення в призначенні → пробуємо зарахувати оплату
  if (m.kind === 'order') {
    const { data: order } = await db
      .from('orders')
      .select('id, status, order_number')
      .eq('order_number', m.orderNumber)
      .maybeSingle();

    if (order && order.status !== 'cancelled') {
      const res = await applyOrderPayment(db, {
        orderId:     order.id,
        amount:      m.amount,
        paymentMode: 'transfer',
        note:        `Monobank${item.counterName ? ' від ' + item.counterName : ''}`.slice(0, 180),
        createdBy:   'monobank',
      });
      if (res.ok) {
        await db.from('mono_bank_txns')
          .update({ status: 'matched', matched_order_id: order.id, order_payment_id: res.paymentId ?? null })
          .eq('id', item.id);
        alertAdmin(
          `💳 Оплата ${m.amount.toFixed(2)} ₴ зарахована до замовлення #${m.orderNumber}`,
          `${res.isFullyPaid ? 'Оплачено повністю' : 'Часткова оплата'}. Платник: ${item.counterName ?? '—'}`,
        );
        return { status: 'matched', orderNumber: m.orderNumber, amount: m.amount };
      }
    }
    // Номер є, але замовлення немає / скасоване / не вдалось провести
    alertAdmin(
      `⚠ Оплата ${m.amount.toFixed(2)} ₴ з №${m.orderNumber}, але замовлення не зараховано`,
      `Перевір вручну (замовлення відсутнє, скасоване або помилка проведення). Платник: ${item.counterName ?? '—'}`,
    );
    return { status: 'unmatched', amount: m.amount, orderNumber: m.orderNumber };
  }

  // Покриття еквайрингу: карткова оплата вже записана вебхуком у момент платежу,
  // тому цей рядок НІКОЛИ не зараховуємо як оплату (навіть з номером замовлення в
  // призначенні — інакше задвоєння). Він лише доводить, що на сайті пройшла
  // карткова оплата: якщо жодне карткове замовлення на цю суму не з'явилося —
  // гроші взяли, а замовлення загубилось (04.08.2026 так зникло замовлення на 104 ₴).
  if (m.kind === 'acquiring') {
    const gross = m.gross;
    let covered = false;
    if (m.orderNumber) {
      const { data: order } = await db
        .from('orders')
        .select('order_number, total_price, payment_confirmed')
        .eq('order_number', m.orderNumber)
        .maybeSingle();
      covered = !!order && Math.abs(Number(order.total_price) - gross) < 0.01 && order.payment_confirmed === true;
    }
    if (!covered) {
      const since = new Date((item.time - 3 * 24 * 60 * 60) * 1000).toISOString();
      const { data: cardOrders } = await db
        .from('orders')
        .select('order_number, total_price')
        .not('payment_reference', 'is', null)
        .gte('created_at', since)
        .limit(200);
      covered = (cardOrders ?? []).some(o => Math.abs(Number(o.total_price) - gross) < 0.01);
    }
    if (!covered) {
      alertAdmin(
        `🚨 Еквайринг ${gross.toFixed(2)} ₴ — карткового замовлення на цю суму НЕМАЄ`,
        `Покупець оплатив на сайті, а замовлення не створилось. Подивіться pending_card_orders за цей день і оформіть вручну. ${item.comment ?? ''}`.trim(),
      );
    }
    await db.from('mono_bank_txns').update({ status: 'acquiring' }).eq('id', item.id);
    try {
      await postAcquiringSettlement(db, { id: item.id, amount: m.amount, gross, date: new Date(item.time * 1000).toISOString().slice(0, 10) });
    } catch (err) {
      alertAdmin(`Покриття еквайрингу ${m.amount.toFixed(2)} ₴ не проведено`, String(err instanceof Error ? err.message : err));
    }
    return { status: 'acquiring', amount: m.amount, orderNumber: m.orderNumber };
  }

  // Немає номера (виплата маркетплейсу, поповнення) — лишаємо для ручної сверки
  return { status: 'unmatched', amount: m.amount };
}

/* ── Виписка за період + бекфіл ──────────────────────────────────────────────
   Monobank Personal: вікно ≤ 31 доба і не частіше 1 запиту/60 с на statement.
   Крон бере 2 доби; кнопка на «Банку» — 7; бекфіл (скрипт) — вікнами по 31 добі
   з паузою. Усе йде через ingestMonoTxn (дедуп по id). */

export type MonoIngestSummary = { total: number; matched: number; unmatched: number; acquiring: number; payouts: number; debits: number; skipped: number; from: string; to: string };

export async function fetchAndIngestMonoStatement(db: ReturnType<typeof createServiceClient>, days = 2, fromTs?: number, toTs?: number): Promise<MonoIngestSummary> {
  const token = await getMonoToken(db);
  if (!token) throw new Error('Токен Monobank не налаштований (app_settings.mono_personal_token)');
  const account = await getMonoFopAccount(db);
  if (!account) throw new Error('mono_fop_account_id не налаштований у app_settings');
  const to = toTs ?? Math.floor(Date.now() / 1000);
  const from = fromTs ?? to - days * 86400;
  const res = await fetch(`https://api.monobank.ua/personal/statement/${account}/${from}/${to}`, { headers: { 'X-Token': token } });
  const text = await res.text();
  if (!res.ok) throw new Error(`Monobank statement ${res.status} — ${text.slice(0, 200)}`);
  const items = JSON.parse(text) as MonoStatementItem[];
  const s: MonoIngestSummary = { total: items.length, matched: 0, unmatched: 0, acquiring: 0, payouts: 0, debits: 0, skipped: 0, from: new Date(from * 1000).toISOString().slice(0, 10), to: new Date(to * 1000).toISOString().slice(0, 10) };
  for (const item of items) {
    const r = await ingestMonoTxn(db, item, account);
    if (r.status === 'matched') s.matched++;
    else if (r.status === 'unmatched') s.unmatched++;
    else if (r.status === 'acquiring') s.acquiring++;
    else if (r.status === 'payout') s.payouts++;
    else if (r.status === 'debit') s.debits++;
    else s.skipped++;
  }
  return s;
}

/** Покриття еквайрингу, збережені до 09.2026 без проводки (status 'acquiring', category null). */
export async function postPendingAcquiringSettlements(db: ReturnType<typeof createServiceClient>, createdBy = 'monobank'): Promise<number> {
  const { extractAcquiringGross } = await import('./mono-statement');
  const { data: rows } = await db.from('mono_bank_txns').select('id, amount, comment, txn_time').eq('status', 'acquiring').is('category', null).order('txn_time').limit(500);
  let n = 0;
  for (const r of rows ?? []) {
    const gross = extractAcquiringGross(r.comment as string | null) ?? Number(r.amount);
    if (await postAcquiringSettlement(db, { id: r.id as string, amount: Number(r.amount), gross, date: String(r.txn_time).slice(0, 10) }, createdBy)) n++;
  }
  return n;
}
