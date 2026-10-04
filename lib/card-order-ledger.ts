import { createServiceClient } from './supabase';
import { recordCustomerPayment } from './accounting/money';
import { resolveSaleDebitParty } from './accounting/documents';
import { isSpecialDebtor } from './accounting/sale-party';

/**
 * Оплата карткового замовлення сайту (Monobank) у грошовому леджері — спільно для
 * вебхука і для підняття замовлень звіркою (card-order-recovery).
 *
 * Сторона оплати = сторона продажу (resolveSaleDebitParty): для замовлення сайту це
 * картка клієнта (customer_id ставить checkout за акаунтом/email/телефоном), без неї —
 * guest. До 04.10.2026 вебхук шукав клієнта лише по auth_user_id і для гостьового
 * оформлення кредитував службову сторону `order:<id>`, а продаж при відгрузці лягав
 * на клієнта: оплачені #26091106 (1 550) і #26091151 (87) висіли в «Дебіторці» як борг.
 *
 * Ключ mono:payment:<orderId> спільний для обох шляхів — повторний вебхук або гонка
 * зі звіркою не задвоюють оплату.
 */
export async function recordCardOrderPayment(input: {
  orderId:      string;
  amount:       number;
  businessDate: string;
  createdBy:    string;
}): Promise<string> {
  const db = createServiceClient();
  const { data: order, error } = await db
    .from('orders')
    .select('id, order_number, customer_id')
    .eq('id', input.orderId)
    .single();
  if (error || !order) throw new Error(`замовлення ${input.orderId} не знайдено`);

  const party = await resolveSaleDebitParty(db, { order_id: order.id, customer_id: order.customer_id });

  let contractId: string | undefined;
  if (!isSpecialDebtor(party)) {
    const { data: contract } = await db
      .from('customer_contracts')
      .select('id')
      .eq('customer_id', party)
      .eq('status', 'active')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    contractId = contract?.id ?? undefined;
  }

  return recordCustomerPayment({
    customerId:     party,
    contractId,
    orderId:        order.id,
    amount:         input.amount,
    paymentMethod:  'acquiring',
    businessDate:   input.businessDate,
    description:    `Оплата картою — замовлення #${order.order_number}`,
    createdBy:      input.createdBy,
    idempotencyKey: `mono:payment:${order.id}`,
  });
}
