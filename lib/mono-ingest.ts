import { createServiceClient } from './supabase';
import { classifyMonoTxn, type MonoStatementItem } from './mono-statement';
import { parseRzPayPayout, postRzPayPayout } from './rozetkapay-payout';
import { applyOrderPayment } from './accounting/order-payment';
import { alertAdmin } from './alert';

// Обробка однієї транзакції виписки Monobank. Ідемпотентна: перший, хто «застовпить»
// рядок у mono_bank_txns (PK = id транзакції), той і обробляє; повторні виклики
// (вебхук + крон-реконсиляція бачать ту саму операцію) пропускаються. Тому вебхук
// і крон безпечно працюють разом.

export type IngestResult =
  | { status: 'skipped'; reason: string }
  | { status: 'matched'; orderNumber: number; amount: number }
  | { status: 'acquiring'; amount: number; orderNumber?: number }
  | { status: 'payout'; amount: number; gross: number; fee: number }
  | { status: 'unmatched'; amount: number; orderNumber?: number };

export async function ingestMonoTxn(
  db: ReturnType<typeof createServiceClient>,
  item: MonoStatementItem,
  account: string,
): Promise<IngestResult> {
  const m = classifyMonoTxn(item);
  if (!m) return { status: 'skipped', reason: 'not-incoming' };   // списання/нуль

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
    return { status: 'acquiring', amount: m.amount, orderNumber: m.orderNumber };
  }

  // Немає номера (виплата маркетплейсу, поповнення) — лишаємо для ручної сверки
  return { status: 'unmatched', amount: m.amount };
}
