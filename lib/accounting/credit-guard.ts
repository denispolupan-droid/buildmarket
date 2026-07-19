import { createServiceClient } from '../supabase';
import { checkCreditAvailability } from './money';

// Контроль кредитного ліміту перед відгрузкою (бэклог аудиту: checkCreditAvailability
// був написаний, але ніде не викликався). Діє лише для замовлень з відстрочкою
// платежу (payment_type='deferred') і клієнтом з активним договором:
// перевищення ліміту або прострочення по договору блокує відгрузку.
export async function checkOrderCredit(orderId: string): Promise<{ ok: true } | { ok: false; reason: string }> {
  const db = createServiceClient();

  const { data: order } = await db
    .from('orders')
    .select('payment_type, customer_id, total_price')
    .eq('id', orderId)
    .single();
  if (!order || order.payment_type !== 'deferred' || !order.customer_id) return { ok: true };

  const { data: contract } = await db
    .from('customer_contracts')
    .select('id')
    .eq('customer_id', order.customer_id)
    .eq('status', 'active')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!contract) return { ok: true };

  const check = await checkCreditAvailability(contract.id, Number(order.total_price));
  if (check.allowed) return { ok: true };

  return {
    ok: false,
    reason: `Кредитний контроль: ${check.reason ?? 'відмовлено'} · поточний борг ${check.currentBalance.toFixed(2)} грн, ліміт ${check.creditLimit} грн. Зафіксуйте оплату або змініть спосіб оплати замовлення.`,
  };
}
