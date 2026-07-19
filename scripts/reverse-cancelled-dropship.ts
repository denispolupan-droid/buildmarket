/**
 * Ретро-сторно обліку по скасованих замовленнях.
 *
 * Знаходить замовлення зі status='cancelled', у яких досі є ПІДТВЕРДЖЕНИЙ
 * документ продажу (РН) — тобто скасування пройшло повз облікове сторно
 * (наприклад, до деплою reverseDropshipLedgerExtras). Для кожного виконує
 * той самий потік, що й штатний cancel: cancelDocument + reverseDropshipLedgerExtras.
 *
 * Використання:
 *   npx tsx --env-file=.env.local scripts/reverse-cancelled-dropship.ts          # dry-run (тільки список)
 *   npx tsx --env-file=.env.local scripts/reverse-cancelled-dropship.ts --apply  # виконати сторно
 */
import { createServiceClient } from '../lib/supabase';
import { cancelDocument } from '../lib/accounting/documents';
import { reverseDropshipLedgerExtras } from '../lib/accounting/dropship';

const APPLY = process.argv.includes('--apply');

async function main() {
  const db = createServiceClient();

  const { data: cancelled, error } = await db
    .from('orders')
    .select('id, order_number, cancelled_at')
    .eq('status', 'cancelled')
    .limit(2000);
  if (error) throw error;

  const orderIds = (cancelled ?? []).map(o => o.id);
  if (!orderIds.length) { console.log('Скасованих замовлень немає.'); return; }

  const { data: docs, error: docErr } = await db
    .from('acc_documents')
    .select('id, order_id, doc_number')
    .in('order_id', orderIds)
    .eq('doc_type', 'sale')
    .eq('status', 'confirmed');
  if (docErr) throw docErr;

  if (!docs?.length) {
    console.log('Підтверджених РН по скасованих замовленнях не знайдено — все чисто.');
    return;
  }

  const orderByIdMap = new Map((cancelled ?? []).map(o => [o.id, o]));
  console.log(`Знайдено ${docs.length} підтверджених РН по скасованих замовленнях:`);
  for (const d of docs) {
    const o = orderByIdMap.get(d.order_id);
    console.log(`  - ${d.doc_number} (замовлення #${o?.order_number}, скасовано ${o?.cancelled_at ?? '—'})`);
  }

  if (!APPLY) {
    console.log('\nDry-run. Запустіть з --apply, щоб виконати сторно.');
    return;
  }

  for (const d of docs) {
    const o = orderByIdMap.get(d.order_id);
    console.log(`\nСторнуємо ${d.doc_number} (замовлення #${o?.order_number})...`);
    await cancelDocument(d.id, 'retro-fix-script', 'Замовлення скасовано (ретро-сторно)');
    await reverseDropshipLedgerExtras({ orderId: d.order_id, docId: d.id, createdBy: 'retro-fix-script' });
    console.log('  ✓ готово');
  }

  console.log('\nЗавершено. Перевірте /admin/finance/payables.');
}

main().catch(err => { console.error(err); process.exit(1); });
