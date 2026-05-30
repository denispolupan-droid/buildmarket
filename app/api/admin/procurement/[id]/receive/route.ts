import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServer } from '../../../../../../lib/supabase-server';
import { createServiceClient } from '../../../../../../lib/supabase';
import { createDocument, confirmDocument, maybeAutoClose } from '../../../../../../lib/accounting/documents';

type OrderRow = { id: string; items: { sku: string; qty: number }[]; status_history: { status: string; at: string; by: string }[] | null };

async function autoPromoteAwaitingOrders(
  db: ReturnType<typeof createServiceClient>,
  receivedSkus: string[],
  warehouseId: number,
  by: string,
) {
  if (!receivedSkus.length) return;

  // Знаходимо замовлення зі статусом awaiting_stock і fulfillment_mode own/null
  const { data: waiting } = await db
    .from('orders')
    .select('id, items, status_history')
    .eq('status', 'awaiting_stock')
    .or('fulfillment_mode.eq.own,fulfillment_mode.is.null');

  if (!waiting?.length) return;

  // Фільтруємо ті, що мають хоча б один з отриманих SKU
  const candidates = (waiting as OrderRow[]).filter(o =>
    (o.items ?? []).some(i => receivedSkus.includes(i.sku))
  );
  if (!candidates.length) return;

  // Отримуємо поточні залишки по всіх потрібних SKU
  const allSkus = [...new Set(candidates.flatMap(o => (o.items ?? []).map(i => i.sku)))];
  const { data: balances } = await db
    .from('stock_balance')
    .select('sku, qty_available')
    .eq('warehouse_id', warehouseId)
    .in('sku', allSkus);

  const avail: Record<string, number> = {};
  for (const b of balances ?? []) avail[b.sku] = Number(b.qty_available ?? 0);

  const now = new Date().toISOString();
  const toPromote = candidates.filter(o =>
    (o.items ?? []).every(i => (avail[i.sku] ?? 0) >= i.qty)
  );

  for (const o of toPromote) {
    const history = [...(o.status_history ?? []), { status: 'picking', at: now, by: `${by} (авто)` }];
    await db.from('orders').update({ status: 'picking', status_history: history }).eq('id', o.id);
    console.log(`[auto-promote] order ${o.id} → picking`);
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || user.user_metadata?.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { id } = await params;
  const body = await req.json() as {
    actualQties?:       Record<string, number>;
    actualPrices?:      Record<string, number>;
    sale_prices?:       Record<string, number>;
    wholesale_prices?:  Record<string, number>;
    drop_prices?:       Record<string, number>;
    notes?:             string;
    draft?:             boolean;
    draftReceiptId?:    string;
    landed_costs?:      { cost_type: string; description?: string; amount: number; payment_method?: 'cash' | 'bank' }[];
    lc_method?:         'by_cost' | 'by_qty' | 'equal';
  };
  const db = createServiceClient();

  // Load PO with lines
  const { data: po } = await db
    .from('acc_documents')
    .select('*, lines:acc_document_lines(*)')
    .eq('id', id)
    .eq('doc_type', 'purchase_order')
    .eq('status', 'confirmed')
    .single();

  if (!po) return NextResponse.json({ error: 'PO не знайдено' }, { status: 404 });

  // Check no receipt yet (only receipt/stock_in, not adjustments!)
  const { count } = await db
    .from('acc_documents')
    .select('*', { count: 'exact', head: true })
    .eq('parent_doc_id', id)
    .eq('status', 'confirmed')
    .in('doc_type', ['receipt', 'stock_in']);

  if ((count ?? 0) > 0) return NextResponse.json({ error: 'Прихід вже існує для цього PO' }, { status: 409 });

  // Delete old draft receipt if replacing it
  if (body.draftReceiptId) {
    await db.from('acc_document_lines').delete().eq('document_id', body.draftReceiptId);
    await db.from('acc_documents').delete().eq('id', body.draftReceiptId).eq('status', 'draft');
  }

  // Create receipt document
  const lines = (po.lines ?? []).map((l: { sku: string; qty: number; cost_price: number; supplier_id: number; warehouse_id: number }) => {
    const actualQty   = body.actualQties?.[l.sku];
    const actualPrice = body.actualPrices?.[l.sku];
    // Guard against NaN (empty input fields send NaN via parseFloat(''))
    const qty        = (actualQty  !== undefined && !isNaN(actualQty))  ? actualQty  : l.qty;
    const cost_price = (actualPrice !== undefined && !isNaN(actualPrice) && actualPrice > 0)
      ? actualPrice
      : (l.cost_price ?? 0);
    return {
      sku:              l.sku,
      qty,
      price:            body.sale_prices?.[l.sku] ?? 0,
      cost_price,
      fulfillment_type: 'own' as const,
      warehouse_id:     l.warehouse_id ?? po.warehouse_id,
      supplier_id:      l.supplier_id ?? po.supplier_id,
    };
  });

  const receipt = await createDocument({
    doc_type:     'receipt',
    warehouse_id: po.warehouse_id,
    supplier_id:  po.supplier_id,
    order_id:     po.order_id,
    notes:        body.notes || `Прихід за ${po.doc_number}`,
    created_by:   user.email ?? 'admin',
    meta:         { parent_doc_id: id },
    lines,
  });

  // Set parent link
  await db.from('acc_documents').update({ parent_doc_id: id }).eq('id', receipt.id);

  if (body.draft) {
    // Draft mode: do not confirm, do not update PO status
    return NextResponse.json({ ok: true, receiptId: receipt.id, draft: true });
  }

  // Confirm receipt → creates FIFO batches, updates stock_balance
  await confirmDocument(receipt.id, user.email ?? 'admin');

  // SKUs що надійшли — для перевірки замовлень
  const receivedSkus = (po.lines ?? [])
    .filter((l: { sku: string; qty: number }) => {
      const qty = body.actualQties?.[l.sku];
      return qty === undefined || (!isNaN(qty) && qty > 0);
    })
    .map((l: { sku: string }) => l.sku);

  // Update PO procurement_status: 'received' if all items fully received, else 'partially_received'
  const allReceived = (po.lines ?? []).every((l: { sku: string; qty: number }) => {
    const actualQty = body.actualQties?.[l.sku];
    const receivedQty = (actualQty !== undefined && !isNaN(actualQty)) ? actualQty : l.qty;
    return receivedQty >= l.qty;
  });
  await db.from('acc_documents')
    .update({ procurement_status: allReceived ? 'received' : 'partially_received' })
    .eq('id', id);

  if (allReceived) await maybeAutoClose(id);

  // Авто-перехід замовлень "Очікуємо товар" → "Збирається"
  // Запускаємо без await щоб не блокувати відповідь — помилки не критичні
  autoPromoteAwaitingOrders(db, receivedSkus, po.warehouse_id, user.email ?? 'system').catch(e =>
    console.error('[auto-promote] failed:', e)
  );

  // Додаткові витрати (landed costs) — застосовуємо одразу після проведення
  const activeCosts = (body.landed_costs ?? []).filter(c => c.amount > 0);
  if (activeCosts.length > 0) {
    const lcMethod = body.lc_method ?? 'by_cost';
    const expenseAccountMap: Record<string, string> = {
      delivery: 'logistics', loading: 'loading', customs: 'customs',
      packaging: 'opex', broker: 'customs', other: 'opex',
    };
    const costTypeLabel: Record<string, string> = {
      delivery: 'Доставка', loading: 'Навантаж./розвантаж.', customs: 'Мито',
      packaging: 'Пакування', broker: 'Брокер', other: 'Інше',
    };
    const today = new Date().toISOString().slice(0, 10);

    await db.from('landed_cost_lines').insert(
      activeCosts.map(c => ({
        document_id: receipt.id,
        cost_type:   c.cost_type,
        description: c.description ?? null,
        amount:      c.amount,
        distributed: false,
      }))
    );
    await db.rpc('apply_landed_costs', { p_document_id: receipt.id, p_method: lcMethod });

    for (const cost of activeCosts) {
      const accountType = expenseAccountMap[cost.cost_type] ?? 'opex';
      const payMethod   = cost.payment_method === 'cash' ? 'cash' : 'bank';
      const description = cost.description
        ? `${cost.description} — ${receipt.doc_number}`
        : `${costTypeLabel[cost.cost_type] ?? cost.cost_type} — ${receipt.doc_number}`;

      const { data: txnId } = await db.rpc('record_money_txn', {
        p_debit_account:  accountType,
        p_credit_account: payMethod,
        p_debit_party:    null,
        p_credit_party:   null,
        p_amount:         cost.amount,
        p_business_date:  today,
        p_doc_id:         receipt.id,
        p_doc_type:       'landed_cost',
        p_description:    description,
        p_created_by:     user.email,
      });

      await db.from('expenses').insert({
        expense_type:   accountType,
        description,
        amount:         cost.amount,
        payment_method: payMethod,
        source:         'landed_cost',
        source_id:      receipt.id,
        txn_id:         txnId ?? null,
        business_date:  today,
        created_by:     user.email,
      });
    }
  }

  // Якщо вказані ціни продажу — фіксуємо їх в product_stock і блокуємо від перезапису синком
  const skusWithPrices = [...new Set([
    ...Object.keys(body.sale_prices      ?? {}).filter(s => (body.sale_prices![s]      ?? 0) > 0),
    ...Object.keys(body.wholesale_prices ?? {}).filter(s => (body.wholesale_prices![s] ?? 0) > 0),
    ...Object.keys(body.drop_prices      ?? {}).filter(s => (body.drop_prices![s]      ?? 0) > 0),
  ])];

  if (skusWithPrices.length > 0) {
    await Promise.allSettled(skusWithPrices.map(sku => {
      const retail    = body.sale_prices?.[sku]      ?? 0;
      const wholesale = body.wholesale_prices?.[sku] ?? 0;
      const drop      = body.drop_prices?.[sku]      ?? 0;
      const row: Record<string, unknown> = { sku, price_locked: true };
      if (retail    > 0) row.price_retail = retail;
      if (wholesale > 0) row.price_unit   = wholesale;
      if (drop      > 0) row.price_drop   = drop;
      return db.from('product_stock').upsert(row, { onConflict: 'sku' });
    }));
  }

  return NextResponse.json({ ok: true, receiptId: receipt.id, draft: false });
}
