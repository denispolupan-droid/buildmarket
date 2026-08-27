/**
 * Приводить orders.fulfillment_mode у відповідність до фактичних рядків РН.
 *
 * Режим ставився при підтвердженні — це вибір менеджера. Але роутер при
 * відвантаженні цілком може перерішити: товар знайшовся на своєму складі, і
 * посилка поїхала з двох складів, а в журналі так і лишилось «Пост.». З 27.08
 * режим перераховується при відгрузці; цей скрипт лагодить те, що вже поїхало.
 *
 * Рахує тільки за не-скасованими видатковими: це доконаний факт, а не план.
 *
 * Використання:
 *   npx tsx --env-file=.env.local scripts/fix-fulfillment-mode.ts           # показати
 *   npx tsx --env-file=.env.local scripts/fix-fulfillment-mode.ts --apply   # виправити
 */
import { createServiceClient } from '../lib/supabase';

const APPLY = process.argv.includes('--apply');

async function main() {
  const db = createServiceClient();

  const { data: docs } = await db
    .from('acc_documents')
    .select('id, order_id')
    .eq('doc_type', 'sale')
    .neq('status', 'cancelled')
    .limit(5000);

  const docsByOrder = new Map<string, string[]>();
  for (const d of docs ?? []) {
    const orderId = d.order_id as string | null;
    if (!orderId) continue;
    if (!docsByOrder.has(orderId)) docsByOrder.set(orderId, []);
    docsByOrder.get(orderId)!.push(d.id as string);
  }
  if (!docsByOrder.size) { console.log('видаткових немає'); return; }

  const typesByDoc = new Map<string, Set<string>>();
  const allDocIds = (docs ?? []).map(d => d.id as string);
  for (let i = 0; i < allDocIds.length; i += 200) {
    const { data: lines } = await db
      .from('acc_document_lines')
      .select('document_id, fulfillment_type')
      .in('document_id', allDocIds.slice(i, i + 200))
      .limit(5000);
    for (const l of lines ?? []) {
      const k = l.document_id as string;
      if (!typesByDoc.has(k)) typesByDoc.set(k, new Set());
      typesByDoc.get(k)!.add(String(l.fulfillment_type));
    }
  }

  const orderIds = [...docsByOrder.keys()];
  const orders: { id: string; order_number: number; status: string; fulfillment_mode: string | null }[] = [];
  for (let i = 0; i < orderIds.length; i += 200) {
    const { data } = await db
      .from('orders')
      .select('id, order_number, status, fulfillment_mode')
      .in('id', orderIds.slice(i, i + 200));
    orders.push(...(data ?? []) as typeof orders);
  }

  const todo: { id: string; label: string; from: string | null; to: string }[] = [];
  for (const o of orders) {
    const types = new Set<string>();
    for (const docId of docsByOrder.get(o.id) ?? []) {
      for (const t of typesByDoc.get(docId) ?? []) types.add(t);
    }
    if (!types.size) continue;
    const real = types.has('own') && types.has('dropship') ? 'mixed'
      : types.has('own') ? 'own'
      : 'supplier';
    if (real !== o.fulfillment_mode) {
      todo.push({ id: o.id, label: `#${o.order_number} (${o.status})`, from: o.fulfillment_mode, to: real });
    }
  }

  if (!todo.length) { console.log(`перевірено замовлень: ${orders.length} — розбіжностей немає`); return; }

  console.log(`перевірено замовлень: ${orders.length}, розбіжностей: ${todo.length}\n`);
  for (const t of todo) console.log(`  ${t.label}: ${t.from ?? '—'} → ${t.to}`);

  if (!APPLY) { console.log('\n(прогін без запису; додайте --apply)'); return; }

  let done = 0;
  for (const t of todo) {
    const { error } = await db.from('orders').update({ fulfillment_mode: t.to }).eq('id', t.id);
    if (error) console.error(`  ${t.label}: ${error.message}`);
    else done++;
  }
  console.log(`\nвиправлено: ${done} з ${todo.length}`);
}

main().catch(err => { console.error(err); process.exit(1); });
