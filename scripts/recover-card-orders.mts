/**
 * Ручний запуск звірки карткових оплат: бере чернетки з pending_card_orders,
 * звіряє з випискою мерчанта Monobank і створює замовлення там, де банк каже
 * success. Та сама логіка, що й у крона /api/cron/card-orders-reconcile —
 * тут лише «руками і зараз», коли чекати десять хвилин немає бажання.
 *
 *   npx tsx --env-file=.env.local scripts/recover-card-orders.mts           # показати
 *   npx tsx --env-file=.env.local scripts/recover-card-orders.mts --apply   # створити
 *
 * Ідемпотентний: замовлення з таким payment_reference удруге не створюється.
 */
import * as supabaseNS from '../lib/supabase';
import * as recoveryNS from '../lib/card-order-recovery';
const { createServiceClient } = (supabaseNS as unknown as { default: typeof supabaseNS }).default ?? supabaseNS;
const { recoverPaidCardOrders, fetchPaidInvoices } =
  (recoveryNS as unknown as { default: typeof recoveryNS }).default ?? recoveryNS;

const apply = process.argv.includes('--apply');

if (!apply) {
  // Сухий прогін: показуємо, що саме підніметься, нічого не змінюючи
  const db = createServiceClient();
  const paid = await fetchPaidInvoices(7);
  const { data: drafts } = await db
    .from('pending_card_orders')
    .select('reference, payload, total_price')
    .order('created_at');

  let n = 0;
  for (const draft of drafts ?? []) {
    const payment = paid.get(draft.reference);
    const payload = draft.payload as Record<string, unknown>;
    const who = `${payload.contact ?? '—'} · ${payload.phone ?? '—'}`;
    if (!payment) { console.log(`— ${who}  ${draft.total_price} ₴ — оплати немає`); continue; }
    const { data: existing } = await db
      .from('orders').select('order_number').eq('payment_reference', draft.reference).maybeSingle();
    if (existing) { console.log(`✓ вже створено #${existing.order_number}  ${who}`); continue; }
    console.log(`• буде створено: ${who}  ${(payment.amount / 100).toFixed(2)} ₴  (інвойс ${payment.invoiceId})`);
    n++;
  }
  console.log(n ? '\nЦе був перегляд. Щоб створити — додайте --apply' : '\nПіднімати нічого.');
  process.exit(0);
}

const result = await recoverPaidCardOrders({ days: 7, notify: false, createdBy: 'script:recover-card-orders' });
console.log(`Розглянуто оплачених чернеток: ${result.checked}`);
console.log(result.created.length ? `Створено замовлення: ${result.created.map(n => '#' + n).join(', ')}` : 'Нових замовлень немає');
if (result.failed) console.log(`Не вдалося створити: ${result.failed}`);
