/**
 * Тримає власний товар, який уже їде до покупця, зарезервованим.
 *
 * За Варіантом 3 видаткова лишається чернеткою до доставки, тож склад
 * списується не при відгрузці, а при врученні. У проміжку товар має тримати
 * резерв — інакше залишок показує «доступно» на коробку, яка вже в дорозі.
 * Резерву могло не бути взагалі: менеджер підтвердив замовлення як
 * «постачальник», а роутер при відгрузці знайшов товар на своєму складі.
 *
 * З 28.08 резерв ставить сам createSaleDraft; цей скрипт лагодить те, що вже
 * поїхало раніше. Ідемпотентний: резервує лише різницю між відвантаженим і
 * вже зарезервованим.
 *
 * Використання:
 *   npx tsx --env-file=.env.local scripts/fix-intransit-reservations.ts           # показати
 *   npx tsx --env-file=.env.local scripts/fix-intransit-reservations.ts --apply   # виправити
 */
import { createServiceClient } from '../lib/supabase';
import { createReservation } from '../lib/accounting/reservations';

const APPLY = process.argv.includes('--apply');

async function main() {
  const db = createServiceClient();

  const { data: drafts } = await db
    .from('acc_documents')
    .select('id, doc_number, order_id, doc_date')
    .eq('doc_type', 'sale')
    .eq('status', 'draft')
    .limit(2000);

  const withOrder = (drafts ?? []).filter(d => d.order_id);
  if (!withOrder.length) { console.log('чернеток немає'); return; }

  const { data: lines } = await db
    .from('acc_document_lines')
    .select('document_id, sku, qty, fulfillment_type, warehouse_id')
    .in('document_id', withOrder.map(d => d.id as string))
    .limit(5000);

  const ownLines = (lines ?? []).filter(l => l.fulfillment_type === 'own');
  if (!ownLines.length) { console.log('власних рядків у чернетках немає'); return; }

  const orderIds = [...new Set(withOrder.map(d => d.order_id as string))];
  const { data: reservations } = await db
    .from('stock_reservations')
    .select('order_id, sku, qty')
    .in('order_id', orderIds)
    .eq('reservation_status', 'active')
    .is('released_at', null);

  const reservedByOrderSku = new Map<string, number>();
  for (const r of reservations ?? []) {
    const k = `${r.order_id}:${r.sku}`;
    reservedByOrderSku.set(k, (reservedByOrderSku.get(k) ?? 0) + Number(r.qty));
  }

  const { data: orders } = await db
    .from('orders')
    .select('id, order_number, status')
    .in('id', orderIds);
  const ordById = new Map((orders ?? []).map(o => [o.id as string, o]));

  type Todo = { orderId: string; warehouseId: number; sku: string; qty: number; label: string };
  const todo: Todo[] = [];
  for (const l of ownLines) {
    const doc = withOrder.find(d => d.id === l.document_id)!;
    const orderId = doc.order_id as string;
    const need = Number(l.qty) - (reservedByOrderSku.get(`${orderId}:${l.sku}`) ?? 0);
    if (need <= 0) continue;
    const ord = ordById.get(orderId);
    todo.push({
      orderId,
      warehouseId: l.warehouse_id as number,
      sku:         l.sku as string,
      qty:         need,
      label:       `${doc.doc_number} · замовлення #${ord?.order_number ?? '—'} (${ord?.status ?? '—'}) · ${l.sku} ×${need}`,
    });
  }

  if (!todo.length) { console.log(`перевірено чернеток: ${withOrder.length} — усе відвантажене вже зарезервоване`); return; }

  console.log(`власний товар у дорозі без резерву: ${todo.length} позицій\n`);
  for (const t of todo) console.log(`  ${t.label}`);

  if (!APPLY) { console.log('\n(прогін без запису; додайте --apply)'); return; }

  let done = 0;
  for (const t of todo) {
    const res = await createReservation({
      order_id: t.orderId, warehouse_id: t.warehouseId, items: [{ sku: t.sku, qty: t.qty }],
    });
    if (res.insufficient.length) {
      console.error(`  ${t.label}: не вистачило залишку — ${JSON.stringify(res.insufficient)}`);
    } else {
      done++;
    }
  }
  console.log(`\nзарезервовано: ${done} з ${todo.length}`);
}

main().catch(err => { console.error(err); process.exit(1); });
