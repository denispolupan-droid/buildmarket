/**
 * Відновлення карткових замовлень, які оплатили, але вебхук не створив.
 *
 * Причина була в перевірці підпису (розбирали ключ Monobank як сирий DER + RSA-PSS,
 * тоді як він — base64 від PEM і ECDSA): кожен вебхук діставав 401, і замовлення не
 * з'являлись узагалі. Чернетки в pending_card_orders при цьому лишались.
 *
 * Скрипт бере кожну чернетку, звіряє її reference з ВИПИСКОЮ МЕРЧАНТА Monobank і
 * створює замовлення тільки для тих, де площадка каже status = success. Тобто
 * джерело правди — банк, а не наші дані.
 *
 * Запуск:
 *   npx tsx --env-file=.env.local scripts/recover-card-orders.mts           # показати
 *   npx tsx --env-file=.env.local scripts/recover-card-orders.mts --apply   # створити
 *
 * Ідемпотентний: замовлення з таким payment_reference удруге не створюється
 * (унікальний індекс + перевірка перед вставкою).
 */
import * as supabaseNS from '../lib/supabase';
import * as moneyNS from '../lib/accounting/money';
const { createServiceClient } = (supabaseNS as unknown as { default: typeof supabaseNS }).default ?? supabaseNS;
const { recordCustomerPayment } = (moneyNS as unknown as { default: typeof moneyNS }).default ?? moneyNS;

const apply = process.argv.includes('--apply');
const db = createServiceClient();

const token = (process.env.MONOBANK_API_TOKEN ?? '').replace(/[^\x20-\x7E]/g, '').trim();
if (!token) throw new Error('MONOBANK_API_TOKEN не заданий');

type MerchantPayment = { invoiceId: string; status: string; amount: number; reference?: string; date?: string };

const DAYS = 7;
const from = Math.floor(Date.now() / 1000) - DAYS * 24 * 60 * 60;
const res = await fetch(`https://api.monobank.ua/api/merchant/statement?from=${from}`, { headers: { 'X-Token': token } });
if (!res.ok) throw new Error(`Monobank statement: ${res.status} ${await res.text()}`);
const payments: MerchantPayment[] = (await res.json()).list ?? [];
const paidByReference = new Map(
  payments.filter(p => p.status === 'success' && p.reference).map(p => [p.reference as string, p]),
);

const { data: drafts } = await db
  .from('pending_card_orders')
  .select('id, reference, payload, user_id, email, total_price, created_at')
  .order('created_at');

if (!drafts?.length) {
  console.log('Чернеток немає — відновлювати нічого.');
  process.exit(0);
}

let done = 0;
for (const draft of drafts) {
  const paid = paidByReference.get(draft.reference);
  const payload = draft.payload as Record<string, unknown>;
  const who = `${payload.contact ?? '—'} · ${payload.phone ?? '—'}`;

  if (!paid) {
    console.log(`— ${draft.reference.slice(0, 24)}…  ${who}  ${draft.total_price} ₴  — оплати немає, пропускаємо`);
    continue;
  }

  const { data: existing } = await db
    .from('orders').select('order_number').eq('payment_reference', draft.reference).maybeSingle();
  if (existing) {
    console.log(`✓ вже створено #${existing.order_number}  ${who}`);
    continue;
  }

  const amountUah = paid.amount / 100;
  console.log(`${apply ? '→ створюю' : '• буде створено'}: ${who}  ${amountUah.toFixed(2)} ₴  (invoice ${paid.invoiceId})`);
  if (!apply) continue;

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
    console.error(`✗ не вдалось створити (${draft.reference}):`, error?.message);
    continue;
  }

  // Оплата в леджер — тим самим ключем, що й вебхук, щоб не задвоїти,
  // якщо колись доставка вебхука все-таки пройде.
  try {
    await recordCustomerPayment({
      customerId:     (payload.customer_id as string) ?? `order:${order.id}`,
      amount:         amountUah,
      paymentMethod:  'acquiring',
      businessDate:   (paid.date ?? new Date().toISOString()).slice(0, 10),
      description:    `Оплата картою — замовлення #${order.order_number}`,
      createdBy:      'script:recover-card-orders',
      idempotencyKey: `mono:payment:${order.id}`,
    });
  } catch (err) {
    console.error(`  ⚠ проводку оплати не записано (#${order.order_number}):`, err);
  }

  await db.from('pending_card_orders').delete().eq('id', draft.id);
  console.log(`  ✓ замовлення #${order.order_number}`);
  done++;
}

console.log(apply ? `\nГотово. Створено: ${done}` : '\nЦе був перегляд. Щоб створити — додайте --apply');
