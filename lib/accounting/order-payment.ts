import { createServiceClient } from '../supabase';
import { recordTxn } from './money';
import { createPaymentVoucher, resolveSaleDebitParty } from './documents';
import { isSpecialDebtor } from './sale-party';
import { transitionOrder } from '../orders/status';
import { alertAdmin } from '../alert';

// Єдина точка проведення оплати замовлення: рядок order_payments + оновлення
// amount_paid/payment_confirmed + грошовий леджер (ваучер + DR метод / CR клієнт).
// Використовується і ручним додаванням оплати (/api/admin/orders/[id]/payments),
// і автозарахуванням з виписки Monobank. Ідемпотентність леджера — по id рядка
// order_payments (order_payment:<uuid>).

export const PAYMENT_METHOD_MAP: Record<string, 'cash' | 'bank' | 'acquiring'> = {
  cash:      'cash',
  transfer:  'bank',
  bank:      'bank',
  card:      'acquiring',
  acquiring: 'acquiring',
};

const MODE_LABEL: Record<string, string> = {
  cash: 'Готівка', transfer: 'Безготівковий', bank: 'Безготівковий', card: 'Карта', acquiring: 'Еквайринг',
  adjustment: 'Коригування боргу',
};

export type ApplyOrderPaymentInput = {
  orderId:      string;
  amount:       number;               // грн, > 0
  paymentMode:  string;               // cash | transfer | bank | card | acquiring
  paymentDate?: string;               // YYYY-MM-DD
  note?:        string | null;
  createdBy:    string;
};

export type ApplyOrderPaymentResult = {
  ok: boolean;
  error?: string;
  payment?: Record<string, unknown>;
  paymentId?: string;
  amountPaid?: number;
  isFullyPaid?: boolean;
  /** Замовлення чекало оплату (pending_payment) і цією оплатою закрите — переведено в confirmed */
  confirmed?: boolean;
  /** Оплату записано, але проводка в леджер не пройшла (алерт уже надіслано) */
  ledgerError?: string;
};

export async function applyOrderPayment(
  db: ReturnType<typeof createServiceClient>,
  input: ApplyOrderPaymentInput,
): Promise<ApplyOrderPaymentResult> {
  const { orderId, amount, paymentMode, note, createdBy } = input;
  if (!(amount > 0)) return { ok: false, error: 'Сума має бути більше 0' };

  const bizDate = input.paymentDate ?? new Date().toISOString().slice(0, 10);

  const { data: order, error: orderErr } = await db
    .from('orders')
    .select('order_number, total_price, amount_paid, customer_id, payment_type, channel_code, status')
    .eq('id', orderId)
    .single();
  if (orderErr || !order) return { ok: false, error: 'Замовлення не знайдено' };
  // Дропшип оплачує партнер з балансу при оформленні, а борг продажу закриває
  // залік балансу (partner-ledger). Окрема «оплата» задвоїла б гроші в обліку.
  if (order.channel_code === 'dropship') {
    return { ok: false, error: `Замовлення #${order.order_number} — дропшип: його оплачено з балансу партнера, окрема оплата не приймається` };
  }

  const { data: payment, error: insertErr } = await db
    .from('order_payments')
    .insert({
      order_id:     orderId,
      amount,
      payment_mode: paymentMode,
      payment_date: bizDate,
      note:         note ?? null,
      created_by:   createdBy,
    })
    .select()
    .single();
  if (insertErr || !payment) return { ok: false, error: insertErr?.message ?? 'Не вдалось зберегти оплату' };

  const newAmountPaid = Number(order.amount_paid ?? 0) + amount;
  const totalPrice    = Number(order.total_price);
  const isFullyPaid   = totalPrice > 0 && newAmountPaid >= totalPrice * 0.999;

  await db.from('orders').update({
    amount_paid:       newAmountPaid,
    payment_confirmed: isFullyPaid,
  }).eq('id', orderId);

  // «Очікує оплати» закривається саме оплатою: повна сума (з виписки Monobank
  // чи внесена вручну) переводить замовлення в «Підтверджено» — так само, як
  // карткова оплата рахунку у вебхуку. Раніше це працювало лише для картки, і
  // рахунок на переказ висів у pending_payment після зарахування (29.10.2026).
  // Резерв/режим виконання тут не визначаються — як і у вебхуку; це робить /confirm.
  let confirmed = false;
  if (isFullyPaid && order.status === 'pending_payment') {
    try {
      const t = await transitionOrder(db, orderId, 'confirmed', createdBy, 'order-payment');
      confirmed = t.changed;
    } catch (err) {
      console.error('[applyOrderPayment] pending_payment → confirmed failed:', err);
    }
  }

  // Грошовий леджер: сторона оплати = сторона продажу (Варіант B). Для гостя /
  // np:cod / mp:* — теж проводимо, інакше оплата губиться, а борг висить.
  {
    const party = await resolveSaleDebitParty(db, { order_id: orderId, customer_id: order.customer_id });
    const realCustomer = isSpecialDebtor(party) ? null : party;
    const ledgerMethod = PAYMENT_METHOD_MAP[paymentMode] ?? 'bank';
    const { data: ctr } = realCustomer ? await db
      .from('customer_contracts')
      .select('id')
      .eq('customer_id', realCustomer)
      .eq('status', 'active')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle() : { data: null };
    const contractId = ctr?.id ?? undefined;

    try {
      const voucher = await createPaymentVoucher({
        doc_type:      'customer_payment',
        customer_id:   realCustomer ?? undefined,
        order_id:      orderId,
        contract_id:   contractId,
        amount,
        business_date: bizDate,
        created_by:    createdBy,
        meta:          { payment_mode: paymentMode, order_payment_id: payment.id, party },
      });

      await recordTxn({
        debitAccount:   ledgerMethod,
        debitParty:     null,
        creditAccount:  'customer',
        creditParty:    party,
        amount,
        businessDate:   bizDate,
        docId:          voucher.id,
        docType:        'customer_payment',
        orderId,
        contractId,
        description:    `${MODE_LABEL[paymentMode] ?? paymentMode} — замовлення #${order.order_number}${note ? ': ' + note : ''}`,
        idempotencyKey: `order_payment:${payment.id}`,
        createdBy,
        meta:           { payment_mode: paymentMode, order_payment_id: payment.id },
      });
    } catch (err: unknown) {
      const msg = String(err instanceof Error ? err.message : err);
      if (!msg.includes('unique') && !msg.includes('duplicate') && !msg.includes('23505')) {
        // Рядок order_payments і amount_paid уже записані, а проводки немає —
        // леджер розійшовся з замовленням. Раніше це йшло лише в console.error
        // і губилось (аудит 31.10.2026, H3); тепер — алерт, щоб полагодити руками
        // (scripts/repair-doc-ledger.ts) або повторно провести оплату.
        alertAdmin(
          `Оплата #${order.order_number} записана, але проводка в леджер не пройшла (order_payment ${payment.id})`,
          err,
        );
        return { ok: true, payment, paymentId: payment.id, amountPaid: newAmountPaid, isFullyPaid, confirmed, ledgerError: msg };
      }
    }
  }

  return { ok: true, payment, paymentId: payment.id, amountPaid: newAmountPaid, isFullyPaid, confirmed };
}
