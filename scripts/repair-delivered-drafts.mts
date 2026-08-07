/**
 * Ремонт інваріанта I7 — «delivered orders have confirmed sale doc».
 *
 * Замовлення в статусі «Доставлено», у якого видаткова лишилась чернеткою: продаж,
 * COGS і комісія не проведені, склад не списаний, резерв висить. Причина була в
 * кнопці «Синхронізувати НП» (власна копія логіки крона, яка ставила delivered без
 * проводок) і в maybeSingle() у completeShipmentByTtn для спільних посилок — обидві
 * полагоджені; цей скрипт добиває наслідки на вже зіпсованих замовленнях.
 *
 * Запуск:
 *   npx tsx --env-file=.env.local scripts/repair-delivered-drafts.mts           # тільки показати
 *   npx tsx --env-file=.env.local scripts/repair-delivered-drafts.mts --apply   # провести
 *
 * Ідемпотентний: applyCompletionEffects не дублює проводки, повторний запуск безпечний.
 */
// Інтероп як у scripts/rozetka/sla-report.mts: tsx вантажить lib як CJS, і прямий
// іменований імпорт в .mts падає на «does not provide an export named».
import * as supabaseNS from '../lib/supabase';
import * as completionNS from '../lib/accounting/completion';
const { createServiceClient } = (supabaseNS as unknown as { default: typeof supabaseNS }).default ?? supabaseNS;
const { completeShipmentByTtn, applyCompletionEffects } =
  (completionNS as unknown as { default: typeof completionNS }).default ?? completionNS;

const apply = process.argv.includes('--apply');
const db = createServiceClient();

const { data: drafts, error } = await db
  .from('acc_documents')
  .select('id, doc_number, order_id, tracking_number')
  .eq('doc_type', 'sale')
  .eq('status', 'draft')
  .limit(1000);
if (error) throw error;

const orderIds = [...new Set((drafts ?? []).map(d => d.order_id).filter(Boolean))] as string[];
if (!orderIds.length) {
  console.log('Чернеток РН немає — нічого ремонтувати.');
  process.exit(0);
}

const { data: orders } = await db
  .from('orders')
  .select('id, order_number, status, tracking_number')
  .in('id', orderIds);

const delivered = new Map(
  (orders ?? []).filter(o => o.status === 'delivered').map(o => [o.id as string, o]),
);
const targets = (drafts ?? []).filter(d => d.order_id && delivered.has(d.order_id));

if (!targets.length) {
  console.log('Доставлених замовлень із чернеткою РН немає — інваріант I7 чистий.');
  process.exit(0);
}

console.log(`Знайдено ${targets.length} чернет${targets.length === 1 ? 'ку' : 'ок'} на доставлених замовленнях:`);
for (const d of targets) {
  const o = delivered.get(d.order_id as string)!;
  console.log(`  ${d.doc_number}  замовлення #${o.order_number}  ТТН ${d.tracking_number ?? o.tracking_number ?? '—'}`);
}

if (!apply) {
  console.log('\nЦе був перегляд. Щоб провести — додайте --apply');
  process.exit(0);
}

// Спершу по ТТН (так само, як це робить крон доставки: одна ТТН може нести
// кілька замовлень, і completeShipmentByTtn проведе всі чернетки номера й
// дорахує COD, коли по замовленню закриті всі посилки).
const byTtn = [...new Set(targets.map(d => d.tracking_number).filter(Boolean))] as string[];
for (const ttn of byTtn) {
  try {
    await completeShipmentByTtn(ttn, 'script:repair-delivered-drafts');
    console.log(`✓ ТТН ${ttn}`);
  } catch (err) {
    console.error(`✗ ТТН ${ttn}:`, err);
  }
}

// Чернетки без ТТН (самовивіз, ручні відгрузки) — напряму за документом.
for (const d of targets.filter(t => !t.tracking_number)) {
  try {
    await applyCompletionEffects(d.id, 'script:repair-delivered-drafts');
    console.log(`✓ ${d.doc_number}`);
  } catch (err) {
    console.error(`✗ ${d.doc_number}:`, err);
  }
}

const { data: left } = await db
  .from('acc_documents')
  .select('doc_number')
  .eq('doc_type', 'sale')
  .eq('status', 'draft')
  .in('order_id', [...delivered.keys()]);
console.log(left?.length ? `\nЛишилось чернеток: ${left.length}` : '\nГотово, чернеток на доставлених замовленнях не лишилось.');
