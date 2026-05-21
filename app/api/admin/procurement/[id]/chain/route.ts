import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServer } from '../../../../../../lib/supabase-server';
import { createServiceClient } from '../../../../../../lib/supabase';

const db = createServiceClient();

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || user.user_metadata?.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { id } = await params;

  // 1. Сам документ (PO)
  const { data: po } = await db
    .from('acc_documents')
    .select('id, doc_number, doc_type, doc_date, status, total_amount, total_cost, procurement_status, notes, order_id')
    .eq('id', id).single();

  if (!po) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  // 2. Дочірні документи (приходи + коригування)
  const { data: allChildren } = await db
    .from('acc_documents')
    .select('id, doc_number, doc_type, doc_date, status, total_cost, notes, landed_cost_total')
    .eq('parent_doc_id', id);

  const children    = (allChildren ?? []).filter(c => ['receipt','stock_in'].includes(c.doc_type));
  const adjustments = (allChildren ?? []).filter(c => c.doc_type === 'purchase_order_adjustment');

  // Рядки коригувань — для відображення змін
  const adjIds = adjustments.map(a => a.id);
  const { data: adjLines } = adjIds.length
    ? await db.from('acc_document_lines')
        .select('document_id, sku, qty, cost_price')
        .in('document_id', adjIds)
    : { data: [] };

  const childIds = children.map(c => c.id);

  // 3. Платежі постачальнику (money_entries linked to PO)
  const { data: payments } = await db
    .from('money_entries')
    .select('id, txn_id, amount, business_date, description, account_type')
    .eq('doc_id', id)
    .in('account_type', ['supplier', 'bank', 'cash', 'acquiring', 'logistics', 'loading', 'customs', 'opex'])
    .order('created_at');

  // 4. Landed costs для дочірніх документів
  const { data: landedCosts } = childIds.length
    ? await db.from('landed_cost_lines')
        .select('id, cost_type, description, amount, distributed, document_id')
        .in('document_id', childIds)
    : { data: [] };

  // 5. FIFO партії для дочірніх документів
  const { data: batches } = childIds.length
    ? await db.from('stock_batches')
        .select('id, sku, initial_qty, cost_price, received_at')
        .in('document_id', childIds)
    : { data: [] };

  // 6. Продажі пов'язані через order_id (якщо PO пов'язаний із замовленням)
  const { data: orderDocs } = po.order_id ? await db
    .from('acc_documents')
    .select('id, doc_number, doc_type, doc_date, total_amount, total_cost')
    .eq('order_id', po.order_id)
    .neq('id', id)
    : { data: [] };

  return NextResponse.json({
    po,
    children:    children,
    adjustments: adjustments,
    adjLines:    adjLines ?? [],
    payments:    payments ?? [],
    landedCosts: landedCosts ?? [],
    batches:     batches ?? [],
    relatedDocs: orderDocs ?? [],
  });
}
