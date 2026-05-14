import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServer } from '../../../../../../lib/supabase-server';
import { createServiceClient } from '../../../../../../lib/supabase';
import { resolveOrderFulfillment } from '../../../../../../lib/accounting/fulfillment';
import { createReservation } from '../../../../../../lib/accounting/reservations';
import { createDocument } from '../../../../../../lib/accounting/documents';
import { notifyAdminStatusChange, notifyCustomerStatus } from '../../../../../../lib/telegram';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || user.user_metadata?.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { id } = await params;
  const { fulfillment_mode } = await req.json() as { fulfillment_mode: 'supplier' | 'own' | 'mixed' };

  if (!['supplier', 'own', 'mixed'].includes(fulfillment_mode)) {
    return NextResponse.json({ error: 'Invalid fulfillment_mode' }, { status: 400 });
  }

  const db = createServiceClient();

  const { data: order } = await db
    .from('orders')
    .select('id, order_number, items, channel_code, telegram_chat_id, tracking_number, contact, phone')
    .eq('id', id)
    .single();

  if (!order) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const items = (order.items ?? []) as { sku: string; qty: number }[];
  let newStatus = 'confirmed';
  let purchaseOrderId: string | undefined;

  if (fulfillment_mode === 'supplier') {
    // Pure dropship — no stock operations
    await db.from('orders').update({ status: 'confirmed', fulfillment_mode }).eq('id', id);

  } else if (fulfillment_mode === 'own') {
    // Reserve all items from own warehouse
    try {
      const plan = await resolveOrderFulfillment(
        items.map(i => ({ sku: i.sku, qty: i.qty })),
        { channel_code: order.channel_code ?? 'website' },
      );
      if (plan.has_own) {
        const byWarehouse = new Map<number, { sku: string; qty: number }[]>();
        for (const src of plan.items.filter(s => s.fulfillment_type === 'own')) {
          if (!byWarehouse.has(src.warehouse_id)) byWarehouse.set(src.warehouse_id, []);
          byWarehouse.get(src.warehouse_id)!.push({ sku: src.sku, qty: src.qty });
        }
        for (const [warehouseId, warehouseItems] of byWarehouse) {
          await createReservation({ order_id: id, warehouse_id: warehouseId, items: warehouseItems });
        }
      }
    } catch (err) {
      console.error('[confirm/own] reservation failed:', err);
    }
    await db.from('orders').update({ status: 'confirmed', fulfillment_mode }).eq('id', id);

  } else {
    // Mixed: reserve own stock + create purchase_order for supplier items
    newStatus = 'awaiting_stock';
    try {
      const plan = await resolveOrderFulfillment(
        items.map(i => ({ sku: i.sku, qty: i.qty })),
        { channel_code: order.channel_code ?? 'website' },
      );

      // Reserve what we have
      if (plan.has_own) {
        const byWarehouse = new Map<number, { sku: string; qty: number }[]>();
        for (const src of plan.items.filter(s => s.fulfillment_type === 'own')) {
          if (!byWarehouse.has(src.warehouse_id)) byWarehouse.set(src.warehouse_id, []);
          byWarehouse.get(src.warehouse_id)!.push({ sku: src.sku, qty: src.qty });
        }
        for (const [warehouseId, warehouseItems] of byWarehouse) {
          await createReservation({ order_id: id, warehouse_id: warehouseId, items: warehouseItems });
        }
      }

      // Create purchase_order document for supplier items
      if (plan.has_dropship) {
        const supplierItems = plan.items.filter(s => s.fulfillment_type === 'dropship');
        const supplierId = supplierItems[0]?.supplier_id;
        const warehouseId = supplierItems[0]?.warehouse_id;

        if (supplierId && warehouseId) {
          const orderItemMap = new Map((order.items as { sku: string; qty: number; price: number }[]).map(i => [i.sku, i]));
          const doc = await createDocument({
            doc_type:    'purchase_order',
            warehouse_id: warehouseId,
            supplier_id: supplierId,
            order_id:    id,
            notes:       `Замовлення #${order.order_number} — змішане виконання`,
            created_by:  user.email ?? 'admin',
            lines: supplierItems.map(src => ({
              sku:         src.sku,
              qty:         src.qty,
              price:       orderItemMap.get(src.sku)?.price ?? 0,
              cost_price:  0,
              fulfillment_type: 'dropship' as const,
              supplier_id: supplierId,
              warehouse_id: warehouseId,
            })),
          });
          purchaseOrderId = doc.id;
        }
      }
    } catch (err) {
      console.error('[confirm/mixed] failed:', err);
    }
    await db.from('orders').update({ status: newStatus, fulfillment_mode }).eq('id', id);
  }

  // Telegram notifications
  try {
    notifyAdminStatusChange(
      { order_number: order.order_number, contact: order.contact, phone: order.phone },
      newStatus,
    );
    if (order.telegram_chat_id) {
      notifyCustomerStatus(order.telegram_chat_id, order.order_number, newStatus, order.tracking_number);
    }
  } catch (err) {
    console.error('[confirm] telegram failed:', err);
  }

  return NextResponse.json({ ok: true, status: newStatus, fulfillment_mode, purchase_order_id: purchaseOrderId });
}
