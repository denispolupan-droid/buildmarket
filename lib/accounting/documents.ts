/**
 * lib/accounting/documents.ts
 *
 * Бизнес-логика документов учётной системы.
 *
 * Принципы:
 *   - Только подтверждённый документ создаёт stock_movements
 *   - Движения всегда в base_uom (qty_in_base)
 *   - Дропшип-строки: финансы фиксируются, физических движений нет
 *   - Отмена confirmed = создаёт сторно-документ (не удаляет движения)
 *   - Отмена draft = просто меняет статус
 *
 * Знак qty в движениях:
 *   'in'  direction: movement.qty = +qtyInBase (или –qtyInBase для сторно)
 *   'out' direction: movement.qty = –qtyInBase (или +qtyInBase для сторно)
 *
 * Это позволяет сторнировать одним и тем же кодом — строки сторно-документа
 * имеют qty = –original_qty, что автоматически даёт правильный знак движения.
 */

import { createServiceClient } from '../supabase';
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
  purchase_order: 'none',    // заказ поставщику — склад не трогаем
  receipt:        'in',
  sale:           'out',
  return_in:      'in',
  return_out:     'out',
  write_off:      'out',
  transfer:       'transfer',
  inventory:      'inventory',
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

  // Загружаем документ со строками
  const doc = await getDocument(documentId);
  if (!doc) throw new Error('Document not found');
  if (doc.status !== 'draft') {
    throw new Error(`Cannot confirm document with status '${doc.status}'`);
  }

  const lines = doc.lines ?? [];
  if (lines.length === 0) throw new Error('Document has no lines');

  const direction: Direction = DIRECTION[doc.doc_type as DocType] ?? 'none';

  // Idempotency: если движения уже созданы (прошлый вызов упал после insert) —
  // пропускаем создание движений и только обновляем статус
  const { count: existingMoves } = await db
    .from('stock_movements')
    .select('id', { count: 'exact', head: true })
    .eq('document_id', documentId);

  let totalAmount = 0;
  let totalCost   = 0;

  if (direction !== 'none' && (existingMoves ?? 0) === 0) {
    const movements = await buildMovements(db, doc, lines, direction);

    if (movements.length > 0) {
      const { error } = await db.from('stock_movements').insert(movements);
      if (error) throw error;
    }
  }

  // Пересчёт итогов по строкам
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
}

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

  // Черновик — просто отменяем без сторно
  if (doc.status === 'draft') {
    const { error } = await db
      .from('acc_documents')
      .update({
        status:       'cancelled',
        cancelled_at: new Date().toISOString(),
        cancelled_by: cancelledBy,
        cancel_reason: reason ?? null,
      })
      .eq('id', documentId);
    if (error) throw error;
    return;
  }

  // Проведённый документ — создаём сторно-документ
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

  // Строки сторно: qty = –original_qty (это даёт обратное движение автоматически)
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

  // Проводим сторно — создаёт обратные движения
  await confirmDocument(reversal.id, cancelledBy);

  // Отмечаем оригинал как отменённый
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
}

// ── Построение движений (внутренняя функция) ──────────────────────────────────

async function buildMovements(
  db: ReturnType<typeof createServiceClient>,
  doc: AccDocumentWithLines,
  lines: AccDocumentLine[],
  direction: Direction,
): Promise<MovementInsert[]> {
  const movements: MovementInsert[] = [];

  // Для расходных движений берём avg_cost из stock_balance
  const physicalLines = lines.filter(l => l.fulfillment_type !== 'dropship');
  const avgCostMap    = await fetchAvgCosts(db, doc.warehouse_id, physicalLines.map(l => l.sku));

  for (const line of lines) {
    // qty_in_base — из вычисляемого поля БД; fallback на qty * uom_factor
    const qtyInBase = line.qty_in_base ?? (line.qty * (line.uom_factor ?? 1));

    // Дропшип-строки: только финансы, физических движений нет
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
      movements.push({
        ...base,
        warehouse_id: lineWarehouseId,
        sku:          line.sku,
        qty:          qtyInBase,                              // + = приход, – = сторно прихода
        cost_price:   line.cost_price ?? null,
        sale_price:   null,
      });

    } else if (direction === 'out') {
      const avgCost = avgCostMap.get(line.sku) ?? line.cost_price ?? null;
      movements.push({
        ...base,
        warehouse_id: lineWarehouseId,
        sku:          line.sku,
        qty:          -qtyInBase,                             // – = расход, + = сторно расхода
        cost_price:   avgCost,
        sale_price:   line.price,
      });

    } else if (direction === 'transfer') {
      const avgCost = avgCostMap.get(line.sku) ?? null;
      // Расход с исходного склада
      movements.push({
        ...base,
        warehouse_id: doc.warehouse_id,
        sku:          line.sku,
        qty:          -qtyInBase,
        cost_price:   avgCost,
        sale_price:   null,
      });
      // Приход на целевой склад
      movements.push({
        ...base,
        warehouse_id: doc.warehouse_to_id!,
        sku:          line.sku,
        qty:          qtyInBase,
        cost_price:   avgCost,
        sale_price:   null,
      });

    } else if (direction === 'inventory') {
      // qty уже знаковый (может быть отрицательным при недостаче)
      const avgCost = avgCostMap.get(line.sku) ?? line.cost_price ?? null;
      movements.push({
        ...base,
        warehouse_id: lineWarehouseId,
        sku:          line.sku,
        qty:          qtyInBase,                              // знак определён в строке
        cost_price:   avgCost,
        sale_price:   null,
      });
    }
  }

  return movements;
}

// Загружает avg_cost из stock_balance для набора SKU
async function fetchAvgCosts(
  db: ReturnType<typeof createServiceClient>,
  warehouseId: number,
  skus: string[],
): Promise<Map<string, number>> {
  if (skus.length === 0) return new Map();

  const { data } = await db
    .from('stock_balance')
    .select('sku, avg_cost')
    .eq('warehouse_id', warehouseId)
    .in('sku', skus);

  return new Map((data ?? []).map(b => [b.sku, b.avg_cost]));
}
