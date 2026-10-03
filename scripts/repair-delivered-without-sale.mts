/**
 * Ремонт інваріанта I7 для замовлень БЕЗ жодної видаткової.
 *
 * Сусідній repair-delivered-drafts.mts лагодить «чернетка є, але не проведена».
 * Тут інший випадок: РН немає взагалі — статус «Відправлено» поставили селектом
 * у картці (або масовою дією), минаючи відгрузку, тож чернетка не створилась, а
 * крон доставки при врученні перевів замовлення в «Доставлено» (живий кейс
 * #26091195, 03.10.2026). Продаж, собівартість, борг постачальнику і комісія
 * маркетплейсу по такому замовленню в обліку відсутні.
 *
 * Що робить:
 *   • status = delivered → створює РН-чернетку (як /ship) і одразу проводить її
 *     (як крон доставки): completeOrderDelivery проведе чернетку, дорахує комісію
 *     і COD партнеру.
 *   • status = shipped (лише з --order=N) → тільки створює чернетку; проведе її
 *     крон доставки, коли перевізник підтвердить вручення.
 *   Дата документа — день відгрузки (shipped_at), як і в звичайному потоці.
 *
 * Запуск:
 *   npx tsx --env-file=.env.local scripts/repair-delivered-without-sale.mts                  # показати
 *   npx tsx --env-file=.env.local scripts/repair-delivered-without-sale.mts --apply          # полагодити всі delivered
 *   npx tsx --env-file=.env.local scripts/repair-delivered-without-sale.mts --order=26091195 --apply
 *
 * Ідемпотентний: замовлення з будь-якою нескасованою РН пропускається.
 */
// Інтероп як у repair-delivered-drafts.mts: tsx вантажить lib як CJS.
import * as supabaseNS from '../lib/supabase';
import * as completionNS from '../lib/accounting/completion';
import * as dropshipNS from '../lib/accounting/dropship';
const { createServiceClient } = (supabaseNS as unknown as { default: typeof supabaseNS }).default ?? supabaseNS;
const { completeOrderDelivery } = (completionNS as unknown as { default: typeof completionNS }).default ?? completionNS;
const { createSaleDraft } = (dropshipNS as unknown as { default: typeof dropshipNS }).default ?? dropshipNS;

const apply = process.argv.includes('--apply');
const orderArg = process.argv.find(a => a.startsWith('--order='))?.slice('--order='.length);
const ACTOR = 'script:repair-delivered-without-sale';
const db = createServiceClient();

type Item = { sku: string; qty: number; price: number; name?: string; brand?: string };
type OrderRow = {
  id: string; order_number: number; status: string; items: Item[] | null;
  channel_code: string | null; customer_id: string | null; shipped_at: string | null;
  shipping_supplier_id: number | null; tracking_number: string | null;
};

let q = db
  .from('orders')
  .select('id, order_number, status, items, channel_code, customer_id, shipped_at, shipping_supplier_id, tracking_number')
  .order('id')
  .limit(1000);
q = orderArg
  ? q.eq('order_number', Number(orderArg)).in('status', ['shipped', 'delivered'])
  : q.eq('status', 'delivered');
const { data: orders, error } = await q;
if (error) throw error;

const candidates = ((orders ?? []) as OrderRow[]).filter(o => Array.isArray(o.items) && o.items.length > 0);
if (!candidates.length) {
  console.log(orderArg ? `Замовлення #${orderArg} у статусі shipped/delivered не знайдено.` : 'Доставлених замовлень немає.');
  process.exit(0);
}

// Будь-яка нескасована РН (чернетка чи проведена, без сторно) — замовлення не наше.
// Пачками по 150 id: доставлених замовлень сотні, і один .in() не вміщується в URL.
const withDoc = new Set<string>();
const ids = candidates.map(o => o.id);
for (let i = 0; i < ids.length; i += 150) {
  const { data: docs, error: docErr } = await db
    .from('acc_documents')
    .select('order_id')
    .eq('doc_type', 'sale')
    .neq('status', 'cancelled')
    .is('reversal_of', null)
    .in('order_id', ids.slice(i, i + 150))
    .limit(5000);
  if (docErr) throw docErr;
  for (const d of docs ?? []) withDoc.add(d.order_id as string);
}
const targets = candidates.filter(o => !withDoc.has(o.id));

if (!targets.length) {
  console.log('Замовлень без видаткової немає — інваріант I7 чистий.');
  process.exit(0);
}

console.log(`Знайдено ${targets.length} замовлен${targets.length === 1 ? 'ня' : 'ь'} без жодної РН:`);
for (const o of targets) {
  const total = (o.items ?? []).reduce((s, i) => s + Number(i.qty) * Number(i.price), 0);
  console.log(`  #${o.order_number}  ${o.status}  ${o.channel_code ?? 'website'}  ${total.toFixed(2)} ₴  ТТН ${o.tracking_number ?? '—'}  відгружено ${o.shipped_at?.slice(0, 10) ?? '—'}`);
}

if (!apply) {
  console.log('\nЦе був перегляд. Щоб полагодити — додайте --apply');
  process.exit(0);
}

for (const o of targets) {
  try {
    const items = (o.items ?? []).map(i => ({
      sku: i.sku, qty: Number(i.qty), price: Number(i.price), name: i.name ?? '', brand: i.brand ?? '',
    }));
    const docId = await createSaleDraft({
      order_id:             o.id,
      order_number:         o.order_number,
      order_items:          items,
      channel_code:         o.channel_code ?? 'website',
      confirmed_by:         ACTOR,
      customer_id:          o.customer_id ?? undefined,
      business_date:        (o.shipped_at ?? new Date().toISOString()).slice(0, 10),
      shipping_supplier_id: o.shipping_supplier_id ?? null,
      tracking_number:      o.tracking_number ?? null,
    });
    const { data: doc } = await db.from('acc_documents').select('doc_number').eq('id', docId).single();
    if (o.status === 'delivered') {
      const posted = await completeOrderDelivery(o.id, ACTOR);
      console.log(`✓ #${o.order_number}: ${doc?.doc_number ?? docId} створено і проведено (${posted})`);
    } else {
      console.log(`✓ #${o.order_number}: ${doc?.doc_number ?? docId} створено як чернетка — проведе крон доставки`);
    }
  } catch (err) {
    console.error(`✗ #${o.order_number}:`, err);
  }
}

const { data: check } = await db.rpc('check_invariants');
const i7 = (check ?? []).find((r: { invariant: string }) => r.invariant.startsWith('I7'));
console.log(`\nI7: ${i7?.status ?? '?'} — ${i7?.details ?? ''}`);
