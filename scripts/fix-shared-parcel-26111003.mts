// Разовий ремонт #26111003 (05.11.2026).
//
// 02.11 #26111003 і #26111002 (той самий покупець) поїхали ОДНІЄЮ посилкою
// 20451576150090. Діалог відгрузки знав лише «переадресацію», її підтвердили —
// і redirectTransit скасував РН-2026-0728 замовлення #26111003 разом із боргом
// постачальнику. Посилку вручено 04.11, але продажу проводити нічим, тож крон
// доставки лишає замовлення «Відправлено» і шле алерт.
//
// Ремонт — ТОЙ САМИЙ виклик, що робить /ship: createSaleDraft (нова РН-чернетка
// + борг постачальнику через syncDropshipPayable). Далі наступний прогін крона
// sync-delivery-status сам проведе її (completeShipmentByTtn: виручка, собівартість,
// комісія Rozetka, np:cod) і поставить «Доставлено» — як 04.11 для #26111002.
// Жодних ручних проводок.
//
//   npx tsx --env-file=.env.local scripts/fix-shared-parcel-26111003.mts           — перевірка (нічого не пише)
//   npx tsx --env-file=.env.local scripts/fix-shared-parcel-26111003.mts --apply   — створити РН
import * as supabaseNS from '../lib/supabase-service';
import * as dropshipNS from '../lib/accounting/dropship';
import * as linesNS from '../lib/orders/lines-read';
// tsx грузить lib як CJS — іменовані експорти лежать у default (як у fix-dropship-order-paid.mts)
type Mod<T> = T & { default?: T };
const { createServiceClient } = ((supabaseNS as Mod<typeof supabaseNS>).default ?? supabaseNS);
const { createSaleDraft } = ((dropshipNS as Mod<typeof dropshipNS>).default ?? dropshipNS);
const { loadOrderItems } = ((linesNS as Mod<typeof linesNS>).default ?? linesNS);

const ORDER_NUMBER = 26111003;
const TTN = '20451576150090';
const SHIP_DATE = '2026-11-02';           // день фактичної відгрузки — борг постачальнику датується ним
const ACTOR = 'denis.polupan@gmail.com';  // той, хто відвантажував 02.11

const apply = process.argv.includes('--apply');
const db = createServiceClient();

const { data: order, error } = await db
  .from('orders')
  .select('id, order_number, status, tracking_number, channel_code, customer_id, shipping_supplier_id')
  .eq('order_number', ORDER_NUMBER)
  .single();
if (error || !order) throw new Error(`Замовлення #${ORDER_NUMBER} не знайдено`);

// Запобіжники: скрипт робить рівно один крок і лише в тому стані, який ми розібрали
const problems: string[] = [];
if (order.status !== 'shipped') problems.push(`статус ${order.status}, очікувався shipped`);
if (order.tracking_number !== TTN) problems.push(`ТТН ${order.tracking_number}, очікувалась ${TTN}`);
const { data: docs } = await db
  .from('acc_documents')
  .select('id, doc_number, status')
  .eq('order_id', order.id)
  .eq('doc_type', 'sale');
const live = (docs ?? []).filter(d => d.status !== 'cancelled');
if (live.length) problems.push(`уже є не скасовані РН: ${live.map(d => `${d.doc_number} (${d.status})`).join(', ')}`);

const items = await loadOrderItems(db, order.id);
if (!items.length) problems.push('немає позицій');

console.log(`#${ORDER_NUMBER}: статус ${order.status}, ТТН ${order.tracking_number}, РН: ${(docs ?? []).map(d => `${d.doc_number}=${d.status}`).join(', ')}`);
console.log('Позиції:', items.map(i => `${i.sku} × ${i.qty} по ${i.price}`).join('; '));
if (problems.length) {
  console.log('СТОП:', problems.join('; '));
  process.exit(1);
}
if (!apply) {
  console.log('Перевірка пройдена. Запустіть з --apply, щоб створити РН-чернетку.');
  process.exit(0);
}

const docId = await createSaleDraft({
  order_id:             order.id,
  order_number:         order.order_number,
  order_items:          items,
  channel_code:         order.channel_code ?? 'rozetka',
  confirmed_by:         ACTOR,
  customer_id:          order.customer_id ?? undefined,
  business_date:        SHIP_DATE,
  shipping_supplier_id: order.shipping_supplier_id ?? null,
  tracking_number:      TTN,
});

const { data: doc } = await db.from('acc_documents').select('doc_number, status, tracking_number').eq('id', docId).single();
const { data: entries } = await db
  .from('money_entries')
  .select('account_type, amount, counterparty_id, description')
  .eq('doc_id', docId);
console.log('Створено:', doc);
console.log('Проводки РН:', entries);
