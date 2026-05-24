import { createServiceClient } from '../supabase';
import {
  recordShipment, recordCOGS, recordPurchase,
  recordReturn, recordSupplierReturn, recordTxn,
} from './money';
import { releaseReservation } from './reservations';
import type {
  AccDocument,
  AccDocumentLine,
  AccDocumentWithLines,
  CreateDocumentInput,
  DocType,
  MovementInsert,
} from './types';

// Направление движения по типу документа
const DIRECTION = {
  purchase_order:            'none',
  purchase_order_adjustment: 'none',
  receipt:                   'in',
  stock_in:                  'in',
  supplier_invoice:          'none',
  supplier_return:           'out',
  sale:                      'out',
  return_in:                 'in',
  return_out:                'out',
  write_off:                 'out',
  transfer:                  'transfer',
  inventory:                 'inventory',
} as const satisfies Record<DocType, string>;

type Direction = (typeof DIRECTION)[DocType];

// ── Создание документа (черновик) ─────────────────────────────────────────────

export async function createDocument(
  input: CreateDocumentInput,
): Promise<AccDocument> {
  const db = createServiceClient();

  const { data: docNumber, error: numError } = await db
    .rpc('next_doc_number', { p_type: input.doc_type });
  if (numError) throw numError;

  const { data: doc, error: docError } = await db
    .from('acc_documents')
    .insert({
      doc_type:         input.doc_type,
      doc_number:       docNumber as string,
      status:           'draft',
      warehouse_id:     input.warehouse_id,
      warehouse_to_id:  input.warehouse_to_id   ?? null,
      supplier_id:      input.supplier_id        ?? null,
      order_id:         input.order_id           ?? null,
      customer_id:      input.customer_id        ?? null,
      counterparty:     input.counterparty       ?? null,
      channel_code:     input.channel_code       ?? null,
      tracking_number:  input.tracking_number    ?? null,
      expected_date:    input.expected_date      ?? null,
      doc_date:         input.doc_date           ?? new Date().toISOString(),
      notes:            input.notes              ?? null,
      currency:         input.currency           ?? 'UAH',
      exchange_rate:    input.exchange_rate      ?? 1,
      created_by:       input.created_by         ?? null,
      parent_doc_id:    input.parent_doc_id      ?? null,
      meta:             input.meta               ?? {},
    })
    .select()
    .single();

  if (docError) throw docError;

  const lines = input.lines.map((l, i) => ({
    document_id:      doc.id,
    sku:              l.sku,
    qty:              l.qty,
    price:            l.price,
    cost_price:       l.cost_price      ?? null,
    warehouse_id:     l.warehouse_id    ?? null,
    fulfillment_type: l.fulfillment_type ?? 'own',
    supplier_id:      l.supplier_id     ?? null,
    uom_code:         l.uom_code        ?? null,
    uom_factor:       l.uom_factor      ?? 1,
    qty_actual:       l.qty_actual      ?? null,
    qty_system:       l.qty_system      ?? null,
    exchange_rate:    l.exchange_rate   ?? (input.exchange_rate ?? 1),
    sort_order:       i,
    meta:             l.meta            ?? {},
  }));

  const { error: linesError } = await db
    .from('acc_document_lines')
    .insert(lines);
  if (linesError) throw linesError;

  return doc as AccDocument;
}

// ── Получение документа ───────────────────────────────────────────────────────

export async function getDocument(id: string): Promise<AccDocumentWithLines | null> {
  const db = createServiceClient();
  const { data, error } = await db
    .from('acc_documents')
    .select('*, lines:acc_document_lines(*)')
    .eq('id', id)
    .order('sort_order', { referencedTable: 'acc_document_lines' })
    .single();
  if (error) return null;
  return data as AccDocumentWithLines;
}

// ── Проведение документа (draft → confirmed) ──────────────────────────────────

export async function confirmDocument(
  documentId: string,
  confirmedBy: string,
): Promise<void> {
  const db = createServiceClient();

  const doc = await getDocument(documentId);
  if (!doc) throw new Error('Document not found');
  if (doc.status !== 'draft') {
    throw new Error(`Cannot confirm document with status '${doc.status}'`);
  }

  const lines = doc.lines ?? [];
  if (lines.length === 0) throw new Error('Document has no lines');

  const direction: Direction = DIRECTION[doc.doc_type as DocType] ?? 'none';
  const isReversal = !!doc.reversal_of;

  // P1: перевірка overreceipt для receipts що мають parent PO
  if ((doc.doc_type === 'receipt' || doc.doc_type === 'stock_in') && doc.parent_doc_id && !isReversal) {
    const { data: check } = await db.rpc('check_receipt_quantities', { p_receipt_id: documentId });
    const violations = (check ?? []).filter((r: { would_exceed: boolean }) => r.would_exceed);
    if (violations.length > 0) {
      const skus = violations.map((v: {
        sku: string; effective: number; already_received: number; this_receipt: number
      }) =>
        `${v.sku}: ефективно замовлено ${v.effective}, вже отримано ${v.already_received}, цей прихід ${v.this_receipt}`
      ).join('; ');
      throw new Error(`[P1] Перевищення замовленої кількості: ${skus}`);
    }
  }

  // Idempotency: якщо рухи вже є — пропускаємо їх побудову
  const { count: existingMoves } = await db
    .from('stock_movements')
    .select('id', { count: 'exact', head: true })
    .eq('document_id', documentId);

  let totalAmount = 0;
  let totalCost   = 0;
  let fifoCost    = 0;

  if (direction !== 'none' && (existingMoves ?? 0) === 0) {
    const result = await buildMovements(db, doc, lines, direction);
    if (result.movements.length > 0) {
      const { error } = await db.from('stock_movements').insert(result.movements);
      if (error) throw error;
    }
    fifoCost = result.fifoCost;
  } else if ((existingMoves ?? 0) > 0 && (direction === 'out' || direction === 'transfer')) {
    const { data: existingMovs } = await db
      .from('stock_movements')
      .select('batch_cost')
      .eq('document_id', documentId);
    fifoCost = (existingMovs ?? []).reduce((s, m) => s + (Number(m.batch_cost) || 0), 0);
  }

  for (const line of lines) {
    totalAmount += Math.abs(line.amount ?? 0);
    totalCost   += Math.abs((line.cost_price ?? 0) * (line.qty_in_base ?? line.qty));
  }

  const { error } = await db
    .from('acc_documents')
    .update({
      status:       'confirmed',
      confirmed_at: new Date().toISOString(),
      confirmed_by: confirmedBy,
      total_amount: totalAmount,
      total_cost:   totalCost,
    })
    .eq('id', documentId);
  if (error) throw error;

  // ── Записи в грошовому леджері (подвійний запис) ──────────────────────────
  // Для сторно-документів (reversal_of != null) напрямок проводок обернений.
  const bizDate = doc.doc_date?.slice(0, 10) ?? new Date().toISOString().slice(0, 10);

  if (doc.doc_type === 'receipt' || doc.doc_type === 'stock_in') {
    if (doc.supplier_id && totalCost > 0) {
      if (isReversal) {
        // Сторно приходу: дебет supplier (зменшуємо борг), кредит inventory_asset
        await recordSupplierReturn({
          supplierId:     String(doc.supplier_id),
          docId:          documentId,
          amount:         totalCost,
          businessDate:   bizDate,
          createdBy:      confirmedBy,
          idempotencyKey: `storno-purchase:${documentId}`,
        });
      } else {
        await recordPurchase({
          supplierId:     String(doc.supplier_id),
          docId:          documentId,
          amount:         totalCost,
          businessDate:   bizDate,
          createdBy:      confirmedBy,
          idempotencyKey: `purchase:${documentId}`,
        });
      }
    }

  } else if (doc.doc_type === 'sale') {
    if (isReversal) {
      // Сторно продажу: сторно виручки + сторно COGS
      if (doc.customer_id && totalAmount > 0) {
        await recordReturn({
          customerId:     doc.customer_id,
          orderId:        doc.order_id ?? undefined,
          docId:          documentId,
          amount:         totalAmount,
          businessDate:   bizDate,
          createdBy:      confirmedBy,
          idempotencyKey: `storno-shipment:${documentId}`,
        });
      }
      if (fifoCost > 0) {
        // Сторно COGS: дебет inventory_asset, кредит cogs (обернено до recordCOGS)
        await recordTxn({
          debitAccount:   'inventory_asset',
          creditAccount:  'cogs',
          amount:         fifoCost,
          businessDate:   bizDate,
          docId:          documentId,
          docType:        'sale',
          orderId:        doc.order_id ?? undefined,
          createdBy:      confirmedBy,
          idempotencyKey: `storno-cogs:${documentId}`,
        });
      }
    } else {
      if (doc.customer_id && totalAmount > 0) {
        await recordShipment({
          customerId:     doc.customer_id,
          orderId:        doc.order_id ?? undefined,
          docId:          documentId,
          amount:         totalAmount,
          businessDate:   bizDate,
          createdBy:      confirmedBy,
          idempotencyKey: `shipment:${documentId}`,
        });
      }
      if (fifoCost > 0) {
        await recordCOGS({
          amount:         fifoCost,
          docId:          documentId,
          orderId:        doc.order_id ?? undefined,
          businessDate:   bizDate,
          createdBy:      confirmedBy,
          idempotencyKey: `cogs:${documentId}`,
        });
      }
      if (doc.order_id) {
        await releaseReservation(doc.order_id, 'shipped');
      }
    }

  } else if (doc.doc_type === 'return_out') {
    if (doc.customer_id && totalAmount > 0) {
      await recordReturn({
        customerId:     doc.customer_id,
        orderId:        doc.order_id ?? undefined,
        docId:          documentId,
        amount:         totalAmount,
        businessDate:   bizDate,
        createdBy:      confirmedBy,
        idempotencyKey: `return:${documentId}`,
      });
    }

  } else if (doc.doc_type === 'supplier_return') {
    if (doc.supplier_id && totalCost > 0) {
      await recordSupplierReturn({
        supplierId:     String(doc.supplier_id),
        docId:          documentId,
        amount:         totalCost,
        businessDate:   bizDate,
        createdBy:      confirmedBy,
        idempotencyKey: `sup-return:${documentId}`,
      });
    }
  }
}

// ── Перевірка залежностей перед скасуванням ───────────────────────────────────
//
// Граф залежностей (не можна скасувати якщо є активні нащадки):
//
//   ЗП (purchase_order)
//    ├─ КЗ (purchase_order_adjustment)  parent_doc_id = ЗП
//    └─ ПН (receipt / stock_in)         parent_doc_id = ЗП
//         └─ Продаж (sale)              consumed stock_batches.remaining_qty < initial_qty
//
//   ПН (receipt / stock_in)
//    └─ Якщо FIFO-партії частково/повністю продані → блокуємо
//
//   Продаж (sale)
//    └─ Повернення (return_out / return_in) parent_doc_id або order_id → блокуємо

async function assertNoDependencies(
  db: ReturnType<typeof createServiceClient>,
  doc: AccDocumentWithLines,
): Promise<void> {
  const id = doc.id;

  // ── 1. ЗП / КЗ — перевірити дочірні документи ──────────────────────────
  if (doc.doc_type === 'purchase_order' || doc.doc_type === 'purchase_order_adjustment') {
    const { data: children } = await db
      .from('acc_documents')
      .select('doc_number, doc_type')
      .eq('parent_doc_id', id)
      .neq('status', 'cancelled');

    if (children && children.length > 0) {
      const list = children
        .map(c => `${c.doc_number} (${DOC_TYPE_SHORT[c.doc_type] ?? c.doc_type})`)
        .join(', ');
      throw new Error(
        `Неможливо скасувати: є активні пов'язані документи — ${list}. ` +
        `Спочатку скасуйте їх.`,
      );
    }
  }

  // ── 2. ПН / stock_in — перевірити чи продані FIFO-партії ────────────────
  if (doc.doc_type === 'receipt' || doc.doc_type === 'stock_in') {
    const { data: batches } = await db
      .from('stock_batches')
      .select('sku, initial_qty, remaining_qty')
      .eq('document_id', id);

    const consumed = (batches ?? []).filter(
      b => Number(b.remaining_qty) < Number(b.initial_qty) - 0.001,
    );

    if (consumed.length > 0) {
      const skus = consumed
        .map(b => `${b.sku} (залишок ${b.remaining_qty} з ${b.initial_qty})`)
        .join(', ');
      throw new Error(
        `Неможливо сторнувати прихід: товар уже відпущено зі складу — ${skus}. ` +
        `Спочатку сторнуйте пов'язані продажі або переміщення.`,
      );
    }
  }

  // ── 3. Продаж — перевірити чи є активні повернення ──────────────────────
  if (doc.doc_type === 'sale') {
    const { data: returns } = await db
      .from('acc_documents')
      .select('doc_number, doc_type')
      .eq('parent_doc_id', id)
      .in('doc_type', ['return_out', 'return_in'])
      .neq('status', 'cancelled');

    if (returns && returns.length > 0) {
      const list = returns.map(r => r.doc_number).join(', ');
      throw new Error(
        `Неможливо сторнувати продаж: є активні повернення — ${list}. ` +
        `Спочатку скасуйте їх.`,
      );
    }
  }
}

const DOC_TYPE_SHORT: Record<string, string> = {
  purchase_order:            'ЗП',
  purchase_order_adjustment: 'КЗ',
  receipt:                   'ПН',
  stock_in:                  'ПН',
  sale:                      'Продаж',
  return_in:                 'Повернення',
  return_out:                'Повернення',
  supplier_return:           'Повернення постачальнику',
  write_off:                 'Списання',
  transfer:                  'Переміщення',
  supplier_invoice:          'Рахунок-фактура',
};

// ── Отмена документа ──────────────────────────────────────────────────────────

export async function cancelDocument(
  documentId: string,
  cancelledBy: string,
  reason?: string,
): Promise<void> {
  const db = createServiceClient();

  const doc = await getDocument(documentId);
  if (!doc)                       throw new Error('Document not found');
  if (doc.status === 'cancelled') throw new Error('Document already cancelled');

  // ── Перевірка залежностей (тільки для підтверджених документів) ───────────
  if (doc.status === 'confirmed') {
    await assertNoDependencies(db, doc);
  }

  // ── Планові документи (direction=none): скасовуємо напряму без реверсалу ──
  // PO, коригування, рахунок-фактура не мають ефекту на склад і леджер,
  // тому немає сенсу створювати зворотний документ.
  const PLAN_ONLY_TYPES = new Set(['purchase_order', 'purchase_order_adjustment', 'supplier_invoice']);

  if (doc.status === 'draft' || PLAN_ONLY_TYPES.has(doc.doc_type)) {
    const { error } = await db
      .from('acc_documents')
      .update({
        status:        'cancelled',
        cancelled_at:  new Date().toISOString(),
        cancelled_by:  cancelledBy,
        cancel_reason: reason ?? null,
      })
      .eq('id', documentId);
    if (error) throw error;
    return;
  }

  // ── Операційні документи (direction=in/out/transfer): створюємо сторно ────
  // Ці документи мають ефект на склад/леджер — потрібен реверсальний документ.
  const { data: docNumber } = await db
    .rpc('next_doc_number', { p_type: doc.doc_type });

  const { data: reversal, error: reversalError } = await db
    .from('acc_documents')
    .insert({
      doc_type:        doc.doc_type,
      doc_number:      docNumber as string,
      status:          'draft',
      warehouse_id:    doc.warehouse_id,
      warehouse_to_id: doc.warehouse_to_id,
      supplier_id:     doc.supplier_id,
      order_id:        doc.order_id,
      customer_id:     doc.customer_id,
      counterparty:    doc.counterparty,
      channel_code:    doc.channel_code,
      currency:        doc.currency,
      exchange_rate:   doc.exchange_rate,
      reversal_of:     documentId,
      doc_date:        new Date().toISOString(),
      notes:           `Сторно ${doc.doc_number}${reason ? ': ' + reason : ''}`,
      created_by:      cancelledBy,
      meta:            doc.meta ?? {},
    })
    .select()
    .single();
  if (reversalError) throw reversalError;

  // Строки сторно: qty = –original_qty
  const reversalLines = doc.lines.map((l: AccDocumentLine, i: number) => ({
    document_id:      reversal.id,
    sku:              l.sku,
    qty:              -l.qty,
    price:            l.price,
    cost_price:       l.cost_price,
    warehouse_id:     l.warehouse_id,
    fulfillment_type: l.fulfillment_type,
    supplier_id:      l.supplier_id,
    uom_code:         l.uom_code,
    uom_factor:       l.uom_factor,
    exchange_rate:    l.exchange_rate,
    sort_order:       i,
    meta:             l.meta ?? {},
  }));

  const { error: linesError } = await db
    .from('acc_document_lines')
    .insert(reversalLines);
  if (linesError) throw linesError;

  await confirmDocument(reversal.id, cancelledBy);

  const { error: cancelError } = await db
    .from('acc_documents')
    .update({
      status:        'cancelled',
      cancelled_at:  new Date().toISOString(),
      cancelled_by:  cancelledBy,
      cancel_reason: reason ?? null,
    })
    .eq('id', documentId);
  if (cancelError) throw cancelError;

  // ПРИМІТКА: сторно purchase_order НЕ впливає на склад і НЕ скасовує
  // пов'язані приходи автоматично. ЗП — плановий документ (direction=none).
  // Якщо товар уже прийнятий і потрібне повернення — сторнуйте прихід окремо
  // або створіть документ «Повернення постачальнику».
}

// ── Побудова рухів ────────────────────────────────────────────────────────────
//
// Знак qty визначається напрямком та тим, чи це сторно (qtyInBase < 0):
//   'in'  + qty>0: +qty  (приход)       'in'  + qty<0: -|qty| (сторно приходу — consume FIFO)
//   'out' + qty>0: -qty  (витрата)      'out' + qty<0: +|qty| (сторно витрати — create batch)
// 'transfer' аналогічно: обидва напрямки обертаються при сторно.

async function buildMovements(
  db: ReturnType<typeof createServiceClient>,
  doc: AccDocumentWithLines,
  lines: AccDocumentLine[],
  direction: Direction,
): Promise<{ movements: MovementInsert[]; fifoCost: number }> {
  const movements: MovementInsert[] = [];
  let totalFifoCost = 0;

  for (const line of lines) {
    const qtyInBase = line.qty_in_base ?? (line.qty * (line.uom_factor ?? 1));

    if (line.fulfillment_type === 'dropship') continue;
    if (qtyInBase === 0) continue;

    const lineWarehouseId = line.warehouse_id ?? doc.warehouse_id;
    const base = {
      document_id:      doc.id,
      document_line_id: line.id,
      doc_type:         doc.doc_type,
      order_id:         doc.order_id    ?? null,
      supplier_id:      doc.supplier_id ?? null,
    };

    if (direction === 'in') {
      if (qtyInBase > 0) {
        // Нормальний приход — створюємо FIFO-партію
        movements.push({
          ...base,
          warehouse_id: lineWarehouseId,
          sku:          line.sku,
          qty:          qtyInBase,
          cost_price:   line.cost_price ?? null,
          sale_price:   null,
        });
        await db.rpc('create_stock_batch', {
          p_sku:          line.sku,
          p_warehouse_id: lineWarehouseId,
          p_supplier_id:  doc.supplier_id ?? line.supplier_id ?? null,
          p_document_id:  doc.id,
          p_qty:          qtyInBase,
          p_cost_price:   line.cost_price ?? 0,
          p_received_at:  doc.doc_date ?? new Date().toISOString(),
        });
      } else {
        // Сторно приходу — consume FIFO, рух від'ємний (склад зменшується)
        const absQty = Math.abs(qtyInBase);
        const { data: batchCost } = await db.rpc('consume_stock_fifo', {
          p_sku:          line.sku,
          p_warehouse_id: lineWarehouseId,
          p_qty:          absQty,
        });
        movements.push({
          ...base,
          warehouse_id: lineWarehouseId,
          sku:          line.sku,
          qty:          -absQty,
          cost_price:   absQty > 0 ? ((batchCost as number) ?? 0) / absQty : (line.cost_price ?? 0),
          sale_price:   null,
          batch_cost:   (batchCost as number) ?? null,
        });
      }

    } else if (direction === 'out') {
      if (qtyInBase > 0) {
        // Нормальний розхід — consume FIFO
        const { data: lineBatchCost } = await db.rpc('consume_stock_fifo', {
          p_sku:          line.sku,
          p_warehouse_id: lineWarehouseId,
          p_qty:          qtyInBase,
        });
        const costPerUnit = ((lineBatchCost as number) ?? 0) / qtyInBase;
        movements.push({
          ...base,
          warehouse_id: lineWarehouseId,
          sku:          line.sku,
          qty:          -qtyInBase,
          cost_price:   costPerUnit,
          sale_price:   line.price,
          batch_cost:   (lineBatchCost as number) ?? null,
        });
        totalFifoCost += (lineBatchCost as number) ?? 0;
      } else {
        // Сторно розходу — повертаємо товар на склад як нову FIFO-партію
        const absQty = Math.abs(qtyInBase);
        const costPerUnit = line.cost_price ?? 0;
        await db.rpc('create_stock_batch', {
          p_sku:          line.sku,
          p_warehouse_id: lineWarehouseId,
          p_supplier_id:  doc.supplier_id ?? null,
          p_document_id:  doc.id,
          p_qty:          absQty,
          p_cost_price:   costPerUnit,
          p_received_at:  doc.doc_date ?? new Date().toISOString(),
        });
        movements.push({
          ...base,
          warehouse_id: lineWarehouseId,
          sku:          line.sku,
          qty:          absQty,
          cost_price:   costPerUnit,
          sale_price:   null,
          batch_cost:   null,
        });
      }

    } else if (direction === 'transfer') {
      const absQty = Math.abs(qtyInBase);
      if (qtyInBase > 0) {
        // Нормальне переміщення: списати з source, оприбуткувати на dest
        const { data: lineBatchCost } = await db.rpc('consume_stock_fifo', {
          p_sku:          line.sku,
          p_warehouse_id: doc.warehouse_id,
          p_qty:          absQty,
        });
        const costPerUnit = absQty > 0 ? ((lineBatchCost as number) ?? 0) / absQty : 0;
        movements.push({ ...base, warehouse_id: doc.warehouse_id,      sku: line.sku, qty: -absQty, cost_price: costPerUnit, sale_price: null });
        movements.push({ ...base, warehouse_id: doc.warehouse_to_id!,  sku: line.sku, qty:  absQty, cost_price: costPerUnit, sale_price: null });
        await db.rpc('create_stock_batch', {
          p_sku: line.sku, p_warehouse_id: doc.warehouse_to_id!,
          p_supplier_id: null, p_document_id: doc.id,
          p_qty: absQty, p_cost_price: costPerUnit,
          p_received_at: doc.doc_date ?? new Date().toISOString(),
        });
      } else {
        // Сторно переміщення: consume з dest, відновити source
        const { data: lineBatchCost } = await db.rpc('consume_stock_fifo', {
          p_sku:          line.sku,
          p_warehouse_id: doc.warehouse_to_id!,
          p_qty:          absQty,
        });
        const costPerUnit = absQty > 0 ? ((lineBatchCost as number) ?? 0) / absQty : 0;
        movements.push({ ...base, warehouse_id: doc.warehouse_id,      sku: line.sku, qty:  absQty, cost_price: costPerUnit, sale_price: null });
        movements.push({ ...base, warehouse_id: doc.warehouse_to_id!,  sku: line.sku, qty: -absQty, cost_price: costPerUnit, sale_price: null });
        await db.rpc('create_stock_batch', {
          p_sku: line.sku, p_warehouse_id: doc.warehouse_id,
          p_supplier_id: null, p_document_id: doc.id,
          p_qty: absQty, p_cost_price: costPerUnit,
          p_received_at: doc.doc_date ?? new Date().toISOString(),
        });
      }

    } else if (direction === 'inventory') {
      if (qtyInBase < 0) {
        const absQty = Math.abs(qtyInBase);
        const { data: lineInventoryCost } = await db.rpc('consume_stock_fifo', {
          p_sku: line.sku, p_warehouse_id: lineWarehouseId, p_qty: absQty,
        });
        movements.push({
          ...base,
          warehouse_id: lineWarehouseId,
          sku:          line.sku,
          qty:          -absQty,
          cost_price:   line.cost_price ?? null,
          sale_price:   null,
          batch_cost:   (lineInventoryCost as number) ?? null,
        });
      } else {
        movements.push({
          ...base,
          warehouse_id: lineWarehouseId,
          sku:          line.sku,
          qty:          qtyInBase,
          cost_price:   line.cost_price ?? null,
          sale_price:   null,
        });
        await db.rpc('create_stock_batch', {
          p_sku: line.sku, p_warehouse_id: lineWarehouseId,
          p_supplier_id: null, p_document_id: doc.id,
          p_qty: qtyInBase, p_cost_price: line.cost_price ?? 0,
          p_received_at: doc.doc_date ?? new Date().toISOString(),
        });
      }
    }
  }

  return { movements, fifoCost: totalFifoCost };
}
