/**
 * Компенсація неатомарності проведення (Етап 3 аудиту).
 *
 * confirmDocument виконує рухи + проводки серією окремих викликів: падіння
 * посередині лишає «напівпроведений» документ (рухи є, грошей немає).
 * Всі проводки мають детерміновані idempotency-ключі, тому їх можна безпечно
 * дозаписати. Скрипт знаходить підтверджені документи з відсутніми очікуваними
 * проводками і (з --apply) допостить їх. Сторно-документи лише репортяться —
 * їх суми залежать від оригіналу і чиняться руками.
 *
 * Використання:
 *   npx tsx --env-file=.env.local scripts/repair-doc-ledger.ts          # dry-run
 *   npx tsx --env-file=.env.local scripts/repair-doc-ledger.ts --apply
 */
import { createServiceClient } from '../lib/supabase';
import { resolveSaleDebitParty } from '../lib/accounting/documents';
import { recordShipment, recordCOGS, recordPurchase, recordSupplierReturn, recordReturn, recordTxn } from '../lib/accounting/money';

const APPLY = process.argv.includes('--apply');

type Doc = {
  id: string; doc_number: string; doc_type: string; reversal_of: string | null;
  order_id: string | null; customer_id: string | null; supplier_id: number | null;
  contract_id: string | null; total_amount: number; total_cost: number; doc_date: string | null;
};

async function main() {
  const db = createServiceClient();

  const { data: docs, error } = await db
    .from('acc_documents')
    .select('id, doc_number, doc_type, reversal_of, order_id, customer_id, supplier_id, contract_id, total_amount, total_cost, doc_date')
    .eq('status', 'confirmed')
    .in('doc_type', ['sale', 'receipt', 'stock_in', 'supplier_return', 'return_out', 'return_in'])
    .order('doc_date', { ascending: true })
    .limit(5000);
  if (error) throw error;
  if (!docs?.length) { console.log('Документів немає.'); return; }

  // Очікувані ключі по кожному документу
  const wantedKeys: string[] = [];
  for (const d of docs as Doc[]) {
    const p = d.reversal_of ? 'storno-' : '';
    if (d.doc_type === 'sale') wantedKeys.push(`${p}shipment:${d.id}`, `${p}cogs:${d.id}`);
    if (d.doc_type === 'receipt' || d.doc_type === 'stock_in') wantedKeys.push(d.reversal_of ? `storno-purchase:${d.id}` : `purchase:${d.id}`);
    if (d.doc_type === 'supplier_return' || d.doc_type === 'return_out') wantedKeys.push(d.reversal_of ? `storno-sup-return:${d.id}` : `sup-return:${d.id}`);
    if (d.doc_type === 'return_in') wantedKeys.push(`${p}return:${d.id}`, `${p}return-cogs:${d.id}`);
  }
  const existing = new Set<string>();
  for (let i = 0; i < wantedKeys.length; i += 500) {
    const { data } = await db.from('money_entries').select('idempotency_key').in('idempotency_key', wantedKeys.slice(i, i + 500));
    for (const e of data ?? []) if (e.idempotency_key) existing.add(e.idempotency_key);
  }

  // Фактична FIFO-собівартість продажу — з batch_cost рухів (dropship рухів не має → 0)
  async function fifoCostOf(docId: string): Promise<number> {
    const { data } = await db.from('stock_movements').select('batch_cost, qty').eq('document_id', docId).lt('qty', 0);
    return (data ?? []).reduce((s, m) => s + Math.abs(Number(m.batch_cost ?? 0)), 0);
  }

  let missing = 0, fixed = 0, reported = 0;

  for (const d of docs as Doc[]) {
    const bizDate = d.doc_date?.slice(0, 10);
    const problems: string[] = [];

    if (d.reversal_of) {
      // Сторно: тільки репорт
      const keys = d.doc_type === 'sale' ? [`storno-shipment:${d.id}`, `storno-cogs:${d.id}`]
        : d.doc_type === 'return_in' ? [`storno-return:${d.id}`, `storno-return-cogs:${d.id}`]
        : d.doc_type === 'supplier_return' || d.doc_type === 'return_out' ? [`storno-sup-return:${d.id}`]
        : [`storno-purchase:${d.id}`];
      for (const k of keys) {
        // сума могла бути легітимно нульовою — репортимо лише коли в оригіналі проводка Є
        const origKey = k.replace('storno-', '').replace(d.id, d.reversal_of);
        if (!existing.has(k) && existing.has(origKey)) {
          console.log(`  ⚠ СТОРНО ${d.doc_number}: відсутня проводка ${k} (оригінал її має) — виправити вручну`);
          reported++;
        }
      }
      continue;
    }

    if (d.doc_type === 'sale') {
      if (Number(d.total_amount) > 0 && !existing.has(`shipment:${d.id}`)) {
        problems.push('виручка');
        missing++;
        if (APPLY) {
          const party = await resolveSaleDebitParty(db, d);
          await recordShipment({ customerId: party, contractId: d.contract_id ?? undefined, orderId: d.order_id ?? undefined, docId: d.id, amount: Number(d.total_amount), businessDate: bizDate, createdBy: 'repair-script', idempotencyKey: `shipment:${d.id}` });
          fixed++;
        }
      }
      if (!existing.has(`cogs:${d.id}`)) {
        const fifo = await fifoCostOf(d.id);
        if (fifo > 0.001) {
          problems.push(`COGS (FIFO ${fifo.toFixed(2)})`);
          missing++;
          if (APPLY) {
            await recordCOGS({ amount: fifo, docId: d.id, orderId: d.order_id ?? undefined, businessDate: bizDate, createdBy: 'repair-script', idempotencyKey: `cogs:${d.id}` });
            fixed++;
          }
        }
      }
    } else if (d.doc_type === 'receipt' || d.doc_type === 'stock_in') {
      if (d.supplier_id && Number(d.total_cost) > 0 && !existing.has(`purchase:${d.id}`)) {
        problems.push('борг постачальнику');
        missing++;
        if (APPLY) {
          await recordPurchase({ supplierId: String(d.supplier_id), docId: d.id, amount: Number(d.total_cost), businessDate: bizDate, createdBy: 'repair-script', idempotencyKey: `purchase:${d.id}` });
          fixed++;
        }
      }
    } else if (d.doc_type === 'supplier_return' || d.doc_type === 'return_out') {
      if (d.supplier_id && Number(d.total_cost) > 0 && !existing.has(`sup-return:${d.id}`)) {
        problems.push('повернення постачальнику');
        missing++;
        if (APPLY) {
          await recordSupplierReturn({ supplierId: String(d.supplier_id), docId: d.id, amount: Number(d.total_cost), businessDate: bizDate, createdBy: 'repair-script', idempotencyKey: `sup-return:${d.id}` });
          fixed++;
        }
      }
    } else if (d.doc_type === 'return_in') {
      if (Number(d.total_amount) > 0 && !existing.has(`return:${d.id}`)) {
        problems.push('сторно виручки');
        missing++;
        if (APPLY) {
          const party = await resolveSaleDebitParty(db, d);
          await recordReturn({ customerId: party, orderId: d.order_id ?? undefined, docId: d.id, amount: Number(d.total_amount), businessDate: bizDate, createdBy: 'repair-script', idempotencyKey: `return:${d.id}` });
          fixed++;
        }
      }
      if (Number(d.total_cost) > 0 && !existing.has(`return-cogs:${d.id}`)) {
        problems.push('повернення собівартості');
        missing++;
        if (APPLY) {
          await recordTxn({ debitAccount: 'inventory_asset', creditAccount: 'cogs', amount: Number(d.total_cost), businessDate: bizDate, docId: d.id, docType: 'return_in', orderId: d.order_id ?? undefined, description: 'Повернення від покупця: собівартість на склад (repair)', idempotencyKey: `return-cogs:${d.id}`, createdBy: 'repair-script' });
          fixed++;
        }
      }
    }

    if (problems.length) {
      console.log(`  ${APPLY ? '✚' : '−'} ${d.doc_number} (${d.doc_type}): відсутні — ${problems.join(', ')}`);
    }
  }

  console.log(`\nПеревірено документів: ${docs.length}. Відсутніх проводок: ${missing}${APPLY ? `, дозаписано: ${fixed}` : ''}. Сторно-проблем (ручних): ${reported}.`);
  if (!APPLY && missing > 0) console.log('Dry-run. Запустіть з --apply, щоб дозаписати.');
  if (missing === 0 && reported === 0) console.log('Всі проводки на місці ✔');
}

main().catch(err => { console.error(err); process.exit(1); });
