import { createServiceClient } from './supabase';
import { classifyMonoTxn, type MonoStatementItem } from './mono-statement';
import { applyOrderPayment } from './accounting/order-payment';
import { alertAdmin } from './alert';

// Обробка однієї транзакції виписки Monobank. Ідемпотентна: перший, хто «застовпить»
// рядок у mono_bank_txns (PK = id транзакції), той і обробляє; повторні виклики
// (вебхук + крон-реконсиляція бачать ту саму операцію) пропускаються. Тому вебхук
// і крон безпечно працюють разом.

export type IngestResult =
  | { status: 'skipped'; reason: string }
  | { status: 'matched'; orderNumber: number; amount: number }
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

  // Немає номера (виплата маркетплейсу, поповнення) — лишаємо для ручної сверки
  return { status: 'unmatched', amount: m.amount };
}
