import { createServiceClient } from './supabase';
import { recordCustomerPayment } from './accounting/money';
import { alertAdmin } from './alert';

// Матеріалізація карткових замовлень із чернеток за ВИПИСКОЮ МЕРЧАНТА Monobank.
//
// Основний шлях — вебхук: він створює замовлення одразу після оплати. Але вебхук
// може не дійти (мережа, зміна формату підпису, збій на боці площадки), і тоді
// гроші списані, а замовлення немає — рівно це й сталося 04–07.08.2026, причому
// мовчки. Тут джерело правди інше й незалежне: платіж, який САМ БАНК позначив
// success. Тому навіть при повністю мертвому вебхуку замовлення дійде до бази —
// із затримкою в один прогін крона, а не ніколи.
//
// Ідемпотентно: замовлення з таким payment_reference удруге не створюється.

export type MerchantPayment = {
  invoiceId: string;
  status: string;
  amount: number;      // копійки
  reference?: string;
  date?: string;
};

export type RecoveryResult = {
  checked: number;      // скільки чернеток розглянуто
  created: number[];    // номери створених замовлень
  failed: number;       // скільки не вдалося створити
};

/** Успішні платежі мерчанта за останні `days` днів, ключ — reference інвойсу. */
export async function fetchPaidInvoices(days = 7): Promise<Map<string, MerchantPayment>> {
  const token = (process.env.MONOBANK_API_TOKEN ?? '').replace(/[^\x20-\x7E]/g, '').trim();
  if (!token) throw new Error('MONOBANK_API_TOKEN не заданий');

  const from = Math.floor(Date.now() / 1000) - days * 24 * 60 * 60;
  const res = await fetch(`https://api.monobank.ua/api/merchant/statement?from=${from}`, {
    headers: { 'X-Token': token },
  });
  if (!res.ok) throw new Error(`Monobank statement: ${res.status}`);

  const list: MerchantPayment[] = (await res.json()).list ?? [];
  return new Map(
    list.filter(p => p.status === 'success' && p.reference).map(p => [p.reference as string, p]),
  );
}

/**
 * Створює замовлення для кожної чернетки, оплату якої підтвердив банк.
 * `notify` — сповіщати адміна про кожне підняте замовлення (крон так і робить:
 * якщо він щось знайшов, значить вебхук не спрацював, і про це треба знати).
 */
export async function recoverPaidCardOrders(opts: { days?: number; notify?: boolean; createdBy: string }): Promise<RecoveryResult> {
  const db = createServiceClient();
  const paid = await fetchPaidInvoices(opts.days ?? 7);
  const result: RecoveryResult = { checked: 0, created: [], failed: 0 };

  const { data: drafts } = await db
    .from('pending_card_orders')
    .select('id, reference, payload, email, total_price')
    .order('created_at');
  if (!drafts?.length) return result;

  for (const draft of drafts) {
    const payment = paid.get(draft.reference);
    if (!payment) continue;                    // не оплачено — чернетка чекає далі
    result.checked++;

    const { data: existing } = await db
      .from('orders').select('id').eq('payment_reference', draft.reference).maybeSingle();
    if (existing) continue;                    // вебхук усе-таки встиг — нічого не робимо

    const amountUah = payment.amount / 100;
    const payload = draft.payload as Record<string, unknown>;

    const { data: order, error } = await db
      .from('orders')
      .insert({
        ...payload,
        status:            'confirmed',
        payment_reference: draft.reference,
        payment_confirmed: true,
        amount_paid:       amountUah,
      })
      .select('id, order_number')
      .single();

    if (error || !order) {
      // 23505 — гонка з вебхуком: він створив замовлення між нашою перевіркою
      // і вставкою. Це не помилка, просто нічого не робимо.
      if (error?.code !== '23505') {
        result.failed++;
        alertAdmin('🚨 Не вдалось підняти оплачене карткове замовлення', {
          reference: draft.reference, amount: amountUah, error: error?.message,
        });
      }
      continue;
    }

    try {
      await recordCustomerPayment({
        customerId:     (payload.customer_id as string) ?? `order:${order.id}`,
        amount:         amountUah,
        paymentMethod:  'acquiring',
        businessDate:   (payment.date ?? new Date().toISOString()).slice(0, 10),
        description:    `Оплата картою — замовлення #${order.order_number}`,
        createdBy:      opts.createdBy,
        // Той самий ключ, що й у вебхука — щоб оплата не задвоїлась, якщо він дійде пізніше.
        idempotencyKey: `mono:payment:${order.id}`,
      });
    } catch (err) {
      alertAdmin(`Оплату замовлення #${order.order_number} не записано в леджер`, err);
    }

    await db.from('pending_card_orders').delete().eq('id', draft.id);
    result.created.push(order.order_number as number);

    if (opts.notify) {
      alertAdmin(
        `⚠ Замовлення #${order.order_number} підняте звіркою, а не вебхуком`,
        `Оплата ${amountUah.toFixed(2)} ₴ (інвойс ${payment.invoiceId}) пройшла, але вебхук Monobank замовлення не створив. Замовлення в базі, гроші зараховані — але з вебхуком щось не так.`,
      );
    }
  }

  return result;
}
